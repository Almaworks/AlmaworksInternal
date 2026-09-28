import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the activation panel is hidden once every activation step is complete", async () => {
  const source = await readFile("app/dashboard/participant/ParticipantDashboard.tsx", "utf8");

  assert.match(
    source,
    /\{complete < view\.activation\.length && <section className=\{styles\.activationPanel\}>/,
  );
});
