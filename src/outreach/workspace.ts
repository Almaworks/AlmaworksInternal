import {
  classifyFollowUp,
  type FollowUpBucket,
} from "./cadence.ts";
import type { OutreachStage } from "./types.ts";

export function getOutreachScreenState(input: {
  semestersLoading: boolean;
  workspaceLoading: boolean;
  hasData: boolean;
  hasError: boolean;
}): "loading" | "error" | "ready" {
  if (input.semestersLoading || input.workspaceLoading) return "loading";
  if (input.hasError || !input.hasData) return "error";
  return "ready";
}

export interface OutreachCursor {
  nextFollowUpAt: string | null;
  id: string;
}

export interface OutreachWorkspaceItem {
  id: string;
  semesterId: string;
  contactId: string;
  contactName: string;
  contactEmail: string | null;
  stage: OutreachStage;
  ownerProfileId: string | null;
  ownerName: string | null;
  ownerIsActive: boolean;
  nextFollowUpAt: string | null;
  snoozedUntil: string | null;
  isSilenced: boolean;
  latestInboundActivityAt: string | null;
  latestOutboundActivityAt: string | null;
  updatedAt?: string;
  cadenceDays?: number;
  silenceReason?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  biography?: string | null;
  labels?: readonly string[];
}

export interface OutreachHealth {
  overdue: number;
  dueToday: number;
  unassigned: number;
  awaitingResponse: number;
}

export interface OutreachOwnerGroup {
  ownerProfileId: string | null;
  ownerName: string;
  items: readonly OutreachWorkspaceItem[];
}

export interface WorkspaceRowsPage<Row> {
  rows: readonly Row[];
  nextCursor: string | null;
}

export type OutreachWorkspaceView = "mine" | "team" | "people" | "companies" | "imports";

export function resolveOutreachSemesterId(
  view: OutreachWorkspaceView,
  requestedSemesterId: string | null,
  semesters: readonly { id: string; isActive: boolean }[],
): string {
  const activeSemesterId = semesters.find((semester) => semester.isActive)?.id ?? "";
  if (view === "people") return activeSemesterId;
  if (
    requestedSemesterId !== null
    && requestedSemesterId !== "all"
    && semesters.some((semester) => semester.id === requestedSemesterId)
  ) {
    return requestedSemesterId;
  }
  return activeSemesterId;
}

export function buildOutreachWorkspaceQuery(input: {
  semesterId: string;
  view: OutreachWorkspaceView;
  cursor?: string;
}): string {
  const query = new URLSearchParams({
    semesterId: input.semesterId,
    view: input.view,
    pageSize: "100",
  });
  if (input.cursor !== undefined) query.set("cursor", input.cursor);
  return query.toString();
}

