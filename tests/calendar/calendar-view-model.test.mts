import assert from "node:assert/strict";
import test from "node:test";
import { calendarTimeMinute, calendarWeek, calendarWeekStart, cohortCalendarWeek, dateInCohort, layoutCalendarIntervals, shiftCalendarWeek } from "../../src/calendar/calendar-view-model.ts";

test("cohort calendar clamps the visible week and marks partial boundary days", () => {
  assert.equal(cohortCalendarWeek("2026-09-20", "2026-10-02", "2026-11-20"), "2026-09-27");
  assert.equal(cohortCalendarWeek("2026-12-06", "2026-10-02", "2026-11-20"), "2026-11-15");
  assert.equal(cohortCalendarWeek("2026-10-04", "2026-10-02", "2026-11-20"), "2026-10-04");
  assert.equal(dateInCohort("2026-10-01", "2026-10-02", "2026-11-20"), false);
  assert.equal(dateInCohort("2026-10-02", "2026-10-02", "2026-11-20"), true);
  assert.equal(dateInCohort("2026-11-21", "2026-10-02", "2026-11-20"), false);
});

test("calendarWeek returns Sunday through Saturday without crossing a timezone boundary", () => {
  assert.deepEqual(calendarWeek("2026-11-01"), [
    "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07",
  ]);
  assert.equal(shiftCalendarWeek("2026-11-01", -1), "2026-10-25");
  assert.equal(shiftCalendarWeek("2026-11-01", 1), "2026-11-08");
  assert.equal(calendarWeekStart("2026-11-04"), "2026-11-01");
});

test("layoutCalendarIntervals places a New York interval using its local DST-aware day and time", () => {
  const layouts = layoutCalendarIntervals({
    intervals: [{ startsAt: "2026-11-01T06:30:00.000Z", endsAt: "2026-11-01T07:30:00.000Z" }],
    timeZone: "America/New_York",
    weekStart: "2026-11-01",
  });

  assert.deepEqual(layouts, [{ dayIndex: 0, endMinute: 150, startMinute: 90 }]);
});

test("layoutCalendarIntervals clips an overnight interval to each visible local day", () => {
  const layouts = layoutCalendarIntervals({
    intervals: [{ startsAt: "2026-10-27T03:30:00.000Z", endsAt: "2026-10-27T05:30:00.000Z" }],
    timeZone: "America/New_York",
    weekStart: "2026-10-25",
  });

  assert.deepEqual(layouts, [
    { dayIndex: 1, endMinute: 1440, startMinute: 1410 },
    { dayIndex: 2, endMinute: 90, startMinute: 0 },
  ]);
});

test("calendarTimeMinute accepts the PostgreSQL time string returned for owner-week working hours", () => {
  assert.equal(calendarTimeMinute("09:00:00"), 540);
  assert.equal(calendarTimeMinute("17:30:00"), 1050);
  assert.equal(calendarTimeMinute("09:00:61"), null);
});
