import type {
  OutreachEmailCommand,
  OutreachEmailPlaceholder,
  OutreachEmailTemplate,
} from "./types.ts";

export { outreachEmailStarterPurposeLabels } from "./types.ts";

export class OutreachEmailRequestError extends Error {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "OutreachEmailRequestError";
    this.field = field;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OFFSET_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|([+-])(\d{2}):(\d{2}))$/u;
const PLACEHOLDER_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gu;
const SUPPORTED_PLACEHOLDERS = ["company_name", "contact_name", "job_title", "mentor_onboarding_url", "semester_name"] as const satisfies readonly OutreachEmailPlaceholder[];
const MAX_SCHEDULE_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export const outreachEmailStarterTemplates: readonly OutreachEmailTemplate[] = [
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nI'm reaching out from Almaworks, the startup accelerator supporting Columbia student founders. We'd love to explore how {{company_name}} could take part in {{semester_name}}.\n\nWould you be open to a short conversation?\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Program introduction",
    "source": "starter",
    "subjectTemplate": "Almaworks × {{company_name}}",
    "templateId": "starter-program-introduction",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nI wanted to follow up on my note about Almaworks and {{semester_name}}. Would you be interested in learning more?\n\nPlease let me know if someone else at {{company_name}} would be a better person to contact.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Friendly follow-up",
    "source": "starter",
    "subjectTemplate": "Following up — {{semester_name}}",
    "templateId": "starter-friendly-follow-up",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nI'm reaching out from Almaworks, the startup accelerator supporting Columbia student founders. For {{semester_name}}, we're inviting mentors across product development, marketing, growth, recruiting, fundraising, legal, and other areas to advise our startups.\n\nYour experience at {{company_name}} could be valuable to our founders. Mentorship meetings can take place throughout the week based on mentors' availability and coordination with startups.\n\nIf you are interested in joining as a mentor, please fill out this [form](https://docs.google.com/forms/d/e/1FAIpQLSdjDnF2Lm5tPBozf4p-Gjz9Rg5pbmXRZlMDDKro07Pn95GA0A/viewform?pli=1).\n\nPlease reply with any questions. We'd love to have you involved.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Mentor invitation",
    "purpose": "mentor_invitation",
    "source": "starter",
    "subjectTemplate": "Invitation: Almaworks Mentorship — {{semester_name}}",
    "templateId": "starter-mentor-invitation",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nI'm reaching out from Almaworks, the startup accelerator supporting Columbia student founders. We would love to invite you to share your experience at {{company_name}} with our {{semester_name}} cohort.\n\nOur aim is a practical conversation with founders, with time for questions. We can agree on a topic, date, format, and location that work for you.\n\nWould you be interested? I'm happy to share more details or arrange a short call.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Speaker invitation",
    "purpose": "speaker_invitation",
    "source": "starter",
    "subjectTemplate": "Speak with Almaworks — {{semester_name}}",
    "templateId": "starter-speaker-invitation",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nI'm reaching out from Almaworks, the startup accelerator supporting Columbia student founders. We're connecting our {{semester_name}} cohort with investors whose interests align with what our teams are building.\n\nWe would love to learn about {{company_name}}'s investment interests and explore relevant introductions. I can share a current cohort overview if useful.\n\nWould you be open to a brief introductory call?\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Investor introduction",
    "purpose": "investor_introduction",
    "source": "starter",
    "subjectTemplate": "Meet Almaworks founders — {{semester_name}}",
    "templateId": "starter-investor-introduction",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nI'm reaching out from Almaworks, the startup accelerator supporting Columbia student founders. We're exploring partnerships and sponsorships to support our {{semester_name}} cohort.\n\nWe'd love to discuss how {{company_name}} could get involved, whether through resources, expertise, or other support for early-stage founders.\n\nWould you be open to a short conversation? I'm happy to share more about the program and learn what would make a partnership useful for your team.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Partner / sponsor invitation",
    "purpose": "partner_sponsor_invitation",
    "source": "starter",
    "subjectTemplate": "Partner with Almaworks — {{semester_name}}",
    "templateId": "starter-partner-sponsor-invitation",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nWe would be delighted to invite you to serve as a judge for Almaworks Demo Day for {{semester_name}}. Your experience at {{company_name}} could help our founders receive thoughtful, practical feedback.\n\nWould you be interested? We can share the event date, format, and judging expectations so you can decide whether it fits your schedule.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Demo Day judge invitation",
    "purpose": "demo_day_judge_invitation",
    "source": "starter",
    "subjectTemplate": "Judge Almaworks Demo Day — {{semester_name}}",
    "templateId": "starter-demo-day-judge-invitation",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nWe were so happy to have you as a mentor for a previous Almaworks cohort, and we're reaching out to see if you'd like to mentor again for {{semester_name}}.\n\nIf you are interested in joining as a mentor, please fill out this [form](https://docs.google.com/forms/d/e/1FAIpQLSdjDnF2Lm5tPBozf4p-Gjz9Rg5pbmXRZlMDDKro07Pn95GA0A/viewform?pli=1).\n\nIf you're unavailable this time, we would greatly appreciate connections to colleagues who might be interested in mentoring.\n\nThank you again, and please reply with any questions.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Past mentor invitation",
    "purpose": "mentor_invitation",
    "source": "starter",
    "subjectTemplate": "Invitation: Almaworks Mentorship — {{semester_name}}",
    "templateId": "starter-past-mentor-invitation",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nThank you for agreeing to mentor Almaworks teams for {{semester_name}}!\n\nWe're coordinating mentorship meetings around mentors' availability throughout the week. Please let us know your preferred times and whether you would prefer to meet remotely or in person.\n\nIf you have already shared your availability, please let us know if anything has changed. We will coordinate meeting details with you and the startups before a session is confirmed.\n\nPlease reply with any questions or updates. We're grateful for your support.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Mentor follow-up — advance",
    "purpose": "mentor_invitation",
    "source": "starter",
    "subjectTemplate": "Almaworks mentorship planning — {{semester_name}}",
    "templateId": "starter-mentor-follow-up-advance",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nThank you for supporting our {{semester_name}} founders. We're checking in on your upcoming Almaworks mentorship meetings.\n\nPlease review the date, time, time zone, and meeting location or video link in each confirmed meeting invitation. If anything is missing or no longer works for you, please reply so we can coordinate an update.\n\nIf you have not received a confirmed invitation, please let us know before making plans to attend.\n\nThank you again for your time and guidance.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Mentor follow-up — week of",
    "purpose": "mentor_invitation",
    "source": "starter",
    "subjectTemplate": "Checking in on your Almaworks meetings — {{semester_name}}",
    "templateId": "starter-mentor-follow-up-week-of",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nThank you for mentoring our Almaworks founders. We'd love to invite you to Demo Day for our {{semester_name}} cohort so you can see what the teams have been building.\n\nWould you be interested in attending? Please reply and we can share the confirmed date, location, and registration details. We'd also appreciate your sharing the invitation with colleagues who may be interested.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Demo Day invitation — mentors",
    "purpose": "demo_day_judge_invitation",
    "source": "starter",
    "subjectTemplate": "Join Almaworks Demo Day — {{semester_name}}",
    "templateId": "starter-demo-day-mentor-invitation",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nI'm reaching out from Almaworks, the startup accelerator supporting Columbia student founders. We'd be delighted to have {{company_name}} represented at Demo Day for our {{semester_name}} cohort.\n\nWould you be interested in meeting the founders and learning about their work? Please reply and we can share the confirmed date, location, and registration details.\n\nIf someone else on your team would be a better fit, we'd welcome an introduction.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Demo Day invitation — investors, founders & operators",
    "purpose": "demo_day_judge_invitation",
    "source": "starter",
    "subjectTemplate": "Meet the Almaworks cohort at Demo Day — {{semester_name}}",
    "templateId": "starter-demo-day-guest-invitation",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nI'm following up on our invitation to Almaworks Demo Day for {{semester_name}}. We'd love to have you join us.\n\nAre you interested in attending? Please reply if you'd like the current event and registration details or have any questions. If you've already confirmed, thank you—we look forward to seeing you.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Demo Day follow-up",
    "purpose": "demo_day_judge_invitation",
    "source": "starter",
    "subjectTemplate": "Following up: Almaworks Demo Day — {{semester_name}}",
    "templateId": "starter-demo-day-follow-up",
    "updatedAt": null
  },
  {
    "archivedAt": null,
    "bodyTemplate": "Hi {{contact_name}},\n\nWe'd love to invite you to speak with our Almaworks {{semester_name}} cohort about your experience at {{company_name}}. Your perspective could offer valuable guidance to our early-stage founders.\n\nWe envision a small-group conversation with time for questions, and can coordinate the topic, timing, and format around your availability.\n\nPlease let me know if you're interested, and I'm happy to send more details.\n\nBest,\nThe Almaworks Team",
    "createdAt": null,
    "name": "Speaker invitation — concise",
    "purpose": "speaker_invitation",
    "source": "starter",
    "subjectTemplate": "Share your experience with Almaworks — {{semester_name}}",
    "templateId": "starter-speaker-invitation-concise",
    "updatedAt": null
  }
];

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new OutreachEmailRequestError("Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new OutreachEmailRequestError(`${field} is required.`, field);
  const result = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(result)) throw new OutreachEmailRequestError(`${field} must be a valid UUID.`, field);
  return result;
}

