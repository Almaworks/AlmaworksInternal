import type { CohortMember } from "./cohort-management.ts";
import { membershipPresentationState } from "./membership-presentation.ts";

export const ACTIVATION_TAB_LABEL = "Needs activation";

export function membersReadyForActivation(members: readonly CohortMember[]): CohortMember[] {
  return members.filter((member) => membershipPresentationState(member) === "ready_for_activation");
}

export function activationAttentionCount(
  members: readonly CohortMember[],
  registrationRequestCount: number,
): number {
  return membersReadyForActivation(members).length + registrationRequestCount;
}
