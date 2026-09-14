export const MAX_BATCH_WINDOWS = 100;

export type BatchWeekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export interface MentorBookingBatchInput {
  bufferMinutes: number;
  dailyEnd: string;
  dailyStart: string;
  durationMinutes: number;
  existingWindows: readonly { endsAt: string; startsAt: string }[];
  rangeEnd: string;
  rangeStart: string;
  timeZone: string;
  weekdays: readonly BatchWeekday[];
}

export interface MentorBookingBatchSlot {
  duplicate: boolean;
  endsAt: string;
  startsAt: string;
}

export interface MentorBookingBatchPreview {
  duplicateCount: number;
  ineligibleCount: number;
  invalidCount: number;
  slots: MentorBookingBatchSlot[];
}

export interface WeeklyPlannerDay {
  disabled: boolean;
  id: BatchWeekday;
  selected: boolean;
}

export interface WeeklyPlanner {
  days: WeeklyPlannerDay[];
  timeRows: string[];
}

const WEEKDAYS: readonly BatchWeekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/u;

function error(message: string): never { throw new Error(message); }

function dateParts(value: string, field: string): { day: number; month: number; year: number } {
  const match = DATE_PATTERN.exec(value);
  if (!match) return error(`${field} must be a calendar date.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return error(`${field} must be a valid calendar date.`);
  return { year, month, day };
}

function minutes(value: string, field: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) return error(`${field} must be HH:MM.`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return error(`${field} must be a valid local time.`);
  return hour * 60 + minute;
}

export function buildWeeklyPlanner(input: Pick<MentorBookingBatchInput, "bufferMinutes" | "dailyEnd" | "dailyStart" | "durationMinutes" | "weekdays">): WeeklyPlanner {
  const start = minutes(input.dailyStart, "Daily start");
  const end = minutes(input.dailyEnd, "Daily end");
  if (end <= start) error("Daily end must be after daily start.");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) error("Meeting duration must be a positive whole number of minutes.");
  if (!Number.isInteger(input.bufferMinutes) || input.bufferMinutes < 0) error("Buffer must be a whole number of minutes.");
  const timeRows: string[] = [];
  for (let value = start; value + input.durationMinutes <= end; value += input.durationMinutes + input.bufferMinutes) {
    timeRows.push(`${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`);
  }
  return { days: WEEKDAYS.map((id) => ({ id, disabled: false, selected: input.weekdays.includes(id) })), timeRows };
}

function validZone(timeZone: string): void {
  try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); } catch { error("Semester timezone is invalid."); }
}

function offsetAt(instant: number, timeZone: string): number {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(new Date(instant)).find((item) => item.type === "timeZoneName")?.value;
  if (!part || part === "GMT") return 0;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/u.exec(part);
  if (!match) return error("Semester timezone offset could not be resolved.");
  const value = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "+" ? value * 60_000 : -value * 60_000;
}

function localParts(instant: number, timeZone: string): { day: number; hour: number; minute: number; month: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const number = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value);
  return { year: number("year"), month: number("month"), day: number("day"), hour: number("hour"), minute: number("minute") };
}

function zonedInstant(date: { day: number; month: number; year: number }, minuteOfDay: number, timeZone: string): number {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const localMs = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const offsets = new Set<number>();
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 30) offsets.add(offsetAt(localMs + offset * 60_000, timeZone));
  const candidates = [...offsets].map((zoneOffset) => localMs - zoneOffset).filter((candidate) => {
    const resolved = localParts(candidate, timeZone);
    return resolved.year === date.year && resolved.month === date.month && resolved.day === date.day && resolved.hour === hour && resolved.minute === minute;
  }).sort((left, right) => left - right);
  if (candidates.length === 0) return error(`The local time ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} does not exist in ${timeZone} on this date.`);
  return candidates[0]!;
}

export function buildMentorBookingBatch(input: MentorBookingBatchInput): MentorBookingBatchPreview {
  validZone(input.timeZone);
  const startDate = dateParts(input.rangeStart, "Range start");
  const endDate = dateParts(input.rangeEnd, "Range end");
  const startDay = Date.UTC(startDate.year, startDate.month - 1, startDate.day);
  const endDay = Date.UTC(endDate.year, endDate.month - 1, endDate.day);
  if (endDay < startDay) error("Range end must not be before range start.");
  if (input.weekdays.length === 0) error("Choose at least one weekday.");
  const dailyStart = minutes(input.dailyStart, "Daily start");
  const dailyEnd = minutes(input.dailyEnd, "Daily end");
  if (dailyEnd <= dailyStart) error("Daily end must be after daily start.");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) error("Meeting duration must be a positive whole number of minutes.");
  if (!Number.isInteger(input.bufferMinutes) || input.bufferMinutes < 0) error("Buffer must be a whole number of minutes.");
  const selected = new Set(input.weekdays);
  const duplicateKeys = new Set(input.existingWindows.map((window) => `${window.startsAt}/${window.endsAt}`));
  const slots: MentorBookingBatchSlot[] = [];
  let invalidCount = 0;
  for (let day = startDay; day <= endDay; day += 86_400_000) {
    const current = new Date(day);
    const date = { year: current.getUTCFullYear(), month: current.getUTCMonth() + 1, day: current.getUTCDate() };
    if (!selected.has(WEEKDAYS[current.getUTCDay()]!)) continue;
    for (let slotStart = dailyStart; slotStart + input.durationMinutes <= dailyEnd; slotStart += input.durationMinutes + input.bufferMinutes) {
      let startsAt: string;
      let endsAt: string;
      try {
        startsAt = new Date(zonedInstant(date, slotStart, input.timeZone)).toISOString();
        endsAt = new Date(zonedInstant(date, slotStart + input.durationMinutes, input.timeZone)).toISOString();
      } catch { invalidCount += 1; continue; }
      slots.push({ startsAt, endsAt, duplicate: duplicateKeys.has(`${startsAt}/${endsAt}`) });
      if (slots.length > MAX_BATCH_WINDOWS) error(`This batch creates more than ${MAX_BATCH_WINDOWS} windows. Narrow the range or choose fewer days.`);
    }
  }
  if (slots.length === 0 && invalidCount === 0) error("This selection creates no slots. Choose an included weekday and a longer daily range.");
  return { slots, duplicateCount: slots.filter((slot) => slot.duplicate).length, ineligibleCount: 0, invalidCount };
}
