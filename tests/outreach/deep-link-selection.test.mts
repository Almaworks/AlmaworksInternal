import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("an outreach opportunity deep link selects its loaded row and reports unavailable records safely", async () => {
  const workspace = await readFile("app/dashboard/admin/outreach/outreach-workspace.tsx", "utf8");

  assert.match(workspace, /params\.get\(["']opportunityId["']\)/u);
  assert.match(workspace, /data\.rows\.find\(\(row\) => row\.id === opportunityId\)/u);
  assert.match(workspace, /That outreach opportunity is unavailable or you no longer have access to it\./u);
});

test("a deep link continues through later authorized workspace pages within a fixed bound", async () => {
  const workspace = await readFile("app/dashboard/admin/outreach/outreach-workspace.tsx", "utf8");

  assert.match(workspace, /const MAX_DEEP_LINK_PAGES = \d+;/u);
  assert.match(workspace, /while \(cursor !== null && pagesLoaded < MAX_DEEP_LINK_PAGES\)/u);
  assert.match(workspace, /await requestPage\(cursor\)/u);
  assert.match(workspace, /Loading linked outreach opportunity/u);
});