function optionalUuid(value: unknown, field: string): string | undefined {
  return value === null || value === undefined || value === "" ? undefined : uuid(value, field);
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || value.trim() === "") throw new OutreachEmailRequestError(`${field} is required.`, field);
  const result = value.trim();
  if (result.length > maximum) throw new OutreachEmailRequestError(`${field} must be at most ${maximum} characters.`, field);
  return result;
}

function timestamp(value: unknown, field: string, normalize = true): string {
  if (typeof value !== "string" || value.trim() === "" || !Number.isFinite(Date.parse(value))) {
    throw new OutreachEmailRequestError(`${field} must be a valid ISO timestamp.`, field);
  }
  const match = OFFSET_TIMESTAMP_PATTERN.exec(value.trim());
  if (!match) throw new OutreachEmailRequestError(`${field} must include an explicit timezone offset or Z.`, field);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0", , offsetSign, offsetHourText = "0", offsetMinuteText = "0"] = match;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = [yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText].map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > maxDay || hour > 23 || minute > 59 || second > 59) {
    throw new OutreachEmailRequestError(`${field} must contain a valid calendar date and time.`, field);
  }
  if (offsetSign && (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0))) {
    throw new OutreachEmailRequestError(`${field} has an invalid timezone offset.`, field);
  }
  return normalize ? new Date(value).toISOString() : value.trim();
}

