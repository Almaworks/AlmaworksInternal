import type { AvailabilityInput, CalendarInterval, EffectiveAvailability } from "./types.ts";

export const CALENDAR_SLOT_MS = 15 * 60_000;
export const CALENDAR_MAX_STALE_MS = 15 * 60_000;
export const CALENDAR_HORIZON_DAYS = 90;
type Range = { start: number; end: number };
const explicitInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;

function validDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Invalid calendar date.");
}
function instant(value: string): number {
  if (!explicitInstant.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid calendar interval timestamp; an explicit timezone is required.");
  validDate(value.slice(0, 10));
  return Date.parse(value);
}
function range(value: CalendarInterval): Range {
  const start = instant(value.startsAt), end = instant(value.endsAt);
  if (end <= start) throw new Error("Calendar interval end must follow its start.");
  return { start, end };
}
function external(value: Range): CalendarInterval {
  return { startsAt: new Date(value.start).toISOString(), endsAt: new Date(value.end).toISOString() };
}
function merge(values: readonly Range[]): Range[] {
  const result: Range[] = [];
  for (const current of [...values].sort((a, b) => a.start - b.start)) {
    const previous = result.at(-1);
    if (previous && current.start <= previous.end) previous.end = Math.max(previous.end, current.end);
    else result.push({ ...current });
  }
  return result;
}
export function mergeIntervals(values: readonly CalendarInterval[]): CalendarInterval[] {
  return merge(values.map(range)).map(external);
}
function clockMinute(value: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value) && value !== "24:00") throw new Error("Working hours must be valid HH:MM times.");
  const minutes = Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  if (minutes % 15) throw new Error("Working hours must align to 15-minute boundaries.");
  return minutes;
}
function localReader(timeZone: string) {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return (value: number) => {
    const parts = format.formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
    const date = `${part("year")}-${part("month")}-${part("day")}`;
    return { date, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), minute: Number(part("hour")) * 60 + Number(part("minute")) };
  };
}
function contains(ranges: readonly Range[], slot: Range): boolean {
  return ranges.some(r => r.start <= slot.start && r.end >= slot.end);
}
function overlaps(ranges: readonly Range[], slot: Range): boolean {
  return ranges.some(r => r.start < slot.end && r.end > slot.start);
}

/** Pure reference projection. The database must enforce equivalent checks on writes. */
export function effectiveAvailability(input: AvailabilityInput): EffectiveAvailability {
  const selected = range(input.range), now = instant(input.now);
  if (selected.end - selected.start > CALENDAR_HORIZON_DAYS * 86_400_000) throw new Error("Calendar range cannot exceed 90 days.");
  validDate(input.semesterStartDate); validDate(input.semesterEndDate);
  if (input.semesterEndDate < input.semesterStartDate) throw new Error("Semester date range is reversed.");
  if (!["weekly", "manual", "synced"].includes(input.mode)) throw new Error("Unknown calendar availability mode.");
  const local = localReader(input.timeZone), program = localReader(input.programTimeZone);
  const hours = input.workingHours.map(h => {
    const start = clockMinute(h.startsAt), end = clockMinute(h.endsAt);
    if (!Number.isInteger(h.weekday) || h.weekday < 0 || h.weekday > 6 || end <= start) throw new Error("Invalid working hours.");
    return { weekday: h.weekday, start, end };
  });
  const additions = merge(input.overrides.filter(o => o.available).map(range));
  const exclusions = merge([...input.overrides.filter(o => !o.available), ...input.acceptedBookings].map(range));
  const manual = merge(input.manualSlots.map(range));
  let coverage: Range | null = null;
  let busy: Range[] = [];
  let status: EffectiveAvailability["status"] = "ready";
  if (input.mode === "synced") {
    if (!input.snapshot || input.syncUnavailable) return { slots: [], status: "sync_required" };
    const fetched = instant(input.snapshot.fetchedAt);
    coverage = range(input.snapshot);
    busy = merge(input.snapshot.busy.map(range));
    if (fetched > now || now - fetched > CALENDAR_MAX_STALE_MS) return { slots: [], status: "sync_required" };
    if (!contains([coverage], { start: Math.max(now, selected.start), end: selected.end })) status = "partial_coverage";
  }
  const slots: CalendarInterval[] = [];
  // Iterate real instants, so both fall-back occurrences exist and spring gaps do not.
  for (let start = Math.ceil(Math.max(selected.start, now) / CALENDAR_SLOT_MS) * CALENDAR_SLOT_MS; start + CALENDAR_SLOT_MS <= selected.end; start += CALENDAR_SLOT_MS) {
    const slot = { start, end: start + CALENDAR_SLOT_MS };
    const programStart = program(start), programEnd = program(slot.end - 1);
    if (programStart.date < input.semesterStartDate || programEnd.date > input.semesterEndDate) continue;
    const reserved = (p: ReturnType<typeof program>) => p.weekday === 5 && p.minute >= 15 * 60 && p.minute < 17 * 60;
    if (reserved(programStart) || reserved(programEnd) || overlaps(exclusions, slot)) continue;
    if (coverage && (!contains([coverage], slot) || overlaps(busy, slot))) continue;
    const from = local(start), to = local(slot.end - 1);
    const working = hours.some(h => from.weekday === h.weekday && from.date === to.date && from.minute >= h.start && from.minute < h.end && to.minute >= h.start && to.minute < h.end);
    const offered = input.mode === "manual" ? contains(manual, slot) : working;
    if (offered || contains(additions, slot)) slots.push(external(slot));
  }
  return { slots, status };
}

/** Freeze only a complete, fresh sync result; never turn a provider failure into a snapshot. */
export function snapshotAvailability(input: AvailabilityInput): CalendarInterval[] {
  const projected = effectiveAvailability(input);
  if (input.mode !== "synced" || projected.status !== "ready") throw new Error("A fresh complete Google snapshot is required before switching to manual availability.");
  return mergeIntervals(projected.slots);
}
