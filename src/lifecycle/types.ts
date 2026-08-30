export type ProgramRole = "startup" | "mentor" | "admin";

export type SemesterStatus = "draft" | "active" | "closed" | "archived";

export type MembershipStatus =
  | "invited"
  | "onboarding"
  | "active"
  | "alumni"
  | "suspended";

export type InvitationStatus =
  | "draft"
  | "queued"
  | "sent"
  | "failed"
  | "accepted"
  | "expired"
  | "revoked";
