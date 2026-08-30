import type { ProgramRole } from "./types.ts";

export interface RosterInputRow {
  email: string;
  fullName: string;
  role: string;
  startupName?: string;
}

export interface ReturningIdentity {
  profileId: string;
  displayName: string;
}

export type RosterIssueCode =
  | "email_invalid"
  | "name_required"
  | "role_invalid"
  | "startup_required"
  | "duplicate_email";

export interface RosterIssue {
  code: RosterIssueCode;
  message: string;
}

export interface RosterMatch {
  kind: "returning-profile";
  profileId: string;
  displayName: string;
}

export interface RosterPreviewRow {
  rowNumber: number;
  email: string;
  fullName: string;
  role: ProgramRole | null;
  startupName: string | null;
  issues: readonly RosterIssue[];
  match: RosterMatch | null;
}

export interface RosterPreview {
  rows: readonly RosterPreviewRow[];
  summary: {
    total: number;
    ready: number;
    invalid: number;
    returning: number;
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROGRAM_ROLES: readonly ProgramRole[] = ["startup", "mentor", "admin"];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function isProgramRole(role: string): role is ProgramRole {
  return PROGRAM_ROLES.includes(role as ProgramRole);
}

export function previewRoster(
  inputRows: readonly RosterInputRow[],
  returningIdentities: ReadonlyMap<string, ReturningIdentity> = new Map(),
): RosterPreview {
  const normalizedEmails = inputRows.map((row) => normalizeEmail(row.email));
  const emailCounts = new Map<string, number>();

  for (const email of normalizedEmails) {
    if (email.length > 0) {
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }
  }

  const rows = inputRows.map<RosterPreviewRow>((input, index) => {
    const email = normalizedEmails[index] ?? "";
    const fullName = input.fullName.trim();
    const normalizedRole = input.role.trim().toLowerCase();
    const role = isProgramRole(normalizedRole) ? normalizedRole : null;
    const startupName = normalizeOptionalText(input.startupName);
    const issues: RosterIssue[] = [];

    if (!EMAIL_PATTERN.test(email)) {
      issues.push({ code: "email_invalid", message: "Enter a valid email address." });
    }
    if (fullName.length === 0) {
      issues.push({ code: "name_required", message: "Full name is required." });
    }
    if (role === null) {
      issues.push({ code: "role_invalid", message: "Role must be startup, mentor, or admin." });
    }
    if (role === "startup" && startupName === null) {
      issues.push({
        code: "startup_required",
        message: "Startup participants must be assigned to a startup.",
      });
    }
    if ((emailCounts.get(email) ?? 0) > 1) {
      issues.unshift({
        code: "duplicate_email",
        message: "This email occurs more than once in the roster.",
      });
    }

    const returningIdentity = returningIdentities.get(email);
    const match = returningIdentity
      ? {
          kind: "returning-profile" as const,
          profileId: returningIdentity.profileId,
          displayName: returningIdentity.displayName,
        }
      : null;

    return {
      rowNumber: index + 1,
      email,
      fullName,
      role,
      startupName,
      issues,
      match,
    };
  });

  return {
    rows,
    summary: {
      total: rows.length,
      ready: rows.filter((row) => row.issues.length === 0).length,
      invalid: rows.filter((row) => row.issues.length > 0).length,
      returning: rows.filter((row) => row.match !== null).length,
    },
  };
}
