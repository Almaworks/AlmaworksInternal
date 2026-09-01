import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const policyPath = new URL("../../supabase/schemas/zzz_database_revamp_rls.sql", import.meta.url);

const expectedPolicyMatrix = {
  invitations: ["select"],
  meeting_availability: ["delete", "insert", "select", "update"],
  meetings: ["select"],
  mentor_profiles: ["select", "update"],
  mentor_semesters: ["select", "update"],
  outreach_activities: ["select"],
  outreach_companies: ["select"],
  outreach_contact_companies: ["select", "update"],
  outreach_contacts: ["select", "update"],
  outreach_imports: ["insert", "select", "update"],
  outreach_opportunities: ["select", "update"],
  platform_roles: ["select"],
  profiles: ["select", "update"],
  program_audit_events: ["select"],
  semester_memberships: ["select"],
  semesters: ["select"],
  sessions: ["delete", "insert", "select", "update"],
  startup_organizations: ["select"],
  startup_semesters: ["select", "update"],
  startup_team_memberships: ["select"],
} as const;

async function loadPolicySql() {
  return (await readFile(policyPath, "utf8")).replace(/\r\n/g, "\n");
}

async function loadDeclarativeSchema() {
  const directory = new URL("../../supabase/schemas/", import.meta.url);
  const filenames = (await readdir(directory)).filter((filename) => filename.endsWith(".sql")).sort();
  return (await Promise.all(filenames.map((filename) => readFile(new URL(filename, directory), "utf8")))).join("\n").replace(/\r\n/g, "\n");
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

test("suspended members cannot reactivate themselves through direct table updates", async () => {
  const sql = await loadPolicySql();
  const schema = await loadDeclarativeSchema();

  assert.doesNotMatch(sql, /create policy "[^"]+" on public\.semester_memberships\s+for update/iu);
  assert.match(schema, /function public\.update_own_onboarding_progress\b/iu);
  assert.match(schema, /if p_finalize and membership_record\.status <> 'onboarding'/iu);
  assert.match(schema, /raise exception 'onboarding status transition is not allowed'/iu);
});

test("an active program member can read historical mentors but not arbitrary profiles", async () => {
  const sql = await loadPolicySql();
  const schema = await loadDeclarativeSchema();
  const profilePolicy = sql.match(/create policy "program members read profiles"[\s\S]*?;\n/u)?.[0] ?? "";

  assert.match(schema, /function private\.can_read_mentor_profile\([\s\S]*?target_profile_id uuid,[\s\S]*?candidate_id uuid/u);
  assert.match(schema, /candidate_membership\.status in \('onboarding', 'active'\)/u);
  assert.match(schema, /mentor_membership\.profile_id = target_profile_id/u);
  assert.match(schema, /mentor_membership\.role = 'mentor'/u);
  assert.match(profilePolicy, /private\.can_read_mentor_profile\(profiles\.id, \(select auth\.uid\(\)\)\)/u);
  assert.doesNotMatch(profilePolicy, /viewer_membership\.semester_id = subject_membership\.semester_id/u);
});

test("outreach bootstrap is atomic and authorized for the target semester", async () => {
  const sql = await loadPolicySql();
  const schema = await loadDeclarativeSchema();

  assert.match(schema, /function public\.upsert_outreach_contact_bundle\b/u);
  assert.match(schema, /not private\.can_manage_semester\(p_semester_id, actor_id\)/u);
  assert.match(schema, /insert into public\.outreach_contacts[\s\S]*?insert into public\.outreach_opportunities[\s\S]*?insert into public\.outreach_contact_companies/u);
  assert.doesNotMatch(sql, /create policy "[^"]+" on public\.outreach_(?:contacts|companies|contact_companies|opportunities)\s+for insert/iu);
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
