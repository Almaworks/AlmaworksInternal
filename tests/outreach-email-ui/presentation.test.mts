import assert from "node:assert/strict";
import test from "node:test";

import { canReleaseFailedDraft, canSchedule, isOutreachEmailWorkspace, isValidTimeZone, outreachEmailTemplateImportExample, parseImportedOutreachEmailTemplate, scheduleLabel } from "../../components/outreach-email/presentation.ts";

test("later preflight errors cannot unlock a previously uncertain email", () => {
  assert.equal(canReleaseFailedDraft(503, false), true);
  assert.equal(canReleaseFailedDraft(503, true), false);
  assert.equal(canReleaseFailedDraft(403, true), false);
  assert.equal(canReleaseFailedDraft(500, false), false);
});

test("allows future sends through the provider's 30 day scheduling limit", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(canSchedule("2026-10-08T11:59:00.000Z", now), true);
  assert.equal(canSchedule("2026-10-08T12:00:01.000Z", now), false);
  assert.equal(canSchedule("2026-09-08T11:59:00.000Z", now), false);
});

test("rejects malformed workspace configuration and message collections", () => {
  const base = { semesterId: "semester", configuration: { available: true, sender: null, timeZone: "America/New_York", unavailableReason: null }, opportunity: null, supportedPlaceholders: ["contact_name"], templates: [], starterTemplates: [], messages: [] };
  assert.equal(isOutreachEmailWorkspace(base), true);
  assert.equal(isOutreachEmailWorkspace({ ...base, configuration: { ...base.configuration, timeZone: "bad-zone" } }), false);
  assert.equal(isOutreachEmailWorkspace({ ...base, messages: [{}] }), false);
  assert.equal(isOutreachEmailWorkspace({ ...base, templates: [{}] }), false);
});

test("formats explicit schedules and validates display timezones", () => {
  assert.equal(scheduleLabel(null, "America/New_York"), "Send immediately");
  assert.match(scheduleLabel("2026-09-10T16:00:00.000Z", "America/New_York"), /Sep 10, 2026/);
  assert.equal(isValidTimeZone("America/New_York"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
});

test("imports the documented Markdown or text template format and retains supported recipient variables", () => {
  assert.deepEqual(parseImportedOutreachEmailTemplate(outreachEmailTemplateImportExample), {
    name: "Program introduction",
    subjectTemplate: "Almaworks × {{company_name}}",
    bodyTemplate: "Hi {{contact_name}},\n\nI'm reaching out from Almaworks about {{semester_name}}. We'd love to explore how {{company_name}} could take part.\n\nBest,\nAlmaworks",
  });
  assert.deepEqual(parseImportedOutreachEmailTemplate("# Follow up\r\nSubject: Hello {{contact_name}}\r\n\r\nWould {{company_name}} have time?\r\n"), {
    name: "Follow up", subjectTemplate: "Hello {{contact_name}}", bodyTemplate: "Would {{company_name}} have time?",
  });
});

test("rejects imports without the documented separation, body, or supported variables", () => {
  assert.throws(() => parseImportedOutreachEmailTemplate("Follow up\nSubject: Hi\n\nBody"), /first line/u);
  assert.throws(() => parseImportedOutreachEmailTemplate("# Follow up\nSubject: Hi\nBody"), /blank line/u);
  assert.throws(() => parseImportedOutreachEmailTemplate("# Follow up\nSubject: Hi\n\n"), /body/u);
  assert.throws(() => parseImportedOutreachEmailTemplate("# Follow up\nSubject: Hi {{first_name}}\n\nBody"), /Unknown placeholder/u);
});


test("workspace guard rejects unsafe opportunity, placeholder and delivery fields", () => {
  const base = { semesterId: "semester", opportunity: null, supportedPlaceholders: ["contact_name"], configuration: { available: false, sender: null, timeZone: "UTC", unavailableReason: null }, templates: [], starterTemplates: [], messages: [] };
  assert.equal(isOutreachEmailWorkspace({...base, opportunity: { opportunityId: "x" }}), false);
  assert.equal(isOutreachEmailWorkspace({...base, supportedPlaceholders: ["unknown"]}), false);
  assert.equal(isOutreachEmailWorkspace({...base, configuration: {...base.configuration, unavailableReason: {secret: "bad"}}}), false);
  assert.equal(isOutreachEmailWorkspace({...base, templates: [{templateId:"t", name:"T", subjectTemplate:"Hello", bodyTemplate:"Body", source:"saved", archivedAt:"bad", createdAt:null, updatedAt:null}]}), false);
});
