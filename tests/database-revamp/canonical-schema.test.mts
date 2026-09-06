import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const canonicalSource = readFileSync(
  new URL("../../supabase/schemas/canonical_schema.sql", import.meta.url),
  "utf8",
).replaceAll('"', "").toLowerCase();
const securitySource = readFileSync(
  new URL("../../supabase/schemas/zz_security.sql", import.meta.url),
  "utf8",
).replaceAll('"', "").toLowerCase();
const source = `${canonicalSource}\n${securitySource}`;
const migrationDirectory = new URL("../../supabase/migrations/", import.meta.url);
const cutoverMigrations = readdirSync(migrationDirectory)
  .filter((name) => name.includes("database_hardening_cutover_stage_"))
  .sort();

const tables = [
  "profiles", "platform_roles", "semesters", "semester_memberships", "invitations",
  "mentor_profiles", "mentor_semesters", "startup_organizations", "startup_semesters",
  "startup_team_memberships", "meetings", "meeting_availability", "sessions",
  "session_rsvps",
  "schedule_attention_alerts",
  "program_audit_events", "outreach_contacts", "outreach_companies",
  "outreach_contact_companies", "outreach_opportunities", "outreach_activities",
  "outreach_imports",
] as const;

test("canonical schema contains exactly the twenty-two Almaworks tables", () => {
  const declared = [...source.matchAll(/create table(?: if not exists)? public\.([a-z_]+)/gu)].map((match) => match[1]);
  assert.deepEqual(declared.sort(), [...tables].sort());
  for (const legacy of ["mentors", "startups", "session_dates", "availability"]) {
    assert.doesNotMatch(source, new RegExp(`create (?:or replace )?view public\\.${legacy}\\b`, "u"));
  }
});

test("session RSVPs are semester-scoped, constrained, indexed, and protected", () => {
  const tableStart = source.indexOf("create table if not exists public.session_rsvps");
  assert.notEqual(tableStart, -1);
  const table = source.slice(tableStart, source.indexOf(";", tableStart));
  assert.match(table, /semester_id uuid not null/u);
  assert.match(table, /session_id uuid not null/u);
  assert.match(table, /semester_membership_id uuid not null/u);
  assert.match(table, /response text not null/u);
  assert.match(source, /session_rsvps_response_check[\s\S]*?attending[\s\S]*?not_attending/u);
  assert.match(source, /session_rsvps_session_membership_key[\s\S]*?unique \(session_id, semester_membership_id\)/u);
  assert.match(source, /session_rsvps_semester_id_fkey[\s\S]*?semesters\(id\)/u);
  assert.match(source, /session_rsvps_semester_session_fkey[\s\S]*?sessions\(semester_id, id\)/u);
  assert.match(source, /session_rsvps_semester_membership_fkey[\s\S]*?semester_memberships\(semester_id, id\)/u);
  assert.match(source, /create index session_rsvps_semester_session_idx/u);
  assert.match(source, /alter table public\.session_rsvps enable row level security/u);
  assert.match(source, /grant insert \(semester_id, session_id, semester_membership_id, response\) on table public\.session_rsvps to authenticated/u);
  assert.match(source, /grant update \(response\) on table public\.session_rsvps to authenticated/u);
});

