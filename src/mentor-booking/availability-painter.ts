import type { BatchWeekday } from "./batch-slots.ts";
import { isFridayInPersonMeetingTime } from "./availability-reservations.ts";

export type AvailabilityPaintIntent = "add" | "remove";
export type AvailabilityBlocks = Record<BatchWeekday, readonly string[]>;

const DAYS: readonly BatchWeekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const KEY_SEPARATOR = "\u0000";

export function availabilityPaintKey(day: BatchWeekday, time: string) {
  return `${day}${KEY_SEPARATOR}${time}`;
}

export function availabilityKeysFromBlocks(blocks: AvailabilityBlocks) {
  return new Set(DAYS.flatMap((day) => blocks[day]
    .filter((time) => !isFridayInPersonMeetingTime(day, time))
    .map((time) => availabilityPaintKey(day, time))));
}

export function applyAvailabilityPaint(keys: Set<string>, day: BatchWeekday, time: string, intent: AvailabilityPaintIntent) {
  const key = availabilityPaintKey(day, time);
  if (intent === "add") {
    if (isFridayInPersonMeetingTime(day, time)) return false;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  }
  return keys.delete(key);
}

export function availabilityBlocksFromKeys(keys: ReadonlySet<string>): AvailabilityBlocks {
  const result: Record<BatchWeekday, string[]> = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
  for (const key of keys) {
    const separator = key.indexOf(KEY_SEPARATOR);
    if (separator === -1) continue;
    const day = key.slice(0, separator) as BatchWeekday;
    const time = key.slice(separator + KEY_SEPARATOR.length);
    if (DAYS.includes(day) && !isFridayInPersonMeetingTime(day, time)) result[day].push(time);
  }
  for (const day of DAYS) result[day].sort();
  return result;
}
