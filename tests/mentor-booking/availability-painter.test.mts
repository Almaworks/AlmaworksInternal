import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAvailabilityPaint,
  availabilityBlocksFromKeys,
  availabilityKeysFromBlocks,
  availabilityPaintKey,
} from "../../src/mentor-booking/availability-painter.ts";

test("availability painter keeps drag changes locally, deduplicated, until it snapshots them", () => {
  const keys = availabilityKeysFromBlocks({ monday: ["09:00"], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });

  assert.equal(applyAvailabilityPaint(keys, "monday", "09:15", "add"), true);
  assert.equal(applyAvailabilityPaint(keys, "monday", "09:15", "add"), false);
  assert.equal(keys.has(availabilityPaintKey("monday", "09:15")), true);
  assert.equal(applyAvailabilityPaint(keys, "monday", "09:00", "remove"), true);

  assert.deepEqual(availabilityBlocksFromKeys(keys), {
    monday: ["09:15"], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
  });
});

test("availability painter snapshot sorts each day without changing days", () => {
  const keys = new Set([availabilityPaintKey("wednesday", "10:15"), availabilityPaintKey("wednesday", "09:45")]);

  assert.deepEqual(availabilityBlocksFromKeys(keys), {
    monday: [], tuesday: [], wednesday: ["09:45", "10:15"], thursday: [], friday: [], saturday: [], sunday: [],
  });
});

test("Friday in-person meeting cells from 3 PM through 4:45 PM cannot be added or restored", () => {
  const keys = availabilityKeysFromBlocks({
    monday: [], tuesday: [], wednesday: [], thursday: [],
    friday: ["14:45", "15:00", "16:45", "17:00"],
    saturday: [], sunday: [],
  });

  assert.equal(keys.has(availabilityPaintKey("friday", "14:45")), true);
  assert.equal(keys.has(availabilityPaintKey("friday", "15:00")), false);
  assert.equal(keys.has(availabilityPaintKey("friday", "16:45")), false);
  assert.equal(keys.has(availabilityPaintKey("friday", "17:00")), true);
  assert.equal(applyAvailabilityPaint(keys, "friday", "15:00", "add"), false);
  assert.equal(applyAvailabilityPaint(keys, "friday", "16:45", "add"), false);
});
