import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaPath = new URL("../../supabase/schemas/lifecycle.sql", import.meta.url);

test("every program-scoped lifecycle table is semester anchored and RLS enabled", () => {
  const sql = readFileSync(schemaPath, "utf8").toLowerCase();
  const scopedTables = [
    "semester_memberships",
    "startup_semesters",
    "startup_team_memberships",
    "mentor_semesters",
    "invitations",
    "access_requests",
    "onboarding_progress",
    "availability_windows",
    "lifecycle_audit_events",
  ];

  for (const table of scopedTables) {
    const tableStart = sql.indexOf(`create table public.${table}`);
    assert.notEqual(tableStart, -1, `${table} must be declared`);
    const tableEnd = sql.indexOf(";", tableStart);
    const declaration = sql.slice(tableStart, tableEnd);
    assert.match(declaration, /semester_id uuid not null references public\.semesters\(id\)/);
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test("authorization helpers are security definer functions with a fixed search path", () => {
  const sql = readFileSync(schemaPath, "utf8").toLowerCase();
  for (const fn of ["is_super_admin", "has_semester_role", "can_manage_semester"]) {
    const functionStart = sql.indexOf(`function public.${fn}`);
    assert.notEqual(functionStart, -1, `${fn} must be declared`);
    const declaration = sql.slice(functionStart, functionStart + 1200);
    assert.match(declaration, /security definer/);
    assert.match(declaration, /set search_path = public/);
  }
});

test("authorization helpers deny anonymous candidate probing", () => {
  const sql = readFileSync(schemaPath, "utf8").toLowerCase();
  const signatures = [
    "is_super_admin(uuid)",
    "has_semester_role(uuid, public.user_role[], uuid)",
    "can_manage_semester(uuid, uuid)",
  ];

  for (const signature of signatures) {
    const escapedSignature = signature.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    assert.match(
      sql,
      new RegExp(`revoke execute on function public\\.${escapedSignature} from public, anon`),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${escapedSignature} to authenticated`),
    );
  }
});

test("auth-user creation never trusts role metadata", () => {
  const sql = readFileSync(schemaPath, "utf8").toLowerCase();
  const functionStart = sql.indexOf("function public.handle_new_user");
  const declaration = sql.slice(functionStart, functionStart + 900);
  assert.doesNotMatch(declaration, /raw_user_meta_data\s*->>\s*'role'/);
  assert.doesNotMatch(declaration, /insert into public\.semester_memberships/);
});

test("cohort lifecycle commands authorize both boundaries and are not public", () => {
  const sql = readFileSync(schemaPath, "utf8").toLowerCase();
  const bulkStart = sql.indexOf("function public.bulk_set_membership_activity");
  const importStart = sql.indexOf("function public.import_prior_semester_memberships");
  assert.notEqual(bulkStart, -1, "bulk lifecycle function must be declared");
  assert.notEqual(importStart, -1, "prior-cohort import function must be declared");

  const bulk = sql.slice(bulkStart, bulkStart + 2600);
  assert.match(bulk, /public\.can_manage_semester\(p_semester_id/);
  assert.match(bulk, /target\.semester_id = p_semester_id/);
  assert.match(bulk, /target\.id = any\(p_membership_ids\)/);

  const carry = sql.slice(importStart, importStart + 8000);
  assert.match(carry, /public\.can_manage_semester\(p_source_semester_id/);
  assert.match(carry, /public\.can_manage_semester\(p_target_semester_id/);
  assert.match(carry, /insert into public\.semester_memberships[\s\S]*?select[\s\S]*?'invited'/);

  assert.match(sql, /revoke execute on function public\.bulk_set_membership_activity\(uuid, uuid\[\], boolean\) from public, anon/);
  assert.match(sql, /revoke execute on function public\.import_prior_semester_memberships\(uuid, uuid, uuid\[\]\) from public, anon/);
});

test("semester transition commands are atomic, audited, and restricted", () => {
  const sql = readFileSync(schemaPath, "utf8").toLowerCase();
  const createStart = sql.indexOf("function public.create_semester_draft");
  const activateStart = sql.indexOf("function public.activate_semester_transition");
  const sessionDatesStart = sql.indexOf("function public.replace_draft_session_dates");
  assert.notEqual(createStart, -1, "draft creation function must be declared");
  assert.notEqual(activateStart, -1, "semester activation function must be declared");
  assert.notEqual(sessionDatesStart, -1, "session date replacement function must be declared");

  const createDraft = sql.slice(createStart, createStart + 5000);
  assert.match(createDraft, /public\.can_manage_semester\(p_source_semester_id/);
  assert.match(createDraft, /insert into public\.semesters/);
  assert.match(createDraft, /insert into public\.semester_memberships/);
  assert.match(createDraft, /insert into public\.lifecycle_audit_events/);

  const activate = sql.slice(activateStart, activateStart + 7000);
  assert.match(activate, /public\.can_manage_semester\(p_source_semester_id/);
  assert.match(activate, /public\.can_manage_semester\(p_target_semester_id/);
  assert.match(activate, /update public\.semesters[\s\S]*?lifecycle_status = 'closed'/);
  assert.match(activate, /update public\.semesters[\s\S]*?lifecycle_status = 'active'/);
  assert.match(activate, /update public\.semester_memberships[\s\S]*?status = 'alumni'/);
  assert.match(activate, /insert into public\.lifecycle_audit_events/);

  const sessionDates = sql.slice(sessionDatesStart, sessionDatesStart + 5000);
  assert.match(sessionDates, /public\.can_manage_semester\(p_semester_id/);
  assert.match(sessionDates, /lifecycle_status[\s\S]*?= 'draft'/);
  assert.match(sessionDates, /delete from public\.session_dates/);
  assert.match(sessionDates, /insert into public\.session_dates/);
  assert.match(sessionDates, /insert into public\.lifecycle_audit_events/);

  assert.match(sql, /revoke execute on function public\.create_semester_draft\(uuid, text, date, date, jsonb\) from public, anon/);
  assert.match(sql, /revoke execute on function public\.activate_semester_transition\(uuid, uuid\) from public, anon/);
  assert.match(sql, /revoke execute on function public\.replace_draft_session_dates\(uuid, jsonb\) from public, anon/);
});