test("identity, semester vocabulary, and canonical scheduling are enforced", () => {
  const profilesStart = source.indexOf("create table if not exists public.profiles");
  const profiles = source.slice(profilesStart, source.indexOf(";", profilesStart));
  assert.match(profiles, /auth_user_id uuid/u);
  assert.match(profiles, /\brole public\.user_role/u);
  assert.match(profiles, /semester_id uuid/u);
  assert.match(source, /profiles_auth_user_id_key[\s\S]*?auth_user_id/u);
  assert.match(source, /profiles_auth_user_id_fkey[\s\S]*?auth\.users\(id\)/u);
  assert.doesNotMatch(source, /foreign key \(id\) references auth\.users/u);
  const newUser = source.slice(source.indexOf("function public.handle_new_user"), source.indexOf("$$;", source.indexOf("function public.handle_new_user")));
  assert.match(newUser, /insert into public\.profiles\s*\(id,\s*auth_user_id,/u);
  assert.match(source, /function public\.replace_draft_meetings/u);
  assert.match(source, /function public\.commit_mentor_assignment/u);
  assert.match(source, /p_meeting_id/u);
  assert.match(source, /p_slot/u);
  const sessionsStart = source.indexOf("create table if not exists public.sessions");
  const sessions = source.slice(sessionsStart, source.indexOf(";", sessionsStart));
  assert.doesNotMatch(sessions, /\b(mentor_id|startup_id|session_date_id|session_date|time_slot|is_confirmed)\b/u);
  assert.doesNotMatch(source, /function public\.(replace_draft_session_dates|commit_legacy_outreach_migration|sync_session_compatibility_columns)/u);
});

test("all tables have RLS, policy actions are consolidated, and auth calls use initplans", () => {
  for (const table of tables) {
    assert.match(source, new RegExp(`alter table public\\.${table} enable row level security`, "u"));
  }
  const policies = [...source.matchAll(/create policy [\s\S]*? on public\.([a-z_]+)[\s\S]*? for (select|insert|update|delete)[\s\S]*?;/gu)];
  const keys = policies.map((match) => `${match[1]}:${match[2]}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const policy of policies) {
    assert.doesNotMatch(policy[0], /(?<!select )auth\.(uid|role|jwt)\(\)/u);
    assert.doesNotMatch(
      policy[0],
      /(?:profile_id|\bid)\s*=\s*\( select auth\.uid\(\) as uid\)/u,
      "durable profile identities must be resolved through private.current_profile_id",
    );
  }
  assert.match(source, /private\.current_profile_id\(\( select auth\.uid\(\) as uid\)\)/u);
});

test("least-privilege grants and relationship indexes are present", () => {
  assert.doesNotMatch(source, /grant all on table .* to (anon|authenticated)/u);
  assert.match(source, /revoke all on function public\.commit_mentor_assignment[\s\S]*? from public/u);
  assert.match(source, /alter default privileges for role postgres\s+revoke all on functions from public/u);
  assert.match(source, /revoke all on function public\.commit_mentor_assignment[\s\S]*? from anon/u);
  assert.match(source, /grant insert \(semester_id, meeting_id, semester_membership_id, slot, is_available, format, source\) on table public\.meeting_availability to authenticated/u);
  assert.match(source, /grant update \(goals, mentorship_needs, mentor_need_context, mentor_need_no_preference, company_snapshot\) on table public\.startup_semesters to authenticated/u);
  assert.match(source, /grant insert \(semester_id, meeting_id, mentor_semester_id, startup_semester_id, slot, status, topic, format\) on table public\.sessions to authenticated/u);
  assert.match(source, /grant update \(status\) on table public\.profiles to service_role/u);
  for (const index of [
    "invitations_invited_by_idx", "meeting_availability_member_idx",
    "mentor_semesters_membership_idx", "outreach_imports_created_by_idx",
    "platform_roles_granted_by_idx", "program_audit_events_actor_idx",
    "sessions_semester_meeting_idx", "startup_semesters_organization_idx",
  ]) {
    assert.match(source, new RegExp(`create index ${index}\\b`, "u"));
  }
});

test("generated cutover stages preserve deny-before-allow ACL ordering", () => {
  assert.equal(cutoverMigrations.length, 2);
  const [stageAName, stageBName] = cutoverMigrations;
  assert.match(stageAName, /_stage_a\.sql$/u);
  assert.match(stageBName, /_stage_b\.sql$/u);
  const stageA = readFileSync(new URL(stageAName, migrationDirectory), "utf8").toLowerCase();
  const stageB = readFileSync(new URL(stageBName, migrationDirectory), "utf8").toLowerCase();
  assert.match(stageA, /alter default privileges for role "postgres" revoke all on functions from public;/u);
  assert.match(stageA, /revoke all on table "public"\."sessions" from "authenticated";/u);
  assert.doesNotMatch(stageB, /^revoke all on table/gmu);
  assert.doesNotMatch(`${stageA}\n${stageB}`, /drop (?:table|schema).*\b(?:visa|agent)/u);
});
