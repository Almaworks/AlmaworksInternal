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
