import assert from "node:assert/strict";
import test from "node:test";

import {
  OutreachEmailRequestError,
  outreachEmailStarterTemplates,
  parseOutreachEmailCommand,
  parseOutreachEmailQuery,
  renderOutreachEmailTemplate,
} from "../../src/outreach-email/model.ts";

const semesterId = "11111111-1111-4111-8111-111111111111";
const opportunityId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";

test("query and commands use explicit semester and server-owned recipient fields", () => {
  assert.deepEqual(parseOutreachEmailQuery(`https://example.test/api/admin/outreach/email?semesterId=${semesterId}&opportunityId=${opportunityId}`), { semesterId, opportunityId });
  assert.deepEqual(parseOutreachEmailCommand({ action: "retry_message", semesterId, messageId }), { action: "retry_message", semesterId, messageId });
  assert.throws(() => parseOutreachEmailQuery("https://example.test/api/admin/outreach/email"), /semesterId is required/u);
  assert.throws(() => parseOutreachEmailCommand({ action: "submit_message", semesterId, opportunityId, recipientEmail: "attacker@example.test" }), OutreachEmailRequestError);
});

test("scheduled submission rejects ambiguous, impossible, past, and beyond-horizon timestamps", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const base = { action: "submit_message", semesterId, opportunityId, templateId: null, subject: "Hello", body: "Body", idempotencyKey: "compose-1" };
  const parsed = parseOutreachEmailCommand({ ...base, scheduledAt: "2026-09-09T09:00:00-04:00" }, now);
  assert.equal(parsed.action === "submit_message" ? parsed.scheduledAt : null, "2026-09-09T13:00:00.000Z");
  assert.throws(() => parseOutreachEmailCommand({ ...base, scheduledAt: "2026-09-09T09:00:00" }, now), /explicit timezone/u);
  assert.throws(() => parseOutreachEmailCommand({ ...base, scheduledAt: "2026-02-30T09:00:00Z" }, now), /valid calendar/u);
  assert.throws(() => parseOutreachEmailCommand({ ...base, scheduledAt: "2026-09-08T11:59:59Z" }, now), /future/u);
  assert.throws(() => parseOutreachEmailCommand({ ...base, scheduledAt: "2026-10-09T12:00:00Z" }, now), /30 days/u);
});

test("fixed placeholders render in subject and plain text and unknown placeholders fail", () => {
  assert.deepEqual(renderOutreachEmailTemplate({
    subjectTemplate: "A note for {{company_name}}",
    bodyTemplate: "Hi {{ contact_name }}, welcome to {{semester_name}}.",
    values: { company_name: "Acme", contact_name: "Ada", semester_name: "Fall 2026" },
  }), { subject: "A note for Acme", body: "Hi Ada, welcome to Fall 2026." });
  assert.throws(() => renderOutreachEmailTemplate({
    subjectTemplate: "Hi {{first_name}}", bodyTemplate: "Body",
    values: { company_name: "Acme", contact_name: "Ada", semester_name: "Fall" },
  }), /Unknown placeholder/u);
  assert.throws(() => parseOutreachEmailCommand({ action: "save_template", semesterId, name: "Bad", subjectTemplate: "Hi {{CONTACT_NAME}}", bodyTemplate: "Body" }), /Unknown placeholder/u);
  assert.throws(() => parseOutreachEmailCommand({ action: "save_template", semesterId, name: "Bad", subjectTemplate: "Hi {{contact_name", bodyTemplate: "Body" }), /malformed placeholder/u);
  assert.throws(() => parseOutreachEmailCommand({ action: "save_template", semesterId, templateId: opportunityId, name: "Update", subjectTemplate: "Hello", bodyTemplate: "Body" }), /expectedUpdatedAt is required/u);
  assert.throws(() => parseOutreachEmailCommand({ action: "submit_message", semesterId, opportunityId, templateId: null, subject: "Hi {{contact_name}}", body: "Body", scheduledAt: null, idempotencyKey: "key" }), /unresolved placeholder/u);
});

