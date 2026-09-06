import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

test("post-login routing distinguishes a missing identity link from pending approval", async () => {
  const subject = await import("../../src/auth/profile-access.ts").catch(() => null);
  assert.ok(subject, "the authenticated profile access helper must exist");

  assert.equal(subject.resolvePostLoginDestination(null), "/?error=identity_link_missing");
  assert.equal(subject.resolvePostLoginDestination({
    is_active: true,
    role: null,
    status: "pending",
  }), "/pending");
});

test("post-login routing sends approved canonical roles to their dashboard", async () => {
  const subject = await import("../../src/auth/profile-access.ts").catch(() => null);
  assert.ok(subject, "the authenticated profile access helper must exist");

  assert.equal(subject.resolvePostLoginDestination({
    is_active: true,
    role: "admin",
    status: "approved",
  }), "/dashboard/admin");
  assert.equal(subject.resolvePostLoginDestination({
    is_active: true,
    role: "mentor",
    status: "approved",
  }), "/dashboard/mentor");
  assert.equal(subject.resolvePostLoginDestination({
    is_active: true,
    role: "startup",
    status: "approved",
  }), "/dashboard/startup");
});

test("post-login routing rejects inactive accounts before role routing", async () => {
  const subject = await import("../../src/auth/profile-access.ts").catch(() => null);
  assert.ok(subject, "the authenticated profile access helper must exist");

  assert.equal(subject.resolvePostLoginDestination({
    is_active: false,
    role: "admin",
    status: "approved",
  }), "/?error=account_inactive");
});

test("approved invited members receive their active-cohort role for onboarding routing", async () => {
  const subject = await import("../../src/program/canonical-access.ts");
  const client = createClient("https://example.supabase.co", "test-key", {
    global: {
      fetch: async (input) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
        if (url.pathname === "/rest/v1/profiles") {
          return Response.json({ id: "profile-1", email: "member@example.test", full_name: "Invited Member", is_active: true, status: "approved" });
        }
        if (url.pathname === "/rest/v1/platform_roles") return Response.json([]);
        if (url.pathname === "/rest/v1/semester_memberships") {
          return Response.json(url.searchParams.get("status") === "in.(invited,onboarding,active)"
            ? [{ role: "startup", status: "invited", semester_id: "fall-2026", semester: { name: "Fall 2026", is_active: true } }]
            : []);
        }
        return Response.json({ message: "unexpected request" }, { status: 404 });
      },
    },
  });

  const access = await subject.loadCanonicalAccess(client, "auth-user-1");

  assert.equal(access?.role, "startup");
});

test("the proxy renders root auth errors instead of redirecting them in a loop", async () => {
  const subject = await import("../../src/auth/profile-access.ts").catch(() => null);
  assert.ok(subject, "the authenticated profile access helper must exist");

  assert.equal(subject.shouldRenderAuthError("/", "identity_link_missing"), true);
  assert.equal(subject.shouldRenderAuthError("/", null), false);
  assert.equal(subject.shouldRenderAuthError("/dashboard", "identity_lookup_failed"), false);
});
