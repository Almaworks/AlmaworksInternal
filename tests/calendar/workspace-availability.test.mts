import test from "node:test";
import assert from "node:assert/strict";
import { readWorkspaceCalendarAvailability } from "../../src/calendar/workspace-availability.ts";
import { ALMAWORKS_SUPABASE_URL } from "../../src/calendar/config.ts";
const input = { environment: { url: ALMAWORKS_SUPABASE_URL, anonKey: "public" }, token: "participant", semesterId: "semester", viewer: { role: "startup" as const, profileId: "startup", startupSemesterId: "team", mentorSemesterId: null }, timeZone: "America/New_York", semesterStartDate: "2026-09-01", weekOffset: 0, now: new Date("2026-09-21T12:00:00Z") };
const mentor = { id: "mentor", semester_memberships: { profile_id: "profile", role: "mentor", status: "active", profiles: { full_name: "Mentor", is_active: true, status: "approved" } } };
test("all roles receive the same effective slots, including mentors without weekly hours", async () => {
  for (const role of ["startup", "admin", "mentor"] as const) {
    const calls: string[] = [];
    const slots = await readWorkspaceCalendarAvailability({ ...input, viewer: { ...input.viewer, role, mentorSemesterId: role === "mentor" ? "mentor" : null }, fetch: async request => {
      const req = request as Request, url = new URL(req.url); calls.push(url.pathname);
      assert.equal(req.headers.get("Authorization"), "Bearer participant");
      if (url.pathname.endsWith("mentor_semesters")) {
        assert.equal(url.searchParams.get("semester_id"), "eq.semester");
        assert.equal(url.searchParams.get("id"), role === "mentor" ? "eq.mentor" : null);
        return Response.json([mentor]);
      }
      const body = await req.json(); assert.equal(body.p_mentor_semester_id, "mentor"); assert.equal(body.p_semester_id, "semester");
      if(Date.parse(body.p_from)>Date.parse("2026-09-21T14:00:00Z")||Date.parse(body.p_until)<Date.parse("2026-09-21T14:15:00Z"))return Response.json([]);
      return Response.json([{ starts_at: "2026-09-21T14:00:00Z", ends_at: "2026-09-21T14:15:00Z", private_event: "must not leak" }]);
    } });
    assert.equal(slots.length, 1); assert.equal(slots[0]?.mentor.name, "Mentor");
    assert.equal(JSON.stringify(slots).includes("private_event"), false); assert.ok(calls.length>2);
  }
});
test("failed or malformed projections never fall back to weekly hours", async () => {
  for (const response of [Response.json({}, { status: 503 }), Response.json([{ starts_at: "bad", ends_at: "bad" }])]) {
    await assert.rejects(readWorkspaceCalendarAvailability({ ...input, fetch: async request => new URL((request as Request).url).pathname.endsWith("mentor_semesters") ? Response.json([mentor]) : response }), /could not be loaded/);
  }
});
test("wrong project and invalid range stop before network access", async () => {
  const fetcher: typeof fetch = async () => { assert.fail("Unexpected network request"); };
  await assert.rejects(readWorkspaceCalendarAvailability({ ...input, weekOffset: 53, fetch: fetcher }));
  await assert.rejects(readWorkspaceCalendarAvailability({ ...input, environment: { ...input.environment, url: "https://other.supabase.co" }, fetch: fetcher }));
});
