import type { OutreachStage, RelationshipLabel } from "./types.ts";

export type ImportIssueCode =
  | "email_invalid"
  | "linkedin_invalid"
  | "identity_missing"
  | "stage_invalid"
  | "relationship_label_invalid"
  | "owner_unmatched"
  | "company_ambiguous"
  | "contact_ambiguous";

export interface NormalizedOutreachRow {
  rowNumber: number;
  fullName: string | null;
  email: string | null;
  linkedinUrl: string | null;
  company: string | null;
  companyDomain: string | null;
  stage: OutreachStage;
  relationshipLabels: readonly RelationshipLabel[];
  ownerName: string | null;
  issues: readonly ImportIssueCode[];
}

export interface ImportContactCandidate {
  id: string;
  email: string | null;
  linkedinUrl: string | null;
  fullName: string;
  company: string | null;
}

export interface ImportOwnerCandidate {
  id: string;
  fullName: string;
  isActive: boolean;
}

export interface ImportCompanyCandidate {
  id: string;
  name: string;
}

export interface ImportCandidateIndex {
  contacts: readonly ImportContactCandidate[];
  owners?: readonly ImportOwnerCandidate[];
  companies?: readonly ImportCompanyCandidate[];
}

export type ImportMatchDisposition =
  | "create"
  | "matched"
  | "review_required"
  | "invalid";

export type ImportMatchSource = "email" | "linkedin" | "name_company" | null;

export interface ImportMatchDecision {
  disposition: ImportMatchDisposition;
  contactId: string | null;
  suggestedContactId: string | null;
  matchSource: ImportMatchSource;
  ownerId: string | null;
  issues: readonly ImportIssueCode[];
}

export interface ImportPreviewSummary {
  totalRows: number;
  matchedRows: number;
  createRows: number;
  reviewRequiredRows: number;
  invalidRows: number;
  rowsWithIssues: number;
}

export function parseOutreachCsv(csvText: string): Record<string, string>[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (character === '"') {
      if (inQuotes && csvText[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      record.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && csvText[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.trim() !== "")) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error("CSV contains an unclosed quoted field.");
  record.push(field);
  if (record.some((value) => value.trim() !== "")) records.push(record);
  if (records.length < 2) throw new Error("CSV must contain a header and at least one data row.");

  const headers = records[0].map((value, index) => {
    const header = value.replace(/^\uFEFF/u, "").trim().toLowerCase();
    if (header === "") throw new Error(`CSV header ${index + 1} is empty.`);
    return header;
  });
  if (new Set(headers).size !== headers.length) throw new Error("CSV headers must be unique.");

  const dataRecords = records.slice(1);
  if (dataRecords.length > 250) throw new Error("CSV imports are limited to 250 rows.");
  return dataRecords.map((values) => Object.fromEntries(
    headers.map((header, index) => [header, (values[index] ?? "").trim()]),
  ));
}

const STAGE_BY_LEGACY_STATUS: Readonly<Record<string, OutreachStage>> = {
  prospect: "not_contacted",
  new: "not_contacted",
  researching: "researching",
  research: "researching",
  ready: "ready",
  qualified: "ready",
  contacted: "contacted",
  responded: "replied",
  replied: "replied",
  meeting: "conversation_scheduled",
  scheduled: "conversation_scheduled",
  nurture: "contacted",
  converted: "closed",
  onboarded: "closed",
  declined: "declined",
  closed: "closed",
  waiting: "not_contacted",
  no: "declined",
  havent_reached: "not_contacted",
  reached_out: "contacted",
  confirmed: "replied",
};

const RELATIONSHIP_LABELS: Readonly<Record<string, RelationshipLabel>> = {
  mentor: "mentor",
  mentorship: "mentor",
  investor: "investor",
  speaker: "speaker",
  panelist: "speaker",
  keynote: "speaker",
  sponsor: "sponsor",
  sponsorship: "sponsor",
  advisor: "advisor",
  adviser: "advisor",
  partner: "partner",
  partnership: "partner",
};

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizedFieldName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function textFrom(input: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const normalizedKey = normalizedFieldName(key);
    for (const [inputKey, inputValue] of Object.entries(input)) {
      if (normalizedFieldName(inputKey) === normalizedKey) {
        const value = nonEmptyText(inputValue);
        if (value !== null) {
          return value;
        }
      }
    }
  }

  return null;
}

function valueFrom(input: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const normalizedKey = normalizedFieldName(key);
    for (const [inputKey, inputValue] of Object.entries(input)) {
      if (normalizedFieldName(inputKey) === normalizedKey) {
        return inputValue;
      }
    }
  }

  return undefined;
}

