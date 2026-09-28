import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAvailability, mergeIntervals, snapshotAvailability } from "../../src/calendar/availability.ts";
import type { AvailabilityInput, CalendarInterval } from "../../src/calendar/types.ts";

const interval = (startsAt: string, endsAt: string): CalendarInterval => ({ startsAt, endsAt });
const monday = (start: string, end: string) => interval(`2026-10-05T${start}:00Z`, `2026-10-05T${end}:00Z`);
function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    mode: "synced", timeZone: "America/New_York", programTimeZone: "America/New_York",
    semesterStartDate: "2026-09-01", semesterEndDate: "2026-12-20",
    range: monday("12:00", "23:00"), now: "2026-10-05T11:59:00Z",
    workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "17:00" }],
    snapshot: { ...monday("00:00", "23:59"), fetchedAt: "2026-10-05T11:58:00Z", busy: [] },
    overrides: [], acceptedBookings: [], manualSlots: [], ...overrides,
  };
}
test("merges overlapping and adjacent ranges with canonical UTC output", () => {
  assert.deepEqual(mergeIntervals([monday("14:00", "15:00"), monday("13:00", "14:15"), monday("15:00", "16:00")]), [interval("2026-10-05T13:00:00.000Z", "2026-10-05T16:00:00.000Z")]);
});
test("Google busy overlap removes entire partial slots, boundaries remain free", () => {
  const result = effectiveAvailability(input({ snapshot: { ...monday("00:00", "23:59"), fetchedAt: "2026-10-05T11:58:00Z", busy: [monday("14:07", "15:00")] } }));
  assert.equal(result.slots.length, 28);
  assert.ok(result.slots.some(s => s.startsAt === "2026-10-05T15:00:00.000Z"));
  assert.ok(!result.slots.some(s => s.startsAt === "2026-10-05T14:00:00.000Z"));
});
test("an all-day busy interval removes the entire working day", () => {
  const result = effectiveAvailability(input({ snapshot: { ...monday("00:00", "23:59"), fetchedAt: "2026-10-05T11:58:00Z", busy: [interval("2026-10-05T04:00:00Z", "2026-10-06T04:00:00Z")] } }));
  assert.deepEqual(result.slots, []);
  assert.equal(result.status, "ready");
});
test("available exceptions extend hours but cannot override Google, manual blocks, or accepted bookings", () => {
  const result = effectiveAvailability(input({
    overrides: [{ ...monday("12:00", "14:00"), available: true }, { ...monday("13:00", "13:15"), available: false }],
    acceptedBookings: [monday("13:15", "13:30")],
    snapshot: { ...monday("00:00", "23:59"), fetchedAt: "2026-10-05T11:58:00Z", busy: [monday("12:00", "12:30")] },
  }));
  assert.equal(result.slots[0]?.startsAt, "2026-10-05T12:30:00.000Z");
  assert.ok(!result.slots.some(s => s.startsAt === "2026-10-05T13:15:00.000Z"));
  assert.equal(result.slots.length, 32);
});
test("stale, missing, future-dated and failed snapshots fail closed for sync", () => {
  for (const snapshot of [null, { ...monday("00:00", "23:59"), fetchedAt: "2026-10-05T10:00:00Z", busy: [] }, { ...monday("00:00", "23:59"), fetchedAt: "2026-10-05T12:30:00Z", busy: [] }]) {
    assert.deepEqual(effectiveAvailability(input({ snapshot })).slots, []);
  }
  assert.deepEqual(effectiveAvailability(input({ syncUnavailable: true })).slots, []);
});
test("only slots fully inside verified Google coverage are published", () => {
  const result = effectiveAvailability(input({ snapshot: { ...monday("13:07", "14:07"), fetchedAt: "2026-10-05T11:58:00Z", busy: [] } }));
  assert.equal(result.slots.length, 3);
  assert.equal(result.slots[0]?.startsAt, "2026-10-05T13:15:00.000Z");
  assert.equal(result.status, "partial_coverage");
});
test("one-time snapshot remains editable and independent from subsequent Google busy", () => {
  const original = input();
  const manualSlots = snapshotAvailability(original);
  const result = effectiveAvailability(input({ mode: "manual", manualSlots, snapshot: null, syncUnavailable: true, workingHours: [], overrides: [{ ...monday("14:00", "15:00"), available: false }] }));
  assert.equal(result.slots.length, 28);
  assert.equal(result.status, "ready");
  assert.throws(() => snapshotAvailability(input({ snapshot: null })), /fresh|snapshot/i);
});
test("Friday program reservation follows program timezone even with other working timezone", () => {
  const result = effectiveAvailability(input({ mode: "weekly", timeZone: "Europe/London", range: interval("2026-10-09T17:00:00Z", "2026-10-09T22:00:00Z"), workingHours: [{ weekday: 5, startsAt: "18:00", endsAt: "23:00" }], snapshot: null }));
  assert.equal(result.slots.length, 12);
  assert.ok(!result.slots.some(s => s.startsAt >= "2026-10-09T19:00:00.000Z" && s.startsAt < "2026-10-09T21:00:00.000Z"));
});
test("DST fall-back retains both real occurrences and respects separate busy instants", () => {
  const result = effectiveAvailability(input({ mode: "weekly", range: interval("2026-11-01T04:00:00Z", "2026-11-01T08:00:00Z"), workingHours: [{ weekday: 0, startsAt: "01:00", endsAt: "02:00" }] }));
  assert.equal(result.slots.length, 8);
  assert.equal(result.slots[0]?.startsAt, "2026-11-01T05:00:00.000Z");
  assert.equal(result.slots[7]?.startsAt, "2026-11-01T06:45:00.000Z");
});
test("DST spring gap creates no imaginary slots", () => {
  const result = effectiveAvailability(input({ mode: "weekly", now: "2027-03-01T00:00:00Z", semesterStartDate: "2027-01-01", semesterEndDate: "2027-05-01", range: interval("2027-03-14T06:00:00Z", "2027-03-14T09:00:00Z"), workingHours: [{ weekday: 0, startsAt: "01:00", endsAt: "04:00" }] }));
  assert.equal(result.slots.length, 8);
});
test("semester, now, range boundaries and empty working hours constrain slots", () => {
  assert.equal(effectiveAvailability(input({ workingHours: [] })).slots.length, 0);
  assert.equal(effectiveAvailability(input({ semesterEndDate: "2026-10-04" })).slots.length, 0);
  assert.equal(effectiveAvailability(input({ mode: "weekly", now: "2026-10-05T20:07:00Z" })).slots.length, 3);
  assert.equal(effectiveAvailability(input({ range: monday("13:07", "13:44") })).slots.length, 1);
});
test("invalid inputs fail closed instead of publishing an empty busy list", () => {
  assert.throws(() => effectiveAvailability(input({ snapshot: { ...monday("00:00", "23:59"), fetchedAt: "2026-10-05T11:58:00Z", busy: [monday("15:00", "14:00")] } })), /interval/i);
  assert.throws(() => effectiveAvailability(input({ workingHours: [{ weekday: 1, startsAt: "09:07", endsAt: "17:00" }] })), /15.minute/i);
  assert.throws(() => effectiveAvailability(input({ range: interval("2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z") })), /90/);
  assert.throws(() => effectiveAvailability(input({ semesterEndDate: "2026-02-30" })), /date/i);
});
