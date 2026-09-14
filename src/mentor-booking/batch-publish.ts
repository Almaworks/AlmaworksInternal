import type { MentorBookingBatchSlot } from "./batch-slots.ts";

export interface MentorBookingBatchFailure {
  message: string;
  slot: MentorBookingBatchSlot;
}

export interface MentorBookingBatchPublishResult {
  duplicateFailures: number;
  duplicateSuccesses: number;
  failures: MentorBookingBatchFailure[];
  successes: MentorBookingBatchSlot[];
}

export async function publishMentorBookingBatch(
  slots: readonly MentorBookingBatchSlot[],
  publish: (slot: MentorBookingBatchSlot) => Promise<void>,
  concurrency = 4,
): Promise<MentorBookingBatchPublishResult> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("Batch concurrency must be a positive whole number.");
  const successes: MentorBookingBatchSlot[] = [];
  const failures: MentorBookingBatchFailure[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < slots.length) {
      const slot = slots[next++];
      if (!slot) return;
      try { await publish(slot); successes.push(slot); }
      catch (cause) { failures.push({ slot, message: cause instanceof Error ? cause.message : "Window could not be published." }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, slots.length) }, () => worker()));
  return {
    successes,
    failures,
    duplicateSuccesses: successes.filter((slot) => slot.duplicate).length,
    duplicateFailures: failures.filter((failure) => failure.slot.duplicate).length,
  };
}
