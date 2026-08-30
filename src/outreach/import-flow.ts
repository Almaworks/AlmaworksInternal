import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../db/types.ts";
import {
  matchOutreachRow,
  normalizeOutreachRow,
  summarizeImportPreview,
  type ImportCandidateIndex,
  type ImportMatchDecision,
  type NormalizedOutreachRow,
} from "./import.ts";
import { normalizeLegacyActivity, normalizeLegacyOutreachMetadata } from "./legacy-migration.ts";

type Client = SupabaseClient<Database>;

function json(value: unknown): Json { return value as Json; }
function comparable(value: string): string {
  return value.toLowerCase().replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation|co)\b\.?/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/gu, " ");
}

export async function createImportPreview(args: {
  client: Client; userId: string; semesterId: string; source: "csv" | "excel" | "legacy";
  sourceFilename?: string; rows: readonly Record<string, unknown>[];
}) {
  const [{ data: contacts, error: contactsError }, { data: companies, error: companiesError }, { data: owners, error: ownersError }] = await Promise.all([
    args.client.from("outreach_contacts").select("id, email, linkedin_url, full_name"),
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
  const { data: job, error: jobError } = await args.client.from("outreach_import_jobs").insert({
    semester_id: args.semesterId, source: args.source, source_filename: args.sourceFilename ?? null,
    status, summary: json(summary), created_by: args.userId,
  }).select("id, status, summary").single();
  if (jobError || !job) throw new Error("Unable to stage import job.");
  const rowInserts: Database["public"]["Tables"]["outreach_import_rows"]["Insert"][] = normalized.map((row, index) => {
    const decision = decisions[index];
    return {
      semester_id: args.semesterId, import_job_id: job.id, row_number: row.rowNumber,
      raw_payload: json(args.rows[index]), normalized_payload: json({
        ...row,
        ownerId: decision.ownerId,
        ...(args.source === "legacy" ? { legacy: normalizeLegacyOutreachMetadata(args.rows[index]) } : {}),
      }), issue_codes: [...decision.issues, ...(args.source === "legacy" ? normalizeLegacyOutreachMetadata(args.rows[index]).issues : [])],
      match_decision: (decision.disposition === "matched"
        ? (decision.matchSource === "email" ? "exact_email" : "exact_linkedin")
        : decision.disposition === "create" ? "create_new" : decision.disposition) as Database["public"]["Enums"]["outreach_import_match_decision"],
      matched_contact_id: decision.contactId, selected: decision.disposition !== "invalid", excluded: false,
    };
  });
  const { error: rowsError } = await args.client.from("outreach_import_rows").insert(rowInserts);
  if (rowsError) {
    await args.client.from("outreach_import_jobs").delete().eq("id", job.id).eq("semester_id", args.semesterId);
    throw new Error("Unable to stage import rows.");
  }
  return { importId: job.id, status: job.status, summary, rows: normalized.map((row, index) => serializeRow(row, decisions[index])) };
}

function serializeRow(row: NormalizedOutreachRow, decision: ImportMatchDecision) {
  return { id: `${row.rowNumber}`, rowNumber: row.rowNumber, name: row.fullName ?? "Unnamed contact", issue: decision.issues.join(", "), decision: decision.disposition === "matched" ? "merge" : decision.disposition === "invalid" ? "exclude" : "create", suggestedContactId: decision.suggestedContactId };
}

export async function commitImport(args: { client: Client; userId: string; semesterId: string; importId: string; idempotencyKey: string }) {
  const { data: job, error: jobError } = await args.client.from("outreach_import_jobs").select("*").eq("id", args.importId).eq("semester_id", args.semesterId).maybeSingle();
  if (jobError || !job) throw new Error("Import job not found.");
  if (job.status === "committed") return { importId: job.id, status: job.status, summary: job.summary };
  if (job.status === "committing") throw new Error("Import is already being committed.");
  if (job.status === "failed" || job.status === "rolled_back") throw new Error("Import job cannot be committed.");
  const { data: claimed, error: claimError } = await args.client.from("outreach_import_jobs").update({ status: "committing", idempotency_key: args.idempotencyKey, updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", job.status).select("id").maybeSingle();
  if (claimError || !claimed) throw new Error("Import job was changed by another request.");
  const { data: rows, error: rowsError } = await args.client.from("outreach_import_rows").select("*").eq("import_job_id", job.id).eq("semester_id", args.semesterId).order("row_number");
  if (rowsError || !rows) throw new Error("Unable to read staged import rows.");
  const createdContacts: string[] = [], createdCompanies: string[] = [], createdOpportunities: string[] = [], createdLinks: string[] = [];
  const { data: labels, error: labelsError } = await args.client
    .from("outreach_relationship_labels").select("id, slug");
  if (labelsError) throw new Error("Unable to load outreach relationship labels.");
  try {
    let committed = 0;
    for (const row of rows) {
      if (row.excluded || !row.selected) continue;
      const payload = row.normalized_payload as {
        fullName?: string | null; email?: string | null; linkedinUrl?: string | null;
        company?: string | null; companyDomain?: string | null;
        stage?: Database["public"]["Enums"]["outreach_stage"]; ownerId?: string | null;
        relationshipLabels?: string[];
        legacy?: {
          notes?: string | null;
          sourceChannel?: Database["public"]["Enums"]["outreach_channel"] | null;
          referredBy?: string | null;
          expertiseTags?: string[];
          conversionDetails?: Json;
          lastContactedAt?: string | null;
        };
      };
      let contactId = row.matched_contact_id;
      if (!contactId) {
        const { data: contact, error } = await args.client.from("outreach_contacts").insert({ full_name: payload.fullName ?? "Unnamed contact", email: payload.email ?? null, linkedin_url: payload.linkedinUrl ?? null, canonical_linkedin_url: payload.linkedinUrl ?? null, expertise_tags: payload.legacy?.expertiseTags ?? [], created_by: args.userId }).select("id").single();
        if (error || !contact) throw new Error(`Unable to create contact for row ${row.row_number}.`);
        contactId = contact.id; createdContacts.push(contact.id);
      }
      let companyId: string | null = row.matched_company_id;
      if (!companyId && payload.company) {
        const normalizedName = comparable(payload.company);
        const { data: existing } = await args.client.from("outreach_companies").select("id").eq("normalized_name", normalizedName).limit(1).maybeSingle();
        if (existing) companyId = existing.id;
        else {
          const { data: company, error } = await args.client.from("outreach_companies").insert({ name: payload.company, normalized_name: normalizedName, domain: payload.companyDomain ?? null, created_by: args.userId }).select("id").single();
          if (error || !company) throw new Error(`Unable to create company for row ${row.row_number}.`);
          companyId = company.id; createdCompanies.push(company.id);
        }
      }
      if (companyId) {
        const { data: link, error } = await args.client.from("outreach_contact_companies").insert({ contact_id: contactId, company_id: companyId, is_primary: true }).select("id").single();
        if (!error && link) createdLinks.push(link.id);
      }
      const { data: opportunity, error: opportunityError } = await args.client.from("outreach_opportunities").insert({ semester_id: args.semesterId, contact_id: contactId, owner_profile_id: payload.ownerId ?? null, stage: payload.stage ?? "prospect", notes: payload.legacy?.notes ?? null, source_channel: payload.legacy?.sourceChannel ?? null, referred_by: payload.legacy?.referredBy ?? null, conversion_details: payload.legacy?.conversionDetails ?? {}, source_import_job_id: job.id, created_by: args.userId }).select("id").single();
      if (opportunityError || !opportunity) {
        const { data: existing } = await args.client.from("outreach_opportunities").select("id").eq("semester_id", args.semesterId).eq("contact_id", contactId).not("stage", "in", "(converted,closed)").maybeSingle();
        if (!existing) throw new Error(`Unable to create opportunity for row ${row.row_number}.`);
        await args.client.from("outreach_import_rows").update({ committed_opportunity_id: existing.id, match_decision: "merge" }).eq("id", row.id);
      } else {
        createdOpportunities.push(opportunity.id);
        await args.client.from("outreach_import_rows").update({ committed_opportunity_id: opportunity.id }).eq("id", row.id);
        if (payload.legacy?.lastContactedAt) {
          const { error: activityError } = await args.client.from("outreach_activities").insert({
            semester_id: args.semesterId,
            opportunity_id: opportunity.id,
            actor_profile_id: payload.ownerId ?? null,
            activity_kind: "email",
            channel: payload.legacy.sourceChannel ?? "other",
            occurred_at: payload.legacy.lastContactedAt,
            summary: "Legacy last-contacted timestamp",
            details: json({ legacy: { outreachId: (row.raw_payload as Record<string, Json>).id ?? null } }),
            import_job_id: job.id,
          });
          if (activityError) throw new Error(`Unable to preserve last contact for row ${row.row_number}.`);
          await args.client.from("outreach_opportunities").update({
            latest_outbound_activity_at: payload.legacy.lastContactedAt,
            next_follow_up_at: new Date(new Date(payload.legacy.lastContactedAt).getTime() + 7 * 86_400_000).toISOString(),
          }).eq("id", opportunity.id).eq("semester_id", args.semesterId);
        }
        if (payload.relationshipLabels?.length) {
          const labelIds = (labels ?? [])
            .filter((label) => payload.relationshipLabels?.includes(label.slug))
            .map((label) => ({
              semester_id: args.semesterId,
              opportunity_id: opportunity.id,
              relationship_label_id: label.id,
              added_by: args.userId,
            }));
          if (labelIds.length) {
            const { error: labelError } = await args.client.from("outreach_opportunity_labels").insert(labelIds);
            if (labelError) throw new Error(`Unable to preserve labels for row ${row.row_number}.`);
          }
        }
        if (job.source === "legacy") {
          const legacyId = (row.raw_payload as Record<string, Json>).id;
          if (typeof legacyId === "string") {
            const { data: legacyActivities, error: activityReadError } = await args.client
              .from("outreach_activity_log").select("*")
              .eq("outreach_id", legacyId).eq("semester_id", args.semesterId)
              .order("created_at", { ascending: true }).order("id", { ascending: true });
            if (activityReadError) throw new Error(`Unable to read legacy activities for row ${row.row_number}.`);
            const activityInserts = (legacyActivities ?? []).map((legacyActivity) => {
              const normalized = normalizeLegacyActivity(legacyActivity);
              return {
                semester_id: args.semesterId, opportunity_id: opportunity.id,
                actor_profile_id: normalized.actorProfileId, activity_kind: normalized.kind,
                channel: normalized.channel, occurred_at: normalized.occurredAt,
                summary: normalized.summary, details: json(normalized.details), import_job_id: job.id,
              };
            });
            if (activityInserts.length) {
              const { error: replayError } = await args.client.from("outreach_activities").insert(activityInserts);
              if (replayError) throw new Error(`Unable to replay legacy activities for row ${row.row_number}.`);
            }
          }
        }
      }
      committed += 1;
    }
    const summary = { ...(job.summary as Record<string, Json>), committedRows: committed };
    const { error } = await args.client.from("outreach_import_jobs").update({ status: "committed", committed_by: args.userId, committed_at: new Date().toISOString(), summary, updated_at: new Date().toISOString(), last_error: null }).eq("id", job.id);
    if (error) throw new Error("Unable to finalize import job.");
    return { importId: job.id, status: "committed", summary };
  } catch (error) {
    if (createdLinks.length) await args.client.from("outreach_contact_companies").delete().in("id", createdLinks);
    if (createdOpportunities.length) await args.client.from("outreach_opportunities").delete().in("id", createdOpportunities);
    if (createdContacts.length) await args.client.from("outreach_contacts").delete().in("id", createdContacts);
    if (createdCompanies.length) await args.client.from("outreach_companies").delete().in("id", createdCompanies);
    await args.client.from("outreach_import_jobs").update({ status: "failed", last_error: error instanceof Error ? error.message : "Import failed.", updated_at: new Date().toISOString() }).eq("id", job.id);
    throw error;
  }
}
