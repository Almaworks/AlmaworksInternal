import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const securityPath = new URL("../../supabase/schemas/zz_database_revamp_security.sql", import.meta.url);

function security(): string {
  return readFileSync(securityPath, "utf8").toLowerCase().replace(/\s+/gu, " ");
}

function declarativeSchema(): string {
  const directory = new URL("../../supabase/schemas/", import.meta.url);
  return readdirSync(directory)
    .filter((filename) => filename.endsWith(".sql"))
    .sort()
    .map((filename) => readFileSync(new URL(filename, directory), "utf8"))
    .join("\n")
    .toLowerCase()
    .replace(/\s+/gu, " ");
}

const authenticatedRpcs = [
  "activate_semester_transition(uuid,uuid)",
  "authorize_semester_member_identity_update(uuid,uuid)",
  "bulk_set_membership_activity(uuid,uuid[],boolean)",
  "can_manage_any_outreach(uuid)",
  "can_manage_semester(uuid,uuid)",
  "carry_forward_outreach_contacts(uuid,uuid,uuid[])",
  "commit_mentor_assignment(uuid,uuid,smallint,uuid,uuid,text,text,text,text[],text,jsonb)",
  "create_semester_draft(uuid,text,date,date,jsonb)",
  "import_prior_semester_memberships(uuid,uuid,uuid[])",
  "log_outreach_activity(uuid,public.outreach_activity_kind,timestamptz,public.outreach_channel,text,jsonb,timestamptz,public.outreach_stage,timestamptz)",
  "move_startup_team_membership(uuid,uuid,uuid)",
  "release_inactive_owner_work(uuid)",
  "replace_draft_meetings(uuid,jsonb)",
  "reset_outreach_opportunities(uuid,uuid[])",
  "set_outreach_silence(uuid,boolean,text,timestamptz,timestamptz)",
  "set_outreach_snooze(uuid,timestamptz,text,timestamptz)",
  "suspend_outreach_membership(uuid,uuid,text,timestamptz)",
  "transfer_outreach_owner(uuid,uuid,text,timestamptz)",
  "update_own_onboarding_progress(uuid,uuid,jsonb,boolean)",
  "update_startup_records(uuid,text,text,text,text,text,text[],text[])",
  "upsert_outreach_contact_bundle(uuid,uuid,text,text,text,text,text,uuid,text,text,text,text,uuid,text,text[],jsonb)",
] as const;

const serviceRpcs = [
  "create_mentor_records(uuid,uuid,uuid,text,text,text,text[],boolean,text,text,text,text,text)",
  "set_semester_member_access(uuid,uuid,uuid,public.user_role,boolean,text,text)",
  "update_mentor_records(uuid,uuid,jsonb)",
] as const;

test("the final schema layer revokes Data API defaults before allowlisting access", () => {
  const sql = security();
  for (const owner of ["postgres", "supabase_admin"]) {
    // PostgreSQL's built-in function default grants EXECUTE to PUBLIC globally;
    // a schema-local revoke cannot override that global default.
    assert.match(sql, new RegExp(`alter default privileges for role ${owner} revoke all on functions from public, anon, authenticated, service_role;`, "u"));
    for (const schema of ["public", "private"]) {
      for (const objectType of ["tables", "sequences", "functions"]) {
        assert.match(sql, new RegExp(`alter default privileges for role ${owner} in schema ${schema} revoke all on ${objectType} from public, anon, authenticated, service_role;`, "u"));
      }
    }
  }
  assert.match(sql, /revoke all privileges on all tables in schema public from public, anon, authenticated, service_role;/u);
  assert.match(sql, /revoke all privileges on all sequences in schema public from public, anon, authenticated, service_role;/u);
  assert.match(sql, /revoke all privileges on all functions in schema public from public, anon, authenticated, service_role;/u);
  assert.match(sql, /revoke all privileges on all tables in schema private from public, anon, authenticated, service_role;/u);
  assert.match(sql, /revoke all privileges on all sequences in schema private from public, anon, authenticated, service_role;/u);
  assert.match(sql, /revoke all privileges on all functions in schema private from public, anon, authenticated, service_role;/u);
});

test("anonymous users receive no public table or function grants", () => {
  const sql = security();
  assert.doesNotMatch(sql, /grant [^;]+ to (?:public|anon)(?:\s*;|,)/u);
});

test("public security-definer RPC execution is explicitly allowlisted by caller class", () => {
  const sql = security();
  for (const signature of authenticatedRpcs) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} to authenticated;`, "u"), signature);
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} to service_role;`, "u"), signature);
  }
  for (const signature of serviceRpcs) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} to service_role;`, "u"), signature);
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")} to authenticated;`, "u"), signature);
  }
});

