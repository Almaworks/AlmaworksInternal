import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMentorBookingWorkspace,
  parseMentorBookingCommand,
  parseMentorBookingQuery,
} from "../../src/mentor-booking/model.ts";

const semesterId = "11111111-1111-4111-8111-111111111111";
const windowId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const semesterDates = { semesterStartDate: "2026-09-01", semesterEndDate: "2099-12-31" };

test("commands validate identifiers, topics, and future window ordering", () => {
  assert.deepEqual(parseMentorBookingQuery(`https://example.test/api/mentor-booking?semesterId=${semesterId}`), { semesterId, weekOffset: 0 });
  assert.deepEqual(parseMentorBookingCommand({ action: "request_window", semesterId, windowId, topic: "  Pricing strategy  " }), {
    action: "request_window", semesterId, windowId, topic: "Pricing strategy",
  });
  assert.throws(() => parseMentorBookingQuery("https://example.test/api/mentor-booking"), /semesterId is required/u);
  assert.throws(() => parseMentorBookingCommand({ action: "request_window", semesterId, windowId, topic: " " }), /topic is required/u);
  assert.throws(() => parseMentorBookingCommand({ action: "request_window", semesterId, windowId, topic: "x".repeat(1001) }), /1000/u);
  assert.throws(() => parseMentorBookingCommand({ action: "publish_window", semesterId, startsAt: "bad", endsAt: "2026-09-08T16:00:00Z" }), /valid ISO/u);
  assert.throws(() => parseMentorBookingCommand({ action: "publish_window", semesterId, startsAt: "2026-09-08T15:00:00", endsAt: "2026-09-08T16:00:00Z" }), /explicit timezone/u);
  assert.throws(() => parseMentorBookingCommand({ action: "publish_window", semesterId, startsAt: "2026-02-30T15:00:00Z", endsAt: "2026-03-02T16:00:00Z" }), /valid calendar/u);
  assert.throws(() => parseMentorBookingCommand({ action: "publish_window", semesterId, startsAt: "2026-09-08T15:00:00+15:00", endsAt: "2026-09-08T16:00:00Z" }), /timezone offset/u);
  assert.throws(() => parseMentorBookingCommand({ action: "publish_window", semesterId, startsAt: "2026-09-08T15:00:00Z", endsAt: "2026-09-08T14:00:00Z" }), /after startsAt/u);
});

test("commands accept a calendar-first availability replacement and startup-selected appointment", () => {
  assert.deepEqual(parseMentorBookingCommand({
    action: "replace_weekly_availability",
    semesterId,
    availability: [
      { weekday: 1, startsAt: "09:00", endsAt: "11:00" },
      { weekday: 3, startsAt: "13:15", endsAt: "14:00" },
    ],
  }), {
    action: "replace_weekly_availability",
    semesterId,
    availability: [
      { weekday: 1, startsAt: "09:00", endsAt: "11:00" },
      { weekday: 3, startsAt: "13:15", endsAt: "14:00" },
    ],
  });
  assert.deepEqual(parseMentorBookingCommand({
    action: "request_booking",
    semesterId,
    mentorSemesterId: "22222222-2222-4222-8222-222222222223",
    startsAt: "2099-01-05T14:00:00Z",
    endsAt: "2099-01-05T14:15:00Z",
    topic: " Fundraising strategy ",
  }), {
    action: "request_booking",
    semesterId,
    mentorSemesterId: "22222222-2222-4222-8222-222222222223",
    startsAt: "2099-01-05T14:00:00.000Z",
    endsAt: "2099-01-05T14:15:00.000Z",
    topic: "Fundraising strategy",
  });
  assert.deepEqual(parseMentorBookingCommand({
    action: "request_booking",
    semesterId,
    mentorSemesterId: "22222222-2222-4222-8222-222222222223",
    startsAt: "2099-01-05T14:00:00Z",
    endsAt: "2099-01-05T14:30:00Z",
    topic: "Fundraising strategy",
  }), {
    action: "request_booking",
    semesterId,
    mentorSemesterId: "22222222-2222-4222-8222-222222222223",
    startsAt: "2099-01-05T14:00:00.000Z",
    endsAt: "2099-01-05T14:30:00.000Z",
    topic: "Fundraising strategy",
  });
  assert.throws(() => parseMentorBookingCommand({
    action: "request_booking",
    semesterId,
    mentorSemesterId: "22222222-2222-4222-8222-222222222223",
    startsAt: "2099-01-05T14:00:00Z",
    endsAt: "2099-01-05T14:45:00Z",
    topic: "Fundraising strategy",
  }), /15 or 30 minutes/u);
});

