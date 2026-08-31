import { classifyFollowUp, type FollowUpBucket } from "@/src/outreach/cadence";
import type { OutreachStage } from "@/src/outreach/types";

export type OutreachView = "mine" | "team" | "people" | "companies" | "imports";

const outreachStages = new Set<OutreachStage>([
  "not_contacted", "researching", "contacted", "replied", "conversation_scheduled", "ready", "declined", "closed",
]);

export interface WorkspaceRow {
  id: string;
  semesterId: string;
  semesterName: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  stage: string;
  ownerProfileId: string | null;
  ownerName: string | null;
  ownerIsActive: boolean;
  nextFollowUpAt: string | null;
  snoozedUntil: string | null;
  isSilenced: boolean;
  latestInboundActivityAt: string | null;
  latestOutboundActivityAt: string | null;
  /** Present in preview data and newer API responses; required by mutation endpoints. */
  updatedAt?: string;
  companyName?: string | null;
  companyDomain?: string | null;
  biography?: string | null;
  labels?: readonly string[];
  cadenceDays?: number;
  silenceReason?: string | null;
}

export interface WorkspaceHealth {
  overdue: number;
  dueToday: number;
  unassigned: number;
  awaitingResponse: number;
}

export interface WorkspaceOwner {
  profileId: string;
  name: string;
  email: string | null;
}

export interface WorkspaceData {
  health: WorkspaceHealth;
  rows: readonly WorkspaceRow[];
  owners: readonly WorkspaceOwner[];
  semester: { id: string; name: string; startsOn?: string; endsOn?: string; isActive?: boolean };
  nextCursor: string | null;
}

export interface WorkspaceSemester { id: string; name: string; isActive: boolean; }

export interface ActivityItem {
  id: string;
  activityKind: string;
  channel: string | null;
  occurredAt: string;
  summary: string | null;
  actorProfileId: string | null;
}

/** Uses the shared domain classification in every Outreach UI view. */
export function classifyWorkspaceRow(row: WorkspaceRow, now = new Date().toISOString()): FollowUpBucket {
  if (!outreachStages.has(row.stage as OutreachStage)) return "waiting";
  return classifyFollowUp({
    stage: row.stage as OutreachStage,
    ownerProfileId: row.ownerProfileId,
    ownerIsActive: row.ownerIsActive,
    nextFollowUpAt: row.nextFollowUpAt,
    snoozedUntil: row.snoozedUntil,
    isSilenced: row.isSilenced,
  }, now);
}

export function isActionableWorkspaceRow(row: WorkspaceRow, now = new Date().toISOString()): boolean {
  const state = classifyWorkspaceRow(row, now);
  return state !== "closed" && state !== "silenced" && state !== "snoozed";
}
