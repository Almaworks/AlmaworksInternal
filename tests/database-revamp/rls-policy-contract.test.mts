import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const policyPath = new URL("../../supabase/schemas/zzz_database_revamp_rls.sql", import.meta.url);

const expectedPolicyMatrix = {
  invitations: ["select"],
  meeting_availability: ["delete", "insert", "select", "update"],
  meetings: ["select"],
  mentor_profiles: ["select", "update"],
  mentor_semesters: ["select", "update"],
  outreach_activities: ["select"],
  outreach_companies: ["insert", "select"],
  outreach_contact_companies: ["insert", "select", "update"],
  outreach_contacts: ["insert", "select", "update"],
  outreach_imports: ["insert", "select", "update"],
  outreach_opportunities: ["insert", "select", "update"],
  platform_roles: ["select"],
  profiles: ["select", "update"],
  program_audit_events: ["select"],
  semester_memberships: ["select", "update"],
  semesters: ["select"],
  sessions: ["delete", "insert", "select", "update"],
  startup_organizations: ["select"],
  startup_semesters: ["select", "update"],
  startup_team_memberships: ["select"],
} as const;

async function loadPolicySql() {
  return (await readFile(policyPath, "utf8")).replace(/\r\n/g, "\n");
}

function policyMatrix(sql: string) {
  const matrix = new Map<string, string[]>();
  const expression = /create policy "[^"]+" on public\.([a-z_]+)\s+for (select|insert|update|delete) to authenticated/giu;

  for (const match of sql.matchAll(expression)) {
    const [, table, command] = match;
    const commands = matrix.get(table) ?? [];
    commands.push(command.toLowerCase());
    matrix.set(table, commands);
  }

  return Object.fromEntries(
    [...matrix].sort(([left], [right]) => left.localeCompare(right)).map(([table, commands]) => [table, commands.sort()]),
  );
}

test("the canonical 20-table RLS layer has one policy per exposed action", async () => {
  const sql = await loadPolicySql();

  assert.deepEqual(policyMatrix(sql), expectedPolicyMatrix);
  assert.doesNotMatch(sql, /for all to authenticated/iu);

  for (const table of Object.keys(expectedPolicyMatrix)) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "u"));
  }
});

test("policy identity lookups use initplans and never legacy profile roles", async () => {
  const sql = await loadPolicySql();

  assert.doesNotMatch(sql, /(?<!select )auth\.uid\(\)/u);
  assert.doesNotMatch(sql, /profiles\.role|get_my_role/iu);
});

test("startup session requests cannot be created for another startup or as confirmed", async () => {
  const sql = await loadPolicySql();
  const insertPolicy = sql.match(/create policy "startups request sessions"[\s\S]*?;\n/u)?.[0] ?? "";

  assert.match(insertPolicy, /sessions\.status = 'requested'/u);
  assert.match(insertPolicy, /team\.startup_semester_id = sessions\.startup_semester_id/u);
  assert.match(insertPolicy, /membership\.semester_id = sessions\.semester_id/u);
  assert.match(insertPolicy, /membership\.profile_id = \(select auth\.uid\(\)\)/u);
});

test("mentor session responses keep ownership and restrict the resulting status", async () => {
  const sql = await loadPolicySql();
  const updatePolicy = sql.match(/create policy "admins or mentors update sessions"[\s\S]*?;\n/u)?.[0] ?? "";

  assert.match(updatePolicy, /mentor_term\.id = sessions\.mentor_semester_id/u);
  assert.match(updatePolicy, /membership\.semester_id = sessions\.semester_id/u);
  assert.match(updatePolicy, /sessions\.status in \('confirmed', 'declined'\)/u);
});

test("meeting availability ownership binds the member and meeting to the row semester", async () => {
  const sql = await loadPolicySql();
  const insertPolicy = sql.match(/create policy "members insert meeting availability"[\s\S]*?;\n/u)?.[0] ?? "";

  assert.match(insertPolicy, /membership\.semester_id = meeting_availability\.semester_id/u);
  assert.match(insertPolicy, /meeting\.semester_id = meeting_availability\.semester_id/u);
  assert.match(insertPolicy, /membership\.status in \('onboarding', 'active'\)/u);
});

test("startup semester updates preserve team ownership without a tautological check", async () => {
  const sql = await loadPolicySql();
  const updatePolicy = sql.match(/create policy "startup teams update startup semesters"[\s\S]*?;\n/u)?.[0] ?? "";

  assert.doesNotMatch(updatePolicy, /semester_id\s*=\s*semester_id/u);
  assert.match(updatePolicy, /team\.semester_id = startup_semesters\.semester_id/u);
  assert.match(updatePolicy, /membership\.semester_id = startup_semesters\.semester_id/u);
  assert.match(updatePolicy, /membership\.profile_id = \(select auth\.uid\(\)\)/u);
});
