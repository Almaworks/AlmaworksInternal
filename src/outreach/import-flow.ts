import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../db/types.ts";
import { matchOutreachRow, normalizeOutreachRow, summarizeImportPreview, type ImportCandidateIndex, type ImportMatchDecision, type NormalizedOutreachRow } from "./import.ts";

type Client = SupabaseClient<Database>;

interface StoredImportRow {
  raw: Record<string, unknown>;
  normalized: NormalizedOutreachRow & { ownerId: string | null };
  decision: ImportMatchDecision;
}

function json(value: unknown): Json { return value as Json; }
function comparable(value: string): string {
  return value.toLowerCase().replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation|co)\b\.?/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/gu, " ");
}

function serializeRow(row: NormalizedOutreachRow, decision: ImportMatchDecision) {
  const matchedContactId = decision.contactId ?? decision.suggestedContactId;
  return { id: `${row.rowNumber}`, rowNumber: row.rowNumber, name: row.fullName ?? "Unnamed contact", issue: decision.issues.join(", "), decision: decision.disposition === "matched" || matchedContactId !== null ? "merge" : decision.disposition === "create" ? "create" : "exclude", matchedContactId };
}

export async function createImportPreview(args: { client: Client; userId: string; semesterId: string; source: "csv" | "excel" | "legacy"; sourceFilename?: string; rows: readonly Record<string, unknown>[] }) {
  const [{ data: contacts, error: contactsError }, { data: companies, error: companiesError }, { data: owners, error: ownersError }] = await Promise.all([
    args.client.from("outreach_contacts").select("id, email, linkedin_url, full_name").is("archived_at", null),
    args.client.from("outreach_companies").select("id, name"),
    args.client.from("profiles").select("id, full_name, is_active").eq("is_active", true),
  ]);
  if (contactsError || companiesError || ownersError) throw new Error("Unable to load import matching data.");
  const candidates: ImportCandidateIndex = {
    contacts: (contacts ?? []).map((contact) => ({ id: contact.id, email: contact.email, linkedinUrl: contact.linkedin_url, fullName: contact.full_name, company: null })),
    companies: companies ?? [],
    owners: (owners ?? []).map((owner) => ({ id: owner.id, fullName: owner.full_name ?? "", isActive: owner.is_active })),
  };
  const normalized = args.rows.map((row, index) => normalizeOutreachRow(row, index + 1));
  const decisions = normalized.map((row) => matchOutreachRow(row, candidates));
  const summary = summarizeImportPreview(decisions);
  const status = summary.invalidRows || summary.reviewRequiredRows ? "reviewing" : "ready";
  const storedRows: StoredImportRow[] = normalized.map((row, index) => ({ raw: args.rows[index] ?? {}, normalized: { ...row, ownerId: decisions[index]?.ownerId ?? null }, decision: decisions[index] as ImportMatchDecision }));
  const { data: importRecord, error } = await args.client.from("outreach_imports").insert({ semester_id: args.semesterId, source_name: args.sourceFilename ?? args.source, status, idempotency_key: `preview:${crypto.randomUUID()}`, rows: json(storedRows), result: json(summary), created_by: args.userId }).select("id, status").single();
  if (error || !importRecord) throw new Error("Unable to stage outreach import.");
  return { importId: importRecord.id, status: importRecord.status, summary, rows: normalized.map((row, index) => serializeRow(row, decisions[index] as ImportMatchDecision)) };
}

export async function commitImport(args: { client: Client; userId: string; semesterId: string; importId: string; idempotencyKey: string; decisions: readonly { rowNumber: number; decision: "create" | "merge" | "exclude"; matchedContactId?: string }[] }) {
  const { data: importRecord, error: importError } = await args.client.from("outreach_imports").select("*").eq("id", args.importId).eq("semester_id", args.semesterId).maybeSingle();
  if (importError || !importRecord) throw new Error("Import not found.");
  if (importRecord.status === "committed") return { importId: importRecord.id, status: importRecord.status, summary: importRecord.result };
  if (importRecord.status === "committing") throw new Error("Import is already being committed.");
  const storedRows = importRecord.rows as unknown as StoredImportRow[];
  const decisionsByRow = new Map(args.decisions.map((decision) => [decision.rowNumber, decision]));
  if (decisionsByRow.size !== storedRows.length || storedRows.some((row) => !decisionsByRow.has(row.normalized.rowNumber))) throw new Error("Every staged import row must have one reviewed decision.");
  const { data: claimed, error: claimError } = await args.client.from("outreach_imports").update({ status: "committing", idempotency_key: args.idempotencyKey, updated_at: new Date().toISOString() }).eq("id", importRecord.id).eq("status", importRecord.status).select("id").maybeSingle();
  if (claimError || !claimed) throw new Error("Import was changed by another request.");
  let committedRows = 0;
  try {
    for (const stored of storedRows) {
      const reviewed = decisionsByRow.get(stored.normalized.rowNumber);
      if (!reviewed || reviewed.decision === "exclude") continue;
      const contactId = reviewed.decision === "merge" ? reviewed.matchedContactId ?? stored.decision.contactId : null;
      let companyId: string | null = null;
      let normalizedName: string | null = null;
      if (stored.normalized.company) {
        normalizedName = comparable(stored.normalized.company);
        const { data: existingCompany } = await args.client.from("outreach_companies").select("id").eq("normalized_name", normalizedName).maybeSingle();
        companyId = existingCompany?.id ?? null;
      }
      const relationshipTypes = stored.normalized.relationshipLabels.length > 0 ? [...stored.normalized.relationshipLabels] : ["mentor"];
      const { error: bundleError } = await args.client.rpc("upsert_outreach_contact_bundle", {
        p_semester_id: args.semesterId,
        p_contact_id: contactId ?? undefined,
        p_full_name: stored.normalized.fullName ?? "Unnamed contact",
        p_email: stored.normalized.email ?? undefined,
        p_linkedin_url: stored.normalized.linkedinUrl ?? undefined,
        p_company_id: companyId ?? undefined,
        p_company_name: (companyId === null ? stored.normalized.company : null) ?? undefined,
        p_company_normalized_name: (companyId === null ? normalizedName : null) ?? undefined,
        p_company_domain: stored.normalized.companyDomain ?? undefined,
        p_owner_profile_id: stored.normalized.ownerId ?? undefined,
        p_stage: stored.normalized.stage,
        p_relationship_types: relationshipTypes,
        p_source_context: json({ import_id: importRecord.id, source_name: importRecord.source_name }),
      });
      if (bundleError) throw new Error(`Unable to create outreach bundle for row ${stored.normalized.rowNumber}.`);
      committedRows += 1;
    }
    const summary = { ...(importRecord.result as Record<string, Json>), committedRows };
    const { error } = await args.client.from("outreach_imports").update({ status: "committed", committed_at: new Date().toISOString(), result: json(summary), updated_at: new Date().toISOString() }).eq("id", importRecord.id);
    if (error) throw new Error("Unable to finalize outreach import.");
    return { importId: importRecord.id, status: "committed", summary };
  } catch (error) {
    await args.client.from("outreach_imports").update({ status: "failed", result: json({ ...(importRecord.result as Record<string, Json>), error: error instanceof Error ? error.message : "Import failed." }), updated_at: new Date().toISOString() }).eq("id", importRecord.id);
    throw error;
  }
}
