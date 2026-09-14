import assert from "node:assert/strict";
import test from "node:test";

import { buildWeeklyPlanner } from "../../src/mentor-booking/batch-slots.ts";

test("weekly planner creates compact local time rows and keeps Friday available for the calendar to block its program interval", () => {
  const planner = buildWeeklyPlanner({ dailyStart: "09:00", dailyEnd: "10:30", durationMinutes: 30, bufferMinutes: 15, weekdays: ["monday", "thursday"] });

  assert.deepEqual(planner.timeRows, ["09:00", "09:45"]);
  assert.equal(planner.days.find((day) => day.id === "friday")?.disabled, false);
  assert.equal(planner.days.find((day) => day.id === "monday")?.selected, true);
  assert.equal(planner.days.find((day) => day.id === "thursday")?.selected, true);
  assert.equal(planner.days.find((day) => day.id === "tuesday")?.selected, false);
});
