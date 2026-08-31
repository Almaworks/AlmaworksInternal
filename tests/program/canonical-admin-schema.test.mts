import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtime = await readFile(new URL("../../supabase/schemas/database_revamp_runtime.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("../../supabase/schemas/database_revamp.sql", import.meta.url), "utf8");
const security = await readFile(new URL("../../supabase/schemas/database_revamp_security.sql", import.meta.url), "utf8");

function functionBody(name: string): string {
  const start = runtime.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} must be declared`);
  const end = runtime.indexOf("$$;", start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return runtime.slice(start, end + 3).toLowerCase();
}

test("startup team uniqueness matches the PostgREST upsert conflict target", () => {
  const table = schema.slice(schema.indexOf("create table public.startup_team_memberships"), schema.indexOf("create table public.meetings"));
  assert.match(table, /unique \(startup_semester_id, semester_membership_id\)/u);
  assert.doesNotMatch(table, /unique \(semester_id, startup_semester_id, semester_membership_id\)/u);
});

test("founder moves are authorized and atomic inside one database function", () => {
  const body = functionBody("move_startup_team_membership");
  assert.match(body, /can_manage_semester/u);
  assert.match(body, /insert into public\.startup_team_memberships/u);
  assert.match(body, /delete from public\.startup_team_memberships/u);
  assert.ok(body.indexOf("insert into public.startup_team_memberships") < body.indexOf("delete from public.startup_team_memberships"));
  assert.match(security, /revoke execute on function public\.move_startup_team_membership\(uuid,uuid,uuid\) from public,anon/u);
  assert.match(security, /grant execute on function public\.move_startup_team_membership\(uuid,uuid,uuid\)[\s\S]*to authenticated/u);
});

test("startup identity and semester edits share one authorized transaction", () => {
  const body = functionBody("update_startup_records");
  assert.match(body, /can_manage_semester/u);
  assert.match(body, /update public\.startup_organizations/u);
  assert.match(body, /update public\.startup_semesters/u);
});

test("semester member approval and role changes are authorized and atomic without platform elevation", () => {
  const body = functionBody("set_semester_member_access");
  assert.match(body, /can_manage_semester\(p_semester_id, auth\.uid\(\)\)/u);
  assert.match(body, /insert into public\.profiles/u);
  assert.match(body, /insert into public\.semester_memberships/u);
  assert.match(body, /insert into public\.mentor_profiles/u);
  assert.match(body, /insert into public\.mentor_semesters/u);
  assert.doesNotMatch(body, /platform_roles/u);
  assert.match(security, /revoke execute on function public\.set_semester_member_access\(uuid,uuid,public\.user_role,boolean,text,text\) from public,anon/u);
  assert.match(security, /grant execute on function[\s\S]*public\.set_semester_member_access\(uuid,uuid,public\.user_role,boolean,text,text\)[\s\S]*to authenticated/u);
});

test("platform super-admin changes require an existing platform super-admin", () => {
  const body = functionBody("set_platform_super_admin");
  assert.match(body, /is_super_admin\(auth\.uid\(\)\)/u);
  assert.doesNotMatch(body, /can_manage_semester/u);
  assert.match(body, /insert into public\.platform_roles/u);
  assert.match(body, /delete from public\.platform_roles/u);
  assert.match(security, /revoke execute on function public\.set_platform_super_admin\(uuid,boolean\) from public,anon/u);
});
