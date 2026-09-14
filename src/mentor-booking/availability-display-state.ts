import type { CalendarBlocks } from "./calendar-selection.ts";

export function hasAvailabilityBlocks(blocks: CalendarBlocks) {
  return Object.values(blocks).some((times) => times.length > 0);
}

export function availabilityBlocksForDisplay(serverBlocks: CalendarBlocks, confirmedBlocks: CalendarBlocks | null) {
  return hasAvailabilityBlocks(serverBlocks) || confirmedBlocks === null ? serverBlocks : confirmedBlocks;
}
