import type { CohortMember, CohortMemberFilters } from "./cohort-management.ts";
import { filterCohortMembers } from "./cohort-management.ts";
import type { ProgramRole } from "./types.ts";

export interface CohortRecordReference {
  recordId: string;
  profileId?: string | null;
  email?: string | null;
  semesterId?: string | null;
}

export interface CohortRecordScope {
  semesterId: string | null;
  role: ProgramRole | "all";
}

export function filterSemesterRecords<T extends { semester_id: string | null }>(
  records: readonly T[],
  semesterId: string | null,
): T[] {
  return semesterId === null
    ? [...records]
    : records.filter((record) => record.semester_id === semesterId);
}

function normalizedEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase();
  return email ? email : null;
}

function membershipsInScope(
  members: readonly CohortMember[],
  scope: CohortRecordScope,
): CohortMember[] {
  const filters: CohortMemberFilters = {
    semesterId: scope.semesterId,
    search: "",
    role: scope.role,
    activity: "all",
  };
  return filterCohortMembers(members, filters);
}

function recordMatchesMembership(record: CohortRecordReference, membership: CohortMember): boolean {
  if (record.semesterId && record.semesterId !== membership.semesterId) return false;
  if (record.profileId && record.profileId === membership.profileId) return true;
  const email = normalizedEmail(record.email);
  return email !== null && email === normalizedEmail(membership.email);
}

export function membershipsForRecord(
  record: CohortRecordReference,
  members: readonly CohortMember[],
  scope: CohortRecordScope,
): CohortMember[] {
  return membershipsInScope(members, scope).filter((membership) => recordMatchesMembership(record, membership));
}

export function roleForProfileInSemester(
  members: readonly CohortMember[],
  profileId: string,
  semesterId: string | null,
): ProgramRole | null {
  if (semesterId === null) return null;
  return members.find((member) => member.profileId === profileId && member.semesterId === semesterId)?.role ?? null;
}

export function membershipIdsForRecords(
  records: readonly CohortRecordReference[],
  members: readonly CohortMember[],
  scope: CohortRecordScope,
): string[] {
  const scoped = membershipsInScope(members, scope);
  const ids = scoped.flatMap((membership) =>
    records.some((record) => recordMatchesMembership(record, membership))
      ? [membership.membershipId]
      : [],
  );
  return [...new Set(ids)];
}

export function selectedVisibleMembershipIds(
  selectedIds: readonly string[],
  visibleIds: readonly string[],
): string[] {
  const selected = new Set(selectedIds);
  return [...new Set(visibleIds)].filter((id) => selected.has(id));
}

export function filterRecordsForCohort<T extends CohortRecordReference>(
  records: readonly T[],
  members: readonly CohortMember[],
  scope: CohortRecordScope,
): T[] {
  const ids = new Set(membershipIdsForRecords(records, members, scope));
  const scoped = membershipsInScope(members, scope);
  return records.filter((record) => scoped.some((membership) =>
    ids.has(membership.membershipId) && recordMatchesMembership(record, membership),
  ));
}