export async function loadCompleteWorkspacePages<Row, Page extends WorkspaceRowsPage<Row>>(
  loadPage: (cursor?: string) => Promise<Page>,
  maximumRows: number,
): Promise<readonly Page[]> {
  const pages: Page[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let loadedRows = 0;

  do {
    const page = await loadPage(cursor);
    loadedRows += page.rows.length;
    if (loadedRows > maximumRows) {
      throw new Error(`All-time outreach exceeds the ${maximumRows}-row safety bound.`);
    }
    pages.push(page);
    if (page.nextCursor === null) return pages;
    if (seenCursors.has(page.nextCursor)) {
      throw new Error("All-time outreach pagination returned a repeated cursor.");
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (true);
}

function compareText(first: string, second: string): number {
  return first.localeCompare(second, undefined, { sensitivity: "base" });
}

function compareNextAction(
  first: OutreachWorkspaceItem,
  second: OutreachWorkspaceItem,
): number {
  if (first.nextFollowUpAt === null && second.nextFollowUpAt !== null) {
    return 1;
  }
  if (first.nextFollowUpAt !== null && second.nextFollowUpAt === null) {
    return -1;
  }
  if (first.nextFollowUpAt !== null && second.nextFollowUpAt !== null) {
    const timestampOrder = Date.parse(first.nextFollowUpAt) - Date.parse(second.nextFollowUpAt);
    if (timestampOrder !== 0) {
      return timestampOrder;
    }
  }
  return 0;
}

function isAwaitingResponse(item: OutreachWorkspaceItem): boolean {
  if (item.stage === "closed" || item.stage === "declined") {
    return false;
  }
  if (item.latestOutboundActivityAt === null) {
    return false;
  }
  return item.latestInboundActivityAt === null
    || Date.parse(item.latestInboundActivityAt) < Date.parse(item.latestOutboundActivityAt);
}

function classifyWorkspaceItem(
  item: OutreachWorkspaceItem,
  nowTimestamp: string,
): FollowUpBucket {
  return classifyFollowUp(
    {
      stage: item.stage,
      ownerProfileId: item.ownerProfileId,
      ownerIsActive: item.ownerIsActive,
      nextFollowUpAt: item.nextFollowUpAt,
      snoozedUntil: item.snoozedUntil,
      isSilenced: item.isSilenced,
    },
    nowTimestamp,
  );
}

interface OutreachQueueFilterItem {
  stage: string;
  ownerProfileId: string | null;
  ownerIsActive: boolean;
  nextFollowUpAt: string | null;
  snoozedUntil: string | null;
  isSilenced: boolean;
}

export function filterOutreachWorkspaceForView<Item extends OutreachQueueFilterItem>(
  items: readonly Item[],
  view: "mine" | "team" | "people",
  currentProfileId: string | null,
  nowTimestamp: string,
): Item[] {
  if (view === "people") return [...items];

  return items.filter((item) => {
    const bucket = item.stage === "closed" || item.stage === "declined"
      ? "closed"
      : classifyFollowUp({
        stage: item.stage as OutreachStage,
        ownerProfileId: item.ownerProfileId,
        ownerIsActive: item.ownerIsActive,
        nextFollowUpAt: item.nextFollowUpAt,
        snoozedUntil: item.snoozedUntil,
        isSilenced: item.isSilenced,
      }, nowTimestamp);
    const isAssignedOpenWork = !["closed", "silenced", "snoozed", "unassigned"].includes(bucket);
    if (!isAssignedOpenWork) return false;
    return view === "team" || (currentProfileId !== null && item.ownerProfileId === currentProfileId);
  });
}

export function buildOutreachHealth(
  items: readonly OutreachWorkspaceItem[],
  nowTimestamp: string,
): OutreachHealth {
  const health: OutreachHealth = {
    overdue: 0,
    dueToday: 0,
    unassigned: 0,
    awaitingResponse: 0,
  };

  for (const item of items) {
    const bucket = classifyWorkspaceItem(item, nowTimestamp);
    if (bucket === "overdue") {
      health.overdue += 1;
    }
    if (bucket === "due_today") {
      health.dueToday += 1;
    }
    if (bucket === "unassigned") {
      health.unassigned += 1;
    }
    if (isAwaitingResponse(item)) {
      health.awaitingResponse += 1;
    }
  }

  return health;
}

export function sortOutreachWorkspaceItems(
  items: readonly OutreachWorkspaceItem[],
): OutreachWorkspaceItem[] {
  return [...items].sort((first, second) => {
    const nextActionOrder = compareNextAction(first, second);
    if (nextActionOrder !== 0) {
      return nextActionOrder;
    }
    const contactNameOrder = compareText(first.contactName, second.contactName);
    return contactNameOrder !== 0 ? contactNameOrder : compareText(first.id, second.id);
  });
}

export function groupOutreachWorkspaceByOwner(
  items: readonly OutreachWorkspaceItem[],
): OutreachOwnerGroup[] {
  const byOwner = new Map<string, OutreachOwnerGroup>();

  for (const item of sortOutreachWorkspaceItems(items)) {
    const key = item.ownerProfileId ?? "__unassigned__";
    const existingGroup = byOwner.get(key);
    if (existingGroup !== undefined) {
      existingGroup.items = [...existingGroup.items, item];
      continue;
    }
    byOwner.set(key, {
      ownerProfileId: item.ownerProfileId,
      ownerName: item.ownerName ?? "Unassigned",
      items: [item],
    });
  }

  return [...byOwner.values()].sort((first, second) => {
    if (first.ownerProfileId === null) {
      return second.ownerProfileId === null ? 0 : -1;
    }
    if (second.ownerProfileId === null) {
      return 1;
    }
    const ownerNameOrder = compareText(first.ownerName, second.ownerName);
    return ownerNameOrder !== 0
      ? ownerNameOrder
      : compareText(first.ownerProfileId, second.ownerProfileId);
  });
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]*$/u.test(value) || value.length % 4 === 1) {
    throw new Error("Invalid outreach cursor");
  }
  const base64 = value
    .replace(/-/gu, "+")
    .replace(/_/gu, "/")
    .padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeOutreachCursor(cursor: OutreachCursor): string {
  return encodeBase64Url(JSON.stringify(cursor));
}

export function decodeOutreachCursor(encodedCursor: string): OutreachCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64Url(encodedCursor));
  } catch {
    throw new Error("Invalid outreach cursor");
  }

  if (
    typeof parsed !== "object"
    || parsed === null
    || !("nextFollowUpAt" in parsed)
    || !("id" in parsed)
    || (parsed.nextFollowUpAt !== null && typeof parsed.nextFollowUpAt !== "string")
    || typeof parsed.id !== "string"
    || parsed.nextFollowUpAt === ""
    || parsed.id === ""
  ) {
    throw new Error("Invalid outreach cursor");
  }

  return {
    nextFollowUpAt: parsed.nextFollowUpAt,
    id: parsed.id,
  };
}
