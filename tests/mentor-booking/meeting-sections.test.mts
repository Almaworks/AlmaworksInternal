import assert from "node:assert/strict";
import test from "node:test";

import { bookingSections } from "../../src/mentor-booking/meeting-sections.ts";
import type { MentorBookingRequest } from "../../src/mentor-booking/types.ts";

function request(overrides: Partial<MentorBookingRequest> = {}): MentorBookingRequest {
  return {
    requestId: "request-1", windowId: null, mentorSemesterId: "mentor-1", mentor: { profileId: "mentor-profile", name: "Ada Mentor" },
    startupSemesterId: "startup-1", startup: { organizationId: "startup-org", name: "Northstar" }, topic: "Pricing",
    status: "pending", startsAt: "2026-09-12T14:00:00.000Z", endsAt: "2026-09-12T14:15:00.000Z",
    requestedAt: "2026-09-10T14:00:00.000Z", respondedAt: null, cancelledAt: null,
    canAccept: false, canDecline: false, canCancel: true,
    ...overrides,
  };
}

test("separates pending requests, confirmed upcoming sessions, and completed booking history", () => {
  const { pending, upcoming, history } = bookingSections([
    request({ requestId: "pending", status: "pending" }),
    request({ requestId: "upcoming-accepted", status: "accepted", startsAt: "2026-09-12T15:00:00.000Z", endsAt: "2026-09-12T15:15:00.000Z" }),
    request({ requestId: "completed", status: "accepted", startsAt: "2026-09-10T13:00:00.000Z", endsAt: "2026-09-10T13:15:00.000Z", canCancel: false }),
    request({ requestId: "cancelled", status: "cancelled", cancelledAt: "2026-09-10T14:00:00.000Z", canCancel: false }),
    request({ requestId: "declined", status: "declined", canCancel: false }),
  ], new Date("2026-09-11T14:00:00.000Z"));

  assert.deepEqual(pending.map((item) => item.requestId), ["pending"]);
  assert.deepEqual(upcoming.map((item) => item.requestId), ["upcoming-accepted"]);
  assert.deepEqual(history.map((item) => item.requestId), ["completed"]);
});

test("a cancelled session is removed from the upcoming queue after its status refreshes", () => {
  const upcoming = request({ requestId: "cancel-me", status: "accepted" });
  assert.deepEqual(bookingSections([upcoming], new Date("2026-09-11T14:00:00.000Z")).upcoming.map((item) => item.requestId), ["cancel-me"]);
  assert.equal(bookingSections([{ ...upcoming, status: "cancelled", cancelledAt: "2026-09-11T14:01:00.000Z", canCancel: false }], new Date("2026-09-11T14:00:00.000Z")).upcoming.length, 0);
});
