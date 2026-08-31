export type OutreachStatus = "prospect" | "contacted" | "responded" | "onboarded";
export type OutreachInsert = {
  admin_id: string;
  semester_id: string;
  prospect_name: string;
  prospect_email: string | null;
  linkedin_url: string | null;
  company: string | null;
  expertise_tags: string[];
  status: OutreachStatus;
  notes: string | null;
  last_contacted_at: string | null;
};

export type NotionOutreachSource = "current" | "deprecated" | "previous_mentors";

export type CsvRow = Record<string, string>;

export type ImportOutreachDraft = {
  prospect_name: string;
  prospect_email: string | null;
  linkedin_url: string | null;
  company: string | null;
  expertise_tags: string[];
  status: OutreachStatus;
  notes: string | null;
  last_contacted_at: string | null;
  _dedupe_key: string;
  _source: NotionOutreachSource;
};

export type ImportOutreachResult = {
  rows: OutreachInsert[];
  drafts: ImportOutreachDraft[];
  stats: {
    input_rows: number;
    mapped_rows: number;
    skipped_rows: number;
    deduped_rows: number;
  };
  warnings: string[];
};

const STATUS_ORDER: Record<OutreachStatus, number> = {
  prospect: 0,
  contacted: 1,
  responded: 2,
  onboarded: 3,
};

export function parseCsv(csvText: string): { headers: string[]; rows: string[][] } {
  const text = csvText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  const pushField = () => {
    currentRow.push(currentField);
    currentField = "";
  };
  const pushRow = () => {
    // drop trailing completely-empty row
    if (currentRow.length === 1 && currentRow[0].trim() === "") {
      currentRow = [];
      return;
    }
    rows.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      pushField();
      continue;
    }

    if (ch === "\r") {
      const next = text[i + 1];
      if (next === "\n") i++;
      pushField();
      pushRow();
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }

    currentField += ch;
  }

  pushField();
  if (currentRow.length > 0) pushRow();

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => normalizeHeader(h));
  const data = rows.slice(1);
  return { headers, rows: data };
}

export function rowsToObjects(headers: string[], rows: string[][]): CsvRow[] {
  return rows.map((r) => {
    const obj: CsvRow = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i] ?? "";
      if (!key) continue;
      obj[key] = (r[i] ?? "").trim();
    }
    return obj;
  });
}

export function importNotionCsvToOutreachInserts(args: {
  csvText: string;
  source: NotionOutreachSource;
  adminId: string;
  semesterId: string;
}): ImportOutreachResult {
  const warnings: string[] = [];
  const { headers, rows } = parseCsv(args.csvText);
  if (headers.length === 0) {
    return {
      rows: [],
      drafts: [],
      stats: { input_rows: 0, mapped_rows: 0, skipped_rows: 0, deduped_rows: 0 },
      warnings: ["CSV had no headers/rows."],
    };
  }

  const objects = rowsToObjects(headers, rows);
  const drafts: ImportOutreachDraft[] = [];
  let skipped = 0;

  for (const row of objects) {
    const draft = mapCsvRowToOutreachDraft(row, args.source, warnings);
    if (!draft) {
      skipped++;
      continue;
    }
    drafts.push(draft);
  }

  const dedupedDrafts = dedupeOutreachDrafts(drafts);
  const insertRows = dedupedDrafts.map((d) => toInsertRow(d, args.adminId, args.semesterId));

  return {
    rows: insertRows,
    drafts: dedupedDrafts,
    stats: {
      input_rows: objects.length,
      mapped_rows: drafts.length,
      skipped_rows: skipped,
      deduped_rows: dedupedDrafts.length,
    },
    warnings,
  };
}

