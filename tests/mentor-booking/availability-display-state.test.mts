import assert from "node:assert/strict";
import test from "node:test";

import { availabilityBlocksForDisplay, hasAvailabilityBlocks } from "../../src/mentor-booking/availability-display-state.ts";

const empty = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } as const;
const monday = { ...empty, monday: ["09:00", "09:15"] } as const;

test("uses confirmed client availability when the refreshed workspace has no visible rows", () => {
  assert.deepEqual(availabilityBlocksForDisplay(empty, monday), monday);
});

test("prefers rows returned by the workspace and preserves an intentional empty confirmed save", () => {
  assert.deepEqual(availabilityBlocksForDisplay(monday, empty), monday);
  assert.deepEqual(availabilityBlocksForDisplay(empty, empty), empty);
  assert.equal(hasAvailabilityBlocks(empty), false);
  assert.equal(hasAvailabilityBlocks(monday), true);
});
