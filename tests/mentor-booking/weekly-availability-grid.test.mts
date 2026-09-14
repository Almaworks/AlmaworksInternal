import assert from "node:assert/strict";
import test from "node:test";

import { calendarBlocksFromWeeklyAvailability } from "../../src/mentor-booking/weekly-availability-grid.ts";

test("hydrates the signed-in mentor's saved weekly availability when no page-level mentor id is supplied", () => {
  const blocks = calendarBlocksFromWeeklyAvailability([
    { mentorSemesterId: "mentor-self", weekday: 1, startsAt: "09:00", endsAt: "09:30" },
    { mentorSemesterId: "another-mentor", weekday: 2, startsAt: "10:00", endsAt: "10:15" },
  ], "mentor-self");

  assert.deepEqual(blocks, {
    monday: ["09:00", "09:15"], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
  });
});

test("finds the signed-in mentor from the returned availability when the viewer has no readable mentor-semester id", () => {
  const blocks = calendarBlocksFromWeeklyAvailability([
    { mentorSemesterId: "mentor-self", mentor: { profileId: "profile-self" }, weekday: 1, startsAt: "09:00", endsAt: "09:30" },
    { mentorSemesterId: "another-mentor", mentor: { profileId: "profile-other" }, weekday: 2, startsAt: "10:00", endsAt: "10:15" },
  ], null, "profile-self");

  assert.deepEqual(blocks, {
    monday: ["09:00", "09:15"], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
  });
});

test("accepts database time values with seconds when building calendar blocks", () => {
  const blocks = calendarBlocksFromWeeklyAvailability([{
    mentorSemesterId: "m1", weekday: 1, startsAt: "08:00:00", endsAt: "09:00:00",
  }], "m1");

  assert.deepEqual(blocks.monday, ["08:00", "08:15", "08:30", "08:45"]);
});
