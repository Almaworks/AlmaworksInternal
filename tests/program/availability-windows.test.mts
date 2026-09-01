import assert from "node:assert/strict";
import test from "node:test";

import {
  availabilityRowsForMeetings,
  availabilityStateFromRows,
  availabilityWindowKey,
} from "../../src/program/availability-windows.ts";

test("availability state keeps each meeting slot independent", () => {
  assert.deepEqual(availabilityStateFromRows([
    { meeting_id: "meeting-1", slot: 1, is_available: true },
    { meeting_id: "meeting-1", slot: 2, is_available: false },
  ]), {
    "meeting-1:1": true,
    "meeting-1:2": false,
  });
  assert.equal(availabilityWindowKey("meeting-1", 2), "meeting-1:2");
});

test("availability persistence writes the exact selected meeting and slot windows", () => {
  assert.deepEqual(availabilityRowsForMeetings({
    meetingIds: ["meeting-1", "meeting-2"],
    membershipId: "membership-1",
    semesterId: "semester-1",
    state: { "meeting-1:1": true, "meeting-1:2": false, "meeting-2:1": false, "meeting-2:2": true },
  }), [
    { semester_id: "semester-1", semester_membership_id: "membership-1", meeting_id: "meeting-1", slot: 1, is_available: true, source: "user" },
    { semester_id: "semester-1", semester_membership_id: "membership-1", meeting_id: "meeting-1", slot: 2, is_available: false, source: "user" },
    { semester_id: "semester-1", semester_membership_id: "membership-1", meeting_id: "meeting-2", slot: 1, is_available: false, source: "user" },
    { semester_id: "semester-1", semester_membership_id: "membership-1", meeting_id: "meeting-2", slot: 2, is_available: true, source: "user" },
  ]);
});
