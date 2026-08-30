import type { OutreachStage } from "./types.ts";

const OUTREACH_STAGE_TRANSITIONS: Readonly<
  Record<OutreachStage, readonly OutreachStage[]>
> = {
  prospect: ["researching", "closed"],
  researching: ["ready", "closed"],
  ready: ["contacted", "closed"],
  contacted: ["responded", "nurture", "closed"],
  responded: ["meeting", "nurture", "closed"],
  meeting: ["converted", "nurture", "closed"],
  nurture: ["ready", "contacted", "closed"],
  converted: [],
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
  return stage !== "converted" && stage !== "closed";
}