export function mapCsvRowToOutreachDraft(
  row: CsvRow,
  source: NotionOutreachSource,
  warnings: string[] = [],
): ImportOutreachDraft | null {
  const nameRaw =
    pick(row, ["name", "prospect_name"]) ??
    buildNameFromParts(pick(row, ["first name", "first_name", "first"]), pick(row, ["last name", "last_name", "last"]));
  const companyRaw = pick(row, ["company"]);

  const name = normalizePersonName(nameRaw);
  const company = normalizeFreeText(companyRaw);
  if (!name) return null;

  const contactInfo = pick(row, ["contact_info", "contact info", "contact"]);
  const emailRaw =
    source === "previous_mentors"
      ? pick(row, ["email", "prospect_email"])
      : firstEmailFromText(contactInfo) ?? pick(row, ["email", "prospect_email"]);

  const email = normalizeEmail(emailRaw);
  const linkedin = normalizeLinkedinUrl(pick(row, ["linkedin", "linkedin_url", "linkedIn"]));

  const description = pick(row, ["description"]);
  const expertise = parseExpertiseTags(description);

  const status = mapStatus(pick(row, ["status"]), source);
  const createdTime = pick(row, ["created_time", "created time", "created"]);
  const lastContactedAt = parseDateToIso(createdTime);

  const notes = buildNotes(
    {
      outreachType: pick(row, ["outreach_type", "outreach type"]),
      ocl: pick(row, ["ocl"]),
      confirmedFor: pick(row, ["confirmed_for", "confirmed for"]),
      contactInfo,
      description,
      statusRaw: pick(row, ["status"]),
    },
    { includeContactInfo: !email && Boolean(normalizeFreeText(contactInfo)) },
  );

  const dedupeKey = buildDedupeKey({ linkedin_url: linkedin, prospect_email: email, prospect_name: name, company });
  if (!dedupeKey) {
    warnings.push(`Could not create dedupe key for "${name}" (${company ?? "no company"}).`);
    return null;
  }

  return {
    prospect_name: name,
    prospect_email: email,
    linkedin_url: linkedin,
    company,
    expertise_tags: expertise,
    status,
    notes,
    last_contacted_at: lastContactedAt,
    _dedupe_key: dedupeKey,
    _source: source,
  };
}

export function dedupeOutreachDrafts(drafts: ImportOutreachDraft[]): ImportOutreachDraft[] {
  const byKey = new Map<string, ImportOutreachDraft>();

  for (const d of drafts) {
    const existing = byKey.get(d._dedupe_key);
    if (!existing) {
      byKey.set(d._dedupe_key, d);
      continue;
    }
    byKey.set(d._dedupe_key, mergeDrafts(existing, d));
  }

  return Array.from(byKey.values());
}

function buildNameFromParts(first: string | null, last: string | null): string | null {
  const f = normalizeFreeText(first);
  const l = normalizeFreeText(last);
  const combined = [f, l].filter((x): x is string => Boolean(x)).join(" ").trim();
  return combined ? combined : null;
}

export function mergeDrafts(a: ImportOutreachDraft, b: ImportOutreachDraft): ImportOutreachDraft {
  const mergedStatus = furthestStatus(a.status, b.status);
  const mergedLastContactedAt = latestIso(a.last_contacted_at, b.last_contacted_at);
  const mergedNotes = mergeNotes(a.notes, b.notes);
  const mergedTags = mergeTags(a.expertise_tags, b.expertise_tags);

  // Prefer non-empty fields; otherwise keep the earlier one.
  const merged: ImportOutreachDraft = {
    ...a,
    prospect_name: preferText(a.prospect_name, b.prospect_name) ?? a.prospect_name,
    prospect_email: preferText(a.prospect_email, b.prospect_email),
    linkedin_url: preferText(a.linkedin_url, b.linkedin_url),
    company: preferText(a.company, b.company),
    expertise_tags: mergedTags,
    status: mergedStatus,
    notes: mergedNotes,
    last_contacted_at: mergedLastContactedAt,
    _source: a._source, // informational only; keep first-seen source
  };

  // If either has a stronger dedupe key (linkedin/email vs fallback), upgrade key.
  merged._dedupe_key = strongerDedupeKey(a, b);
  return merged;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const v = normalizeFreeText(email);
  if (!v) return null;
  const candidate = v.trim().toLowerCase();
  // Simple sanity check (avoid importing "N/A", etc.)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) return null;
  return candidate;
}

