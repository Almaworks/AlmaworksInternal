import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaPath = new URL("../../supabase/schemas/database_revamp.sql", import.meta.url);

function schema(): string {
  return readFileSync(schemaPath, "utf8").toLowerCase();
}

const targetTables = [
  "semesters",
  "profiles",
  "platform_roles",
  "semester_memberships",
  "invitations",
  "mentor_profiles",
  "mentor_semesters",
  "startup_organizations",
  "startup_semesters",
  "startup_team_memberships",
  "meetings",
  "meeting_availability",
  "sessions",
  "program_audit_events",
  "outreach_contacts",
  "outreach_companies",
  "outreach_contact_companies",
  "outreach_opportunities",
  "outreach_activities",
  "outreach_imports",
] as const;

test("the revamp contracts to exactly twenty Almaworks base tables", () => {
  const sql = schema();
  const manifestStart = sql.indexOf("-- canonical table manifest");
  const manifestEnd = sql.indexOf("-- end canonical table manifest");
  assert.notEqual(manifestStart, -1, "canonical table manifest must exist");
  assert.notEqual(manifestEnd, -1, "canonical table manifest must end");
  const manifest = sql.slice(manifestStart, manifestEnd);
  const declared = [...manifest.matchAll(/create table public\.([a-z0-9_]+)/gu)].map((match) => match[1]);
  assert.deepEqual(declared, targetTables);
});

test("program scheduling uses Friday meetings and two conflict-safe slots", () => {
  const sql = schema();
  const meetings = sql.slice(sql.indexOf("create table public.meetings"), sql.indexOf(";", sql.indexOf("create table public.meetings")));
  const availability = sql.slice(sql.indexOf("create table public.meeting_availability"), sql.indexOf(";", sql.indexOf("create table public.meeting_availability")));
  const sessions = sql.slice(sql.indexOf("create table public.sessions"), sql.indexOf(";", sql.indexOf("create table public.sessions")));

  assert.match(meetings, /semester_id uuid not null/);
  assert.match(meetings, /extract\(isodow from meeting_date\) = 5/);
  assert.match(availability, /slot smallint not null check \(slot in \(1, 2\)\)/);
  assert.match(availability, /unique \(meeting_id, semester_membership_id, slot\)/);
  assert.match(sessions, /slot smallint not null check \(slot in \(1, 2\)\)/);
  assert.match(sessions, /foreign key \(semester_id, meeting_id\)/);
  assert.match(sessions, /foreign key \(semester_id, mentor_semester_id\)/);
  assert.match(sessions, /foreign key \(semester_id, startup_semester_id\)/);
  assert.match(sessions, /unique \(meeting_id, slot, mentor_semester_id\)/);
  assert.match(sessions, /unique \(meeting_id, slot, startup_semester_id\)/);
  assert.doesNotMatch(sessions, /is_confirmed/);
});

test("membership is the semester-history and onboarding source of truth", () => {
  const sql = schema();
  const start = sql.indexOf("create table public.semester_memberships");
  const declaration = sql.slice(start, sql.indexOf(";", start));
  assert.match(declaration, /unique \(semester_id, profile_id\)/);
  assert.match(declaration, /onboarding_data jsonb not null default '\{\}'::jsonb/);
  assert.match(declaration, /onboarding_started_at timestamptz/);
  assert.match(declaration, /onboarding_completed_at timestamptz/);
});

test("outreach is six tables with semester-fresh opportunities", () => {
  const sql = schema();
  const opportunitiesStart = sql.indexOf("create table public.outreach_opportunities");
  const opportunities = sql.slice(opportunitiesStart, sql.indexOf(";", opportunitiesStart));
  assert.match(opportunities, /semester_id uuid not null/);
  assert.match(opportunities, /relationship_types text\[\] not null/);
  assert.match(opportunities, /stage text not null default 'not_contacted'/);
  assert.match(opportunities, /unique \(semester_id, contact_id\)/);
  assert.doesNotMatch(opportunities, /converted_mentor|mentor_profile|startup/);

  const carryStart = sql.indexOf("function public.carry_forward_outreach_contacts");
  const carry = sql.slice(carryStart, carryStart + 7000);
  assert.match(carry, /stage,[\s\S]*?select[\s\S]*?'not_contacted'/);
  assert.match(carry, /next_follow_up_at,[\s\S]*?select[\s\S]*?null/);
  assert.match(carry, /snoozed_until,[\s\S]*?select[\s\S]*?null/);
  assert.match(carry, /on conflict \(semester_id, contact_id\)/);

  const resetStart = sql.indexOf("function public.reset_outreach_opportunities");
  const reset = sql.slice(resetStart, resetStart + 7000);
  assert.match(reset, /insert into public\.outreach_activities/);
  assert.doesNotMatch(reset, /delete from public\.outreach_activities/);
});

test("all twenty exposed tables enable RLS", () => {
  const sql = schema();
  for (const table of targetTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), `${table} must enable RLS`);
  }
});
