import { currentCalendarWeek } from "./startup-availability.ts";
import { availabilityPaintKey } from "./availability-painter.ts";
import type { MentorBookingRequest } from "./types.ts";

const weekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function localParts(value: Date, timeZone: string): { date: string; day: typeof weekday[number]; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const dayIndex = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, day: weekday[dayIndex]!, time: `${part("hour")}:${part("minute")}` };
}

export function mentorBookedCells(input: { requests: readonly MentorBookingRequest[]; now: Date; timeZone: string }): Map<string, string> {
  const week = currentCalendarWeek(input.now, input.timeZone);
  const result = new Map<string, string>();
  for (const request of input.requests) {
    if (request.status !== "accepted" || Date.parse(request.endsAt) <= input.now.getTime()) continue;
    for (let instant = Date.parse(request.startsAt); instant < Date.parse(request.endsAt); instant += 15 * 60 * 1000) {
      const local = localParts(new Date(instant), input.timeZone);
      if (local.date < week.startDate || local.date > week.endDate) continue;
      result.set(availabilityPaintKey(local.day, local.time), request.startup.name);
    }
  }
  return result;
}
