import assert from "node:assert/strict";
import test from "node:test";

import { mentorBookedCells } from "../../src/mentor-booking/mentor-booked-cells.ts";
import { availabilityPaintKey } from "../../src/mentor-booking/availability-painter.ts";

const accepted = {
  requestId: "request-1",
  windowId: null,
  mentorSemesterId: "mentor-1",
  mentor: { profileId: "profile-1", name: "Mentor" },
  startupSemesterId: "startup-1",
  startup: { organizationId: "org-1", name: "Startup One" },
  topic: "Pricing",
  status: "accepted" as const,
  startsAt: "2026-09-14T15:00:00.000Z",
  endsAt: "2026-09-14T15:15:00.000Z",
  requestedAt: "2026-09-13T12:00:00.000Z",
  respondedAt: "2026-09-13T13:00:00.000Z",
  cancelledAt: null,
  canAccept: false,
  canDecline: false,
  canCancel: true,
};

test("marks accepted meetings in the mentor's current local week", () => {
  assert.deepEqual([...mentorBookedCells({ requests: [accepted], now: new Date("2026-09-14T14:00:00.000Z"), timeZone: "America/New_York" })], [
    [availabilityPaintKey("monday", "11:00"), "Startup One"],
  ]);
});

test("removes cancelled, passed, and non-current-week meetings", () => {
  const now = new Date("2026-09-14T15:15:00.000Z");
  assert.equal(mentorBookedCells({ requests: [accepted], now, timeZone: "America/New_York" }).size, 0);
  assert.equal(mentorBookedCells({ requests: [{ ...accepted, status: "cancelled" }], now: new Date("2026-09-14T14:00:00.000Z"), timeZone: "America/New_York" }).size, 0);
  assert.equal(mentorBookedCells({ requests: [{ ...accepted, startsAt: "2026-09-21T15:00:00.000Z", endsAt: "2026-09-21T15:15:00.000Z" }], now: new Date("2026-09-14T14:00:00.000Z"), timeZone: "America/New_York" }).size, 0);
});

test("keeps an in-progress accepted meeting blocked until its exact end", () => {
  const cells = mentorBookedCells({ requests: [accepted], now: new Date("2026-09-14T15:07:00.000Z"), timeZone: "America/New_York" });

  assert.equal(cells.get(availabilityPaintKey("monday", "11:00")), "Startup One");
});
