import assert from "node:assert/strict";
import test from "node:test";

import { mapWithConcurrency } from "../../src/sessions/bounded-concurrency.ts";

test("mapWithConcurrency limits in-flight work and preserves input order", async () => {
  let active = 0;
  let maximumActive = 0;

  const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await Promise.resolve();
    active -= 1;
    return value * 10;
  });

  assert.equal(maximumActive, 3);
  assert.deepEqual(results, [10, 20, 30, 40, 50, 60, 70]);
});