export function normalizeLinkedinUrl(url: string | null | undefined): string | null {
  const v = normalizeFreeText(url);
  if (!v) return null;
  let u = v.trim();
  u = u.replace(/^<|>$/g, "");
  u = u.replace(/^https?:\/\//i, "");
  u = u.replace(/^www\./i, "");
  u = u.replace(/\/+$/g, "");
  u = u.toLowerCase();

  // Keep only linkedin.com URLs when it looks like one.
  if (!u.includes("linkedin.com/")) return null;

  // Prefer /in/ profiles; if present, keep up to that path segment.
  const inIdx = u.indexOf("linkedin.com/in/");
  if (inIdx >= 0) {
    const tail = u.slice(inIdx + "linkedin.com/".length); // "in/...."
    const parts = tail.split("/");
    const handle = parts[1] ?? "";
    if (handle) return `linkedin.com/in/${handle}`;
  }

  // fallback: return normalized linkedin.com/<path>
  const start = u.indexOf("linkedin.com/");
  return u.slice(start);
}

export function normalizePersonName(name: string | null | undefined): string | null {
  const v = normalizeFreeText(name);
  if (!v) return null;
  // Collapse whitespace
  const collapsed = v.replace(/\s+/g, " ").trim();
  // Filter out obviously bad placeholders
  if (/^(n\/a|na|none|unknown|null|-)$/i.test(collapsed)) return null;
  return collapsed;
}

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeFreeText(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s ? s : null;
}

export function parseExpertiseTags(description: string | null | undefined): string[] {
  const v = normalizeFreeText(description);
  if (!v) return [];

  // Heuristic: treat as tags when it looks like a short delimited list.
  const hasDelimiters = /[,;\n]/.test(v);
  const looksLikeSentence = /[.!?]\s/.test(v) || v.split(/\s+/).length > 30;
  if (!hasDelimiters || looksLikeSentence) return [];

  const raw = v
    .split(/[,;\n]/g)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.replace(/\s+/g, " "));

  return dedupeCaseInsensitive(raw).slice(0, 50);
}

export function mapStatus(statusRaw: string | null | undefined, source: NotionOutreachSource): OutreachStatus {
  if (source === "previous_mentors") return "onboarded";

  const v = (statusRaw ?? "").trim().toLowerCase();
  if (!v) return "prospect";

  // normalize common variants
  if (v.includes("reached")) return "contacted";
  if (v.includes("waiting")) return "prospect";
  if (v === "confirmed") return "responded";
  if (v === "no") return "prospect";
  if (v.includes("haven't reached") || v.includes("havent reached")) return "prospect";

  return "prospect";
}

export function buildDedupeKey(args: {
  linkedin_url: string | null;
  prospect_email: string | null;
  prospect_name: string;
  company: string | null;
}): string | null {
  if (args.linkedin_url) return `li:${args.linkedin_url}`;
  if (args.prospect_email) return `em:${args.prospect_email}`;
  const name = args.prospect_name.trim().toLowerCase();
  const company = (args.company ?? "").trim().toLowerCase();
  if (!name) return null;
  return `nc:${name}|${company}`;
}

export function toInsertRow(d: ImportOutreachDraft, adminId: string, semesterId: string): OutreachInsert {
  return {
    admin_id: adminId,
    semester_id: semesterId,
    prospect_name: d.prospect_name,
    prospect_email: d.prospect_email,
    linkedin_url: d.linkedin_url,
    company: d.company,
    expertise_tags: d.expertise_tags,
    status: d.status,
    notes: d.notes,
    last_contacted_at: d.last_contacted_at,
  };
}

