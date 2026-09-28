import { supportedOutreachEmailPlaceholders, validateOutreachEmailTemplate } from "../../src/outreach-email/model.ts";

export function scheduleLabel(value: string | null, timeZone: string): string {
  if (value === null) return "Send immediately";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

export function canSchedule(value: string, now: Date): boolean {
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && timestamp > now.getTime() && timestamp <= now.getTime() + 30 * 24 * 60 * 60 * 1000;
}

export function isValidTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone }); return true; } catch { return false; }
}

export const outreachEmailTemplateImportExample = `# Program introduction
Subject: Almaworks × {{company_name}}

Hi {{contact_name}},

I'm reaching out from Almaworks about {{semester_name}}. We'd love to explore how {{company_name}} could take part.

Best,
Almaworks
`;

export type ImportedOutreachEmailTemplate = {
  bodyTemplate: string;
  name: string;
  subjectTemplate: string;
};

/** Parses the documented plain-text Markdown format used by the template library. */
export function parseImportedOutreachEmailTemplate(value: string): ImportedOutreachEmailTemplate {
  const normalized = value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  const lines = normalized.split("\n");
  const heading = lines[0]?.match(/^#\s+(.+?)\s*$/u);
  if (!heading) throw new Error("The first line must be the template name, starting with '# '.");
  const subject = lines[1]?.match(/^Subject:\s*(.+?)\s*$/u);
  if (!subject) throw new Error("The second line must start with 'Subject: '.");
  if (lines[2]?.trim() !== "") throw new Error("Leave one blank line between the subject and the body.");
  const name = heading[1]!.trim();
  const subjectTemplate = subject[1]!.trim();
  const bodyTemplate = lines.slice(3).join("\n").trim();
  if (name.length > 120) throw new Error("The template name must be at most 120 characters.");
  if (subjectTemplate.length > 500) throw new Error("The subject must be at most 500 characters.");
  if (bodyTemplate.length === 0) throw new Error("Add a plain-text email body after the blank line.");
  if (bodyTemplate.length > 20_000) throw new Error("The body must be at most 20,000 characters.");
  try {
    validateOutreachEmailTemplate(subjectTemplate);
    validateOutreachEmailTemplate(bodyTemplate);
  } catch (cause) {
    throw new Error(cause instanceof Error ? cause.message : "The template contains an invalid recipient variable.");
  }
  return { name, subjectTemplate, bodyTemplate };
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nullableText(value: unknown): boolean { return value === null || typeof value === "string"; }
function instant(value: unknown): boolean { return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value)); }
function nullableInstant(value: unknown): boolean { return value === null || instant(value); }
const statuses = new Set(["accepted", "bounced", "cancel_unknown", "cancelled", "complained", "delivered", "failed", "prepared", "scheduled", "sent", "submission_unknown"]);
const placeholders = new Set<string>(supportedOutreachEmailPlaceholders());

export function isOutreachEmailWorkspace(value: unknown): value is import("../../src/outreach-email/types").OutreachEmailWorkspaceResponse {
  if (!record(value) || typeof value.semesterId !== "string" || !record(value.configuration)) return false;
  const c = value.configuration;
  if (typeof c.available !== "boolean" || !nullableText(c.sender) || !nullableText(c.unavailableReason) || typeof c.timeZone !== "string" || !isValidTimeZone(c.timeZone)) return false;
  if (!Array.isArray(value.supportedPlaceholders) || !value.supportedPlaceholders.every(p => typeof p === "string" && placeholders.has(p))) return false;
  if (c.mentorOnboardingUrl !== undefined && !nullableText(c.mentorOnboardingUrl)) return false;
  const o = value.opportunity;
  if (record(o) && o.jobTitle !== undefined && !nullableText(o.jobTitle)) return false;
  if (o !== null && (!record(o) || !["opportunityId", "recipientEmail", "recipientName", "semesterName"].every(k => typeof o[k] === "string") || !nullableText(o.companyName))) return false;
  const template = (t: unknown): boolean => record(t) && ["templateId", "name", "subjectTemplate", "bodyTemplate"].every(k => typeof t[k] === "string") && (t.source === "saved" || t.source === "starter") && ["archivedAt", "createdAt", "updatedAt"].every(k => nullableInstant(t[k]));
  const message = (m: unknown): boolean => record(m)
    && ["messageId", "opportunityId", "recipientEmail", "recipientName", "sender", "subject", "body"].every(k => typeof m[k] === "string")
    && typeof m.status === "string" && statuses.has(m.status)
    && ["templateId", "providerId", "providerStatus", "lastError", "activityId"].every(k => nullableText(m[k]))
    && ["createdAt", "idempotencyExpiresAt"].every(k => instant(m[k]))
    && ["scheduledAt", "sentAt", "acceptedAt", "deliveredAt", "cancelledAt", "providerCheckedAt"].every(k => nullableInstant(m[k]))
    && ["canCancel", "canRefresh", "canRetry"].every(k => typeof m[k] === "boolean");
  return Array.isArray(value.templates) && value.templates.every(template)
    && Array.isArray(value.starterTemplates) && value.starterTemplates.every(template)
    && Array.isArray(value.messages) && value.messages.every(message);
}
export function canReleaseFailedDraft(status: number, previouslyUnresolved: boolean): boolean {
  return !previouslyUnresolved && [400, 401, 403, 404, 422, 503].includes(status);
}
