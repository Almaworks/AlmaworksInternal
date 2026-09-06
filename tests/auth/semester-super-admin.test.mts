import assert from "node:assert/strict";
import test from "node:test";
import * as access from "../../src/auth/admin-route.ts";
import * as server from "../../src/auth/server.ts";

test("Semesters rejects ordinary admins and failed lookups, allowing only approved Super Admins", () => {
  const base = { authenticated: true, profile: { role: "admin" as const, status: "approved" }, authority: { isSuperAdmin: false, hasActiveSemesterAdminMembership: true, lookupFailed: false } };
  assert.equal(access.resolveSuperAdminRouteAccess(base), "/dashboard/admin");
  assert.equal(access.resolveSuperAdminRouteAccess({ ...base, authority: { ...base.authority, isSuperAdmin: true } }), null);
  assert.equal(access.resolveSuperAdminRouteAccess({ ...base, authority: { ...base.authority, isSuperAdmin: true, lookupFailed: true } }), "/pending");
  assert.equal(access.resolveSuperAdminRouteAccess({ ...base, authenticated: false }), "/");
  assert.equal(access.resolveSuperAdminRouteAccess({ ...base, profile: { role: "admin", status: "pending" } }), "/pending");
});

test("API guard checks durable Super Admin grant and denies regular admins, missing auth, and lookup failures", async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://layjdjfvxkowxidwuvbs.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  let mode = "regular";
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    if (url.pathname === "/auth/v1/user") return Response.json({ id: "auth-user", aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/profiles") return Response.json([{ id: "durable-profile" }]);
    if (url.pathname === "/rest/v1/platform_roles") {
      assert.equal(url.searchParams.get("profile_id"), "eq.durable-profile");
      assert.equal(url.searchParams.get("role"), "eq.super_admin");
      if (mode === "failure") return Response.json({ message: "denied" }, { status: 403 });
      return Response.json(mode === "super" ? { role: "super_admin" } : null);
    }
    throw new Error("Unexpected request: " + url.pathname);
  };
  try {
    const request = new Request("https://almaworks.test", { headers: { authorization: "Bearer test-token" } });
    await assert.rejects(() => server.requireSuperAdminWithRls(request), { status: 403 });
    mode = "failure";
    await assert.rejects(() => server.requireSuperAdminWithRls(request), { status: 403 });
    mode = "super";
    assert.equal((await server.requireSuperAdminWithRls(request)).profileId, "durable-profile");
    await assert.rejects(() => server.requireSuperAdminWithRls(new Request("https://almaworks.test")), { status: 401 });
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
});

test("semester setup endpoints and server layout retain their Super Admin gates", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const route of ["route.ts", "activate/route.ts", "meetings/route.ts"]) {
    const code = await readFile(new URL("../../app/api/admin/lifecycle/semesters/" + route, import.meta.url), "utf8");
    assert.match(code, /await requireSuperAdminWithRls\(request\)/);
    assert.doesNotMatch(code, /requireSemesterAdmin|adminClient/);
  }
  const layout = await readFile(new URL("../../app/dashboard/admin/semesters/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /resolveSuperAdminRouteAccess/);
  assert.match(layout, /if \(destination\) redirect\(destination\)/);
  const navigation = await readFile(new URL("../../app/dashboard/layout.tsx", import.meta.url), "utf8");
  assert.match(navigation, /isSuperAdmin \? \[\{ href: '\/dashboard\/admin\/semesters'/);
});
