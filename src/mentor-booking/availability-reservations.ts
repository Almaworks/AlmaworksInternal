import type { BatchWeekday } from "./batch-slots.ts";

export const FRIDAY_IN_PERSON_MEETING_LABEL = "Reserved for in-person meetings";

function clockMinutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

export function isFridayInPersonMeetingTime(day: BatchWeekday, time: string): boolean {
  if (day !== "friday") return false;
  const minutes = clockMinutes(time);
  return minutes >= 15 * 60 && minutes < 17 * 60;
}
