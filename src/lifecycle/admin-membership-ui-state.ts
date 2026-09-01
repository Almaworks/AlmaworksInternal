import type { CohortMember } from "./cohort-management.ts";
import {
  activationAttentionCount,
  membersReadyForActivation,
} from "./admin-activation.ts";
import type { MembershipVisibility } from "./membership-presentation.ts";

export interface ActivationWorkspaceState {
  readyMembers: CohortMember[];
  attentionCount: number;
}

export interface MemberDeepLinkState {
  search: string;
  visibility: MembershipVisibility;
  selectedMembershipIds: string[];
}

export function activationWorkspaceState(
  members: readonly CohortMember[],
  currentSemesterId: string | null,
  registrationRequestCount: number,
): ActivationWorkspaceState {
  const currentMembers = currentSemesterId === null
    ? []
    : members.filter((member) => member.semesterId === currentSemesterId);
  return {
    readyMembers: membersReadyForActivation(currentMembers),
    attentionCount: activationAttentionCount(currentMembers, registrationRequestCount),
  };
}

export function memberDeepLinkState(member: string | null): MemberDeepLinkState | null {
  if (!member) return null;
  return {
    search: member,
    visibility: "all",
    selectedMembershipIds: [],
  };
}
