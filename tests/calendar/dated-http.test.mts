import assert from "node:assert/strict";
import test from "node:test";
import { handleDatedCalendarGet, handleDatedCalendarPost } from "../../src/calendar/dated-http.ts";

const semesterId = "00000000-0000-4000-8000-000000000001";
const mentorSemesterId = "00000000-0000-4000-8000-000000000002";
const from = "2026-10-15T12:00:00.000Z";
const until = "2026-11-15T12:00:00.000Z";
const mentor = { role: "mentor" as const, mentorSemesterId };

test("dated GET authorizes the actual mentor and returns the validated owner projection", async () => {
  const payload = {
    timeZone: "America/Chicago", programTimeZone: "America/New_York",
    semesterStart: "2026-09-01", semesterEnd: "2026-12-15", from, until,
    offered: [{ startsAt: from, endsAt: "2026-10-15T12:15:00.000Z" }], busy: [], bookings: [],
    syncUnavailable: false, mode: "weekly" as const, lastSuccessAt: null,
  };
  const request = new Request(`http://localhost/api/calendar/dated?semesterId=${semesterId}&from=${encodeURIComponent(from)}&until=${encodeURIComponent(until)}`);
  const response = await handleDatedCalendarGet(request, {
    enabled: true,
    authorize: async (_request, receivedSemesterId) => { assert.equal(receivedSemesterId, semesterId); return mentor; },
    rpc: async (name, args) => {
      assert.equal(name, "calendar_owner_dated_availability");
      assert.deepEqual(args, { p_semester_id: semesterId, p_mentor_semester_id: mentorSemesterId, p_from: from, p_until: until });
      return payload;
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payload);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("dated GET rejects malformed, excessive, reversed, and non-mentor ranges before RPC", async () => {
  const invalidUrls = [
    `http://localhost/api/calendar/dated?semesterId=bad&from=${from}&until=${until}`,
    `http://localhost/api/calendar/dated?semesterId=${semesterId}&from=nope&until=${until}`,
    `http://localhost/api/calendar/dated?semesterId=${semesterId}&from=${until}&until=${from}`,
    `http://localhost/api/calendar/dated?semesterId=${semesterId}&from=${from}&until=2027-02-15T12:00:00.000Z`,
  ];
  for (const url of invalidUrls) {
    const response = await handleDatedCalendarGet(new Request(url), { enabled: true, authorize: async () => mentor, rpc: async () => assert.fail("RPC reached") });
    assert.equal(response.status, 400);
  }
  const denied = await handleDatedCalendarGet(new Request(`http://localhost/api/calendar/dated?semesterId=${semesterId}&from=${from}&until=${until}`), {
    enabled: true, authorize: async () => ({ role: "startup", mentorSemesterId: null }), rpc: async () => assert.fail("RPC reached"),
  });
  assert.equal(denied.status, 403);
});

test("dated POST saves one atomic normalized batch for the actual mentor", async () => {
  const changes = [
    { startsAt: "2026-10-20T14:00:00.000Z", endsAt: "2026-10-20T14:15:00.000Z", available: true },
    { startsAt: "2026-10-20T14:00:00Z", endsAt: "2026-10-20T14:15:00Z", available: true },
    { startsAt: "2026-10-20T14:15:00.000Z", endsAt: "2026-10-20T14:30:00.000Z", available: false },
  ];
  const request = new Request("http://localhost/api/calendar/dated", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semesterId, mentorSemesterId: "victim", changes }) });
  const response = await handleDatedCalendarPost(request, {
    enabled: true, now: () => Date.parse("2026-10-14T12:01:00Z"), authorize: async () => mentor,
    rpc: async (name, args) => {
      assert.equal(name, "calendar_save_dated_availability");
      assert.deepEqual(args, { p_semester_id: semesterId, p_mentor_semester_id: mentorSemesterId, p_changes: [changes[0], changes[2]] });
      return true;
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { saved: true });
});

test("dated POST rejects invalid and contradictory batches before authorization or RPC", async () => {
  const valid = { startsAt: "2026-10-20T14:00:00.000Z", endsAt: "2026-10-20T14:15:00.000Z", available: true };
  const invalidBodies: unknown[] = [
    null, {}, { semesterId, changes: [] },
    { semesterId, changes: [{ ...valid, available: "true" }] },
    { semesterId, changes: [{ ...valid, startsAt: "2026-10-20T14:01:00.000Z" }] },
    { semesterId, changes: [{ ...valid, endsAt: "2026-10-20T14:30:00.000Z" }] },
    { semesterId, changes: [{ startsAt: "2027-01-12T12:00:00.000Z", endsAt: "2027-01-12T12:15:00.000Z", available: true }] },
    { semesterId, changes: [valid, { ...valid, available: false }] },
    { semesterId, changes: Array.from({ length: 513 }, (_, index) => ({ startsAt: new Date(Date.parse("2026-10-20T14:00:00Z") + index * 900_000).toISOString(), endsAt: new Date(Date.parse("2026-10-20T14:15:00Z") + index * 900_000).toISOString(), available: true })) },
  ];
  for (const body of invalidBodies) {
    const response = await handleDatedCalendarPost(new Request("http://localhost/api/calendar/dated", { method: "POST", body: JSON.stringify(body) }), {
      enabled: true, now: () => Date.parse("2026-10-14T12:01:00Z"), authorize: async () => assert.fail("authorization reached"), rpc: async () => assert.fail("RPC reached"),
    });
    assert.equal(response.status, 400);
  }
});

test("dated POST denies startup and admin actors and requires a true database acknowledgement", async () => {
  const body = { semesterId, changes: [{ startsAt: "2026-10-20T14:00:00.000Z", endsAt: "2026-10-20T14:15:00.000Z", available: true }] };
  for (const role of ["startup", "admin"] as const) {
    const response = await handleDatedCalendarPost(new Request("http://localhost/api/calendar/dated", { method: "POST", body: JSON.stringify(body) }), {
      enabled: true, now: () => Date.parse("2026-10-14T12:01:00Z"), authorize: async () => ({ role, mentorSemesterId: null }), rpc: async () => assert.fail("RPC reached"),
    });
    assert.equal(response.status, 403);
  }
  const conflict = await handleDatedCalendarPost(new Request("http://localhost/api/calendar/dated", { method: "POST", body: JSON.stringify(body) }), {
    enabled: true, now: () => Date.parse("2026-10-14T12:01:00Z"), authorize: async () => mentor, rpc: async () => false,
  });
  assert.equal(conflict.status, 409);
});
