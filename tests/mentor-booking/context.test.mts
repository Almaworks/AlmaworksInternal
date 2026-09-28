import assert from "node:assert/strict";
import test from "node:test";

import { parseBookingContextCommand, parseBookingContextIds } from "../../src/mentor-booking/context.ts";

const semesterId = "c1000000-0000-4000-8000-000000000001";
const requestId = "c9000000-0000-4000-8000-000000000001";

test("context IDs require both scoped UUIDs", () => {
  assert.deepEqual(parseBookingContextIds(semesterId, requestId), { semesterId, requestId });
  assert.throws(() => parseBookingContextIds(semesterId, "other"), /valid semester and booking/);
});

test("meeting links require ordinary HTTP(S) hosts without embedded credentials", () => {
  const base = { action: "save_meeting", semesterId, requestId, location: " Office ", expectedUpdatedAt: null };
  const saved = parseBookingContextCommand({ ...base, videoUrl: "https://meet.example.test/room" });
  assert.equal(saved.action, "save_meeting");
  if (saved.action === "save_meeting") assert.equal(saved.location, "Office");
  for (const videoUrl of ["javascript:alert(1)", "ftp://meet.example.test", "https://name:secret@meet.example.test/room", "https://name@meet.example.test/room"]) {
    assert.throws(() => parseBookingContextCommand({ ...base, videoUrl }), /HTTP or HTTPS/);
  }
});

test("decision notes and outcomes are constrained at the API boundary", () => {
  assert.throws(() => parseBookingContextCommand({ action: "transition_with_note", semesterId, requestId, transition: "declined", note: "  ", alternativeText: null }), /decision note/);
  assert.throws(() => parseBookingContextCommand({ action: "record_outcome", semesterId, requestId, attendance: "unknown", feedback: null, expectedUpdatedAt: null }), /Attendance/);
  const note = parseBookingContextCommand({ action: "transition_with_note", semesterId, requestId, transition: "declined", note: " No availability ", alternativeText: " Next week " });
  assert.deepEqual(note, { action: "transition_with_note", semesterId, requestId, transition: "declined", note: "No availability", alternativeText: "Next week" });
});
