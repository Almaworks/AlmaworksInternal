import test from "node:test";
import assert from "node:assert/strict";
import { startupBookingSlots } from "../../src/mentor-booking/startup-availability.ts";
const mentor = { name: "Mentor", profileId: "mentor" };
const input = { availability: [{ mentor, mentorSemesterId: "mentor", weekday: 1, startsAt: "09:00", endsAt: "17:00" }], semesterStartDate: "2026-09-01", semesterEndDate: "2026-12-31", timeZone: "UTC", now: new Date("2026-09-21T08:00:00Z"), durationMinutes: 15 as const };
test("authoritative empty Calendar slots never resurrect weekly availability", () => {
  assert.ok(startupBookingSlots(input).length > 0);
  assert.deepEqual(startupBookingSlots({ ...input, effectiveAvailability: [] }), []);
});
test("shared slot projection preserves dated additions and filters the displayed week", () => {
  const slot = { mentor, mentorSemesterId: "mentor", startsAt: "2026-09-21T20:00:00Z", endsAt: "2026-09-21T20:15:00Z" };
  assert.deepEqual(startupBookingSlots({ ...input, effectiveAvailability: [slot] }), [slot]);
  assert.deepEqual(startupBookingSlots({ ...input, effectiveAvailability: [slot], weekOffset: 1 }), []);
});
