import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as adminRoute from "../../src/auth/admin-route.ts";
import * as profileAccess from "../../src/auth/profile-access.ts";
import * as authErrors from "../../src/auth/auth-errors.ts";
import * as onboarding from "../../src/auth/participant-onboarding-gate.ts";

type Result = { cookies: { getAll: () => { name: string; value: string }[]; set: (cookie: { name: string; value: string }) => void }; kind: "next" | "redirect"; url?: URL };
type RequestStub = { cookies: { set: () => void }; url: string; nextUrl: URL };

function harness(options: { role?: "mentor" | "startup" | "admin"; invalidClaims?: boolean; unavailable?: boolean; refresh?: boolean; inactive?: boolean } = {}) {
  const calls: string[] = [];
  function cookies() {
    const values: { name: string; value: string }[] = [];
    return { getAll: () => values, set: (cookie: { name: string; value: string } | string, value?: string) => {
      values.push(typeof cookie === 'string' ? { name: cookie, value: value ?? '' } : cookie);
    } };
  }
  const dependencies: Record<string, unknown> = {
    "@supabase/ssr": {
      createServerClient: (_url: string, _key: string, config: { cookies: { setAll: (cookies: { name: string; value: string; options: object }[]) => void } }) => {
        calls.push("client");
        return {
          auth: { getClaims: async () => {
            calls.push("claims");
            if (options.refresh) config.cookies.setAll([{ name: 'refreshed-session', value: 'fixture', options: {} }]);
            if (options.unavailable) return { data: null, error: { name: 'AuthRetryableFetchError' } };
            return options.invalidClaims
              ? { data: null, error: new Error("Invalid signature") }
              : { data: { claims: { sub: "verified-user" } }, error: null };
          } },
          from: (table: string) => {
            calls.push(table);
            const query = {
              select: () => query, eq: () => query, in: () => query, order: () => query,
              maybeSingle: async () => ({ data: table === "profiles" ? { status: "approved", is_active: !options.inactive } : null, error: null }),
            };
            return query;
          },
        };
      },
    },
    "next/server": { NextResponse: {
      next: (): Result => ({ kind: "next", cookies: cookies() }),
      redirect: (url: URL): Result => ({ kind: "redirect", url, cookies: cookies() }),
    } },
    "@/src/auth/admin-route": adminRoute,
    "@/src/auth/auth-errors": authErrors,
    "@/src/auth/profile-access": profileAccess,
    "@/src/auth/participant-onboarding-gate": onboarding,
    "@/src/program/canonical-access": { loadCanonicalAccess: async (_client: unknown, userId: string) => {
      assert.equal(userId, "verified-user");
      calls.push("access");
      return { profileId: "profile", role: options.role ?? "startup", status: "approved", is_active: !options.inactive };
    } },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const exports = {} as { proxy: (request: RequestStub) => Promise<Result> };
  new Function("require", "exports", compiled.outputText)((name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, exports);
  return {
    calls,
    run: (path: string) => {
      const nextUrl = new URL(path, "http://localhost:3000");
      return exports.proxy({ cookies: { set: () => {} }, url: nextUrl.toString(), nextUrl });
    },
  };
}

test("API handlers and public routes do not repeat cookie auth work", async () => {
  const app = harness();
  for (const path of ["/api/auth/capabilities", "/api/participant-dashboard", "/learn-more", "/privacy", "/terms", "/google9ced8612a8f8afd4.html", "/request-access", "/verify-email", "/forgot-password", "/auth/callback", "/?error=account_inactive"]) {
    assert.equal((await app.run(path)).kind, "next");
  }
  assert.deepEqual(app.calls, []);
});

test("invalid signed claims cannot reach protected lookup or render", async () => {
  const app = harness({ invalidClaims: true });
  const result = await app.run("/dashboard/admin/access");
  assert.equal(result.kind, "redirect");
  assert.equal(result.url?.pathname, "/");
  assert.deepEqual(app.calls, ["client", "claims"]);
});

test("startup directory navigation does not get mistaken for the mentor workspace", async () => {
  const app = harness({ role: "startup" });
  for (const path of ["/dashboard/mentors", "/dashboard/mentors/mentor-id"]) {
    assert.equal((await app.run(path)).kind, "next");
  }
  for (const path of ["/dashboard/mentor", "/dashboard/mentor/inbox"]) {
    assert.equal((await app.run(path)).url?.pathname, "/dashboard/startup");
  }
});

test("mentor identities remain excluded from the startup workspace", async () => {
  const app = harness({ role: "mentor" });
  assert.equal((await app.run("/dashboard/startup")).url?.pathname, "/dashboard/mentor");
});

test("legacy booking links reuse verified routing identity and preserve participant query context", async () => {
  for (const role of ["mentor", "startup"] as const) {
    const app = harness({ role });
    const result = await app.run("/dashboard/bookings?mentor=mentor-fixture");
    assert.equal(result.url?.pathname, `/dashboard/${role}`);
    assert.equal(result.url?.searchParams.get("tab"), "bookings");
    assert.equal(result.url?.searchParams.get("mentor"), "mentor-fixture");
    assert.deepEqual(app.calls, ["client", "claims", "access", "semester_memberships"]);
  }
  assert.equal((await harness({ role: "admin" }).run("/dashboard/bookings")).kind, "next");
});

test("admin requests still recheck account suspension on every navigation", async () => {
  const app = harness({ role: "admin", inactive: true });
  for (const path of ["/dashboard/admin/access", "/dashboard/admin/startups"]) {
    assert.equal((await app.run(path)).url?.searchParams.get("error"), "account_inactive");
  }
  assert.equal(app.calls.filter((call) => call === "profiles").length, 2);
  assert.ok(!app.calls.includes("access"));
});

 test("auth service failures explain the outage instead of silently restarting login", async () => {
  assert.equal((await harness({ unavailable: true }).run('/dashboard')).url?.searchParams.get('error'), 'auth_unavailable');
});
test("refreshed session cookies survive an authenticated redirect", async () => {
  const result = await harness({ refresh: true }).run('/');
  assert.equal(result.kind, 'redirect');
  assert.deepEqual(result.cookies.getAll(), [{ name: 'refreshed-session', value: 'fixture' }]);
});
