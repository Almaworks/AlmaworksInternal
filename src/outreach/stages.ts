import type { OutreachStage } from "./types.ts";

const OUTREACH_STAGE_TRANSITIONS: Readonly<
  Record<OutreachStage, readonly OutreachStage[]>
> = {
  not_contacted: ["researching", "contacted", "declined", "closed"],
  researching: ["contacted", "ready", "declined", "closed"],
  contacted: ["replied", "declined", "closed"],
  replied: ["conversation_scheduled", "ready", "declined", "closed"],
  conversation_scheduled: ["ready", "declined", "closed"],
  ready: ["contacted", "conversation_scheduled", "declined", "closed"],
  declined: ["not_contacted", "closed"],
  closed: [],
};

export function canTransitionOutreachStage(
  from: OutreachStage,
  to: OutreachStage,
): boolean {
  return OUTREACH_STAGE_TRANSITIONS[from].includes(to);
}

export function transitionOutreachStage(
  from: OutreachStage,
  to: OutreachStage,
): OutreachStage {
  if (!canTransitionOutreachStage(from, to)) {
    throw new Error(`Cannot transition outreach from ${from} to ${to}`);
  }

  return to;
}

export function isOpenOutreachStage(stage: OutreachStage): boolean {
  return stage !== "declined" && stage !== "closed";
}
