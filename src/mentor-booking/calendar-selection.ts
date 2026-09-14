import { buildMentorBookingBatch, type BatchWeekday, type MentorBookingBatchPreview } from "./batch-slots.ts";

export type CalendarWeekday = BatchWeekday;
export type CalendarBlocks = Record<CalendarWeekday, readonly string[]>;

export interface CalendarSelectionInput {
  existingWindows: readonly { endsAt: string; startsAt: string }[];
  rangeEnd: string;
  rangeStart: string;
  selectedBlocks: CalendarBlocks;
  timeZone: string;
}

const WEEKDAYS: CalendarWeekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function minutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/u.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error("Calendar blocks must be valid local HH:MM times.");
  return Number(match[1]) * 60 + Number(match[2]);
}

function time(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }

export function buildCalendarSelectionBatch(input: CalendarSelectionInput): MentorBookingBatchPreview {
  const previews: MentorBookingBatchPreview[] = [];
  for (const weekday of WEEKDAYS) {
    const values = [...input.selectedBlocks[weekday]].map(minutes).sort((left, right) => left - right);
    for (let index = 0; index < values.length;) {
      const start = values[index]!;
      let end = start + 15;
      index += 1;
      while (values[index] === end) { end += 15; index += 1; }
      previews.push(buildMentorBookingBatch({ rangeStart: input.rangeStart, rangeEnd: input.rangeEnd, weekdays: [weekday], dailyStart: time(start), dailyEnd: time(end), durationMinutes: 15, bufferMinutes: 0, timeZone: input.timeZone, existingWindows: input.existingWindows }));
    }
  }
  const slots = previews.flatMap((preview) => preview.slots);
  return { slots, duplicateCount: slots.filter((slot) => slot.duplicate).length, ineligibleCount: 0, invalidCount: previews.reduce((total, preview) => total + preview.invalidCount, 0) };
}
