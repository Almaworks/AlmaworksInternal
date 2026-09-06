import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const canonical = (await readFile(new URL("../../supabase/schemas/canonical_schema.sql", import.meta.url), "utf8"))
  .replaceAll('"', "")
  .toLowerCase();
const runtime = canonical;
const schema = canonical;
const security = canonical;

function functionBody(name: string): string {
  const start = runtime.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} must be declared`);
  const end = runtime.indexOf("$$;", start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return runtime.slice(start, end + 3).toLowerCase();
}

test("startup team uniqueness matches the PostgREST upsert conflict target", () => {
  assert.match(schema, /unique \(startup_semester_id, semester_membership_id\)/u);
  assert.doesNotMatch(schema, /unique \(semester_id, startup_semester_id, semester_membership_id\)/u);
});

test("founder moves are authorized and atomic inside one database function", () => {
  const body = functionBody("move_startup_team_membership");
  assert.match(body, /can_manage_semester/u);
  assert.match(body, /insert into public\.startup_team_memberships/u);
  assert.match(body, /delete from public\.startup_team_memberships/u);
  assert.ok(body.indexOf("insert into public.startup_team_memberships") < body.indexOf("delete from public.startup_team_memberships"));
  assert.match(security, /revoke all on function public\.move_startup_team_membership\([^;]+ from public/u);
  assert.match(security, /grant all on function public\.move_startup_team_membership\([^;]+ to authenticated/u);
});

test("startup identity and semester edits share one authorized transaction", () => {
  const body = functionBody("update_startup_records");
  assert.match(body, /can_manage_semester/u);
  assert.match(body, /update public\.startup_organizations/u);
  assert.match(body, /update public\.startup_semesters/u);
});

test("semester member approval and role changes are authorized and atomic without platform elevation", () => {
  const body = functionBody("set_semester_member_access");
  assert.match(body, /actor_can_manage_semester\(p_semester_id, p_actor_profile_id\)/u);
  assert.doesNotMatch(body, /insert into public\.profiles/u);
  assert.match(body, /insert into public\.semester_memberships/u);
  assert.match(body, /insert into public\.mentor_profiles/u);
  assert.match(body, /insert into public\.mentor_semesters/u);
  assert.doesNotMatch(body, /platform_roles/u);
  assert.match(security, /revoke all on function public\.set_semester_member_access\([^;]+ from public/u);
  assert.match(security, /grant all on function public\.set_semester_member_access\([^;]+ to service_role/u);
});

test("platform super-admin changes require an existing platform super-admin", () => {
  const body = functionBody("set_platform_super_admin");
  assert.match(body, /is_super_admin\(auth\.uid\(\)\)/u);
  assert.doesNotMatch(body, /can_manage_semester/u);
  assert.match(body, /insert into public\.platform_roles/u);
  assert.match(body, /delete from public\.platform_roles/u);
  assert.match(security, /revoke all on function public\.set_platform_super_admin/u);
});

test("member identity preflight requires target membership and protects super-admin identities", () => {
  const body = functionBody("authorize_semester_member_identity_update");
  assert.match(body, /can_manage_semester\(p_semester_id, auth\.uid\(\)\)/u);
  assert.match(body, /from public\.semester_memberships/u);
  assert.match(body, /profile_id = p_profile_id/u);
  assert.match(body, /is_super_admin\(p_profile_id\)[\s\S]*is_super_admin\(auth\.uid\(\)\)/u);
  assert.match(security, /grant all on function public\.authorize_semester_member_identity_update\([^;]+ to authenticated/u);
});

test("existing member updates cannot insert arbitrary targets or corrupt dependent semester data", () => {
  const body = functionBody("set_semester_member_access");
  assert.match(body, /if not p_approve and v_membership_id is null/u);
  assert.match(body, /semester member not found/u);
  assert.match(body, /mentor_semesters/u);
  assert.match(body, /startup_team_memberships/u);
  assert.match(body, /role transition requires explicit data migration/u);
  assert.match(body, /is_super_admin\(p_profile_id\)[\s\S]*is_super_admin\(p_actor_profile_id\)/u);
});

test("approval cannot provision an arbitrary existing profile through the direct RPC", () => {
  const body = functionBody("set_semester_member_access");
  assert.match(body, /select[\s\S]*profile\.email[\s\S]*profile\.status[\s\S]*from public\.profiles profile/u);
  assert.match(body, /not p_approve and v_membership_id is null[\s\S]*semester member not found/u);
  assert.match(body, /v_membership_id is null[\s\S]*v_existing_status is distinct from 'pending'[\s\S]*pending auth-triggered profile is required/u);
  assert.match(body, /lower\(v_existing_email\) is distinct from lower\(trim\(p_email\)\)[\s\S]*profile email does not match/u);
  assert.match(body, /if p_approve then[\s\S]*status = 'approved'[\s\S]*else[\s\S]*set email = coalesce\(nullif\(trim\(p_email\), ''\), email\)/u);
});

test("mentor create and update commands are authorized single transactions", () => {
  const createBody = functionBody("create_mentor_records");
  assert.match(createBody, /actor_can_manage_semester\(p_semester_id, p_actor_profile_id\)/u);
  assert.doesNotMatch(createBody, /insert into public\.profiles/u);
  assert.match(createBody, /insert into public\.semester_memberships/u);
  assert.match(createBody, /insert into public\.mentor_profiles/u);
  assert.match(createBody, /insert into public\.mentor_semesters/u);
  assert.match(createBody, /existing semester membership has an incompatible role/u);
  assert.match(createBody, /is_super_admin\(p_profile_id\)[\s\S]*is_super_admin\(p_actor_profile_id\)/u);

  const updateBody = functionBody("update_mentor_records");
  assert.match(updateBody, /actor_can_manage_semester\(v_semester_id, p_actor_profile_id\)/u);
  assert.match(updateBody, /update public\.profiles/u);
  assert.match(updateBody, /update public\.mentor_profiles/u);
  assert.match(updateBody, /update public\.mentor_semesters/u);
  assert.match(updateBody, /update public\.semester_memberships/u);
  assert.match(updateBody, /is_super_admin\(v_profile_id\)[\s\S]*is_super_admin\(p_actor_profile_id\)/u);
  assert.match(security, /grant all on function public\.create_mentor_records\([^;]+ to service_role/u);
  assert.match(security, /grant all on function public\.update_mentor_records\([^;]+ to service_role/u);
});

test("mentor creation cannot claim an arbitrary profile through the direct RPC", () => {
  const body = functionBody("create_mentor_records");
  assert.match(body, /select[\s\S]*profile\.email[\s\S]*profile\.status[\s\S]*from public\.profiles profile/u);
  assert.match(body, /v_membership_id is null[\s\S]*v_existing_status is distinct from 'pending'[\s\S]*pending auth-triggered profile is required/u);
  assert.match(body, /lower\(v_existing_email\) is distinct from lower\(trim\(p_email\)\)[\s\S]*profile email does not match/u);
  assert.match(body, /update public\.profiles[\s\S]*set status = 'approved'/u);
  assert.doesNotMatch(body, /set email =/u);
});

test("global mentor account access is reversible, super-admin-only, and preserves history", () => {
  const body = functionBody("set_mentor_account_access");
  assert.match(body, /private\.is_super_admin\(auth\.uid\(\)\)/u);
  assert.match(body, /update public\.profiles[\s\S]*is_active = p_enabled/u);
  assert.match(body, /update public\.semester_memberships[\s\S]*status = 'suspended'/u);
  assert.match(body, /status in \('invited', 'onboarding', 'active'\)/u);
  assert.match(body, /if not p_enabled then[\s\S]*update public\.semester_memberships/u);
  assert.doesNotMatch(body, /delete from/u);
  assert.doesNotMatch(body, /status = 'active'/u);
  assert.match(body, /insert into public\.program_audit_events/u);
  assert.match(security, /revoke all on function public\.set_mentor_account_access\([^;]+ from public/u);
  assert.match(security, /grant all on function public\.set_mentor_account_access\([^;]+ to authenticated/u);
});
