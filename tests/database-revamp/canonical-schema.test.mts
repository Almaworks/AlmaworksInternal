import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../../supabase/schemas/canonical_schema.sql", import.meta.url),
  "utf8",
).replaceAll('"', "").toLowerCase();

const tables = [
  "profiles", "platform_roles", "semesters", "semester_memberships", "invitations",
  "mentor_profiles", "mentor_semesters", "startup_organizations", "startup_semesters",
  "startup_team_memberships", "meetings", "meeting_availability", "sessions",
  "program_audit_events", "outreach_contacts", "outreach_companies",
  "outreach_contact_companies", "outreach_opportunities", "outreach_activities",
  "outreach_imports",
] as const;

test("canonical schema contains exactly the twenty Almaworks tables", () => {
  const declared = [...source.matchAll(/create table(?: if not exists)? public\.([a-z_]+)/gu)].map((match) => match[1]);
  assert.deepEqual(declared.sort(), [...tables].sort());
  for (const legacy of ["mentors", "startups", "session_dates", "availability"]) {
    assert.doesNotMatch(source, new RegExp(`create (?:or replace )?view public\\.${legacy}\\b`, "u"));
  }
});

test("identity, semester vocabulary, and canonical scheduling are enforced", () => {
  const profilesStart = source.indexOf("create table if not exists public.profiles");
  const profiles = source.slice(profilesStart, source.indexOf(";", profilesStart));
  assert.doesNotMatch(profiles, /\b(role|semester_id|auth_user_id)\b/u);
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
  }
});

test("least-privilege grants and relationship indexes are present", () => {
  assert.doesNotMatch(source, /grant all on table .* to (anon|authenticated)/u);
  assert.match(source, /revoke all on function public\.commit_mentor_assignment[\s\S]*? from public/u);
  for (const index of [
    "invitations_invited_by_idx", "meeting_availability_member_idx",
    "mentor_semesters_membership_idx", "outreach_imports_created_by_idx",
    "platform_roles_granted_by_idx", "program_audit_events_actor_idx",
    "sessions_semester_meeting_idx", "startup_semesters_organization_idx",
  ]) {
    assert.match(source, new RegExp(`create index ${index}\\b`, "u"));
  }
});