test("workspace derives actionable flags while retaining authorized terminal history", () => {
  const result = buildMentorBookingWorkspace({
    ...semesterDates,
    semesterId,
    timeZone: "America/New_York",
    viewer: { profileId: "p1", role: "mentor", mentorSemesterId: "m1", startupSemesterId: null },
    claims: [{ windowId, status: "pending" }],
    windows: [{
      windowId, semesterId, mentorSemesterId: "m1", mentorProfileId: "p1", mentorName: "Ada Mentor",
      startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:30:00Z", withdrawnAt: null,
    }],
    requests: [{
      requestId, windowId, semesterId, mentorSemesterId: "m1", mentorProfileId: "p1", mentorName: "Ada Mentor",
      startupSemesterId: "s1", startupOrganizationId: "o1", startupName: "Example Co", topic: "Pricing strategy",
      status: "pending", startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:30:00Z",
      requestedAt: "2098-12-01T12:00:00Z", respondedAt: null, cancelledAt: null,
    }],
  });

  assert.equal(result.timeZone, "America/New_York");
  assert.deepEqual(result.windows[0], {
    windowId, semesterId, mentorSemesterId: "m1", mentor: { profileId: "p1", name: "Ada Mentor" },
    startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:30:00Z", status: "pending",
    canWithdraw: false, canRequest: false,
    request: {
      requestId, windowId, mentorSemesterId: "m1", mentor: { profileId: "p1", name: "Ada Mentor" },
      startupSemesterId: "s1", startup: { organizationId: "o1", name: "Example Co" }, topic: "Pricing strategy",
      status: "pending", startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:30:00Z",
      requestedAt: "2098-12-01T12:00:00Z", respondedAt: null, cancelledAt: null,
      canAccept: true, canDecline: true, canCancel: true,
    },
  });
  assert.equal(result.history.length, 1);
});

