import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BATCH_WINDOWS,
  buildMentorBookingBatch,
} from "../../src/mentor-booking/batch-slots.ts";

const base = {
  rangeEnd: "2026-03-15",
  rangeStart: "2026-03-08",
  weekdays: ["sunday"] as const,
  dailyStart: "09:00",
  dailyEnd: "10:00",
  durationMinutes: 30,
  bufferMinutes: 0,
  timeZone: "America/New_York",
  existingWindows: [],
};

test("builds dated concrete slots in the semester timezone across spring DST", () => {
  const result = buildMentorBookingBatch(base);
  assert.deepEqual(result.slots.map((slot) => [slot.startsAt, slot.endsAt]), [
    ["2026-03-08T13:00:00.000Z", "2026-03-08T13:30:00.000Z"],
    ["2026-03-08T13:30:00.000Z", "2026-03-08T14:00:00.000Z"],
    ["2026-03-15T13:00:00.000Z", "2026-03-15T13:30:00.000Z"],
    ["2026-03-15T13:30:00.000Z", "2026-03-15T14:00:00.000Z"],
  ]);
});

test("uses the correct standard-time offset across fall DST", () => {
  const result = buildMentorBookingBatch({ ...base, rangeStart: "2026-11-01", rangeEnd: "2026-11-01" });
  assert.deepEqual(result.slots.map((slot) => slot.startsAt), ["2026-11-01T14:00:00.000Z", "2026-11-01T14:30:00.000Z"]);
});

test("keeps the earlier instant when a fall-back wall time occurs twice", () => {
  const result = buildMentorBookingBatch({
    ...base,
    dailyEnd: "01:30",
    dailyStart: "01:00",
    rangeEnd: "2026-11-01",
    rangeStart: "2026-11-01",
  });
  assert.deepEqual(result.slots.map((slot) => [slot.startsAt, slot.endsAt]), [
    ["2026-11-01T05:00:00.000Z", "2026-11-01T05:30:00.000Z"],
  ]);
});

test("honors duration and buffer without emitting a partial final slot", () => {
  const result = buildMentorBookingBatch({ ...base, rangeStart: "2026-03-09", rangeEnd: "2026-03-09", weekdays: ["monday"], dailyStart: "09:00", dailyEnd: "10:00", durationMinutes: 20, bufferMinutes: 10 });
  assert.deepEqual(result.slots.map((slot) => [slot.startsAt, slot.endsAt]), [
    ["2026-03-09T13:00:00.000Z", "2026-03-09T13:20:00.000Z"],
    ["2026-03-09T13:30:00.000Z", "2026-03-09T13:50:00.000Z"],
  ]);
});

test("allows Friday outside its separate program-time guard and rejects a date range with no selected weekday", () => {
  assert.equal(buildMentorBookingBatch({ ...base, rangeStart: "2026-03-13", rangeEnd: "2026-03-13", weekdays: ["friday"] }).slots.length, 2);
  assert.throws(() => buildMentorBookingBatch({ ...base, rangeStart: "2026-03-09", rangeEnd: "2026-03-09", weekdays: ["sunday"] }), /no slots/u);
});

test("marks loaded-window duplicates and never sends the same slot twice", () => {
  const result = buildMentorBookingBatch({ ...base, rangeStart: "2026-03-08", rangeEnd: "2026-03-08", existingWindows: [{ startsAt: "2026-03-08T13:00:00.000Z", endsAt: "2026-03-08T13:30:00.000Z" }] });
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.slots[0]?.duplicate, true);
  assert.equal(new Set(result.slots.map((slot) => `${slot.startsAt}/${slot.endsAt}`)).size, result.slots.length);
});

test("reports a clear maximum-batch error", () => {
  assert.throws(() => buildMentorBookingBatch({ ...base, rangeStart: "2026-01-01", rangeEnd: "2026-12-31", weekdays: ["monday", "tuesday", "wednesday", "thursday", "saturday", "sunday"], dailyStart: "08:00", dailyEnd: "18:00", durationMinutes: 15 }), new RegExp(`${MAX_BATCH_WINDOWS}`));
});

test("counts nonexistent spring-forward wall-time slots as invalid without using the browser timezone", () => {
  const result = buildMentorBookingBatch({ ...base, rangeStart: "2026-03-08", rangeEnd: "2026-03-08", dailyStart: "02:00", dailyEnd: "03:00" });
  assert.equal(result.invalidCount, 2);
  assert.equal(result.ineligibleCount, 0);
  assert.equal(result.slots.length, 0);
});
