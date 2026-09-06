import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("participant dashboard calls only implemented literal API routes", async () => {
  const source = await readFile(new URL("../../app/dashboard/participant/ParticipantDashboard.tsx", import.meta.url), "utf8");
  const paths = [...source.matchAll(/authenticatedFetch\("(\/api\/[^"?]+)"/gu)].map((match) => match[1]);
  assert.ok(paths.length > 0);
  for (const path of paths) {
    assert.ok(existsSync(new URL(`../../app${path}/route.ts`, import.meta.url)), `Missing route for ${path}`);
  }
});
