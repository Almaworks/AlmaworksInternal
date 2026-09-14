import { buildMentorBookingBatch, type BatchWeekday } from "./batch-slots.ts";
import { isFridayInPersonMeetingTime } from "./availability-reservations.ts";
import type { MentorBookingAcceptedOccupancy, MentorWeeklyAvailability } from "./types.ts";

export interface StartupBookingSlot {
  endsAt: string;
  mentor: MentorWeeklyAvailability["mentor"];
  mentorSemesterId: string;
  startsAt: string;
}

export interface StartupBookingSlotsInput {
  acceptedOccupancy?: readonly MentorBookingAcceptedOccupancy[];
  availability: readonly MentorWeeklyAvailability[];
  now: Date;
  semesterEndDate: string;
  semesterStartDate: string;
  timeZone: string;
  weekOffset?: number;
}

export interface CalendarWeek {
  dates: string[];
  endDate: string;
  label: string;
  startDate: string;
}

const weekdays: readonly BatchWeekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function localDate(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, count: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + count);
  return next.toISOString().slice(0, 10);
}

function calendarDate(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function calendarWeekLabel(startDate: string, endDate: string): string {
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  const startMonth = startDate.slice(5, 7);
  const endMonth = endDate.slice(5, 7);
  if (startYear !== endYear) return `${calendarDate(startDate, { month: "short", day: "numeric", year: "numeric" })} - ${calendarDate(endDate, { month: "short", day: "numeric", year: "numeric" })}`;
  if (startMonth !== endMonth) return `${calendarDate(startDate, { month: "short", day: "numeric" })} - ${calendarDate(endDate, { month: "short", day: "numeric", year: "numeric" })}`;
  return `${calendarDate(startDate, { month: "short", day: "numeric" })} - ${Number(endDate.slice(8, 10))}, ${endYear}`;
}

export function currentCalendarWeek(now: Date, timeZone: string, weekOffset = 0): CalendarWeek {
  const today = localDate(now, timeZone);
  const sunday = addDays(today, -new Date(`${today}T12:00:00Z`).getUTCDay() + weekOffset * 7);
  const dates = Array.from({ length: 7 }, (_, index) => addDays(sunday, index));
  const endDate = dates[6]!;
  return { dates, endDate, label: calendarWeekLabel(sunday, endDate), startDate: sunday };
}

function boundedStart(semesterStartDate: string, now: Date, timeZone: string, weekOffset: number): string {
  const selectedWeekStart = currentCalendarWeek(now, timeZone, weekOffset).startDate;
  return selectedWeekStart > semesterStartDate ? selectedWeekStart : semesterStartDate;
}

function localTime(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("hour")}:${part("minute")}`;
}

export function startupBookingSlots(input: StartupBookingSlotsInput): StartupBookingSlot[] {
  const weekOffset = Math.max(0, Math.trunc(input.weekOffset ?? 0));
  const selectedWeek = currentCalendarWeek(input.now, input.timeZone, weekOffset);
  const rangeStart = boundedStart(input.semesterStartDate, input.now, input.timeZone, weekOffset);
  if (rangeStart > input.semesterEndDate) return [];
  const rangeEnd = input.semesterEndDate < selectedWeek.endDate ? input.semesterEndDate : selectedWeek.endDate;
  if (rangeStart > rangeEnd) return [];
  const after = input.now.getTime();
  const dates: string[] = [];
  for (let date = rangeStart; date <= rangeEnd; date = addDays(date, 1)) dates.push(date);
  const acceptedOccupancy = input.acceptedOccupancy ?? [];
  return input.availability.flatMap((availability) => dates.flatMap((date) => {
    if (weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()] !== weekdays[availability.weekday]) return [];
    const weekday = weekdays[availability.weekday]!;
    return buildMentorBookingBatch({ rangeStart: date, rangeEnd: date, timeZone: input.timeZone, weekdays: [weekday], dailyStart: availability.startsAt.slice(0, 5), dailyEnd: availability.endsAt.slice(0, 5), durationMinutes: 15, bufferMinutes: 0, existingWindows: [] }).slots
      .filter((slot) => !isFridayInPersonMeetingTime(weekday, localTime(slot.startsAt, input.timeZone)))
      .filter((slot) => !acceptedOccupancy.some((occupancy) => occupancy.mentorSemesterId === availability.mentorSemesterId
        && Date.parse(occupancy.endsAt) > after
        && Date.parse(occupancy.startsAt) < Date.parse(slot.endsAt)
        && Date.parse(occupancy.endsAt) > Date.parse(slot.startsAt)));
  }).filter((slot) => Date.parse(slot.startsAt) > after).map((slot) => ({ mentor: availability.mentor, mentorSemesterId: availability.mentorSemesterId, startsAt: slot.startsAt, endsAt: slot.endsAt }))).sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
}
