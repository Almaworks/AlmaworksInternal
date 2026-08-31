import type { OutreachStage } from "./types.ts";

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const DEFAULT_FOLLOW_UP_HORIZON_DAYS = 7;

export type FollowUpBucket =
  | "closed"
  | "silenced"
  | "snoozed"
  | "unassigned"
  | "overdue"
  | "due_today"
  | "upcoming"
  | "waiting";

export interface FollowUpOpportunity {
  stage: OutreachStage;
  ownerProfileId: string | null;
  ownerIsActive: boolean;
  nextFollowUpAt: string | null;
  snoozedUntil: string | null;
  isSilenced: boolean;
}

function parseTimestamp(timestamp: string, label: string): Date {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/u.test(timestamp)) {
    throw new Error(`${label} must include an explicit timezone offset`);
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }

  return date;
}

function utcDayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function validateCadenceDays(cadenceDays: number): void {
  if (
    !Number.isInteger(cadenceDays) ||
    cadenceDays < 1 ||
    cadenceDays > 365
  ) {
    throw new Error("Cadence must be an integer between 1 and 365 days");
  }
}

function hasActiveOwner(opportunity: FollowUpOpportunity): boolean {
  return opportunity.ownerProfileId !== null && opportunity.ownerIsActive;
}

export function calculateNextFollowUp(
  activityTimestamp: string,
  cadenceDays: number,
): string {
  validateCadenceDays(cadenceDays);
  const activityDate = parseTimestamp(activityTimestamp, "Activity timestamp");

  return new Date(
    activityDate.getTime() + cadenceDays * DAY_IN_MILLISECONDS,
  ).toISOString();
}

export function classifyFollowUp(
  opportunity: FollowUpOpportunity,
  nowTimestamp: string,
  horizonDays = DEFAULT_FOLLOW_UP_HORIZON_DAYS,
): FollowUpBucket {
  const now = parseTimestamp(nowTimestamp, "Current timestamp");

  if (opportunity.stage === "closed" || opportunity.stage === "declined") {
    return "closed";
  }

  if (opportunity.isSilenced) {
    return "silenced";
  }

  if (
    opportunity.snoozedUntil !== null &&
    parseTimestamp(opportunity.snoozedUntil, "Snoozed-until timestamp") > now
  ) {
    return "snoozed";
  }

  if (!hasActiveOwner(opportunity)) {
    return "unassigned";
  }

  if (opportunity.nextFollowUpAt === null) {
    return "waiting";
  }

  const nextFollowUp = parseTimestamp(
    opportunity.nextFollowUpAt,
    "Next follow-up timestamp",
  );
  const todayStart = utcDayStart(now);
  const nextFollowUpDay = utcDayStart(nextFollowUp);

  if (nextFollowUpDay < todayStart) {
    return "overdue";
  }

  if (nextFollowUpDay === todayStart) {
    return "due_today";
  }

  if (nextFollowUpDay <= todayStart + horizonDays * DAY_IN_MILLISECONDS) {
    return "upcoming";
  }

  return "waiting";
}

export function restoreSilencedOpportunity(
  opportunity: FollowUpOpportunity,
  nextFollowUpAt: string | null,
): FollowUpOpportunity {
  if (nextFollowUpAt === null) {
    throw new Error("A next follow-up is required to restore a silenced opportunity");
  }

  parseTimestamp(nextFollowUpAt, "Next follow-up timestamp");

  return {
    ...opportunity,
    isSilenced: false,
    nextFollowUpAt,
  };
}
