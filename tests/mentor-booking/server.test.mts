import assert from "node:assert/strict";
import test from "node:test";

import { acceptedOccupancyForWorkspace, createMentorBookingHandlers, MentorBookingHttpError, mentorBookingDatabaseError, mentorWeeklyAvailabilityForWorkspace, startupNeedsForWorkspace, toWeeklyAvailabilityRpcPayload, type MentorBookingStore } from "../../src/mentor-booking/server.ts";
import type { MentorBookingModelInput } from "../../src/mentor-booking/model.ts";

const semesterId = "11111111-1111-4111-8111-111111111111";
const requestId = "33333333-3333-4333-8333-333333333333";
const model: MentorBookingModelInput = {
  semesterId, semesterStartDate: "2026-09-01", semesterEndDate: "2026-12-20", timeZone: "UTC",
  viewer: { profileId: "p1", role: "mentor", mentorSemesterId: "m1", startupSemesterId: null },
  acceptedOccupancy: [], claims: [], windows: [], requests: [],
};

function post(body: unknown): Request {
  return new Request("http://localhost/api/mentor-booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function store(overrides: Partial<MentorBookingStore> = {}): MentorBookingStore {
  return {
    load: async () => model,
    execute: async () => undefined,
    ...overrides,
  };
}

test("GET returns a private uncached workspace after semester authorization", async () => {
  const calls: unknown[] = [];
  const handlers = createMentorBookingHandlers(async (_request, selectedSemester) => {
    calls.push(selectedSemester);
    return store({ load: async (id) => { calls.push(id); return model; } });
  });
  const response = await handlers.GET(new Request(`http://localhost/api/mentor-booking?semesterId=${semesterId}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(calls, [semesterId, semesterId]);
});

test("POST executes exactly one typed command then returns the refreshed workspace", async () => {
  const calls: unknown[] = [];
  const handlers = createMentorBookingHandlers(async () => store({
    execute: async (command) => { calls.push(command); },
    load: async (id) => { calls.push(["load", id]); return model; },
  }));
  const response = await handlers.POST(post({ action: "accept_request", semesterId, requestId }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ action: "accept_request", semesterId, requestId }, ["load", semesterId]]);
  assert.deepEqual(await response.json(), { workspace: {
    acceptedOccupancy: [], availability: [], semesterId, semesterStartDate: "2026-09-01", semesterEndDate: "2026-12-20", timeZone: "UTC", viewer: model.viewer, windows: [], history: [],
  } });
});

test("POST dispatches a startup-selected appointment without a synthetic availability window", async () => {
  const calls: unknown[] = [];
  const handlers = createMentorBookingHandlers(async () => store({
    execute: async (command) => { calls.push(command); },
  }));
  const response = await handlers.POST(post({
    action: "request_booking",
    semesterId,
    mentorSemesterId: "22222222-2222-4222-8222-222222222223",
    startsAt: "2099-01-05T14:00:00Z",
    endsAt: "2099-01-05T14:15:00Z",
    topic: "Pricing strategy",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{
    action: "request_booking",
    semesterId,
    mentorSemesterId: "22222222-2222-4222-8222-222222222223",
    startsAt: "2099-01-05T14:00:00.000Z",
    endsAt: "2099-01-05T14:15:00.000Z",
    topic: "Pricing strategy",
  }]);
});

test("POST rejects availability overlapping the Friday 3–5 PM program block in the configured semester timezone", async () => {
  const calls: unknown[] = [];
  const handlers = createMentorBookingHandlers(async () => store({
    execute: async (command) => { calls.push(command); },
    load: async () => ({ ...model, timeZone: "America/New_York" }),
  }));

  const response = await handlers.POST(post({
    action: "publish_window",
    semesterId,
    startsAt: "2099-02-06T20:00:00Z",
    endsAt: "2099-02-06T20:15:00Z",
  }));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test("POST allows Friday availability outside the Friday Program block in the configured semester timezone", async () => {
  const calls: unknown[] = [];
  const handlers = createMentorBookingHandlers(async () => store({
    execute: async (command) => { calls.push(command); },
    load: async () => ({ ...model, timeZone: "America/New_York" }),
  }));

  const response = await handlers.POST(post({
    action: "publish_window",
    semesterId,
    startsAt: "2099-02-06T18:00:00Z",
    endsAt: "2099-02-06T18:15:00Z",
  }));

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
});

test("invalid bodies are rejected before authorization", async () => {
  const handlers = createMentorBookingHandlers(async () => { throw new Error("authorization must not run"); });
  assert.equal((await handlers.POST(new Request("http://localhost", { method: "POST", body: "{" }))).status, 400);
  assert.equal((await handlers.POST(post({ action: "withdraw_window", semesterId, windowId: "bad" }))).status, 400);
});

test("authorization, conflict, and unavailable-schema errors keep actionable statuses", async () => {
  for (const status of [401, 403, 404, 409, 503]) {
    const handlers = createMentorBookingHandlers(async () => { throw new MentorBookingHttpError(status, "Booking unavailable"); });
    const response = await handlers.GET(new Request(`http://localhost/?semesterId=${semesterId}`));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: "Booking unavailable" });
  }
});

test("PostgREST relationship-cache failures are reported as temporary booking setup errors", () => {
  assert.throws(
    () => mentorBookingDatabaseError({ code: "PGRST200", message: "relationship missing" }),
    (error) => {
      assert.ok(error instanceof MentorBookingHttpError);
      assert.equal(error.status, 503);
      assert.match(error.message, /finish its setup/u);
      return true;
    },
  );
});

test("weekly availability RPC payload uses the database's snake_case time fields", () => {
  assert.deepEqual(toWeeklyAvailabilityRpcPayload([{ weekday: 1, startsAt: "09:00", endsAt: "10:15" }]), [
    { weekday: 1, starts_at: "09:00", ends_at: "10:15" },
  ]);
});

test("normalizes PostgREST array relations when loading weekly availability", () => {
  assert.deepEqual(mentorWeeklyAvailabilityForWorkspace({
    semester_id: semesterId,
    mentor_semester_id: "m1",
    weekday: 1,
    starts_at: "08:00:00",
    ends_at: "21:00:00",
    mentor_semesters: [{ semester_memberships: [{ profile_id: "p1", profiles: [{ full_name: "Layth Rahman" }] }] }],
  }), {
    semesterId,
    mentorSemesterId: "m1",
    weekday: 1,
    startsAt: "08:00:00",
    endsAt: "21:00:00",
    mentorProfileId: "p1",
    mentorName: "Layth Rahman",
  });
});

test("includes a mentor's expertise tags with weekly availability for startup fit ranking", () => {
  assert.deepEqual(mentorWeeklyAvailabilityForWorkspace({
    semester_id: semesterId,
    mentor_semester_id: "m1",
    weekday: 1,
    starts_at: "08:00:00",
    ends_at: "09:00:00",
    mentor_semesters: [{ semester_memberships: [{ profile_id: "p1", profiles: [{ full_name: "Layth Rahman" }], mentor_profiles: [{ expertise_tags: ["Fundraising", "Sales"] }] }] }],
  }), {
    semesterId,
    mentorSemesterId: "m1",
    weekday: 1,
    startsAt: "08:00:00",
    endsAt: "09:00:00",
    mentorProfileId: "p1",
    mentorName: "Layth Rahman",
    mentorExpertiseTags: ["Fundraising", "Sales"],
  });
});

test("normalizes saved startup mentorship needs for booking fit ranking", () => {
  assert.deepEqual(startupNeedsForWorkspace(["Fundraising", " Sales ", 7, ""]), ["Fundraising", "Sales"]);
});

test("maps accepted occupancy without request or startup details", () => {
  const occupancy = acceptedOccupancyForWorkspace({
    semester_id: semesterId,
    mentor_semester_id: "m1",
    starts_at: "2099-01-01T15:00:00Z",
    ends_at: "2099-01-01T15:15:00Z",
  });

  assert.deepEqual(occupancy, { semesterId, mentorSemesterId: "m1", startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:15:00Z" });
});

test("unexpected database detail is not exposed", async () => {
  const handlers = createMentorBookingHandlers(async () => store({ load: async () => { throw new Error("secret detail"); } }));
  const response = await handlers.GET(new Request(`http://localhost/?semesterId=${semesterId}`));
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /secret detail/u);
});
