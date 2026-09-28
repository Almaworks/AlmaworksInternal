export interface CalendarViewInterval {
  endsAt: string;
  startsAt: string;
}

export interface CalendarIntervalLayout {
  dayIndex: number;
  endMinute: number;
  startMinute: number;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function validDate(value: string): void {
  const match = DATE.exec(value);
  if (!match) throw new Error("Week start must be a calendar date.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw new Error("Week start must be a valid calendar date.");
}

function addDays(date: string, days: number): string {
  validDate(date);
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  let value = dateTimeFormatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    dateTimeFormatters.set(timeZone, value);
  }
  return value;
}

function localDateTime(value: string, timeZone: string): { date: string; minute: number } {
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new Error("Calendar interval must use ISO timestamps.");
  const parts = formatter(timeZone).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find(item => item.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, minute: Number(part("hour")) * 60 + Number(part("minute")) };
}

export function shiftCalendarWeek(weekStart: string, weeks: number): string {
  if (!Number.isInteger(weeks)) throw new Error("Week movement must be whole weeks.");
  return addDays(weekStart, weeks * 7);
}

export function calendarWeekStart(date: string): string {
  validDate(date);
  return addDays(date, -new Date(`${date}T12:00:00Z`).getUTCDay());
}

/** Keep the displayed week within the first and last weeks of a cohort. */
export function cohortCalendarWeek(weekStart: string, semesterStart: string, semesterEnd: string): string {
  const first = calendarWeekStart(semesterStart), last = calendarWeekStart(semesterEnd);
  return weekStart < first ? first : weekStart > last ? last : weekStart;
}

export function dateInCohort(date: string, semesterStart: string, semesterEnd: string): boolean {
  return date >= semesterStart && date <= semesterEnd;
}

/** Parses browser HH:mm and PostgreSQL time HH:mm:ss values used by the weekly grid. */
export function calendarTimeMinute(value: string): number | null {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(value);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]), second = match[3] === undefined ? 0 : Number(match[3]);
  return hour < 24 && minute < 60 && second < 60 ? hour * 60 + minute : null;
}

export function calendarWeek(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/** Converts absolute intervals to local, clipped day segments for a weekly grid. */
export function layoutCalendarIntervals(input: { intervals: readonly CalendarViewInterval[]; timeZone: string; weekStart: string }): CalendarIntervalLayout[] {
  const dates = calendarWeek(input.weekStart);
  const layouts: CalendarIntervalLayout[] = [];
  for (const interval of input.intervals) {
    const startsAt = Date.parse(interval.startsAt);
    const endsAt = Date.parse(interval.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) continue;
    const start = localDateTime(interval.startsAt, input.timeZone);
    const end = localDateTime(interval.endsAt, input.timeZone);
    for (let date = start.date; date <= end.date; date = addDays(date, 1)) {
      const dayIndex = dates.indexOf(date);
      if (dayIndex < 0) continue;
      const startMinute = date === start.date ? start.minute : 0;
      const endMinute = date === end.date ? end.minute : 1440;
      if (endMinute > startMinute) layouts.push({ dayIndex, startMinute, endMinute });
    }
  }
  return layouts;
}
