import assert from "node:assert/strict";
import test from "node:test";

import {
  canChangeSessionRsvp,
  sessionRsvpLabel,
  sessionStartIso,
  summarizeSessionRsvps,
  type SessionAttendeeRsvp,
} from "../../src/sessions/rsvp.ts";

const attendees: SessionAttendeeRsvp[] = [
  {
    semesterMembershipId: "mentor-membership",
    profileId: "mentor-profile",
    fullName: "Maya Chen",
    role: "mentor",
    response: "attending",
    respondedAt: "2026-09-01T14:00:00.000Z",
    updatedAt: "2026-09-01T14:00:00.000Z",
  },
  {
    semesterMembershipId: "startup-member-one",
    profileId: "startup-profile-one",
    fullName: "Ari Rivera",
    role: "startup",
    response: "not_attending",
    respondedAt: "2026-09-01T14:05:00.000Z",
    updatedAt: "2026-09-01T14:05:00.000Z",
  },
  {
    semesterMembershipId: "startup-member-two",
    profileId: "startup-profile-two",
    fullName: "Sam Lee",
    role: "startup",
    response: "no_response",
    respondedAt: null,
    updatedAt: null,
  },
];

test("summarizes explicit responses and counts a missing RSVP projection as no response", () => {
  assert.deepEqual(summarizeSessionRsvps(attendees), {
    attending: 1,
    notAttending: 1,
    noResponse: 1,
  });
});

test("presents not-attending RSVP values as cannot attend", () => {
  assert.equal(sessionRsvpLabel("attending"), "Can attend");
  assert.equal(sessionRsvpLabel("not_attending"), "Can’t attend");
  assert.equal(sessionRsvpLabel("no_response"), "No response");
});

test("allows RSVP changes only before a confirmed session begins", () => {
  assert.equal(canChangeSessionRsvp({
    now: "2026-09-04T19:29:59.999Z",
    sessionStartsAt: "2026-09-04T19:30:00.000Z",
    status: "confirmed",
  }), true);
  assert.equal(canChangeSessionRsvp({
    now: "2026-09-04T19:30:00.000Z",
    sessionStartsAt: "2026-09-04T19:30:00.000Z",
    status: "confirmed",
  }), false);
  assert.equal(canChangeSessionRsvp({
    now: "2026-09-04T18:30:00.000Z",
    sessionStartsAt: "2026-09-04T19:30:00.000Z",
    status: "cancelled",
  }), false);
});

test("converts a New York winter session start to its UTC instant", () => {
  assert.equal(sessionStartIso({
    meetingDate: "2026-01-16",
    startsAt: "15:30:00",
    timezone: "America/New_York",
  }), "2026-01-16T20:30:00.000Z");
});

test("converts a New York daylight-saving session start to its UTC instant", () => {
  assert.equal(sessionStartIso({
    meetingDate: "2026-09-04",
    startsAt: "15:30:00",
    timezone: "America/New_York",
  }), "2026-09-04T19:30:00.000Z");
});

test("uses New York as the documented timezone fallback", () => {
  assert.equal(sessionStartIso({
    meetingDate: "2026-09-04",
    startsAt: "15:30",
    timezone: null,
  }), "2026-09-04T19:30:00.000Z");
});

test("rejects invalid session date, time, and timezone inputs", () => {
  assert.throws(() => sessionStartIso({ meetingDate: "2026-02-30", startsAt: "15:30", timezone: "America/New_York" }), /Invalid meeting date/);
  assert.throws(() => sessionStartIso({ meetingDate: "2026-09-04", startsAt: "25:00", timezone: "America/New_York" }), /Invalid session start time/);
  assert.throws(() => sessionStartIso({ meetingDate: "2026-09-04", startsAt: "15:30", timezone: "Mars\/Olympus" }), /Invalid timezone/);
});

test("treats malformed instants as locked", () => {
  assert.equal(canChangeSessionRsvp({ now: "not-a-date", sessionStartsAt: "2026-09-04T19:30:00.000Z", status: "confirmed" }), false);
  assert.equal(canChangeSessionRsvp({ now: "2026-09-04T19:00:00.000Z", sessionStartsAt: "not-a-date", status: "confirmed" }), false);
});
