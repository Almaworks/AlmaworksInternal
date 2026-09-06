import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = (await readFile(new URL("../supabase/schemas/canonical_schema.sql", import.meta.url), "utf8"))
  .replaceAll('"', "")
  .toLowerCase();
const security = (await readFile(new URL("../supabase/schemas/zz_security.sql", import.meta.url), "utf8"))
  .replaceAll('"', "")
  .toLowerCase();

function functionBody(name: string): string {
  const start = schema.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} must be declared`);
  const end = schema.indexOf("$$;", start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return schema.slice(start, end + 3);
}

test("only an active admin can be granted platform super-admin access", () => {
  const body = functionBody("set_platform_super_admin");

  assert.match(body, /from public\.semester_memberships/u);
  assert.match(body, /role = 'admin'/u);
  assert.match(body, /status = 'active'/u);
  assert.match(body, /join public\.semesters/u);
  assert.match(body, /is_active = true/u);
  assert.match(security, /grant execute on function public\.set_platform_super_admin\([^;]+ to authenticated/u);
});

test("super-admin changes protect self-revocation and the final super-admin", () => {
  const body = functionBody("set_platform_super_admin");

  assert.match(body, /p_profile_id = v_actor_profile_id/u);
  assert.match(body, /count\(\*\)[\s\S]*from public\.platform_roles/u);
  assert.match(body, /cannot revoke the final platform super-administrator/u);
  assert.match(body, /insert into public\.program_audit_events/u);
});

test("the members experience has a super-admin-only platform access control", async () => {
  const page = await readFile(new URL("../app/dashboard/admin/page.tsx", import.meta.url), "utf8");

  assert.match(page, /Platform access/u);
  assert.match(page, /\/api\/admin\/platform-access/u);
  assert.match(page, /You cannot change your own Super Admin access\./u);
});
