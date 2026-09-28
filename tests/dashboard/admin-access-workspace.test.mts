import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../src/db/types.ts";

type AccessModule = typeof import("../../src/dashboard/admin-access.ts");

const accessModule = await import("../../src/dashboard/admin-access.ts").catch(() => null) as AccessModule | null;

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve };
}

async function flush() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function accessClient(urls: URL[]) {
  return createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        urls.push(url);
        if (url.pathname.endsWith("/semesters")) {
          return json([
            { id: "current-semester", name: "Fall 2026", start_date: "2026-09-01", is_active: true },
            { id: "prior-semester", name: "Spring 2026", start_date: "2026-01-01", is_active: false },
          ]);
        }
        if (url.pathname.endsWith("/profiles") && url.searchParams.get("status") === "eq.pending") {
          return json([{ id: "pending-profile", email: "pending@example.test", full_name: "Pending Person", created_at: "2026-09-18T12:00:00Z" }]);
        }
        if (url.pathname.endsWith("/semester_memberships")) {
          return json([
            { id: "current-membership", semester_id: "current-semester", profile_id: "current-profile", role: "mentor", status: "onboarding" },
            { id: "prior-membership", semester_id: "prior-semester", profile_id: "prior-profile", role: "startup", status: "active" },
          ]);
        }
        if (url.pathname.endsWith("/profiles")) {
          return json([
            { id: "current-profile", full_name: "Ready Mentor", email: "ready@example.test" },
            { id: "prior-profile", full_name: "Prior Startup", email: "prior@example.test" },
          ]);
        }
        if (url.pathname.endsWith("/mentor_semesters")) {
          return json([{ semester_membership_id: "current-membership", readiness_status: "ready" }]);
        }
        if (url.pathname.endsWith("/startup_team_memberships")) {
          return json([{
            semester_membership_id: "prior-membership",
            semester_id: "prior-semester",
            startup_semester: { semester_id: "prior-semester", readiness_status: "ready" },
          }]);
        }
        throw new Error(`Unexpected request: ${url.pathname}`);
      },
    },
  });
}

test("Access workspace uses a fixed six-read budget and loads selected plus current cohorts together", async () => {
  assert.ok(accessModule, "the dedicated Access workspace loader must exist");
  const urls: URL[] = [];
  const result = await accessModule.loadAdminAccessWorkspace(
    accessClient(urls),
    { scope: "semester", semesterId: "prior-semester" },
  );

  assert.equal(urls.length, 6);
  assert.deepEqual(result.pendingUsers.map((profile) => profile.id), ["pending-profile"]);
  assert.equal(result.pendingUsers[0]?.requested_role, null);
  assert.deepEqual(result.members.map((member) => member.membershipId), ["prior-membership"]);
  assert.deepEqual(result.currentMembers.map((member) => member.membershipId), ["current-membership"]);
  assert.equal(result.semesterId, "prior-semester");
  assert.equal(result.scope, "semester");

  const membershipRequest = urls.find((url) => url.pathname.endsWith("/semester_memberships"));
  assert.ok(membershipRequest);
  assert.match(membershipRequest.searchParams.get("semester_id") ?? "", /current-semester/u);
  assert.match(membershipRequest.searchParams.get("semester_id") ?? "", /prior-semester/u);
});

test("pending registration preferences are sanitized and Auth lookup failures do not hide profiles", async () => {
  assert.ok(accessModule, "the dedicated Access workspace loader must exist");
  let active = 0;
  let peak = 0;
  const preferences = await accessModule.loadPendingRegistrationPreferences(
    [
      { id: "mentor-profile", auth_user_id: "mentor-auth" },
      { id: "startup-profile", auth_user_id: "startup-auth" },
      { id: "admin-profile", auth_user_id: "admin-auth" },
      { id: "missing-profile", auth_user_id: null },
      { id: "failed-profile", auth_user_id: "failed-auth" },
      { id: "extra-profile", auth_user_id: "extra-auth" },
    ],
    {
      getUserById: async (userId) => {
        active += 1;
        peak = Math.max(peak, active);
        await flush();
        active -= 1;
        if (userId === "failed-auth") throw new Error("Auth unavailable");
        const requestedRole = userId === "mentor-auth" ? "mentor"
          : userId === "startup-auth" ? "startup"
          : userId === "admin-auth" ? "admin"
          : "mentor";
        return { data: { user: { user_metadata: { requested_role: requestedRole, private_note: "never return" } } }, error: null };
      },
    },
  );

  assert.ok(peak <= 4, `expected at most four concurrent Auth reads, observed ${peak}`);
  assert.deepEqual(preferences, new Map([
    ["mentor-profile", "mentor"],
    ["startup-profile", "startup"],
    ["admin-profile", null],
    ["missing-profile", null],
    ["failed-profile", null],
    ["extra-profile", "mentor"],
  ]));
});

