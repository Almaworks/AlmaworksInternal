import assert from "node:assert/strict";
import test from "node:test";

import { buildCalendarSelectionBatch } from "../../src/mentor-booking/calendar-selection.ts";

test("turns each weekday's selected 15-minute blocks into concrete booking windows", () => {
  const result = buildCalendarSelectionBatch({
    rangeStart: "2026-09-07", rangeEnd: "2026-09-13", timeZone: "America/New_York", existingWindows: [],
    selectedBlocks: { monday: ["09:00", "09:15"], tuesday: ["13:00"], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] },
  });
  assert.deepEqual(result.slots.map((slot) => [slot.startsAt, slot.endsAt]), [
    ["2026-09-07T13:00:00.000Z", "2026-09-07T13:15:00.000Z"],
    ["2026-09-07T13:15:00.000Z", "2026-09-07T13:30:00.000Z"],
    ["2026-09-08T17:00:00.000Z", "2026-09-08T17:15:00.000Z"],
  ]);
});

test("includes mentor availability selected during the former Friday Program window", () => {
  const input = { rangeStart: "2026-09-07", rangeEnd: "2026-09-13", timeZone: "America/New_York", existingWindows: [], selectedBlocks: { monday: [], tuesday: [], wednesday: [], thursday: [], friday: ["15:00"], saturday: [], sunday: [] } };

  assert.deepEqual(buildCalendarSelectionBatch(input).slots.map((slot) => [slot.startsAt, slot.endsAt]), [
    ["2026-09-11T19:00:00.000Z", "2026-09-11T19:15:00.000Z"],
  ]);
});