export function validateOutreachEmailTemplate(template: string): void {
  const tokenPattern = /\{\{([^{}]*)\}\}/gu;
  let match: RegExpExecArray | null;
  let remainder = template;
  while ((match = tokenPattern.exec(template)) !== null) {
    const placeholder = match[1]?.trim() ?? "";
    if (!SUPPORTED_PLACEHOLDERS.includes(placeholder as OutreachEmailPlaceholder)) {
      throw new OutreachEmailRequestError(`Unknown placeholder: {{${placeholder}}}.`);
    }
    remainder = remainder.replace(match[0], "");
  }
  if (remainder.includes("{{") || remainder.includes("}}")) {
    throw new OutreachEmailRequestError("Template contains a malformed placeholder.");
  }
}

export function validateRenderedOutreachEmail(value: string, field: string): void {
  validateOutreachEmailTemplate(value);
  if (/\{\{[^{}]*\}\}/u.test(value)) {
    throw new OutreachEmailRequestError(`${field} contains an unresolved placeholder.`, field);
  }
}

export function parseOutreachEmailQuery(url: string): { semesterId: string; opportunityId?: string } {
  const parameters = new URL(url).searchParams;
  return {
    semesterId: uuid(parameters.get("semesterId"), "semesterId"),
    opportunityId: optionalUuid(parameters.get("opportunityId"), "opportunityId"),
  };
}

