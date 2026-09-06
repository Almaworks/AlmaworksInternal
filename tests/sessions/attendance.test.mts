import assert from "node:assert/strict";
import test from "node:test";

import { buildSessionAttendance } from "../../src/sessions/attendance.ts";

test("buildSessionAttendance projects explicit and missing responses", () => {
  const result = buildSessionAttendance({
    participants: [
      { semesterMembershipId: "mentor-1", fullName: "Morgan Mentor", role: "mentor" },
      { semesterMembershipId: "founder-1", fullName: "Alex Founder", role: "startup" },
      { semesterMembershipId: "founder-2", fullName: "Sam Founder", role: "startup" },
    ],
    responses: [
      { semesterMembershipId: "mentor-1", response: "attending" },
      { semesterMembershipId: "founder-2", response: "not_attending" },
    ],
  });

  assert.deepEqual(result.counts, { attending: 1, notAttending: 1, noResponse: 1, total: 3 });
  assert.deepEqual(result.attendees.map((attendee) => attendee.response), ["attending", "no_response", "not_attending"]);
});

test("buildSessionAttendance ignores responses from people outside the session", () => {
  const result = buildSessionAttendance({
    participants: [{ semesterMembershipId: "mentor-1", fullName: "Morgan Mentor", role: "mentor" }],
    responses: [{ semesterMembershipId: "someone-else", response: "attending" }],
  });

  assert.deepEqual(result.counts, { attending: 0, notAttending: 0, noResponse: 1, total: 1 });
});
