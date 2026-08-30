import type { MembershipStatus, ProgramRole } from "./types.ts";

export interface CohortSummary {
  id: string;
  name: string;
  startsOn: string;
  isActive: boolean;
}

export interface CohortMember {
  membershipId: string;
  profileId: string;
  name: string;
  email: string;
  role: ProgramRole;
  status: MembershipStatus;
  semesterId: string;
  semesterName: string;
}

export interface CohortMemberFilters {
  semesterId: string | null;
  search: string;
  role: ProgramRole | "all";
  activity: "active" | "inactive" | "all";
}

export type CohortScope =
  | { kind: "confirmation_required"; warning: string }
  | { kind: "all_time"; semesterId: null; canMutate: false }
  | { kind: "semester"; semesterId: string; canMutate: true };

export interface BulkLifecycleRequest {
  semesterId: string;
  membershipIds: string[];
  activity: "active" | "inactive";
}

export interface ImportMembershipsRequest {
  sourceSemesterId: string;
  targetSemesterId: string;
  membershipIds: string[] | null;
}

const MAX_BULK_MEMBERSHIPS = 200;

export class CohortValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CohortValidationError";
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CohortValidationError(`${field} is required.`);
  }
  return value.trim();
}

function uniqueIds(value: unknown, allowAll: boolean): string[] | null {
  if (value === null && allowAll) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BULK_MEMBERSHIPS) {
    throw new CohortValidationError(`membershipIds must contain between 1 and ${MAX_BULK_MEMBERSHIPS} values.`);
  }
  const ids = value.map((id) => requiredText(id, "membershipId"));
  return [...new Set(ids)];
}

export function buildCohortOptions(semesters: readonly CohortSummary[]) {
  const all = [...semesters].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
    return right.startsOn.localeCompare(left.startsOn);
  });
  return {
    current: all.find((semester) => semester.isActive) ?? all[0] ?? null,
    previous: all.find((semester) => !semester.isActive) ?? null,
    all,
  };
}

export function parseCohortScope(value: string, allTimeConfirmed: boolean): CohortScope {
  if (value === "all") {
    if (!allTimeConfirmed) {
      return {
        kind: "confirmation_required",
        warning: "All-time view loads every cohort and may take longer.",
      };
    }
    return { kind: "all_time", semesterId: null, canMutate: false };
  }
  return { kind: "semester", semesterId: requiredText(value, "semesterId"), canMutate: true };
}

export function filterCohortMembers(
  members: readonly CohortMember[],
  filters: CohortMemberFilters,
): CohortMember[] {
  const search = filters.search.trim().toLowerCase();
  return members.filter((member) => {
    const matchesSemester = filters.semesterId === null || member.semesterId === filters.semesterId;
    const matchesRole = filters.role === "all" || member.role === filters.role;
    const isActive = member.status === "active";
    const matchesActivity = filters.activity === "all"
      || (filters.activity === "active" ? isActive : !isActive);
    const matchesSearch = search.length === 0
      || `${member.name} ${member.email} ${member.semesterName}`.toLowerCase().includes(search);
    return matchesSemester && matchesRole && matchesActivity && matchesSearch;
  });
}

export function parseBulkLifecycleRequest(value: unknown): BulkLifecycleRequest {
  if (typeof value !== "object" || value === null) throw new CohortValidationError("Request body is required.");
  const input = value as Record<string, unknown>;
  if (input.semesterId === null) throw new CohortValidationError("Bulk changes require a specific semester.");
  const semesterId = requiredText(input.semesterId, "semesterId");
  if (input.activity !== "active" && input.activity !== "inactive") {
    throw new CohortValidationError("activity must be active or inactive.");
  }
  return {
    semesterId,
    membershipIds: uniqueIds(input.membershipIds, false) ?? [],
    activity: input.activity,
  };
}

export function parseImportMembershipsRequest(value: unknown): ImportMembershipsRequest {
  if (typeof value !== "object" || value === null) throw new CohortValidationError("Request body is required.");
  const input = value as Record<string, unknown>;
  const sourceSemesterId = requiredText(input.sourceSemesterId, "sourceSemesterId");
  const targetSemesterId = requiredText(input.targetSemesterId, "targetSemesterId");
  if (sourceSemesterId === targetSemesterId) {
    throw new CohortValidationError("Source and target semesters must differ.");
  }
  return {
    sourceSemesterId,
    targetSemesterId,
    membershipIds: uniqueIds(input.membershipIds, true),
  };
}