test("Access workspace overlaps independent reads at both data stages", async () => {
  assert.ok(accessModule, "the dedicated Access workspace loader must exist");
  const semesters = deferredResponse();
  const pending = deferredResponse();
  const memberships = deferredResponse();
  const profiles = deferredResponse();
  const mentors = deferredResponse();
  const startups = deferredResponse();
  const started: string[] = [];
  const client = createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/semesters")) { started.push("semesters"); return await semesters.promise; }
      if (url.pathname.endsWith("/profiles") && url.searchParams.get("status") === "eq.pending") { started.push("pending"); return await pending.promise; }
      if (url.pathname.endsWith("/semester_memberships")) { started.push("memberships"); return await memberships.promise; }
      if (url.pathname.endsWith("/profiles")) { started.push("profiles"); return await profiles.promise; }
      if (url.pathname.endsWith("/mentor_semesters")) { started.push("mentors"); return await mentors.promise; }
      if (url.pathname.endsWith("/startup_team_memberships")) { started.push("startups"); return await startups.promise; }
      throw new Error(`Unexpected request: ${url.pathname}`);
    } },
  });

  const loading = accessModule.loadAdminAccessWorkspace(client, { scope: "semester", semesterId: null });
  await flush();
  assert.deepEqual(started, ["semesters", "pending"]);
  pending.resolve(json([]));
  await flush();
  assert.deepEqual(started, ["semesters", "pending"]);
  semesters.resolve(json([{ id: "current", name: "Fall", start_date: "2026-09-01", is_active: true }]));
  await flush();
  assert.deepEqual(started, ["semesters", "pending", "memberships"]);
  memberships.resolve(json([{ id: "membership", semester_id: "current", profile_id: "profile", role: "mentor", status: "active" }]));
  await flush();
  assert.deepEqual(started.slice(0, 3), ["semesters", "pending", "memberships"]);
  assert.deepEqual(new Set(started.slice(3)), new Set(["profiles", "mentors", "startups"]));
  profiles.resolve(json([{ id: "profile", full_name: "Mentor", email: "mentor@example.test" }]));
  mentors.resolve(json([]));
  startups.resolve(json([]));
  await loading;
});

test("Access workspace defaults to the active cohort and reports a missing active cohort instead of false empty data", async () => {
  assert.ok(accessModule, "the dedicated Access workspace loader must exist");
  const urls: URL[] = [];
  const current = await accessModule.loadAdminAccessWorkspace(accessClient(urls), { scope: "semester", semesterId: null });
  assert.equal(current.semesterId, "current-semester");
  assert.deepEqual(current.members.map((member) => member.membershipId), ["current-membership"]);

  const client = createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: async (input) => String(input).includes("/semesters?") ? json([]) : json([]) },
  });
  await assert.rejects(
    accessModule.loadAdminAccessWorkspace(client, { scope: "semester", semesterId: null }),
    /No active cohort is configured/u,
  );
});

test("Access workspace surfaces authorization/read failures instead of returning empty queues", async () => {
  assert.ok(accessModule, "the dedicated Access workspace loader must exist");
  const client = createClient<Database>("https://example.supabase.co", "test-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: async (input) => String(input).includes("/profiles?")
        ? json({ message: "permission denied" }, 403)
        : json([{ id: "current-semester", name: "Fall", start_date: "2026-09-01", is_active: true }]),
    },
  });
  await assert.rejects(
    accessModule.loadAdminAccessWorkspace(client, { scope: "semester", semesterId: null }),
    /permission denied/u,
  );
});