test("policy and trigger helpers live outside the exposed public schema", () => {
  const sql = security();
  const schema = declarativeSchema();
  for (const helper of [
    "is_super_admin",
    "has_semester_role",
    "can_read_outreach_relationship_labels",
    "has_outreach_contact_access",
    "has_outreach_company_access",
    "handle_new_user",
    "validate_outreach_owner_membership",
    "prevent_outreach_activity_mutation",
  ]) {
    assert.match(schema, new RegExp(`(?:function|procedure) private\\.${helper}\\b`, "u"), helper);
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${helper}\\b`, "u"), helper);
  }
  assert.match(sql, /revoke all on schema private from public, anon, authenticated, service_role;/u);
  assert.match(sql, /grant usage on schema private to authenticated;/u);
});

test("every declared security-definer function has an empty fixed search path", () => {
  const schema = declarativeSchema();
  const declarations = [...schema.matchAll(/create or replace function\s+(?:public|private)\.[a-z0-9_]+[\s\S]*?\$\$;/gu)]
    .map((match) => match[0])
    .filter((declaration) => declaration.includes("security definer"));
  assert.ok(declarations.length > 0, "security-definer functions must be audited");
  for (const declaration of declarations) {
    const name = declaration.match(/function\s+((?:public|private)\.[a-z0-9_]+)/u)?.[1] ?? "unknown";
    assert.match(declaration, /set search_path\s*=\s*''/u, `${name} must use an empty search path`);
  }
});

test("public authorization probes are bound to the authenticated identity", () => {
  const schema = declarativeSchema();
  for (const name of ["can_manage_semester", "can_manage_any_outreach"]) {
    const start = schema.indexOf(`function public.${name}`);
    assert.notEqual(start, -1, `${name} must remain available to the authenticated application`);
    const declaration = schema.slice(start, schema.indexOf("$$;", start));
    assert.match(declaration, /candidate_id is not distinct from auth\.uid\(\)/u, `${name} must not probe another identity`);
  }
});

test("authenticated table privileges are operation-specific", () => {
  const sql = security();
  assert.doesNotMatch(sql, /grant (?:all|insert|update) on (?:table )?public\.[^;(]+ to authenticated;/u);
  assert.match(sql, /grant select on table public\.semesters,[^;]+public\.sessions,[^;]+public\.outreach_imports to authenticated;/u);
  assert.match(sql, /grant delete on table public\.meeting_availability to authenticated;/u);
});

function grantedColumns(sql: string, operation: "insert" | "update", table: string, role: "authenticated" | "service_role") {
  const match = sql.match(new RegExp(`grant ${operation} \\(([^)]+)\\) on table public\\.${table} to ${role};`, "u"));
  assert.ok(match, `${role} needs an explicit ${operation} column grant on ${table}`);
  return match[1].split(",").map((column) => column.trim()).sort();
}

test("authenticated writes cannot mutate identity, ownership, or scheduling keys beyond client intent", () => {
  const sql = security();
  assert.deepEqual(grantedColumns(sql, "update", "profiles", "authenticated"), ["full_name"]);
  assert.deepEqual(grantedColumns(sql, "update", "startup_semesters", "authenticated"), [
    "goals", "mentor_need_context", "mentor_need_no_preference", "mentorship_needs", "preferred_expertise_tags",
  ]);
  assert.deepEqual(grantedColumns(sql, "update", "sessions", "authenticated"), ["status"]);
  assert.doesNotMatch(sql, /grant update \([^)]*\) on table public\.semester_memberships to authenticated;/u);
  assert.doesNotMatch(sql, /grant update \([^)]*(?:email|is_active|profile_id|semester_id|mentor_semester_id|startup_semester_id)[^)]*\) on table public\.(?:profiles|semester_memberships|startup_semesters|sessions) to authenticated;/u);
});

test("authenticated inserts are constrained to the fields each direct workflow submits", () => {
  const sql = security();
  assert.doesNotMatch(sql, /grant insert \([^)]*\) on table public\.meetings to authenticated;/u);
  assert.deepEqual(grantedColumns(sql, "insert", "sessions", "authenticated"), [
    "format", "meeting_id", "mentor_semester_id", "semester_id", "slot", "startup_semester_id", "status", "topic",
  ]);
  assert.deepEqual(grantedColumns(sql, "insert", "meeting_availability", "authenticated"), [
    "is_available", "meeting_id", "semester_id", "semester_membership_id", "slot", "source",
  ]);
  assert.deepEqual(grantedColumns(sql, "insert", "outreach_imports", "authenticated"), [
    "created_by", "idempotency_key", "result", "rows", "semester_id", "source_name", "status",
  ]);
  assert.doesNotMatch(sql, /grant insert \([^)]*\) on table public\.outreach_(?:contacts|companies|contact_companies|opportunities) to authenticated;/u);
});

test("service-role direct writes are column-scoped and cannot rewrite record identities", () => {
  const sql = security();
  assert.doesNotMatch(sql, /grant (?:insert|update) on (?:table )?public\.[^;(]+ to service_role;/u);
  assert.deepEqual(grantedColumns(sql, "update", "semester_memberships", "service_role"), ["status"]);
  assert.doesNotMatch(sql, /grant update \([^)]*\) on table public\.startup_team_memberships to service_role;/u);
  assert.deepEqual(grantedColumns(sql, "update", "sessions", "service_role"), [
    "format", "mentor_semester_id", "slot", "startup_absent", "startup_semester_id", "status", "substitute_name", "topic",
  ]);
  assert.deepEqual(grantedColumns(sql, "insert", "startup_organizations", "service_role"), ["description", "industry", "name", "slug"]);
  assert.deepEqual(grantedColumns(sql, "insert", "meetings", "service_role"), ["label", "meeting_date", "semester_id"]);
  assert.deepEqual(grantedColumns(sql, "update", "profiles", "service_role"), ["status"]);
});