export function parseOutreachEmailCommand(value: unknown, now = new Date()): OutreachEmailCommand {
  const body = object(value);
  const semesterId = uuid(body.semesterId, "semesterId");
  if (body.action === "save_template") {
    const expectedUpdatedAt = body.expectedUpdatedAt === undefined ? undefined : timestamp(body.expectedUpdatedAt, "expectedUpdatedAt", false);
    const subjectTemplate = text(body.subjectTemplate, "subjectTemplate", 500);
    const bodyTemplate = text(body.bodyTemplate, "bodyTemplate", 20_000);
    validateOutreachEmailTemplate(subjectTemplate);
    validateOutreachEmailTemplate(bodyTemplate);
    const templateId = optionalUuid(body.templateId, "templateId");
    if (templateId && !expectedUpdatedAt) throw new OutreachEmailRequestError("expectedUpdatedAt is required when updating a template.", "expectedUpdatedAt");
    return {
      action: body.action,
      bodyTemplate,
      expectedUpdatedAt,
      name: text(body.name, "name", 120),
      semesterId,
      subjectTemplate,
      templateId,
    };
  }
  if (body.action === "archive_template") {
    return { action: body.action, expectedUpdatedAt: timestamp(body.expectedUpdatedAt, "expectedUpdatedAt", false), semesterId, templateId: uuid(body.templateId, "templateId") };
  }
  if (body.action === "submit_message") {
    const scheduledAt = body.scheduledAt === null ? null : timestamp(body.scheduledAt, "scheduledAt");
    if (scheduledAt !== null) {
      const delay = Date.parse(scheduledAt) - now.getTime();
      if (delay <= 0) throw new OutreachEmailRequestError("scheduledAt must be in the future.", "scheduledAt");
      if (delay > MAX_SCHEDULE_MILLISECONDS) throw new OutreachEmailRequestError("scheduledAt must be no more than 30 days in the future.", "scheduledAt");
    }
    const subject = text(body.subject, "subject", 500);
    const renderedBody = text(body.body, "body", 20_000);
    validateRenderedOutreachEmail(subject, "subject");
    validateRenderedOutreachEmail(renderedBody, "body");
    return {
      action: body.action,
      body: renderedBody,
      idempotencyKey: text(body.idempotencyKey, "idempotencyKey", 200),
      opportunityId: uuid(body.opportunityId, "opportunityId"),
      scheduledAt,
      semesterId,
      subject,
      templateId: body.templateId === null ? null : uuid(body.templateId, "templateId"),
    };
  }
  if (body.action === "cancel_message" || body.action === "refresh_message" || body.action === "retry_message") {
    return { action: body.action, messageId: uuid(body.messageId, "messageId"), semesterId };
  }
  throw new OutreachEmailRequestError("action is not supported.", "action");
}

export function renderOutreachEmailTemplate(input: {
  bodyTemplate: string;
  subjectTemplate: string;
  values: Partial<Record<OutreachEmailPlaceholder, string | null | undefined>>;
}): { body: string; subject: string } {
  validateOutreachEmailTemplate(input.subjectTemplate);
  validateOutreachEmailTemplate(input.bodyTemplate);
  const render = (template: string) => template.replace(PLACEHOLDER_PATTERN, (_match, placeholder: string) => {
    if (!SUPPORTED_PLACEHOLDERS.includes(placeholder as OutreachEmailPlaceholder)) {
      throw new OutreachEmailRequestError(`Unknown placeholder: {{${placeholder}}}.`);
    }
    const value = input.values[placeholder as OutreachEmailPlaceholder];
    if (typeof value !== "string" || value.trim() === "") {
      throw new OutreachEmailRequestError(`Missing value for placeholder: {{${placeholder}}}.`);
    }
    return value;
  });
  const subject = render(input.subjectTemplate).trim();
  const body = render(input.bodyTemplate).trim();
  validateRenderedOutreachEmail(subject, "subject");
  validateRenderedOutreachEmail(body, "body");
  text(subject, "subject", 500);
  text(body, "body", 20_000);
  return { subject, body };
}

export function supportedOutreachEmailPlaceholders(): OutreachEmailPlaceholder[] {
  return [...SUPPORTED_PLACEHOLDERS];
}
