"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { mergeIntervals } from "@/src/calendar/availability";
import { calendarTimeMinute, calendarWeek, calendarWeekStart, cohortCalendarWeek, dateInCohort, layoutCalendarIntervals, shiftCalendarWeek, type CalendarViewInterval } from "@/src/calendar/calendar-view-model";
import { isFridayInPersonMeetingTime } from "@/src/mentor-booking/availability-reservations";
import { applyWeeklyDraftStroke } from "@/src/calendar/weekly-draft";

type CalendarMode = "weekly" | "synced" | "manual";
type CalendarView = {
  bookings: CalendarViewInterval[];
  busy: CalendarViewInterval[];
  lastSuccessAt: string | null;
  mode: CalendarMode;
  semesterEnd: string;
  semesterStart: string;
  slots: CalendarViewInterval[];
  syncUnavailable: boolean;
  timeZone: string;
  weekStart: string;
  workingHours: { endsAt: string; startsAt: string; weekday: number }[];
};

type BlockKind = "available" | "booking" | "busy";
const kinds: Record<BlockKind, { className: string; label: string }> = {
  available: { className: "border-emerald-500 bg-emerald-200/90 text-emerald-950", label: "Available to book" },
  booking: { className: "border-violet-600 bg-violet-300/90 text-violet-950", label: "Accepted booking or program reservation" },
  busy: { className: "border-slate-500 bg-slate-400/90 text-slate-950", label: "Google Calendar busy" },
};

function isInterval(value: unknown): value is CalendarViewInterval {
  return !!value && typeof value === "object" && "startsAt" in value && "endsAt" in value && typeof value.startsAt === "string" && typeof value.endsAt === "string" && Number.isFinite(Date.parse(value.startsAt)) && Number.isFinite(Date.parse(value.endsAt)) && Date.parse(value.endsAt) > Date.parse(value.startsAt);
}

function parseView(value: unknown): CalendarView {
  if (!value || typeof value !== "object") throw new Error("Calendar view could not be loaded.");
  const view = value as Record<string, unknown>;
  const strings = ["weekStart", "timeZone", "semesterStart", "semesterEnd"] as const;
  if (strings.some(key => typeof view[key] !== "string") || !["weekly", "synced", "manual"].includes(String(view.mode)) || (view.lastSuccessAt !== null && typeof view.lastSuccessAt !== "string") || typeof view.syncUnavailable !== "boolean") throw new Error("Calendar view could not be loaded.");
  const intervals = (key: "busy" | "bookings" | "slots"): CalendarViewInterval[] => {
    if (!Array.isArray(view[key]) || !view[key].every(isInterval)) throw new Error("Calendar view could not be loaded.");
    return view[key];
  };
  if (!Array.isArray(view.workingHours)) throw new Error("Calendar view could not be loaded.");
  const workingHours = view.workingHours.flatMap(item => item && typeof item === "object" && "weekday" in item && "startsAt" in item && "endsAt" in item && typeof item.weekday === "number" && typeof item.startsAt === "string" && typeof item.endsAt === "string" ? [{ weekday: item.weekday, startsAt: item.startsAt, endsAt: item.endsAt }] : []);
  if (workingHours.length !== view.workingHours.length) throw new Error("Calendar view could not be loaded.");
  const weekStart = view.weekStart as string, semesterStart = view.semesterStart as string, semesterEnd = view.semesterEnd as string;
  calendarWeek(weekStart); calendarWeekStart(semesterStart); calendarWeekStart(semesterEnd);
  return { weekStart, timeZone: view.timeZone as string, semesterStart, semesterEnd, mode: view.mode as CalendarMode, lastSuccessAt: view.lastSuccessAt as string | null, syncUnavailable: view.syncUnavailable, workingHours, busy: intervals("busy"), bookings: intervals("bookings"), slots: intervals("slots") };
}

