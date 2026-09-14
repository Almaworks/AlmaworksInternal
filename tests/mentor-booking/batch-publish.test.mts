import assert from "node:assert/strict";
import test from "node:test";

import { publishMentorBookingBatch } from "../../src/mentor-booking/batch-publish.ts";

const slots = [
  { startsAt: "2026-09-06T13:00:00.000Z", endsAt: "2026-09-06T13:30:00.000Z", duplicate: false },
  { startsAt: "2026-09-06T14:00:00.000Z", endsAt: "2026-09-06T14:30:00.000Z", duplicate: true },
  { startsAt: "2026-09-06T15:00:00.000Z", endsAt: "2026-09-06T15:30:00.000Z", duplicate: true },
] as const;

test("publishes every preview slot with bounded concurrency and separates duplicate outcomes", async () => {
  let inFlight = 0;
  let maximumInFlight = 0;
  const result = await publishMentorBookingBatch(slots, async (slot) => {
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    if (slot.startsAt === slots[2].startsAt) throw new Error("That availability changed.");
  }, 2);
  assert.equal(maximumInFlight, 2);
  assert.equal(result.successes.length, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.duplicateSuccesses, 1);
  assert.equal(result.duplicateFailures, 1);
  assert.equal(result.failures[0]?.message, "That availability changed.");
});
