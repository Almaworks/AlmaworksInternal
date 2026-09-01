import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const schemaPath = new URL("../../supabase/schemas/database_revamp.sql", import.meta.url);
const schemasDirectory = new URL("../../supabase/schemas/", import.meta.url);

function canonicalSchema(): string {
  return readFileSync(schemaPath, "utf8").toLowerCase();
}

const requiredIndexes = [
  ["platform_roles_granted_by_idx", "platform_roles", "granted_by"],
  ["invitations_operations_idx", "invitations", "semester_id, status, created_at desc"],
  ["invitations_open_identity_idx", "invitations", "semester_id, email, role"],
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
  ["outreach_opportunities_queue_cursor_idx", "outreach_opportunities", "semester_id, next_follow_up_at, id"],
  ["outreach_opportunities_contact_idx", "outreach_opportunities", "contact_id, semester_id"],
  ["outreach_opportunities_owner_idx", "outreach_opportunities", "owner_profile_id, semester_id"],
  ["outreach_activities_timeline_idx", "outreach_activities", "semester_id, opportunity_id, occurred_at desc, id desc"],
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

test("each declarative index name has one owner", () => {
  const owners = new Map<string, string[]>();
  for (const filename of readdirSync(schemasDirectory).filter((name) => name.endsWith(".sql"))) {
    const sql = readFileSync(new URL(filename, schemasDirectory), "utf8").toLowerCase();
    for (const match of sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gu)) {
      owners.set(match[1], [...(owners.get(match[1]) ?? []), filename]);
    }
  }

  const duplicates = [...owners.entries()].filter(([, files]) => files.length > 1);
  assert.deepEqual(duplicates, []);
});

test("outreach keyset ordering includes the nullable tail", () => {
  const sql = canonicalSchema();
  const declaration = sql.match(
    /create index outreach_opportunities_queue_cursor_idx[\s\S]*?;/u,
  )?.[0];
  assert.equal(
    declaration,
    "create index outreach_opportunities_queue_cursor_idx on public.outreach_opportunities (semester_id, next_follow_up_at, id);",
  );
});