function formatDate(date: string, _timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function formatInterval(interval: CalendarViewInterval, timeZone: string): string {
  const format = new Intl.DateTimeFormat(undefined, { timeZone, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${format.format(new Date(interval.startsAt))}–${new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(interval.endsAt))}`;
}

export type CalendarWorkingHours = { endsAt: string; startsAt: string; weekday: number };
const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const cellKey = (day: number, minute: number) => `${day}:${clock(minute)}`;

export function IntegratedAvailabilityCalendar({ semesterId, refreshKey, workingHours: draftHours, onWorkingHoursChange, disabled = false }: { semesterId: string; refreshKey: string | number; workingHours?: CalendarWorkingHours[]; onWorkingHoursChange?: (hours: CalendarWorkingHours[]) => void; disabled?: boolean }) {
  const [view, setView] = useState<CalendarView | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [navigationEpoch, setNavigationEpoch] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const gridScrollRef = useRef<HTMLDivElement>(null), gridRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ day: number; minute: number; add: boolean } | null>(null);
  const pointerType = useRef<string | null>(null);
  const displayedWeekStart = view?.weekStart;

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ semesterId });
    if (weekStart) query.set("weekStart", weekStart);
    void authenticatedFetch(`/api/calendar/view?${query.toString()}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
      .then(async response => {
        const value: unknown = await response.json();
        if (!response.ok) throw new Error("Calendar view could not be loaded.");
        return parseView(value);
      })
      .then(data => { if (!controller.signal.aborted) {
        const bounded = cohortCalendarWeek(data.weekStart, data.semesterStart, data.semesterEnd);
        if (bounded !== data.weekStart) { setWeekStart(bounded); return; }
        setView(data); setError(null);
      } })
      .catch(() => { if (!controller.signal.aborted) setError("Could not load this calendar week. Try again after your settings finish refreshing."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [semesterId, refreshKey, weekStart, navigationEpoch]);

  useEffect(() => {
    if (displayedWeekStart && gridScrollRef.current) gridScrollRef.current.scrollTop = 8 / 24 * 2304;
  }, [displayedWeekStart]);

  const dates = useMemo(() => view ? calendarWeek(view.weekStart) : [], [view]);
  const weeks = useMemo(() => {
    if (!view) return [];
    const result: string[] = [];
    const last = calendarWeekStart(view.semesterEnd);
    for (let week = calendarWeekStart(view.semesterStart); week <= last; week = shiftCalendarWeek(week, 1)) result.push(week);
    return result;
  }, [view]);
  const outsideSemester = !!view && (view.weekStart > view.semesterEnd || dates[6]! < view.semesterStart);
  const stale = !!view && view.mode === "synced" && (view.syncUnavailable || !view.lastSuccessAt);
  const navigate = (nextWeek: string) => {
    if (loading || nextWeek === view?.weekStart) return;
    gesture.current = null;
    setError(null);
    setLoading(true);
    setWeekStart(nextWeek);
  };
  const move = (weeks: number) => { if (view) navigate(cohortCalendarWeek(shiftCalendarWeek(view.weekStart, weeks), view.semesterStart, view.semesterEnd)); };
  const blocks = view ? ([
    { intervals: view.busy, kind: "busy" as const },
    { intervals: view.bookings, kind: "booking" as const },
    { intervals: mergeIntervals(view.slots), kind: "available" as const },
  ].flatMap(group => group.intervals.flatMap(interval => layoutCalendarIntervals({ intervals: [interval], timeZone: view.timeZone, weekStart: view.weekStart }).map(layout => ({ ...layout, interval, kind: group.kind }))))) : [];
  const workingHours = (draftHours ?? view?.workingHours ?? []).flatMap(range => {
    const startMinute = calendarTimeMinute(range.startsAt), endMinute = calendarTimeMinute(range.endsAt);
    return startMinute !== null && endMinute !== null && endMinute > startMinute && range.weekday >= 0 && range.weekday <= 6 ? [{ dayIndex: range.weekday, startMinute, endMinute }] : [];
  });
  const selected = useMemo(() => new Set(workingHours.flatMap(range => Array.from({ length: Math.max(0, Math.floor((range.endMinute - range.startMinute) / 15)) }, (_, index) => cellKey(range.dayIndex, range.startMinute + index * 15)))), [workingHours]);
  const saved = useMemo(() => new Set((view?.workingHours ?? []).flatMap(range => {
    const start = calendarTimeMinute(range.startsAt), end = calendarTimeMinute(range.endsAt);
    return start === null || end === null ? [] : Array.from({ length: Math.max(0, Math.floor((end - start) / 15)) }, (_, index) => cellKey(range.weekday, start + index * 15));
  })), [view]);
  const hasAdditions = [...selected].some(key => !saved.has(key));
  const hasRemovals = [...saved].some(key => !selected.has(key));
  const selectedRef = useRef(selected);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  const blocked = useMemo(() => { const keys = new Set<string>(); for (let minute = 15 * 60; minute < 17 * 60; minute += 15) keys.add(cellKey(5, minute)); return keys; }, []);
  const cellAt = (clientX: number, clientY: number) => { const rect = gridRef.current?.getBoundingClientRect(); if (!rect || clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) return null; return { day: Math.min(6, Math.floor((clientX - rect.left) / (rect.width / 7))), minute: Math.min(1410, Math.floor((clientY - rect.top) / (rect.height / 96)) * 15) }; };
  const strokeTo = (day: number, minute: number, add: boolean, fromMinute = minute) => { if (!onWorkingHoursChange || disabled || loading) return; const values = applyWeeklyDraftStroke({ keys: selectedRef.current, day, fromMinute, toMinute: minute, add, blocked, key: cellKey }); selectedRef.current = values; const next: CalendarWorkingHours[] = []; for (let weekday = 0; weekday < 7; weekday++) { let start: number | null = null; for (let value = 0; value < 1425; value += 15) { const enabled = values.has(cellKey(weekday, value)); if (enabled && start === null) start = value; if (start !== null && (!enabled || value === 1410)) { const end = enabled && value === 1410 ? 1425 : value; if (end > start) next.push({ weekday, startsAt: clock(start), endsAt: clock(end) }); start = null; } } } onWorkingHoursChange(next); };

  return <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-5" aria-labelledby="availability-calendar-heading">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <h4 id="availability-calendar-heading" className="text-base font-semibold text-[#002147]">Your mentoring calendar</h4>
        <p className="mt-1 text-sm text-slate-600">{onWorkingHoursChange ? "Drag with a mouse, tap, or use Enter/Space to choose recurring weekly mentoring hours. Save settings to publish your draft." : "Green blocks are times startups can book during the cohort. Gray blocks are busy on Google Calendar."}</p>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0" aria-label="Calendar navigation">
        <button type="button" aria-label="Previous week" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[#002147] hover:bg-slate-100 disabled:opacity-50" onClick={() => move(-1)} disabled={loading || !view || view.weekStart === weeks[0]}>&larr;</button>
        <select aria-label="Program week" className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm font-medium text-[#002147]" value={(loading ? weekStart : view?.weekStart) ?? ""} disabled={loading || !view} onChange={event => navigate(event.target.value)}>
          {!view && <option value="">Loading weeks...</option>}
          {weeks.map(week => <option key={week} value={week}>{formatDate(week, "UTC", { month: "short", day: "numeric" })}–{formatDate(calendarWeek(week)[6]!, "UTC", { month: "short", day: "numeric" })}</option>)}
        </select>
        <button type="button" aria-label="Next week" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-[#002147] hover:bg-slate-100 disabled:opacity-50" onClick={() => move(1)} disabled={loading || !view || view.weekStart === weeks.at(-1)}>&rarr;</button>
      </div>
    </div>
    {loading && !view && <p role="status" className="mt-3 text-sm text-slate-600">Loading calendar…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error} <button type="button" className="underline" onClick={() => { setError(null); setLoading(true); setNavigationEpoch(value => value + 1); }}>Retry</button></p>}
    {view && <>
      <h5 className="mt-4 text-sm font-semibold text-[#002147]">{formatDate(view.weekStart, view.timeZone, { month: "long", day: "numeric", year: "numeric" })} – {formatDate(dates[6]!, view.timeZone, { month: "long", day: "numeric", year: "numeric" })}</h5>
      <p className="mt-1 text-xs text-slate-600">Cohort dates: {formatDate(view.semesterStart, view.timeZone, { month: "short", day: "numeric" })} – {formatDate(view.semesterEnd, view.timeZone, { month: "short", day: "numeric", year: "numeric" })}. Shaded dates are outside the cohort.</p>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-700" aria-label="Calendar legend">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-3 w-3 rounded-sm border border-dashed border-slate-400 bg-slate-100" />Saved recurring hours</span>
        {onWorkingHoursChange && hasAdditions && <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-3 w-3 rounded-sm border border-sky-500 bg-sky-300" />Unsaved mentoring hours</span>}
        {onWorkingHoursChange && hasRemovals && <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-3 w-3 rounded-sm border border-orange-500 bg-orange-200" />Pending removal (save to apply)</span>}
        <span className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-3 w-3 rounded-sm border border-amber-400 bg-amber-100" />Friday Program reserved time · 3:00–5:00 PM {view.timeZone}</span>
        {(Object.keys(kinds) as BlockKind[]).map(kind => <span key={kind} className="inline-flex items-center gap-1.5"><i aria-hidden="true" className={`h-3 w-3 rounded-sm border ${kinds[kind].className}`} />{kinds[kind].label}</span>)}
      </div>
      <p className="mt-2 text-xs text-slate-600">Times shown in {view.timeZone}. {view.mode === "synced" && view.lastSuccessAt ? `Last Google check: ${new Intl.DateTimeFormat(undefined, { timeZone: view.timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(view.lastSuccessAt))}.` : ""}</p>
      {stale && <p role="status" className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">Google Calendar status is stale, so availability may be incomplete until the next successful refresh.</p>}
      {onWorkingHoursChange && <p className="mt-2 text-xs text-slate-600">Green means available to book. Blue additions and orange removals take effect after you save. Changes repeat weekly; Google busy times and confirmed meetings stay blocked.</p>}
      {outsideSemester && <p role="status" className="mt-3 rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-700">This week is outside the semester. Busy time remains visible, but no mentoring time is bookable.</p>}
      {!outsideSemester && view.workingHours.length === 0 && <p role="status" className="mt-3 rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-700">No weekly mentoring hours are configured for this semester.</p>}
      <p className="mt-3 text-xs text-slate-600 sm:hidden">Swipe left or right for every day. Scroll up to see early hours.</p>
      <div className="relative mt-4" aria-busy={loading}>
        {loading && <div role="status" aria-live="polite" className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-md border border-slate-200 bg-white/95 text-[#002147]">
          <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#002147] motion-reduce:animate-none" />
          <p className="text-sm font-semibold">Loading calendar week…</p>
          <p className="text-xs text-slate-600">Updating availability and bookings</p>
        </div>}
      <div ref={gridScrollRef} className="h-[520px] overflow-auto rounded-md border border-slate-200 bg-white pb-2">
        <div className="min-w-[760px]">
          <div className="sticky top-0 z-30 grid grid-cols-[58px_repeat(7,minmax(92px,1fr))] border-b border-slate-300 bg-white text-center shadow-sm">
            <div className="p-2 text-xs font-medium text-slate-500">Time</div>
            {dates.map(date => <div key={date} className={`border-l border-slate-200 p-2 ${dateInCohort(date, view.semesterStart, view.semesterEnd) ? "" : "bg-slate-100 text-slate-400"}`}><div className="text-xs font-semibold">{formatDate(date, view.timeZone, { weekday: "short" })}</div><div className="text-sm">{formatDate(date, view.timeZone, { month: "numeric", day: "numeric" })}</div></div>)}
          </div>
          <div className="grid grid-cols-[58px_1fr] bg-white">
            <div className="relative h-[2304px] border-r border-slate-300 text-right text-[10px] text-slate-500">{Array.from({ length: 24 }, (_, hour) => <span key={hour} className="absolute right-2 -translate-y-1/2" style={{ top: `${hour / 24 * 100}%` }}>{hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}</span>)}</div>
            <div ref={gridRef} className="relative h-[2304px]" role="grid" aria-label={`Weekly mentoring calendar starting ${formatDate(view.weekStart, view.timeZone, { month: "long", day: "numeric", year: "numeric" })}`} onPointerMove={event => { const cell = cellAt(event.clientX, event.clientY); if (gesture.current && event.buttons === 1 && cell?.day === gesture.current.day) strokeTo(cell.day, cell.minute, gesture.current.add, gesture.current.minute); }} onPointerUp={event => { const cell = cellAt(event.clientX, event.clientY); if (gesture.current && cell?.day === gesture.current.day) strokeTo(cell.day, cell.minute, gesture.current.add, gesture.current.minute); gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}>
              <div aria-hidden="true" className="absolute inset-0 grid grid-cols-7">{dates.map(date => <div key={date} className={`border-r border-slate-200 ${dateInCohort(date, view.semesterStart, view.semesterEnd) ? "" : "bg-slate-100/90"}`} />)}</div>
              <div aria-hidden="true" className="absolute inset-0">{Array.from({ length: 25 }, (_, hour) => <div key={hour} className="absolute w-full border-t border-slate-100" style={{ top: `${hour / 24 * 100}%` }} />)}</div>
              <div role="gridcell" aria-label={`Friday Program reserved time, 3:00 PM to 5:00 PM ${view.timeZone}`} className="pointer-events-none absolute z-10 border border-amber-400 bg-amber-100/90" style={{ left: `calc(${5 / 7 * 100}% + 2px)`, width: `calc(${100 / 7}% - 4px)`, top: `${15 * 60 / 1440 * 100}%`, height: `${2 * 60 / 1440 * 100}%` }} />
              {onWorkingHoursChange && <div className="absolute inset-0 z-20 grid grid-cols-7">{Array.from({ length: 7 }, (_, day) => <div key={day} className="relative">{Array.from({ length: 95 }, (_, index) => { const minute = index * 15, key = cellKey(day, minute), added = selected.has(key) && !saved.has(key), removed = saved.has(key) && !selected.has(key), programReserved = blocked.has(key) || isFridayInPersonMeetingTime(weekdays[day]!, clock(minute)), unavailable = disabled || loading || !dateInCohort(dates[day]!, view.semesterStart, view.semesterEnd) || programReserved; return <button key={key} type="button" data-calendar-cell data-day={day} data-minute={minute} disabled={unavailable} aria-label={`${dates[day]} ${clock(minute)}${programReserved ? "; Friday Program reserved time" : unavailable ? "; unavailable" : added ? "; unsaved mentoring hours" : removed ? "; pending removal; save to apply" : selected.has(key) ? "; saved recurring hours" : "; available for selection"}`} onPointerDown={event => { pointerType.current = event.pointerType; if (unavailable || event.pointerType === "touch") return; gridRef.current?.setPointerCapture(event.pointerId); const add = !selectedRef.current.has(key); gesture.current = { day, minute, add }; strokeTo(day, minute, add); }} onClick={(event) => { if (!unavailable && (event.detail === 0 || pointerType.current === "touch")) strokeTo(day, minute, !selectedRef.current.has(key)); }} className={`absolute left-0 w-full border-0 ${programReserved ? "cursor-not-allowed bg-amber-100/60" : unavailable ? "cursor-not-allowed" : added ? "bg-sky-300 hover:bg-sky-400 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-600" : removed ? "bg-orange-200 hover:bg-orange-300 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-600" : "hover:bg-sky-100/40"}`} style={{ top: `${minute / 1440 * 100}%`, height: `${15 / 1440 * 100}%` }} />; })}</div>)}</div>}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0">{(view.workingHours.flatMap(range => { const startMinute = calendarTimeMinute(range.startsAt), endMinute = calendarTimeMinute(range.endsAt); return startMinute === null || endMinute === null ? [] : [{ dayIndex: range.weekday, startMinute, endMinute }]; })).filter(range => dateInCohort(dates[range.dayIndex]!, view.semesterStart, view.semesterEnd)).map((range, index) => <div key={`${range.dayIndex}:${range.startMinute}:${range.endMinute}:${index}`} className="absolute z-0 border border-dashed border-slate-400 bg-slate-100/70" style={{ left: `calc(${range.dayIndex / 7 * 100}% + 2px)`, width: `calc(${100 / 7}% - 4px)`, top: `${range.startMinute / 1440 * 100}%`, height: `${(range.endMinute - range.startMinute) / 1440 * 100}%` }} />)}</div>
              {blocks.map((block, index) => {
                const meta = kinds[block.kind];
                const interval = block.interval;
                return <div key={`${block.kind}:${interval.startsAt}:${interval.endsAt}:${index}`} role="gridcell" aria-label={`${meta.label}: ${formatInterval(interval, view.timeZone)}`} className={`pointer-events-none absolute z-10 overflow-hidden rounded border px-1 py-0.5 text-[10px] leading-tight shadow-sm ${meta.className}`} style={{ left: `calc(${block.dayIndex / 7 * 100}% + 2px)`, width: `calc(${100 / 7}% - 4px)`, top: `${block.startMinute / 1440 * 100}%`, height: `max(${(block.endMinute - block.startMinute) / 1440 * 100}%, 3px)` }}>
                  <span className="sr-only">{meta.label}</span>{block.kind !== "busy" && <span aria-hidden="true">{block.kind === "available" ? "Available to book" : "Booked"}</span>}
                </div>;
              })}
            </div>
          </div>
        </div>
      </div>
      </div>
      {!outsideSemester && !stale && view.slots.length === 0 && <p className="mt-3 text-sm text-slate-600">No bookable mentoring slots this week.</p>}
    </>}
  </section>;
}
