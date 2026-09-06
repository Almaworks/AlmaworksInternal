import type { MembershipStatus } from "../lifecycle/types.ts";

export function needsParticipantOnboarding(
  membershipStatus: MembershipStatus,
  readinessStatus: string | null,
): boolean {
  if (membershipStatus !== "invited" && membershipStatus !== "onboarding") {
    return false;
  }

  return readinessStatus !== "ready";
}