test("Access handler authorizes before loading and marks private data uncached", async () => {
  assert.ok(accessModule, "the dedicated Access workspace handler must exist");
  const calls: string[] = [];
  const handlers = accessModule.createAdminAccessHandlers(async () => {
    calls.push("authorize");
    return {
      load: async (query) => {
        calls.push(`load:${query.scope}:${query.semesterId ?? "active"}`);
        return {
          cohorts: { current: { id: "current", name: "Fall", startsOn: "2026-09-01", isActive: true }, previous: null, all: [] },
          currentMembers: [], members: [], pendingUsers: [], scope: "semester" as const, semesterId: "current",
        };
      },
    };
  });
  const response = await handlers.GET(new Request("https://almaworks.test/api/admin/access"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(calls, ["authorize", "load:semester:active"]);
});

test("Access handler rejects malformed scope before authorization", async () => {
  assert.ok(accessModule, "the dedicated Access workspace handler must exist");
  const handlers = accessModule.createAdminAccessHandlers(async () => {
    throw new Error("authorization should not run");
  });
  const response = await handlers.GET(new Request("https://almaworks.test/api/admin/access?scope=unknown"));
  assert.equal(response.status, 400);
});

test("Access handler denies an inactive Super Admin before loading workspace data", async () => {
  assert.ok(accessModule, "the dedicated Access workspace handler must exist");
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const oldServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://layjdjfvxkowxidwuvbs.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  const urls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    urls.push(url);
    if (url.pathname === "/auth/v1/user") return json({ id: "auth-user", aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/platform_roles") return json({ role: "super_admin" });
    if (url.pathname === "/rest/v1/profiles" && (url.searchParams.get("select") ?? "").includes("status")) {
      return json({ status: "approved", is_active: false });
    }
    if (url.pathname === "/rest/v1/profiles") return json({ id: "profile-id" });
    throw new Error(`Workspace data must not load: ${url.pathname}`);
  };
  try {
    const response = await accessModule.createAdminAccessHandlers().GET(new Request(
      "https://almaworks.test/api/admin/access",
      { headers: { authorization: "Bearer test-token" } },
    ));
    assert.equal(response.status, 403);
    assert.equal(urls.some((url) => url.pathname === "/rest/v1/semesters"), false);
    assert.equal(urls.some((url) => url.pathname.includes("/auth/v1/admin/users/")), false);
    assert.equal(urls.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
    if (oldServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldServiceKey;
  }
});

test("Access handler denies an active regular admin before loading workspace data", async () => {
  assert.ok(accessModule, "the dedicated Access workspace handler must exist");
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const oldServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://layjdjfvxkowxidwuvbs.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  const urls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    urls.push(url);
    if (url.pathname === "/auth/v1/user") return json({ id: "auth-user", aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/rest/v1/platform_roles") return json(null);
    if (url.pathname === "/rest/v1/profiles" && (url.searchParams.get("select") ?? "").includes("status")) return json({ status: "approved", is_active: true });
    if (url.pathname === "/rest/v1/profiles") return json({ id: "profile-id" });
    throw new Error(`Workspace data must not load: ${url.pathname}`);
  };
  try {
    const response = await accessModule.createAdminAccessHandlers().GET(new Request(
      "https://almaworks.test/api/admin/access",
      { headers: { authorization: "Bearer test-token" } },
    ));
    assert.equal(response.status, 403);
    assert.equal(urls.some((url) => url.pathname === "/rest/v1/semesters"), false);
    assert.equal(urls.some((url) => url.pathname.includes("/auth/v1/admin/users/")), false);
    assert.equal(urls.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
    if (oldServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldServiceKey;
  }
});

test("Access handler overlaps durable-role and active-profile gates before workspace reads", async () => {
  assert.ok(accessModule, "the dedicated Access workspace handler must exist");
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const oldServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://layjdjfvxkowxidwuvbs.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  const role = deferredResponse();
  const status = deferredResponse();
  const started: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    if (url.pathname === "/auth/v1/user") { started.push("user"); return json({ id: "auth-user", aud: "authenticated", role: "authenticated" }); }
    if (url.pathname === "/rest/v1/platform_roles") { started.push("role"); return await role.promise; }
    if (url.pathname === "/rest/v1/profiles" && (url.searchParams.get("select") ?? "").includes("status")) { started.push("status"); return await status.promise; }
    if (url.pathname === "/rest/v1/profiles" && (url.searchParams.get("select") ?? "") === "id") { started.push("identity"); return json({ id: "profile-id" }); }
    if (url.pathname === "/rest/v1/semesters") { started.push("semesters"); return json([{ id: "current", name: "Fall", start_date: "2026-09-01", is_active: true }]); }
    if (url.pathname === "/rest/v1/profiles" && url.searchParams.get("status") === "eq.pending") { started.push("pending"); return json([]); }
    if (url.pathname === "/rest/v1/semester_memberships") { started.push("memberships"); return json([{ id: "membership", semester_id: "current", profile_id: "member", role: "mentor", status: "active" }]); }
    if (url.pathname === "/rest/v1/profiles") { started.push("member-profiles"); return json([{ id: "member", full_name: "Mentor", email: "mentor@example.test" }]); }
    if (url.pathname === "/rest/v1/mentor_semesters") { started.push("mentors"); return json([]); }
    if (url.pathname === "/rest/v1/startup_team_memberships") { started.push("startups"); return json([]); }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  try {
    const responsePromise = accessModule.createAdminAccessHandlers().GET(new Request(
      "https://almaworks.test/api/admin/access",
      { headers: { authorization: "Bearer test-token" } },
    ));
    await flush();
    assert.deepEqual(started.slice(0, 2), ["user", "identity"]);
    assert.deepEqual(new Set(started.slice(2)), new Set(["role", "status"]));
    assert.equal(started.includes("semesters"), false);
    status.resolve(json({ status: "approved", is_active: true }));
    await flush();
    assert.equal(started.includes("semesters"), false);
    role.resolve(json({ role: "super_admin" }));
    const response = await responsePromise;
    assert.equal(response.status, 200);
    assert.equal(started.length, 10);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
    if (oldServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldServiceKey;
  }
});
