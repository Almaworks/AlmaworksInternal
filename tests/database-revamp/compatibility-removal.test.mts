import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const schemaDirectory = new URL("../../supabase/schemas/", import.meta.url);

function declarativeSchema(): string {
  return readdirSync(schemaDirectory)
    .filter((filename) => filename.endsWith(".sql"))
    .sort()
    .map((filename) => readFileSync(new URL(filename, schemaDirectory), "utf8"))
    .join("\n")
    .toLowerCase();
}

test("the declarative target exposes only canonical program relations", () => {
  const sql = declarativeSchema();

  for (const legacyView of ["mentors", "startups", "session_dates", "availability"]) {
    assert.doesNotMatch(sql, new RegExp(`create\\s+(?:or\\s+replace\\s+)?view\\s+public\\.${legacyView}\\b`, "u"));
  }

  for (const helper of ["mentors", "startups", "session_dates", "semesters"]) {
    assert.doesNotMatch(sql, new RegExp(`function\\s+public\\.${helper}\\s*\\(public\\.(?:sessions|mentors|startups|session_dates)\\)`, "u"));
  }
});

test("sessions retain idempotency while dropping all mirrored compatibility columns", () => {
  const sql = declarativeSchema();
  const start = sql.indexOf("create table public.sessions");
  const declaration = sql.slice(start, sql.indexOf(";", start));

  assert.notEqual(start, -1);
  assert.match(declaration, /idempotency_key text/);
  for (const column of ["mentor_id", "startup_id", "session_date_id", "session_date", "time_slot", "is_confirmed"]) {
    assert.doesNotMatch(declaration, new RegExp(`\\b${column}\\b`, "u"));
    assert.doesNotMatch(sql, new RegExp(`add\\s+column\\s+(?:if\\s+not\\s+exists\\s+)?${column}\\b`, "u"));
  }
  assert.doesNotMatch(sql, /function public\.sync_session_compatibility_columns\s*\(/);
});

test("only canonical meeting and assignment RPCs remain", () => {
  const sql = declarativeSchema();

  assert.doesNotMatch(sql, /function public\.replace_draft_session_dates\s*\(/);
  assert.match(sql, /function public\.replace_draft_meetings\s*\(p_semester_id uuid, p_meetings jsonb\)/);
  assert.doesNotMatch(sql, /function public\.commit_legacy_outreach_migration\s*\(/);

  const assignmentStart = sql.indexOf("function public.commit_mentor_assignment");
  assert.notEqual(assignmentStart, -1);
  const assignment = sql.slice(assignmentStart, assignmentStart + 900);
  assert.match(assignment, /p_meeting_id uuid/);
  assert.match(assignment, /p_slot smallint/);
  assert.match(assignment, /p_mentor_semester_id uuid/);
  assert.doesNotMatch(assignment, /p_session_date_id|p_time_slot|p_mentor_profile_id/);
});
