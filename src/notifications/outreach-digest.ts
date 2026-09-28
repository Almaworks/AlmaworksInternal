import type { OutreachStage } from "../outreach/types.ts";

const NEW_YORK_TIME_ZONE = "America/New_York";

export interface OutreachDigestOpportunity {
  id: string;
  semesterId: string;
  contactName: string;
  companyName: string | null;
  nextAction: string;
  stage: OutreachStage;
  ownerProfileId: string | null;
  ownerIsActive: boolean;
  isActive: boolean;
  isArchived: boolean;
  isSilenced: boolean;
  snoozedUntil: string | null;
  nextFollowUpAt: string | null;
}

export interface OutreachDigestItem {
  id: string;
  semesterId: string;
  contactName: string;
  companyName: string | null;
  nextAction: string;
  dueAt: string;
  dueDate: string;
  assignment: "assigned" | "unassigned";
  status: "overdue" | "due_today";
}

export interface OutreachDigest {
  subject: string;
  text: string;
  html: string;
}

function parseTimestamp(value: string, label: string): Date {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) {
    throw new Error(`${label} must include an explicit timezone offset`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid timestamp`);
  }
  return date;
}

function newYorkDay(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDueDate(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(value);
}

function isExcluded(
  opportunity: OutreachDigestOpportunity,
  now: Date,
  includeUnassigned: boolean,
): boolean {
  if (opportunity.ownerProfileId === null && !includeUnassigned) return true;
  if (opportunity.ownerProfileId !== null && !opportunity.ownerIsActive) return true;
  if (!opportunity.isActive || opportunity.isArchived || opportunity.isSilenced) return true;
  if (opportunity.stage === "closed" || opportunity.stage === "declined") return true;
  if (opportunity.snoozedUntil !== null) {
    return parseTimestamp(opportunity.snoozedUntil, "Snoozed-until timestamp") > now;
  }
  return false;
}

function compareItems(first: OutreachDigestItem, second: OutreachDigestItem): number {
  if (first.status !== second.status) return first.status === "overdue" ? -1 : 1;
  const dueOrder = Date.parse(first.dueAt) - Date.parse(second.dueAt);
  if (dueOrder !== 0) return dueOrder;
  const contactOrder = first.contactName.localeCompare(second.contactName, undefined, { sensitivity: "base" });
  return contactOrder !== 0 ? contactOrder : first.id.localeCompare(second.id);
}

/**
 * Returns work due on or before today's New York calendar date for one recipient.
 * Set includeUnassigned only for an active semester-admin recipient.
 */
export function selectOutreachDigestItems(input: {
  ownerProfileId: string;
  includeUnassigned?: boolean;
  now: string;
  opportunities: readonly OutreachDigestOpportunity[];
}): OutreachDigestItem[] {
  const now = parseTimestamp(input.now, "Current timestamp");
  const today = newYorkDay(now);

  const items: OutreachDigestItem[] = [];
  for (const opportunity of input.opportunities) {
    const isUnassigned = opportunity.ownerProfileId === null;
    if (
      (isUnassigned && input.includeUnassigned !== true)
      || (!isUnassigned && opportunity.ownerProfileId !== input.ownerProfileId)
      || isExcluded(opportunity, now, input.includeUnassigned === true)
    ) {
      continue;
    }
    if (opportunity.nextFollowUpAt === null) continue;

    const dueAt = parseTimestamp(opportunity.nextFollowUpAt, "Next follow-up timestamp");
    const dueDay = newYorkDay(dueAt);
    if (dueDay > today) continue;

    items.push({
      id: opportunity.id,
      semesterId: opportunity.semesterId,
      contactName: opportunity.contactName,
      companyName: opportunity.companyName,
      nextAction: opportunity.nextAction,
      dueAt: opportunity.nextFollowUpAt,
      dueDate: formatDueDate(dueAt),
      assignment: isUnassigned ? "unassigned" : "assigned",
      status: dueDay < today ? "overdue" : "due_today",
    });
  }
  return items.sort(compareItems);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function safeOrigin(value: string): URL {
  const origin = new URL(value);
  if (
    origin.protocol !== "https:"
    || origin.username
    || origin.password
    || origin.pathname !== "/"
    || origin.search
    || origin.hash
  ) {
    throw new Error("A public HTTPS application origin is required for outreach digest.");
  }
  return origin;
}

export function buildOutreachOpportunityUrl(input: {
  appOrigin: string;
  semesterId: string;
  opportunityId: string;
}): string {
  const url = new URL("/dashboard/admin/outreach", safeOrigin(input.appOrigin));
  url.searchParams.set("semesterId", input.semesterId);
  url.searchParams.set("opportunityId", input.opportunityId);
  return url.toString();
}

/** Renders a single owner-specific admin reminder; it does not send mail or load data. */
export function renderOutreachDigest(input: {
  appOrigin: string;
  ownerName: string;
  items: readonly OutreachDigestItem[];
}): OutreachDigest {
  const origin = safeOrigin(input.appOrigin);
  const count = input.items.length;
  const subject = `Almaworks: ${count} outreach follow-up${count === 1 ? "" : "s"} due`;
  const rows = input.items.map((item) => {
    const url = buildOutreachOpportunityUrl({
      appOrigin: origin.toString(),
      semesterId: item.semesterId,
      opportunityId: item.id,
    });
    const company = item.companyName?.trim() ? ` at ${item.companyName.trim()}` : "";
    const status = item.status === "overdue" ? "Overdue" : "Due today";
    const assignment = item.assignment === "unassigned" ? "Unassigned opportunity · " : "";
    return {
      html: `<li><strong>${escapeHtml(assignment)}${escapeHtml(status)}: ${escapeHtml(item.contactName)}${escapeHtml(company)}</strong><br>Due: ${escapeHtml(item.dueDate)}<br>Next action: ${escapeHtml(item.nextAction)}<br><a href="${escapeHtml(url)}">Open opportunity</a></li>`,
      text: `${assignment}${status}: ${item.contactName}${company}\nDue: ${item.dueDate}\nNext action: ${item.nextAction}\nOpen opportunity: ${url}`,
    };
  });
  const noItemsText = "Your outreach queue has no due follow-ups today.";
  const text = [
    `Hello ${input.ownerName},`,
    "",
    count === 0 ? noItemsText : "Your due outreach follow-ups:",
    ...(count === 0 ? [] : ["", ...rows.map((row) => row.text).flatMap((row) => [row, ""]).slice(0, -1)]),
    "",
    "Open Almaworks for the current opportunity details.",
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;color:#17233b;line-height:1.5"><p>Hello ${escapeHtml(input.ownerName)},</p>${count === 0 ? `<p>${noItemsText}</p>` : `<p>Your due outreach follow-ups:</p><ul style="padding-left:20px">${rows.map((row) => row.html).join("")}</ul>`}<p style="font-size:13px;color:#526174">Open Almaworks for the current opportunity details.</p></div>`;
  return { subject, text, html };
}