test("a startup can request only an available future window and cannot act on another startup's request", () => {
  const result = buildMentorBookingWorkspace({
    ...semesterDates,
    semesterId,
    timeZone: "UTC",
    viewer: { profileId: "p2", role: "startup", mentorSemesterId: null, startupSemesterId: "s2" },
    claims: [],
    windows: [
      { windowId, semesterId, mentorSemesterId: "m1", mentorProfileId: "p1", mentorName: "Ada", startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:30:00Z", withdrawnAt: null },
    ],
    requests: [{
      requestId, windowId, semesterId, mentorSemesterId: "m1", mentorProfileId: "p1", mentorName: "Ada",
      startupSemesterId: "other-startup", startupOrganizationId: "private-org", startupName: "Private Startup",
      topic: "Private acquisition details", status: "pending", startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:30:00Z",
      requestedAt: "2098-12-01T12:00:00Z", respondedAt: null, cancelledAt: null,
    }],
  });
  assert.equal(result.windows[0]?.canRequest, true);
  assert.equal(result.windows[0]?.canWithdraw, false);
  assert.equal(result.windows[0]?.request, null);
  assert.equal(result.history.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /Private acquisition|Private Startup|private-org/u);
});

test("safe occupancy prevents another startup from requesting without exposing private request details", () => {
  const result = buildMentorBookingWorkspace({
    ...semesterDates,
    semesterId,
    timeZone: "UTC",
    viewer: { profileId: "p2", role: "startup", mentorSemesterId: null, startupSemesterId: "s2" },
    claims: [{ windowId, status: "pending" }],
    windows: [{ windowId, semesterId, mentorSemesterId: "m1", mentorProfileId: "p1", mentorName: "Ada", startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:30:00Z", withdrawnAt: null }],
    requests: [],
  });
  assert.equal(result.windows[0]?.status, "pending");
  assert.equal(result.windows[0]?.canRequest, false);
  assert.equal(result.windows[0]?.request, null);
});

test("cross-semester saved records fail closed", () => {
  assert.throws(() => buildMentorBookingWorkspace({
    ...semesterDates,
    semesterId,
    timeZone: "UTC",
    viewer: { profileId: "p2", role: "startup", mentorSemesterId: null, startupSemesterId: "s2" },
    claims: [],
    windows: [{ windowId, semesterId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", mentorSemesterId: "m1", mentorProfileId: "p1", mentorName: "Ada", startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:30:00Z", withdrawnAt: null }],
    requests: [],
  }), /different semester/u);
});

test("workspace returns privacy-safe accepted occupancy without startup details", () => {
  const result = buildMentorBookingWorkspace({
    ...semesterDates,
    semesterId,
    timeZone: "UTC",
    viewer: { profileId: "p2", role: "startup", mentorSemesterId: null, startupSemesterId: "s2" },
    acceptedOccupancy: [{ semesterId, mentorSemesterId: "m1", startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:15:00Z" }],
    requests: [],
  });

  assert.deepEqual(result.acceptedOccupancy, [{ mentorSemesterId: "m1", startsAt: "2099-01-01T15:00:00Z", endsAt: "2099-01-01T15:15:00Z" }]);
  assert.deepEqual(Object.keys(result.acceptedOccupancy[0]!).sort(), ["endsAt", "mentorSemesterId", "startsAt"]);
});

test("workspace rejects malformed or reversed accepted occupancy intervals", () => {
  const base = {
    semesterId,
    semesterStartDate: "2099-01-01",
    semesterEndDate: "2099-06-01",
    timeZone: "UTC",
    viewer: { profileId: "p2", role: "startup" as const, mentorSemesterId: null, startupSemesterId: "s2" },
    requests: [],
  };

  assert.throws(() => buildMentorBookingWorkspace({ ...base, acceptedOccupancy: [{ semesterId, mentorSemesterId: "m1", startsAt: "bad", endsAt: "2099-01-01T15:15:00Z" }] }), /invalid interval/u);
  assert.throws(() => buildMentorBookingWorkspace({ ...base, acceptedOccupancy: [{ semesterId, mentorSemesterId: "m1", startsAt: "2099-01-01T15:15:00Z", endsAt: "2099-01-01T15:00:00Z" }] }), /invalid interval/u);
});

test("weekly roster projection does not expose other startups to participants", () => {
  const startupRoster = [{ startupSemesterId: "own", name: "Own" }, { startupSemesterId: "other", name: "Other" }];
  const base = { ...semesterDates, semesterId, timeZone: "UTC", requests: [], startupRoster };
  const startup = buildMentorBookingWorkspace({ ...base, viewer: { profileId: "p", role: "startup", mentorSemesterId: null, startupSemesterId: "own" } });
  assert.deepEqual(startup.startupRoster, [startupRoster[0]]);
  const mentor = buildMentorBookingWorkspace({ ...base, viewer: { profileId: "p", role: "mentor", mentorSemesterId: "m", startupSemesterId: null } });
  assert.deepEqual(mentor.startupRoster, []);
  const admin = buildMentorBookingWorkspace({ ...base, viewer: { profileId: "p", role: "admin", mentorSemesterId: null, startupSemesterId: null } });
  assert.deepEqual(admin.startupRoster, startupRoster);
});
