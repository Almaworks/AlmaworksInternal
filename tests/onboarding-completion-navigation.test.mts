import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the completion screen navigates without attempting to finalize onboarding again", async () => {
  const source = await readFile("app/dashboard/onboarding/onboarding-flow.tsx", "utf8");
  const start = source.indexOf("function goToDashboard()");
  const end = source.indexOf("const completedKeys", start);
  const handler = source.slice(start, end);

  assert.notEqual(start, -1, "expected a dashboard navigation handler");
  assert.doesNotMatch(handler, /persistProgress/);
  assert.match(handler, /router\.push\(role === "mentor" \? "\/dashboard\/mentor" : "\/dashboard\/startup"\)/);
});

test("mentor onboarding offers a saved availability choice and redirects only after finalization succeeds", async () => {
  const source = await readFile("app/dashboard/onboarding/onboarding-flow.tsx", "utf8");

  assert.match(source, /"set-hours-next"/u);
  assert.match(source, /"add-later"/u);
  assert.match(source, /item_key: "mentoring_hours_setup"[\s\S]*?completed_at: null[\s\S]*?choice: availabilityChoice/u);
  assert.match(source, /const ok = await persistProgress\(step === 3\);[\s\S]*?if \(!ok\) return;[\s\S]*?router\.push\("\/dashboard\/mentor\?tab=bookings&setup=availability"\)/u);
  assert.match(source, /Finish setup & set hours/u);
  assert.match(source, /Google Calendar only removes busy conflicts/u);
});

test("mentor bookings shows a setup guide for the onboarding handoff", async () => {
  const source = await readFile("app/dashboard/participant/ParticipantDashboard.tsx", "utf8");

  assert.match(source, /searchParams\.get\("setup"\) === "availability"/u);
  assert.match(source, /Set your recurring mentoring hours/u);
  assert.match(source, /Google Calendar removes conflicts/u);
});
