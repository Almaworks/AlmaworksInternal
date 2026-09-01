import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("manual contact creation uses one authorized bundle command before reading results", async () => {
  const route = await readFile(new URL("../../app/api/admin/outreach/contacts/route.ts", import.meta.url), "utf8");

  assert.match(route, /\.rpc\("upsert_outreach_contact_bundle"/u);
  assert.doesNotMatch(route, /\.from\("outreach_contacts"\)\s*\.insert/u);
  assert.doesNotMatch(route, /\.from\("outreach_companies"\)\s*\.insert/u);
  assert.doesNotMatch(route, /\.from\("outreach_opportunities"\)\s*\.insert/u);
});

test("import commit creates or links each reviewed row through the semester bundle command", async () => {
  const flow = await readFile(new URL("../../src/outreach/import-flow.ts", import.meta.url), "utf8");

  assert.match(flow, /\.rpc\("upsert_outreach_contact_bundle"/u);
  assert.doesNotMatch(flow, /\.from\("outreach_contacts"\)\.insert/u);
  assert.doesNotMatch(flow, /\.from\("outreach_companies"\)\.insert/u);
  assert.doesNotMatch(flow, /\.from\("outreach_contact_companies"\)\.upsert/u);
  assert.doesNotMatch(flow, /\.from\("outreach_opportunities"\)\.upsert/u);
});