function pick(row: CsvRow, keys: string[]): string | null {
  for (const k of keys) {
    const normalized = normalizeHeader(k);
    for (const actualKey of Object.keys(row)) {
      if (normalizeHeader(actualKey) === normalized) {
        const v = normalizeFreeText(row[actualKey]);
        if (v) return v;
      }
    }
  }
  return null;
}

function firstEmailFromText(text: string | null): string | null {
  const v = normalizeFreeText(text);
  if (!v) return null;
  const match = v.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function parseDateToIso(value: string | null | undefined): string | null {
  const v = normalizeFreeText(value);
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function buildNotes(
  fields: {
    outreachType: string | null;
    ocl: string | null;
    confirmedFor: string | null;
    contactInfo: string | null;
    description: string | null;
    statusRaw: string | null;
  },
  opts: { includeContactInfo: boolean },
): string | null {
  const parts: string[] = [];
  const add = (label: string, v: string | null) => {
    const t = normalizeFreeText(v);
    if (!t) return;
    parts.push(`${label}: ${t}`);
  };

  add("Outreach Type", fields.outreachType);
  add("OCL", fields.ocl);
  add("Confirmed for", fields.confirmedFor);
  if (opts.includeContactInfo) add("Contact info", fields.contactInfo);

  // Keep the description only when we didn't use it as tags (or when it looks long/sentence-like).
  const desc = normalizeFreeText(fields.description);
  if (desc && (parseExpertiseTags(desc).length === 0 || desc.split(/\s+/).length > 15)) {
    add("Description", desc);
  }

  // Preserve unrecognized statuses to avoid losing info.
  const status = (fields.statusRaw ?? "").trim();
  if (status && mapStatus(status, "current") === "prospect" && !/^(waiting|no|confirmed|reached out|haven't reached|havent reached)$/i.test(status)) {
    add("Status (raw)", status);
  }

  const merged = parts.join("\n");
  return merged ? merged : null;
}

function furthestStatus(a: OutreachStatus, b: OutreachStatus): OutreachStatus {
  return STATUS_ORDER[a] >= STATUS_ORDER[b] ? a : b;
}

function latestIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const ad = new Date(a).getTime();
  const bd = new Date(b).getTime();
  if (Number.isNaN(ad)) return b;
  if (Number.isNaN(bd)) return a;
  return ad >= bd ? a : b;
}

function mergeNotes(a: string | null, b: string | null): string | null {
  const ta = normalizeFreeText(a);
  const tb = normalizeFreeText(b);
  if (!ta) return tb;
  if (!tb) return ta;
  if (ta === tb) return ta;
  return `${ta}\n---\n${tb}`;
}

function mergeTags(a: string[], b: string[]): string[] {
  const all = [...a, ...b].map((t) => t.trim()).filter(Boolean);
  return dedupeCaseInsensitive(all).slice(0, 50);
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function preferText(a: string | null, b: string | null): string | null {
  const ta = normalizeFreeText(a);
  const tb = normalizeFreeText(b);
  if (tb && !ta) return tb;
  if (ta && !tb) return ta;
  if (ta && tb) return ta.length >= tb.length ? ta : tb;
  return null;
}

function strongerDedupeKey(a: ImportOutreachDraft, b: ImportOutreachDraft): string {
  const candidateKeys = [
    buildDedupeKey({
      linkedin_url: a.linkedin_url,
      prospect_email: a.prospect_email,
      prospect_name: a.prospect_name,
      company: a.company,
    }),
    buildDedupeKey({
      linkedin_url: b.linkedin_url,
      prospect_email: b.prospect_email,
      prospect_name: b.prospect_name,
      company: b.company,
    }),
  ].filter((k): k is string => Boolean(k));

  const score = (k: string) => (k.startsWith("li:") ? 3 : k.startsWith("em:") ? 2 : 1);
  return candidateKeys.sort((x, y) => score(y) - score(x))[0] ?? a._dedupe_key;
}