test("purpose-specific starter templates render with their required values", () => {
  const purposeStarters = outreachEmailStarterTemplates.filter((template) => template.purpose !== undefined);
  assert.deepEqual([...new Set(purposeStarters.map((template) => template.purpose))], [
    "mentor_invitation",
    "speaker_invitation",
    "investor_introduction",
    "partner_sponsor_invitation",
    "demo_day_judge_invitation",
  ]);

  for (const template of purposeStarters) {
    const rendered = renderOutreachEmailTemplate({
      subjectTemplate: template.subjectTemplate,
      bodyTemplate: template.bodyTemplate,
      values: {
        company_name: "Acme",
        contact_name: "Ada",
        mentor_onboarding_url: "https://almaworks.example/request-access",
        semester_name: "Fall 2026",
      },
    });
    assert.doesNotMatch(rendered.subject, /\{\{|\}\}|undefined/u);
    assert.doesNotMatch(rendered.body, /\{\{|\}\}|undefined/u);
  }
});

test("existing generic and follow-up starter templates remain renderable", () => {
  const originalStarters = outreachEmailStarterTemplates.filter((template) => template.purpose === undefined);
  assert.deepEqual(originalStarters.map((template) => template.templateId), [
    "starter-program-introduction",
    "starter-friendly-follow-up",
  ]);
  for (const template of originalStarters) {
    assert.doesNotThrow(() => renderOutreachEmailTemplate({
      subjectTemplate: template.subjectTemplate,
      bodyTemplate: template.bodyTemplate,
      values: { company_name: "Acme", contact_name: "Ada", semester_name: "Fall 2026" },
    }));
  }
});

test("mentor invitation includes the labeled interest form without requiring a site URL", () => {
  const mentor = outreachEmailStarterTemplates.find(template => template.purpose === "mentor_invitation");
  assert.ok(mentor);
  assert.match(mentor.bodyTemplate, /please fill out this \[form\]\(https:\/\/docs.google.com\/forms\//u);
  assert.doesNotMatch(mentor.bodyTemplate, /mentor_onboarding_url/u);
});

test("rendering rejects missing or blank values for used placeholders", () => {
  const template = { subjectTemplate: "Hello {{contact_name}}", bodyTemplate: "Your role: {{job_title}}" };
  assert.throws(() => renderOutreachEmailTemplate({
    ...template,
    values: { contact_name: "Ada" },
  }), /Missing value for placeholder: \{\{job_title\}\}/u);
  assert.throws(() => renderOutreachEmailTemplate({
    ...template,
    values: { contact_name: "Ada", job_title: " " },
  }), /Missing value for placeholder: \{\{job_title\}\}/u);
});

test("rendering rejects a placeholder introduced by a replacement value", () => {
  assert.throws(() => renderOutreachEmailTemplate({
    subjectTemplate: "Hello {{contact_name}}",
    bodyTemplate: "Body",
    values: { contact_name: "{{company_name}}" },
  }), /unresolved placeholder/u);
});

test("template concurrency tokens retain PostgreSQL microsecond precision", () => {
  const expectedUpdatedAt = "2026-09-08T12:00:00.123456+00:00";
  const parsed = parseOutreachEmailCommand({ action: "save_template", semesterId, templateId: opportunityId, expectedUpdatedAt, name: "Update", subjectTemplate: "Hello", bodyTemplate: "Body" });
  assert.equal(parsed.action === "save_template" ? parsed.expectedUpdatedAt : null, expectedUpdatedAt);
});

 test("refreshed library covers every distinct export and excludes obsolete logistics", () => {
  assert.equal(outreachEmailStarterTemplates.length, 14);
  assert.equal(new Set(outreachEmailStarterTemplates.map(t => t.templateId)).size, 14);
  const body = outreachEmailStarterTemplates.map(t => t.bodyTemplate).join("\n");
  assert.doesNotMatch(body, /Spring 2026|2020|October 10|zoom\.us|wufoo|urldefense|timeful|150M|catered|attached|3-5|3-6|45-minute/u);
  for (const t of outreachEmailStarterTemplates) {
    assert.doesNotThrow(() => parseOutreachEmailCommand({ action: "save_template", semesterId, name: t.name, subjectTemplate: t.subjectTemplate, bodyTemplate: t.bodyTemplate }));
  }
});
