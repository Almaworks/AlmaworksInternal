import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaPath = new URL("../../supabase/schemas/database_revamp.sql", import.meta.url);

function canonicalSchema(): string {
  return readFileSync(schemaPath, "utf8").toLowerCase();
}

const requiredIndexes = [
  ["platform_roles_granted_by_idx", "platform_roles", "granted_by"],
  ["invitations_operations_idx", "invitations", "semester_id, status, created_at desc"],
  ["invitations_startup_semester_idx", "invitations", "startup_semester_id"],
  ["invitations_matched_profile_idx", "invitations", "matched_profile_id"],
  ["invitations_invited_by_idx", "invitations", "invited_by"],
  ["mentor_semesters_membership_idx", "mentor_semesters", "semester_membership_id"],
  ["startup_semesters_organization_idx", "startup_semesters", "startup_organization_id"],
  ["startup_team_memberships_semester_idx", "startup_team_memberships", "semester_id"],
  ["startup_team_memberships_profile_idx", "startup_team_memberships", "semester_membership_id"],
  ["meeting_availability_semester_idx", "meeting_availability", "semester_id"],
  ["meeting_availability_member_idx", "meeting_availability", "semester_membership_id, meeting_id"],
  ["sessions_semester_meeting_idx", "sessions", "semester_id, meeting_id"],
  ["sessions_mentor_idx", "sessions", "mentor_semester_id, meeting_id"],
  ["sessions_startup_idx", "sessions", "startup_semester_id, meeting_id"],
  ["program_audit_events_semester_timeline_idx", "program_audit_events", "semester_id, created_at desc"],
  ["program_audit_events_actor_idx", "program_audit_events", "actor_profile_id"],
  ["outreach_contact_companies_company_idx", "outreach_contact_companies", "company_id, contact_id"],
  ["outreach_opportunities_owner_idx", "outreach_opportunities", "owner_profile_id, semester_id"],
  ["outreach_activities_actor_idx", "outreach_activities", "actor_profile_id"],
  ["outreach_imports_created_by_idx", "outreach_imports", "created_by"],
] as const;

test("canonical indexes cover parent deletes, RLS lookups, and application filters", () => {
  const sql = canonicalSchema();

  for (const [name, table, columns] of requiredIndexes) {
    const declaration = new RegExp(
      `create (?:unique )?index ${name} on public\\.${table} \\(${columns.replaceAll(" ", "\\s+")}\\)`,
      "u",
    );
    assert.match(sql, declaration, `${name} must lead with (${columns})`);
  }
});

test("the canonical index set does not reintroduce profile semester coupling", () => {
  assert.doesNotMatch(canonicalSchema(), /create (?:unique )?index [^;]+ on public\.profiles \(semester_id/u);
});
