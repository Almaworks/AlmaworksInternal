import type { MembershipStatus } from "../lifecycle/types.ts";

export function needsParticipantOnboarding(
  membershipStatus: MembershipStatus,
  onboardingCompletedAt: string | null,
): boolean {
  if (membershipStatus !== "invited" && membershipStatus !== "onboarding") {
    return false;
  }

  // Startup readiness belongs to the whole team, not this member's onboarding.
  return onboardingCompletedAt === null || !Number.isFinite(Date.parse(onboardingCompletedAt));
}
