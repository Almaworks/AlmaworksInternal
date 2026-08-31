import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const schemaDirectory = new URL("../../supabase/schemas/", import.meta.url);

function readDeclarativeSchema(): string {
  return readdirSync(schemaDirectory)
    .filter((filename) => filename.endsWith(".sql"))
    .sort()
    .map((filename) => readFileSync(new URL(filename, schemaDirectory), "utf8"))
    .join("\n")
    .toLowerCase();
}

test("outreach global records are declared without semester anchors and use RLS", () => {
  const sql = readDeclarativeSchema();
  const globalTables = [
    "outreach_contacts",
    "outreach_companies",
    "outreach_contact_companies",
    "outreach_relationship_labels",
  ];

  for (const table of globalTables) {
    const tableStart = sql.indexOf(`create table public.${table}`);
    assert.notEqual(tableStart, -1, `${table} must be declared`);
    const tableEnd = sql.indexOf(";", tableStart);
    const declaration = sql.slice(tableStart, tableEnd);
    assert.doesNotMatch(declaration, /semester_id/);
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
  }
});

test("outreach program records are semester anchored and use RLS", () => {
  const sql = readDeclarativeSchema();
  const scopedTables = [
    "outreach_opportunities",
    "outreach_opportunity_labels",
    "outreach_activities",
    "outreach_import_jobs",
    "outreach_import_rows",
  ];

  for (const table of scopedTables) {
    const tableStart = sql.indexOf(`create table public.${table}`);
    assert.notEqual(tableStart, -1, `${table} must be declared`);
    const tableEnd = sql.indexOf(";", tableStart);
    const declaration = sql.slice(tableStart, tableEnd);
    assert.match(
      declaration,
      /semester_id uuid not null references public\.semesters\(id\)/,
    );
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );
  }
});

test("outreach command RPCs are security definer functions with fixed search paths", () => {
  const sql = readDeclarativeSchema();
  const functions = [
    "log_outreach_activity",
    "transfer_outreach_owner",
    "set_outreach_snooze",
    "set_outreach_silence",
    "release_inactive_owner_work",
    "suspend_outreach_membership",
  ];

  for (const functionName of functions) {
    const functionStart = sql.indexOf(`create or replace function public.${functionName}`);
    assert.notEqual(functionStart, -1, `${functionName} must be declared`);
    const declaration = sql.slice(functionStart, functionStart + 4500);
    assert.match(declaration, /security definer/);
    assert.match(declaration, /set search_path = public/);
  }
});

test("legacy migration commit is one authorized provenance-preserving transaction RPC", () => {
  const sql = readDeclarativeSchema();
  const functionStart = sql.indexOf("function public.commit_legacy_outreach_migration");
  assert.notEqual(functionStart, -1, "legacy commit RPC must be declared");
  const declaration = sql.slice(functionStart, functionStart + 18000);

  assert.match(declaration, /security definer/);
  assert.match(declaration, /set search_path = ''/);
  assert.match(declaration, /auth\.uid\(\)/);
  assert.match(declaration, /can_manage_semester/);
  assert.match(declaration, /for update/);
  assert.match(declaration, /idempotency_key/);
  assert.match(declaration, /outreach_activity_log/);
  assert.match(declaration, /actor_profile_id/);
  assert.match(declaration, /import_job_id/);
  assert.match(declaration, /converted_mentor_profile_id/);
  assert.match(declaration, /outreach_opportunity_labels/);
  assert.match(declaration, /'merge'::public\.outreach_import_match_decision/);
  assert.match(
    sql,
    /revoke execute on function public\.commit_legacy_outreach_migration[\s\S]*from public, anon/,
  );
  assert.match(
    sql,
    /grant execute on function public\.commit_legacy_outreach_migration[\s\S]*to authenticated/,
  );
});
