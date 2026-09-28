import assert from "node:assert/strict";
import test from "node:test";

import { weeklyAvailabilityForProfile } from "../../src/dashboard/participant-availability.ts";

test("matches a mentor's weekly availability when Supabase returns nested relations as arrays", () => {
  const ranges = weeklyAvailabilityForProfile([
    {
      weekday: 1,
      starts_at: "11:15:00",
      ends_at: "12:00:00",
      mentor_semesters: [{ semester_memberships: [{ profile_id: "layth" }] }],
    },
  ], "layth");

  assert.deepEqual(ranges, [{ weekday: 1, startsAt: "11:15:00", endsAt: "12:00:00" }]);
});