function emailFromContactInfo(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
  return match?.[0] ?? null;
}

function normalizeEmail(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const email = value.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : null;
}

function normalizeLinkedInUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//iu.test(value)
    ? value
    : `https://${value}`;

  try {
    const url = new URL(withProtocol);
    const hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (hostname !== "linkedin.com" || pathParts.length < 2 || pathParts[0].toLowerCase() !== "in") {
      return null;
    }

    const profileSlug = pathParts[1].toLowerCase();
    return profileSlug === "" ? null : `https://www.linkedin.com/in/${profileSlug}`;
  } catch {
    return null;
  }
}

function normalizeStatus(value: string | null, issues: ImportIssueCode[]): OutreachStage {
  if (value === null) {
    return "not_contacted";
  }

  const status = value
    .toLowerCase()
    .replace(/[\u2018\u2019']/gu, "")
    .replace(/[\s-]+/gu, "_");
  const stage = STAGE_BY_LEGACY_STATUS[status];
  if (stage !== undefined) {
    return stage;
  }

  issues.push("stage_invalid");
  return "not_contacted";
}

function relationshipValues(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return value.split(",");
  }

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  return [];
}

function normalizeRelationshipLabels(value: unknown, issues: ImportIssueCode[]): readonly RelationshipLabel[] {
  const labels: RelationshipLabel[] = [];

  for (const rawLabel of relationshipValues(value)) {
    const label = rawLabel.trim().toLowerCase();
    if (label === "") {
      continue;
    }

    const normalized = RELATIONSHIP_LABELS[label];
    if (normalized === undefined) {
      issues.push("relationship_label_invalid");
      continue;
    }

    if (!labels.includes(normalized)) {
      labels.push(normalized);
    }
  }

  return labels;
}

function fullNameFrom(input: Record<string, unknown>): string | null {
  const fullName = textFrom(input, ["prospect_name", "full_name", "name"]);
  if (fullName !== null) {
    return fullName;
  }

  const firstName = textFrom(input, ["first_name", "firstName"]);
  const lastName = textFrom(input, ["last_name", "lastName"]);
  const name = [firstName, lastName].filter((part): part is string => part !== null).join(" ");
  return name === "" ? null : name;
}

function addIssue(issues: ImportIssueCode[], issue: ImportIssueCode): void {
  if (!issues.includes(issue)) {
    issues.push(issue);
  }
}

function emailDomain(email: string | null): string | null {
  return email === null ? null : email.slice(email.lastIndexOf("@") + 1);
}

export function normalizeOutreachRow(
  input: Record<string, unknown>,
  rowNumber: number,
): NormalizedOutreachRow {
  const issues: ImportIssueCode[] = [];
  const rawEmail = textFrom(input, ["prospect_email", "email"])
    ?? emailFromContactInfo(textFrom(input, ["contact_info"]));
  const rawLinkedInUrl = textFrom(input, ["linkedin_url", "linkedin", "linkedinUrl"]);
  const email = normalizeEmail(rawEmail);
  const linkedinUrl = normalizeLinkedInUrl(rawLinkedInUrl);
  const fullName = fullNameFrom(input);

  if (rawEmail !== null && email === null) {
    addIssue(issues, "email_invalid");
  }
  if (rawLinkedInUrl !== null && linkedinUrl === null) {
    addIssue(issues, "linkedin_invalid");
  }

  const company = textFrom(input, ["company", "company_name"]);
  const stage = normalizeStatus(textFrom(input, ["status", "stage"]), issues);
  const relationshipLabels = normalizeRelationshipLabels(
    valueFrom(input, ["outreach_type", "relationship_labels", "relationshipLabels"]),
    issues,
  );

  if (email === null && linkedinUrl === null && fullName === null) {
    addIssue(issues, "identity_missing");
  }

  return {
    rowNumber,
    fullName,
    email,
    linkedinUrl,
    company,
    companyDomain: emailDomain(email),
    stage,
    relationshipLabels,
    ownerName: textFrom(input, ["who_reached_out", "owner", "owner_name", "ocl"]),
    issues,
  };
}

function comparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation|co)\b\.?/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function isSimilarNameAndCompany(
  row: NormalizedOutreachRow,
  candidate: ImportContactCandidate,
): boolean {
  if (row.fullName === null || row.company === null || candidate.company === null) {
    return false;
  }

  const rowName = comparable(row.fullName);
  const candidateName = comparable(candidate.fullName);
  const rowCompany = comparable(row.company);
  const candidateCompany = comparable(candidate.company);
  const companySimilar = rowCompany.includes(candidateCompany) || candidateCompany.includes(rowCompany);

  return rowName === candidateName && rowName !== "" && companySimilar;
}

