import type { MembershipStatus, SemesterStatus } from "./types.ts";

const SEMESTER_TRANSITIONS: Readonly<Record<SemesterStatus, readonly SemesterStatus[]>> = {
  draft: ["active"],
  active: ["closed"],
  closed: ["archived"],
  archived: [],
};

const MEMBERSHIP_TRANSITIONS: Readonly<
  Record<MembershipStatus, readonly MembershipStatus[]>
> = {
  invited: ["onboarding", "suspended"],
  onboarding: ["active", "suspended"],
  active: ["alumni", "suspended"],
  alumni: [],
  suspended: ["invited", "onboarding", "active"],
};

export function canTransitionSemester(
  from: SemesterStatus,
  to: SemesterStatus,
): boolean {
  return SEMESTER_TRANSITIONS[from].includes(to);
}

export function transitionSemester(
  from: SemesterStatus,
  to: SemesterStatus,
): SemesterStatus {
  if (!canTransitionSemester(from, to)) {
    throw new Error(`Cannot transition semester from ${from} to ${to}`);
  }

  return to;
}

export function canTransitionMembership(
  from: MembershipStatus,
  to: MembershipStatus,
): boolean {
  return MEMBERSHIP_TRANSITIONS[from].includes(to);
}

export function transitionMembership(
  from: MembershipStatus,
  to: MembershipStatus,
): MembershipStatus {
  if (!canTransitionMembership(from, to)) {
    throw new Error(`Cannot transition membership from ${from} to ${to}`);
  }

  return to;
}
