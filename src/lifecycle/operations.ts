import type {
  InvitationStatus,
  MembershipStatus,
  ProgramRole,
} from "./types.ts";

export interface OperationsMember {
  id: string;
  name: string;
  email: string;
  role: ProgramRole;
  organization: string | null;
  membershipStatus: MembershipStatus;
  invitationStatus: InvitationStatus;
  onboardingPercent: number;
}

export interface OperationsSummary {
  total: number;
  active: number;
  onboarding: number;
  invited: number;
  alumni: number;
  suspended: number;
  readyPercent: number;
  deliveryFailures: number;
}

export interface RosterFilters {
  search: string;
  role: ProgramRole | "all";
  attentionOnly: boolean;
}

export function buildOperationsSummary(
  members: readonly OperationsMember[],
): OperationsSummary {
  const countStatus = (status: MembershipStatus) =>
    members.filter((member) => member.membershipStatus === status).length;
  const ready = members.filter((member) => member.onboardingPercent === 100).length;

  return {
    total: members.length,
    active: countStatus("active"),
    onboarding: countStatus("onboarding"),
    invited: countStatus("invited"),
    alumni: countStatus("alumni"),
    suspended: countStatus("suspended"),
    readyPercent: members.length === 0 ? 0 : Math.round((ready / members.length) * 100),
    deliveryFailures: members.filter((member) => member.invitationStatus === "failed").length,
  };
}

export function filterRosterMembers(
  members: readonly OperationsMember[],
  filters: RosterFilters,
): OperationsMember[] {
  const search = filters.search.trim().toLowerCase();

  return members.filter((member) => {
    const matchesSearch =
      search.length === 0 ||
      [member.name, member.email, member.organization ?? ""].some((value) =>
        value.toLowerCase().includes(search),
      );
    const matchesRole = filters.role === "all" || member.role === filters.role;
    const needsAttention =
      member.invitationStatus === "failed" ||
      member.membershipStatus === "suspended" ||
      member.onboardingPercent < 100;

    return matchesSearch && matchesRole && (!filters.attentionOnly || needsAttention);
  });
}
