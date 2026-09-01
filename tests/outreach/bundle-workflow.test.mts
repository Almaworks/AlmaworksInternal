import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeUrl = new URL("../../supabase/schemas/canonical_schema.sql", import.meta.url);
const outreachSchemaUrl = runtimeUrl;

test("manual contact creation uses one authorized bundle command before reading results", async () => {
  const route = await readFile(new URL("../../app/api/admin/outreach/contacts/route.ts", import.meta.url), "utf8");

  assert.match(route, /\.rpc\("upsert_outreach_contact_bundle"/u);
  assert.doesNotMatch(route, /\.from\("outreach_contacts"\)\s*\.insert/u);
  assert.doesNotMatch(route, /\.from\("outreach_companies"\)\s*\.insert/u);
  assert.doesNotMatch(route, /\.from\("outreach_opportunities"\)\s*\.insert/u);
  assert.match(route, /outreach_company_identity_conflict[\s\S]*?Company details conflict with an existing outreach record\./u);
  assert.match(route, /error\?\.code === "23505"[\s\S]*?contact with that email or LinkedIn URL/u);
});

test("import commit creates or links each reviewed row through the semester bundle command", async () => {
  const flow = await readFile(new URL("../../src/outreach/import-flow.ts", import.meta.url), "utf8");

  assert.match(flow, /\.rpc\("upsert_outreach_contact_bundle"/u);
  assert.doesNotMatch(flow, /\.from\("outreach_contacts"\)\.insert/u);
  assert.doesNotMatch(flow, /\.from\("outreach_companies"\)\.insert/u);
  assert.doesNotMatch(flow, /\.from\("outreach_contact_companies"\)\.upsert/u);
  assert.doesNotMatch(flow, /\.from\("outreach_opportunities"\)\.upsert/u);
});

test("two contacts with the same normalized company reuse one accessible global company", async () => {
  const runtime = (await readFile(runtimeUrl, "utf8")).replaceAll('"', "").toLowerCase();
  const bundle = runtime.match(/create or replace function public\.upsert_outreach_contact_bundle\([\s\S]*?\n\$\$;/u)?.[0] ?? "";

  assert.match(bundle, /select[\s\S]*?from public\.outreach_companies[\s\S]*?company\.normalized_name = normalized_company_name/u);
  assert.match(bundle, /private\.has_outreach_company_access\(matched_company_id, actor_id\)/u);
  assert.match(bundle, /resolved_company_id := matched_company_id/u);
  assert.match(bundle, /if resolved_company_id is null then[\s\S]*?insert into public\.outreach_companies/u);
});

test("company identity creation is serialized and protected by database uniqueness", async () => {
  const [runtime, outreachSchema] = await Promise.all([
    readFile(runtimeUrl, "utf8").then((value) => value.replaceAll('"', "").toLowerCase()),
    readFile(outreachSchemaUrl, "utf8").then((value) => value.replaceAll('"', "").toLowerCase()),
  ]);
  const bundle = runtime.match(/create or replace function public\.upsert_outreach_contact_bundle\([\s\S]*?\n\$\$;/u)?.[0] ?? "";

  assert.match(outreachSchema, /create unique index outreach_companies_normalized_name_key\s+on public\.outreach_companies using btree \(normalized_name\)/u);
  assert.match(outreachSchema, /create unique index outreach_companies_domain_key/u);
  assert.match(bundle, /pg_advisory_xact_lock/u);
  assert.match(bundle, /order by identity_key/u);
  assert.ok(bundle.indexOf("pg_advisory_xact_lock") < bundle.indexOf("from public.outreach_companies"));
  assert.match(bundle, /outreach_company_identity_conflict/u);
});
