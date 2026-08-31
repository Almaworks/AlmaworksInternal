export type OutreachStage =
  | "not_contacted"
  | "researching"
  | "contacted"
  | "replied"
  | "conversation_scheduled"
  | "ready"
  | "declined"
  | "closed";

export type RelationshipLabel =
  | "mentor"
  | "investor"
  | "speaker"
  | "sponsor"
  | "advisor"
  | "partner";

export type OutreachChannel =
  | "email"
  | "linkedin"
  | "warm_intro"
  | "referral"
  | "event"
  | "other";

export type ActivityKind =
  | "email"
  | "call"
  | "linkedin"
  | "meeting"
  | "reply"
  | "note"
  | "stage_change"
  | "owner_transfer"
  | "owner_release"
  | "snooze"
  | "silence"
  | "unsilence";
