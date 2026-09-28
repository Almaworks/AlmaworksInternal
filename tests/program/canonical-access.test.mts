import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

import {
  loadCanonicalAccess,
  requireActiveSemesterAdmin,
  requireSemesterAdmin,
} from "../../src/program/canonical-access.ts";

type CapturedRequest = { body: string | null; url: URL };

function recordingClient(responses: readonly unknown[] | Record<string, unknown>) {
  const requests: CapturedRequest[] = [];
  let index = 0;
  const client = createClient("https://example.supabase.co", "test-key", {
    global: {
      fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
        requests.push({ body: typeof init?.body === "string" ? init.body : null, url });
        const response = Array.isArray(responses)
          ? responses[index++]
          : (responses as Record<string, unknown>)[url.pathname];
        return new Response(JSON.stringify(response ?? []), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
  });
  return { client, requests };
}

test("role-aware access derives global admin from platform roles and cohort role from active membership", async () => {
  const { client, requests } = recordingClient({
    "/rest/v1/profiles": { id: "profile-1", email: "admin@example.com", full_name: "Admin", is_active: true, status: "approved" },
    "/rest/v1/platform_roles": [{ role: "super_admin" }],
    "/rest/v1/semester_memberships": [{ role: "mentor", status: "active", semester_id: "semester-1", semester: { is_active: true, name: "Fall 2026" } }],
  });

  const access = await loadCanonicalAccess(client, "auth-user-9");

  assert.equal(access?.profileId, "profile-1");
  assert.equal(access?.role, "admin");
  assert.equal(access?.membershipRole, "mentor");
  assert.equal(access?.semesterId, "semester-1");
  assert.equal(requests[0].url.pathname, "/rest/v1/profiles");
  assert.equal(requests[0].url.searchParams.get("select"), "id,email,full_name,is_active,status");
  assert.equal(requests[0].url.searchParams.get("auth_user_id"), "eq.auth-user-9");
  // Independent reads can arrive in either order; respond by relation, as the
  // actual API does, so concurrency cannot swap authority and membership rows.
  assert.equal(requests.length, 3);
  const platform = requests.find((request) => request.url.pathname === "/rest/v1/platform_roles");
  const memberships = requests.find((request) => request.url.pathname === "/rest/v1/semester_memberships");
  assert.equal(platform?.url.searchParams.get("profile_id"), "eq.profile-1");
  assert.equal(platform?.url.searchParams.get("role"), "eq.super_admin");
  assert.equal(memberships?.url.searchParams.get("profile_id"), "eq.profile-1");
  assert.equal(memberships?.url.searchParams.get("semester.order"), "is_active.desc");
});

test("selected-semester authorization checks the requested cohort instead of substituting the active cohort", async () => {
  const { client, requests } = recordingClient([true]);

  const semesterId = await requireSemesterAdmin(client, "profile-1", "semester-prior");

  assert.equal(semesterId, "semester-prior");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, "/rest/v1/rpc/can_manage_semester");
  assert.deepEqual(JSON.parse(requests[0].body ?? "null"), {
    candidate_id: "profile-1",
    target_semester_id: "semester-prior",
  });
});

test("active-semester authorization verifies can_manage_semester for the authenticated profile", async () => {
  const { client, requests } = recordingClient([{ id: "semester-1" }, true]);

  const semesterId = await requireActiveSemesterAdmin(client, "profile-1");

  assert.equal(semesterId, "semester-1");
  assert.equal(requests[0].url.pathname, "/rest/v1/semesters");
  assert.equal(requests[0].url.searchParams.get("is_active"), "eq.true");
  assert.equal(requests[1].url.pathname, "/rest/v1/rpc/can_manage_semester");
  assert.deepEqual(JSON.parse(requests[1].body ?? "null"), {
    candidate_id: "profile-1",
    target_semester_id: "semester-1",
  });
});
