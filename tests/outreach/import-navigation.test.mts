import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("import is native to Outreach and absent from dashboard navigation", async () => {
  const [layout, legacyRoute, workspace] = await Promise.all([
    readFile("app/dashboard/layout.tsx", "utf8"),
    readFile("app/dashboard/admin/import/page.tsx", "utf8"),
    readFile("app/dashboard/admin/outreach/outreach-workspace.tsx", "utf8"),
  ]);

  assert.doesNotMatch(layout, /label:\s*["']Import["']/u);
  assert.match(legacyRoute, /redirect\(["']\/dashboard\/admin\/outreach\?view=imports["']\)/u);
  assert.match(workspace, /<ImportReview[^>]+semesterId=/u);
});
