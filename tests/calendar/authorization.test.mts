import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/db/types.ts";
import { resolveCalendarParticipant } from "../../src/calendar/authorization.ts";

function source(options: { profileActive?: boolean; semesterActive?: boolean; role?: string; status?: string; roleRecord?: boolean } = {}) {
  const calls: string[] = [];
  const userClient = createClient<Database>("https://layjdjfvxkowxidwuvbs.supabase.co", "test-public", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer test-user-token" }, fetch: async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init);
      assert.equal(req.headers.get("Authorization"), "Bearer test-user-token");
      const url = new URL(req.url); calls.push(url.pathname + url.search);
      if (url.pathname.endsWith("/profiles")) return Response.json(options.profileActive === false ? { id: "profile", is_active: false, status: "approved" } : { id: "profile", is_active: true, status: "approved" });
      if (url.pathname.endsWith("/semesters")) return Response.json(options.semesterActive === false ? null : { id: "semester", is_active: true, start_date: "2026-09-01", end_date: "2026-12-20", configuration: { timezone: "America/New_York" } });
      if (url.pathname.endsWith("/semester_memberships")) return Response.json([{ id: "membership", role: options.role ?? "mentor", status: options.status ?? "onboarding" }]);
      if (url.pathname.endsWith("/mentor_semesters")) return Response.json(options.roleRecord === false ? null : { id: "mentor-term" });
      if (url.pathname.endsWith("/startup_team_memberships")) return Response.json(options.roleRecord === false ? null : { startup_semester_id: "startup-term" });
      throw new Error("Unexpected request");
    } },
  });
  return { profileId: "profile", userClient, calls };
}
test("onboarding mentors can prepare Calendar without active-only booking authorization", async () => {
  const context = source();
  const actor = await resolveCalendarParticipant(context, "semester");
  assert.equal(actor.role, "mentor");
  assert.equal(actor.membershipStatus, "onboarding");
  assert.equal(actor.mentorSemesterId, "mentor-term");
  assert.ok(context.calls.some(c => c.includes("profile_id=eq.profile")));
});
test("startup Calendar connections are bound to actual current team membership", async () => {
  const actor = await resolveCalendarParticipant(source({ role: "startup", status: "active" }), "semester");
  assert.equal(actor.startupSemesterId, "startup-term");
  assert.equal(actor.mentorSemesterId, null);
});
test("disabled accounts, closed semesters, admin-only or suspended membership and missing role records are denied", async () => {
  for (const option of [{ profileActive: false }, { semesterActive: false }, { role: "admin" }, { status: "suspended" }, { roleRecord: false }]) {
    await assert.rejects(resolveCalendarParticipant(source(option), "semester"), (error: unknown) => error instanceof Error && "status" in error && error.status === 403);
  }
});
