import type { ParticipantDirectoryEntry, ParticipantMembershipInput } from "./participant-dashboard.ts";

/** Memberships, never a global profile's existence, determine cohort participation. */
export function scopeActiveNetwork(
  semesterId: string,
  viewerProfileId: string,
  memberships: ParticipantMembershipInput[],
  entries: ParticipantDirectoryEntry[],
): ParticipantDirectoryEntry[] {
  const active = new Set(memberships.filter((member) => (
    member.semesterId === semesterId && member.status === "active"
    && (member.role === "mentor" || member.role === "startup")
  )).map((member) => `${member.profileId}:${member.role}`));
  return entries.filter((entry) => entry.semesterId === semesterId
    && entry.id !== viewerProfileId && active.has(`${entry.id}:${entry.kind}`));
}
