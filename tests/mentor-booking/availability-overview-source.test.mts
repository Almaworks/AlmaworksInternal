import assert from "node:assert/strict";
import test from "node:test";

import { availabilityOverviewSource } from "../../src/mentor-booking/availability-overview-source.ts";

test("uses the booking workspace availability for the signed-in mentor when the dashboard response is empty", () => {
  const result = availabilityOverviewSource([], [
    { mentor: { profileId: "other" }, mentorSemesterId: "other-term", weekday: 2, startsAt: "09:00", endsAt: "10:00" },
    { mentor: { profileId: "layth" }, mentorSemesterId: "layth-term", weekday: 1, startsAt: "11:15", endsAt: "12:00" },
  ], "layth");

  assert.deepEqual(result, [{ weekday: 1, startsAt: "11:15", endsAt: "12:00" }]);
});