function matchOwner(row: NormalizedOutreachRow, candidates: ImportCandidateIndex): string | null {
  if (row.ownerName === null) {
    return null;
  }

  const ownerName = comparable(row.ownerName);
  const owner = candidates.owners?.find(
    (candidate) => candidate.isActive && comparable(candidate.fullName) === ownerName,
  );
  return owner?.id ?? null;
}

function matchingCompanyCount(row: NormalizedOutreachRow, candidates: ImportCandidateIndex): number {
  if (row.company === null) {
    return 0;
  }

  const companyName = comparable(row.company);
  return (candidates.companies ?? []).filter(
    (candidate) => comparable(candidate.name) === companyName,
  ).length;
}

function issuesForMatch(row: NormalizedOutreachRow, candidates: ImportCandidateIndex): ImportIssueCode[] {
  const issues = [...row.issues];
  if (row.ownerName !== null && matchOwner(row, candidates) === null) {
    addIssue(issues, "owner_unmatched");
  }
  if (matchingCompanyCount(row, candidates) > 1) {
    addIssue(issues, "company_ambiguous");
  }
  return issues;
}

export function matchOutreachRow(
  row: NormalizedOutreachRow,
  candidates: ImportCandidateIndex,
): ImportMatchDecision {
  const issues = issuesForMatch(row, candidates);
  const ownerId = matchOwner(row, candidates);

  if (row.issues.includes("identity_missing")) {
    return {
      disposition: "invalid",
      contactId: null,
      suggestedContactId: null,
      matchSource: null,
      ownerId,
      issues,
    };
  }

  const emailMatches = row.email === null
    ? []
    : candidates.contacts.filter((candidate) => normalizeEmail(candidate.email) === row.email);
  if (emailMatches.length === 1) {
    return {
      disposition: "matched",
      contactId: emailMatches[0].id,
      suggestedContactId: null,
      matchSource: "email",
      ownerId,
      issues,
    };
  }
  if (emailMatches.length > 1) {
    addIssue(issues, "contact_ambiguous");
    return {
      disposition: "review_required",
      contactId: null,
      suggestedContactId: null,
      matchSource: "email",
      ownerId,
      issues,
    };
  }

  const linkedInMatches = row.linkedinUrl === null
    ? []
    : candidates.contacts.filter(
      (candidate) => normalizeLinkedInUrl(candidate.linkedinUrl) === row.linkedinUrl,
    );
  if (linkedInMatches.length === 1) {
    return {
      disposition: "matched",
      contactId: linkedInMatches[0].id,
      suggestedContactId: null,
      matchSource: "linkedin",
      ownerId,
      issues,
    };
  }
  if (linkedInMatches.length > 1) {
    addIssue(issues, "contact_ambiguous");
    return {
      disposition: "review_required",
      contactId: null,
      suggestedContactId: null,
      matchSource: "linkedin",
      ownerId,
      issues,
    };
  }

  const fuzzyMatches = candidates.contacts.filter((candidate) => isSimilarNameAndCompany(row, candidate));
  if (fuzzyMatches.length === 1) {
    return {
      disposition: "review_required",
      contactId: null,
      suggestedContactId: fuzzyMatches[0].id,
      matchSource: "name_company",
      ownerId,
      issues,
    };
  }
  if (fuzzyMatches.length > 1) {
    addIssue(issues, "contact_ambiguous");
    return {
      disposition: "review_required",
      contactId: null,
      suggestedContactId: null,
      matchSource: "name_company",
      ownerId,
      issues,
    };
  }

  return {
    disposition: "create",
    contactId: null,
    suggestedContactId: null,
    matchSource: null,
    ownerId,
    issues,
  };
}

export function summarizeImportPreview(
  decisions: readonly ImportMatchDecision[],
): ImportPreviewSummary {
  const summary: ImportPreviewSummary = {
    totalRows: decisions.length,
    matchedRows: 0,
    createRows: 0,
    reviewRequiredRows: 0,
    invalidRows: 0,
    rowsWithIssues: 0,
  };

  for (const decision of decisions) {
    if (decision.disposition === "matched") {
      summary.matchedRows += 1;
    } else if (decision.disposition === "create") {
      summary.createRows += 1;
    } else if (decision.disposition === "review_required") {
      summary.reviewRequiredRows += 1;
    } else {
      summary.invalidRows += 1;
    }

    if (decision.issues.length > 0) {
      summary.rowsWithIssues += 1;
    }
  }

  return summary;
}
