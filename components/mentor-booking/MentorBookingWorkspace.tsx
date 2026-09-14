"use client";

import { CalendarClock, Check, RefreshCw } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { formatEnumLabel, formatTimeZoneLabel } from "@/src/presentation/display-labels";
import { publishMentorBookingBatch } from "@/src/mentor-booking/batch-publish";
import { buildCalendarSelectionBatch, type CalendarBlocks } from "@/src/mentor-booking/calendar-selection";
import { availabilityBlocksForDisplay } from "@/src/mentor-booking/availability-display-state";
import { applyAvailabilityPaint, availabilityBlocksFromKeys, availabilityKeysFromBlocks, availabilityPaintKey, type AvailabilityPaintIntent } from "@/src/mentor-booking/availability-painter";
import { FRIDAY_IN_PERSON_MEETING_LABEL, isFridayInPersonMeetingTime } from "@/src/mentor-booking/availability-reservations";
import { calendarBlocksFromWeeklyAvailability } from "@/src/mentor-booking/weekly-availability-grid";
import { buildWeeklyPlanner, type BatchWeekday, type MentorBookingBatchPreview } from "@/src/mentor-booking/batch-slots";
import { bookingSections } from "@/src/mentor-booking/meeting-sections";
import { mentorBookedCells } from "@/src/mentor-booking/mentor-booked-cells";
import { currentCalendarWeek } from "@/src/mentor-booking/startup-availability";
import { StartupAvailabilityBrowser } from "./StartupAvailabilityBrowser";

import { bookingDateTime, formatAvailabilityTimeLabel, isCurrentMentorBookingResponse, isMentorBookingResponse } from "./presentation";
import type { MentorBookingRequest, MentorBookingWorkspaceResponse } from "@/src/mentor-booking/types";

type Action = "publish_window" | "withdraw_window" | "request_window" | "replace_weekly_availability" | "request_booking" | "accept_request" | "decline_request" | "cancel_request";
type Props = { semesterId: string | null | undefined; mentorSemesterId?: string | null; previewData?: MentorBookingWorkspaceResponse; heading?: string; semesterStartsOn?: string | null; semesterEndsOn?: string | null };
const availabilityDays: readonly BatchWeekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function availabilityCacheKey(semesterId: string, profileId: string) { return `almaworks:weekly-availability:${semesterId}:${profileId}`; }
function isCalendarBlocks(value: unknown): value is CalendarBlocks {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return availabilityDays.every((day) => {
    const times = record[day];
    return Array.isArray(times) && times.every((time: unknown) => typeof time === "string");
  });
}
function readConfirmedAvailability(semesterId: string, profileId: string): CalendarBlocks | null {
  try { const value: unknown = JSON.parse(window.localStorage.getItem(availabilityCacheKey(semesterId, profileId)) ?? "null"); return isCalendarBlocks(value) ? value : null; } catch { return null; }
}
function writeConfirmedAvailability(semesterId: string, profileId: string, blocks: CalendarBlocks) {
  try { window.localStorage.setItem(availabilityCacheKey(semesterId, profileId), JSON.stringify(blocks)); } catch { /* Browser storage is optional resilience only. */ }
}

function readPayload(value: unknown): MentorBookingWorkspaceResponse | null {
  if (!isMentorBookingResponse(value)) return null;
  return value;
}

export default function MentorBookingWorkspace({ semesterId, mentorSemesterId, previewData, heading = "Bookings", semesterStartsOn, semesterEndsOn }: Props) {
  const [workspaceData, setData] = useState<MentorBookingWorkspaceResponse | null>(previewData ?? null);
  const [loading, setLoading] = useState(previewData === undefined);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [topicByWindow, setTopicByWindow] = useState<Record<string, string>>({});
  const [, setRangeStart] = useState("");
  const [, setRangeEnd] = useState("");
  const [weekdays, setWeekdays] = useState<BatchWeekday[]>(["monday"]);
  const [dailyStart, setDailyStart] = useState("09:00");
  const [dailyEnd, setDailyEnd] = useState("12:00");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [bufferMinutes, setBufferMinutes] = useState("0");
  const [reviewBatch, setReviewBatch] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [selectedBlocks, setSelectedBlocks] = useState<CalendarBlocks>({ monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });
  const availabilityCalendar = useRef<AvailabilityCalendarHandle>(null);
  const loadEpoch = useRef(0);
  const mutationEpoch = useRef(0);
  const scopeVersion = useRef(0);
  const actionScope = useRef<{ semesterId: string; version: number } | null>(null);
  const scopeRef = useRef(semesterId ?? "");
  const priorScope = useRef(semesterId);
  if (priorScope.current !== semesterId) { priorScope.current = semesterId; loadEpoch.current += 1; mutationEpoch.current += 1; scopeVersion.current += 1; }
  scopeRef.current = semesterId ?? "";

  const load = useCallback(async () => {
    const epoch = loadEpoch.current + 1;
    loadEpoch.current = epoch;
    if (previewData) { setData(previewData); setLoading(false); setError(null); return; }
    if (!semesterId) { setData(null); setLoading(false); setError("Select a semester to view bookings."); return; }
    setLoading(true); setError(null);
    try {
      const response = await authenticatedFetch(`/api/mentor-booking?semesterId=${encodeURIComponent(semesterId)}`);
      const payload: unknown = await response.json().catch(() => null);
      const workspace = readPayload(payload);
      if (!response.ok || !workspace) throw new Error(isError(payload) ?? "Bookings could not be loaded.");
      if (loadEpoch.current !== epoch || scopeRef.current !== semesterId) return;
      if (!isCurrentMentorBookingResponse(semesterId, workspace)) throw new Error("The booking response did not match the selected semester.");
      setData(workspace);
    } catch (cause) {
      if (loadEpoch.current !== epoch || scopeRef.current !== semesterId) return;
      setData(null); setError(cause instanceof Error ? cause.message : "Bookings could not be loaded.");
    } finally { if (loadEpoch.current === epoch) setLoading(false); }
  }, [previewData, semesterId]);

  useEffect(() => { void load(); return () => { loadEpoch.current += 1; mutationEpoch.current += 1; }; }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (semesterStartsOn && semesterEndsOn) { setRangeStart(semesterStartsOn); setRangeEnd(semesterEndsOn); } }, [semesterEndsOn, semesterStartsOn]);
  useEffect(() => {
    if (!workspaceData) return;
    const serverBlocks = calendarBlocksFromWeeklyAvailability(workspaceData.availability ?? [], mentorSemesterId ?? workspaceData.viewer.mentorSemesterId, workspaceData.viewer.profileId);
    setSelectedBlocks(availabilityBlocksForDisplay(serverBlocks, readConfirmedAvailability(workspaceData.semesterId, workspaceData.viewer.profileId)));
  }, [mentorSemesterId, workspaceData]);

  const windows = useMemo(() => (workspaceData?.windows ?? []).filter((window) => !mentorSemesterId || window.mentorSemesterId === mentorSemesterId), [workspaceData, mentorSemesterId]);
  const bookedCells = useMemo(() => workspaceData?.viewer.role === "mentor" ? mentorBookedCells({ requests: workspaceData.history, now, timeZone: workspaceData.timeZone }) : new Map<string, string>(), [now, workspaceData]);
  const batch = useMemo<{ error: string | null; preview: MentorBookingBatchPreview | null }>(() => {
    const plannerStart = semesterStartsOn ?? workspaceData?.semesterStartDate;
    const plannerEnd = semesterEndsOn ?? workspaceData?.semesterEndDate;
    if (!workspaceData || !plannerStart || !plannerEnd) return { error: "Semester dates are unavailable. Contact an administrator.", preview: null };
    try { return { error: null, preview: buildCalendarSelectionBatch({ rangeStart: plannerStart, rangeEnd: plannerEnd, selectedBlocks, timeZone: workspaceData.timeZone, existingWindows: windows.filter((window) => window.mentorSemesterId === workspaceData.viewer.mentorSemesterId) }) }; }
    catch (cause) { return { error: cause instanceof Error ? cause.message : "The batch could not be prepared.", preview: null }; }
  }, [selectedBlocks, semesterEndsOn, semesterStartsOn, windows, workspaceData]);
  function scopedAction(): string | null {
    const activeActionScope = actionScope.current;
    return activeActionScope !== null && activeActionScope.semesterId === semesterId && activeActionScope.version === scopeVersion.current ? acting : null;
  }
  async function act(action: Action, key: string, extra: Record<string, unknown> = {}) {
    if (!semesterId || scopedAction() !== null) return false;
    if (previewData) {
      setData((current) => current === null ? current : previewUpdate(current, action, Object.fromEntries(Object.entries(extra).filter((entry): entry is [string, string] => typeof entry[1] === "string"))));
      setMessage("Preview updated on this page only.");
      return true;
    }
    const epoch = mutationEpoch.current + 1; mutationEpoch.current = epoch; const scope = semesterId; const version = scopeVersion.current;
    actionScope.current = { semesterId: scope, version };
    setActing(key); setError(null); setMessage(null);
    try {
      const response = await authenticatedFetch("/api/mentor-booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, semesterId, ...extra }) });
      const payload: unknown = await response.json().catch(() => null);
      const workspace = isObject(payload) ? readPayload(payload.workspace) : null;
      if (!response.ok || !workspace) throw new Error(isError(payload) ?? "The booking could not be updated.");
      if (mutationEpoch.current !== epoch || scopeRef.current !== scope) return false;
      if (!isCurrentMentorBookingResponse(scope, workspace)) throw new Error("The booking update did not match the selected semester.");
      setData(workspace); setMessage("Booking updated."); setTopicByWindow((current) => ({ ...current, [key]: "" }));
      return true;
    } catch (cause) { if (mutationEpoch.current === epoch && scopeRef.current === scope) setError(cause instanceof Error ? cause.message : "The booking could not be updated."); return false; }
    finally { if (mutationEpoch.current === epoch && scopeRef.current === scope) setActing(null); }
  }

  function weeklyAvailability(blocks = selectedBlocks) {
    const weekday: Record<BatchWeekday, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    return (Object.entries(blocks) as [BatchWeekday, readonly string[]][]).flatMap(([day, values]) => {
      const ranges: { weekday: number; startsAt: string; endsAt: string }[] = [];
      let start: string | null = null;
      let endMinute = 0;
      for (const value of [...values].sort()) {
        const minute = Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
        if (start !== null && minute !== endMinute) ranges.push({ weekday: weekday[day], startsAt: start, endsAt: `${String(Math.floor(endMinute / 60)).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}` });
        if (start === null || minute !== endMinute) start = value;
        endMinute = minute + 15;
      }
      if (start !== null) ranges.push({ weekday: weekday[day], startsAt: start, endsAt: `${String(Math.floor(endMinute / 60)).padStart(2, "0")}:${String(endMinute % 60).padStart(2, "0")}` });
      return ranges;
    });
  }

  async function saveWeeklyAvailability() {
    const blocks = availabilityCalendar.current?.flush() ?? selectedBlocks;
    if (await act("replace_weekly_availability", "save-weekly-availability", { availability: weeklyAvailability(blocks) })) {
      const profileId = currentData?.viewer.profileId;
      if (semesterId && profileId) writeConfirmedAvailability(semesterId, profileId, blocks);
      setSelectedBlocks(blocks);
    }
  }

  async function publishBatch() {
    if (!semesterId || !batch.preview || scopedAction() !== null) return;
    if (batch.preview.slots.length === 0) { setError("This batch has no valid windows to publish."); return; }
    if (previewData) {
      setData((current) => current === null ? current : batch.preview!.slots.reduce((workspace, slot, index) => previewUpdate(workspace, "publish_window", { startsAt: slot.startsAt, endsAt: slot.endsAt, windowId: `preview-batch-${index}` }), current));
      setMessage(`Preview added ${batch.preview.slots.length} batch windows on this page only.`);
      return;
    }
    const epoch = mutationEpoch.current + 1; mutationEpoch.current = epoch; const scope = semesterId; const version = scopeVersion.current;
    actionScope.current = { semesterId: scope, version }; setActing("publish-batch"); setError(null); setMessage(null);
    const result = await publishMentorBookingBatch(batch.preview.slots, async (slot) => {
      const response = await authenticatedFetch("/api/mentor-booking", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish_window", semesterId: scope, startsAt: slot.startsAt, endsAt: slot.endsAt }) });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(isError(payload) ?? "Window could not be published.");
    });
    if (mutationEpoch.current !== epoch || scopeRef.current !== scope) return;
    if (result.successes.length > 0) await load();
    if (mutationEpoch.current !== epoch || scopeRef.current !== scope) return;
    setMessage(`Published ${result.successes.length} of ${batch.preview.slots.length} windows.${result.duplicateSuccesses + result.duplicateFailures > 0 ? ` Duplicate rows: ${result.duplicateSuccesses} succeeded, ${result.duplicateFailures} failed.` : ""}`);
    if (result.failures.length > 0) setError(`${result.failures.length} window${result.failures.length === 1 ? "" : "s"} could not be published: ${result.failures.slice(0, 3).map((failure) => failure.message).join(" ")}`);
    if (mutationEpoch.current === epoch && scopeRef.current === scope) setActing(null);
  }

  const currentData = workspaceData?.semesterId === semesterId ? workspaceData : null;
  const currentActing = scopedAction();
  if (loading) return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-busy="true"><p className="flex items-center gap-2 text-sm text-slate-600"><RefreshCw className="animate-spin" size={17} /> Loading bookings…</p></section>;
  if (error && !currentData) return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><h1 className="font-semibold text-[#002147]">{heading}</h1><p role="alert" className="mt-2 text-sm text-rose-800">{error}</p><button type="button" className="mt-4 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-[#002147]" onClick={() => void load()}>Try again</button></section>;
  if (!currentData) return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-busy="true"><p className="flex items-center gap-2 text-sm text-slate-600"><RefreshCw className="animate-spin" size={17} /> Loading bookings…</p></section>;
  const data = currentData;
  const mentor = data.viewer.role === "mentor";
  const startup = data.viewer.role === "startup";
  const meetingSections = bookingSections(data.history);
  const actualWeek = currentCalendarWeek(now, data.timeZone);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite">
    <header className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#75AADB]">{formatTimeZoneLabel(data.timeZone)} · All times displayed in this timezone</p><span className="mt-2 inline-block w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{formatEnumLabel(data.viewer.role)} view</span></div><div className="self-end text-right"><p className="text-xs font-medium text-slate-500">Current week</p><p className="mt-1 text-2xl font-semibold tracking-tight text-[#002147] sm:text-3xl">{actualWeek.label}</p></div></header>
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}{message && <p role="status" className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><Check size={16} />{message}</p>}
    {(mentor || startup) && <><PendingSessions requests={meetingSections.pending} role={data.viewer.role} timeZone={data.timeZone} onAction={(request, action) => void act(action, request.requestId, { requestId: request.requestId })} acting={currentActing} /><UpcomingSessions requests={meetingSections.upcoming} role={data.viewer.role} timeZone={data.timeZone} onAction={(request, action) => void act(action, request.requestId, { requestId: request.requestId })} acting={currentActing} /></>}
    {mentor && <><PerDayCalendar ref={availabilityCalendar} selectedBlocks={selectedBlocks} bookedCells={bookedCells} onBlocks={setSelectedBlocks} onChanged={() => setReviewBatch(false)} /><div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm text-slate-700">Blue times repeat weekly. Violet times are accepted meetings in the current week.</p><button type="button" disabled={currentActing !== null} onClick={() => void saveWeeklyAvailability()} className="rounded-lg bg-[#002147] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save weekly availability</button></div></>}
    {startup && <StartupAvailabilityBrowser data={data} acting={currentActing !== null} onRequest={(slot, topic) => void act("request_booking", `${slot.mentorSemesterId}:${slot.startsAt}`, { mentorSemesterId: slot.mentorSemesterId, startsAt: slot.startsAt, endsAt: slot.endsAt, topic })} />}
    {!mentor && !startup && <div className="mt-5 space-y-3">{windows.map((window) => <article key={window.windowId} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="font-semibold text-[#002147]">{window.mentor.name}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><CalendarClock size={16} />{bookingDateTime(window.startsAt, data.timeZone)} – {bookingDateTime(window.endsAt, data.timeZone)}</p></div><span className={window.status === "available" ? "h-fit rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800" : "h-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"}>{formatEnumLabel(window.status)}</span></div>
      {window.request && <RequestCard request={window.request} timeZone={data.timeZone} onAction={(action) => void act(action, window.request!.requestId, { requestId: window.request!.requestId })} acting={currentActing !== null} />}
      {window.canWithdraw && <button type="button" disabled={currentActing !== null} onClick={() => void act("withdraw_window", window.windowId, { windowId: window.windowId })} className="mt-3 text-sm font-semibold text-rose-700 hover:text-rose-900 disabled:opacity-50">Withdraw window</button>}
      {window.canRequest && <div className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor={`topic-${window.windowId}`}>Request topic</label><input id={`topic-${window.windowId}`} value={topicByWindow[window.windowId] ?? ""} onChange={(event) => setTopicByWindow((current) => ({ ...current, [window.windowId]: event.target.value }))} placeholder="What would you like to discuss?" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button type="button" disabled={currentActing !== null || !(topicByWindow[window.windowId] ?? "").trim()} onClick={() => void act("request_window", window.windowId, { windowId: window.windowId, topic: (topicByWindow[window.windowId] ?? "").trim() })} className="rounded-lg bg-[#002147] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Request window</button></div>}
    </article>)}{windows.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">No mentor availability is available right now.</div>}</div>}
    <History requests={meetingSections.history.map((request) => ({ ...request, canCancel: false }))} role={data.viewer.role} timeZone={data.timeZone} />
  </section>;
}

type AvailabilityCalendarHandle = { flush: () => CalendarBlocks };

const PerDayCalendar = forwardRef<AvailabilityCalendarHandle, { selectedBlocks: CalendarBlocks; bookedCells: ReadonlyMap<string, string>; onBlocks: (value: CalendarBlocks) => void; onChanged: () => void }>(function PerDayCalendar({ selectedBlocks, bookedCells, onBlocks, onChanged }, ref) {
  void CalendarPlanner;
  const grid = useRef<HTMLDivElement>(null);
  const origin = useRef<BatchWeekday | null>(null);
  const intent = useRef<AvailabilityPaintIntent | null>(null);
  const keys = useRef(availabilityKeysFromBlocks(selectedBlocks));
  const dirty = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef<number | null>(null);
  const planner = buildWeeklyPlanner({ weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], dailyStart: "08:00", dailyEnd: "21:00", durationMinutes: 15, bufferMinutes: 0 });

  useEffect(() => { if (origin.current === null) keys.current = availabilityKeysFromBlocks(selectedBlocks); }, [selectedBlocks]);
  const snapshot = () => availabilityBlocksFromKeys(keys.current);
  const paint = (day: BatchWeekday, time: string, nextIntent: AvailabilityPaintIntent, cell: HTMLButtonElement) => {
    if (!applyAvailabilityPaint(keys.current, day, time, nextIntent)) return;
    dirty.current = true;
    cell.classList.toggle("bg-sky-400", nextIntent === "add");
    cell.classList.toggle("bg-white", nextIntent === "remove");
  };
  const paintAtPointer = () => {
    frame.current = null;
    if (!pointer.current || !origin.current || !intent.current) return;
    const cell = document.elementFromPoint(pointer.current.x, pointer.current.y)?.closest<HTMLButtonElement>("button[data-availability-cell]");
    const day = cell?.dataset.day as BatchWeekday | undefined;
    const time = cell?.dataset.time;
    if (!cell || cell.disabled || day !== origin.current || !time) return;
    paint(day, time, intent.current, cell);
  };
  const flush = () => {
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; paintAtPointer(); }
    const blocks = snapshot();
    if (dirty.current) { dirty.current = false; onBlocks(blocks); onChanged(); }
    return blocks;
  };
  useImperativeHandle(ref, () => ({ flush }));
  useEffect(() => {
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, []);
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `[aria-label="Weekly availability planner"] .min-h-8{min-height:1.25rem}[aria-label="Weekly availability planner"] .p-2{padding:.2rem .3rem;font-size:.65rem}`;
    document.head.append(style);
    return () => style.remove();
  }, []);
  return <section className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3" aria-label="Weekly availability planner"><div className="mb-2"><h2 className="font-semibold text-[#002147]">Weekly availability</h2><p className="text-xs text-slate-600">Click blocks to toggle them. Drag stays within one day and applies the same add or remove action. Friday 3–5 PM is reserved for in-person meetings.</p></div><div ref={grid} onPointerMove={(event) => { if (!origin.current || !intent.current || event.buttons !== 1) return; pointer.current = { x: event.clientX, y: event.clientY }; if (frame.current === null) frame.current = requestAnimationFrame(paintAtPointer); }} onPointerUp={() => { flush(); origin.current = null; intent.current = null; pointer.current = null; }} onPointerCancel={() => { flush(); origin.current = null; intent.current = null; pointer.current = null; }} className="grid min-w-[42rem] grid-cols-[4rem_repeat(7,minmax(5rem,1fr))] gap-px overflow-hidden rounded-lg bg-slate-200 text-xs"><div className="bg-slate-50 p-2 font-semibold text-slate-500">Time</div>{planner.days.map((day) => <div key={day.id} className="bg-slate-50 p-2 text-center font-semibold capitalize text-[#002147]">{day.id.slice(0, 3)}</div>)}{planner.timeRows.flatMap((time) => { const display = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(`2000-01-01T${time}:00`)); return [<div key={`${time}-label`} className="bg-slate-50 p-2 text-slate-500">{formatAvailabilityTimeLabel(time)}</div>, ...planner.days.map((day) => { const reserved = isFridayInPersonMeetingTime(day.id, time); const bookedWith = bookedCells.get(availabilityPaintKey(day.id, time)); const booked = !reserved && bookedWith !== undefined; const selected = !reserved && !booked && selectedBlocks[day.id].includes(time); const blockedLabel = reserved ? FRIDAY_IN_PERSON_MEETING_LABEL : booked ? `Booked with startup: ${bookedWith}` : undefined; return <button type="button" data-availability-cell data-day={day.id} data-time={time} key={`${day.id}-${time}`} disabled={reserved || booked} title={blockedLabel} onPointerDown={(event) => { if (reserved || booked) return; grid.current?.setPointerCapture(event.pointerId); origin.current = day.id; intent.current = selected ? "remove" : "add"; paint(day.id, time, intent.current, event.currentTarget); }} onClick={(event) => { if (reserved || booked || event.detail !== 0) return; const nextIntent: AvailabilityPaintIntent = keys.current.has(availabilityPaintKey(day.id, time)) ? "remove" : "add"; paint(day.id, time, nextIntent, event.currentTarget); flush(); }} aria-label={blockedLabel ? `${day.id} ${display}; ${blockedLabel}` : `${day.id} ${display}`} className={`min-h-8 touch-none ${reserved ? "cursor-not-allowed bg-amber-100" : booked ? "cursor-not-allowed bg-violet-200 ring-1 ring-inset ring-violet-400" : selected ? "bg-sky-400" : "bg-white hover:bg-sky-50"}`} />; })]; })}</div></section>;
});

function CalendarPlanner({ weekdays, dailyStart, dailyEnd, durationMinutes, bufferMinutes, onWeekdays, onDailyStart, onDailyEnd, onChanged }: { weekdays: BatchWeekday[]; dailyStart: string; dailyEnd: string; durationMinutes: string; bufferMinutes: string; onWeekdays: (value: BatchWeekday[]) => void; onDailyStart: (value: string) => void; onDailyEnd: (value: string) => void; onChanged: () => void }) {
  const dragStart = useRef<string | null>(null);
  let planner;
  try { planner = buildWeeklyPlanner({ weekdays, dailyStart: "08:00", dailyEnd: "19:00", durationMinutes: Number(durationMinutes), bufferMinutes: Number(bufferMinutes) }); } catch { return null; }
  const duration = Number(durationMinutes);
  const minuteValue = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const timeValue = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const selectDay = (day: BatchWeekday) => { if (day !== "friday" && !weekdays.includes(day)) onWeekdays([...weekdays, day]); };
  const selectRange = (time: string) => {
    const start = dragStart.current ?? time;
    const from = Math.min(minuteValue(start), minuteValue(time));
    const through = Math.max(minuteValue(start), minuteValue(time)) + duration;
    onDailyStart(timeValue(from)); onDailyEnd(timeValue(through)); onChanged();
  };
  return <section className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-3" aria-label="Weekly availability planner"><div className="mb-2 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-[#002147]">Choose availability on the calendar</h2><p className="text-xs text-slate-600">Drag across times to set one shared, contiguous daily range. Friday is reserved for the program.</p></div><span className="text-xs font-medium text-slate-600">{dailyStart}–{dailyEnd}</span></div><div className="grid min-w-[40rem] grid-cols-[4rem_repeat(7,minmax(4.5rem,1fr))] gap-px overflow-hidden rounded-lg bg-slate-200 text-xs"><div className="bg-slate-50 p-2 font-semibold text-slate-500">Time</div>{planner.days.map((day) => <button type="button" key={day.id} disabled={day.disabled} onClick={() => { if (day.disabled) return; onWeekdays(weekdays.includes(day.id) ? weekdays.filter((value) => value !== day.id) : [...weekdays, day.id]); onChanged(); }} className={`p-2 font-semibold capitalize ${day.disabled ? "bg-slate-100 text-slate-400 line-through" : day.selected ? "bg-sky-100 text-[#002147]" : "bg-white text-slate-600"}`}>{day.id.slice(0, 3)}{day.disabled && " (program)"}</button>)}{planner.timeRows.flatMap((time) => [<div key={`${time}-label`} className="bg-slate-50 p-2 font-medium text-slate-500">{time}</div>, ...planner.days.map((day) => { const selected = !day.disabled && day.selected && minuteValue(time) >= minuteValue(dailyStart) && minuteValue(time) + duration <= minuteValue(dailyEnd); return <button type="button" key={`${time}-${day.id}`} disabled={day.disabled} onPointerDown={(event) => { if (day.disabled) return; event.currentTarget.setPointerCapture(event.pointerId); dragStart.current = time; selectDay(day.id); selectRange(time); }} onPointerEnter={(event) => { if (dragStart.current !== null && event.buttons === 1 && !day.disabled) { selectDay(day.id); selectRange(time); } }} onPointerUp={() => { dragStart.current = null; }} aria-label={`${time} ${day.id}`} className={`min-h-10 touch-none ${day.disabled ? "bg-slate-100" : selected ? "bg-sky-400 hover:bg-sky-500" : "bg-white hover:bg-sky-50"}`} />; })])}</div></section>;
}

function BatchPublisher({ data, active, rangeStart, rangeEnd, weekdays, dailyStart, dailyEnd, durationMinutes, bufferMinutes, review, batch, onRangeStart, onRangeEnd, onWeekdays, onDailyStart, onDailyEnd, onDuration, onBuffer, onReview, onPublish }: { data: MentorBookingWorkspaceResponse; active: boolean; rangeStart: string; rangeEnd: string; weekdays: BatchWeekday[]; dailyStart: string; dailyEnd: string; durationMinutes: string; bufferMinutes: string; review: boolean; batch: { error: string | null; preview: MentorBookingBatchPreview | null }; onRangeStart: (value: string) => void; onRangeEnd: (value: string) => void; onWeekdays: (value: BatchWeekday[]) => void; onDailyStart: (value: string) => void; onDailyEnd: (value: string) => void; onDuration: (value: string) => void; onBuffer: (value: string) => void; onReview: (value: boolean) => void; onPublish: () => void }) {
  const resetReview = () => onReview(false);
  return <section className="mt-5 rounded-xl border border-sky-100 bg-sky-50 p-4"><h2 className="font-semibold text-[#002147]">Publish a weekly availability batch</h2><p className="mt-1 text-sm text-slate-600">All dates and times use {data.timeZone}, never your browser timezone. The endpoint verifies semester eligibility on publish.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-sm font-medium text-[#002147]">Range start<input type="date" value={rangeStart} onChange={(event) => { onRangeStart(event.target.value); resetReview(); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-[#002147]">Range end<input type="date" value={rangeEnd} onChange={(event) => { onRangeEnd(event.target.value); resetReview(); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-[#002147]">Daily start<input type="time" value={dailyStart} onChange={(event) => { onDailyStart(event.target.value); resetReview(); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-[#002147]">Daily end<input type="time" value={dailyEnd} onChange={(event) => { onDailyEnd(event.target.value); resetReview(); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-[#002147]">Duration (minutes)<input min="1" step="1" type="number" value={durationMinutes} onChange={(event) => { onDuration(event.target.value); resetReview(); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><label className="text-sm font-medium text-[#002147]">Buffer (minutes)<input min="0" step="1" type="number" value={bufferMinutes} onChange={(event) => { onBuffer(event.target.value); resetReview(); }} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label></div><fieldset className="mt-4"><legend className="text-sm font-medium text-[#002147]">Weekdays (Friday excluded)</legend><div className="mt-2 flex flex-wrap gap-3">{(["monday", "tuesday", "wednesday", "thursday", "saturday", "sunday"] as const).map((weekday) => <label key={weekday} className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={weekdays.includes(weekday)} onChange={(event) => { onWeekdays(event.target.checked ? [...weekdays, weekday] : weekdays.filter((value) => value !== weekday)); resetReview(); }} />{weekday[0]!.toUpperCase() + weekday.slice(1)}</label>)}</div></fieldset><button type="button" disabled={active || !rangeStart || !rangeEnd} onClick={() => onReview(true)} className="mt-4 rounded-lg border border-[#002147] bg-white px-4 py-2 text-sm font-semibold text-[#002147] disabled:opacity-60">Preview batch</button>{review && <div className="mt-4 rounded-lg border border-sky-200 bg-white p-4">{batch.error ? <p role="alert" className="text-sm text-rose-800">{batch.error}</p> : batch.preview && <><p className="text-sm font-semibold text-[#002147]">{batch.preview.slots.length} concrete windows · {batch.preview.duplicateCount} known duplicates · {batch.preview.ineligibleCount} known ineligible · {batch.preview.invalidCount} invalid</p><p className="mt-1 text-xs text-slate-600">Known duplicates are still submitted; server successes and failures are reported separately.</p><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{batch.preview.slots.map((slot) => <div key={`${slot.startsAt}/${slot.endsAt}`} className="flex flex-wrap justify-between gap-2 rounded border border-slate-100 px-3 py-2 text-sm"><span>{bookingDateTime(slot.startsAt, data.timeZone)} – {bookingDateTime(slot.endsAt, data.timeZone)}</span>{slot.duplicate && <span className="font-medium text-amber-800">Known duplicate</span>}</div>)}</div><button type="button" disabled={active || batch.preview.slots.length === 0} onClick={onPublish} className="mt-4 rounded-lg bg-[#002147] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Publish {batch.preview.slots.length} windows</button></>}</div>}</section>;
}

function RequestCard({ request, timeZone, onAction, acting }: { request: MentorBookingRequest; timeZone: string; onAction: (action: "accept_request" | "decline_request" | "cancel_request") => void; acting: boolean }) {
  return <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold text-[#002147]">{request.startup.name} · {formatEnumLabel(request.status)}</p><p className="mt-1 text-slate-700"><span className="font-medium">Topic:</span> {request.topic}</p><p className="mt-1 text-xs text-slate-500">Requested {bookingDateTime(request.requestedAt, timeZone)}</p><div className="mt-3 flex flex-wrap gap-2">{request.canAccept && <button type="button" disabled={acting} onClick={() => onAction("accept_request")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Accept</button>}{request.canDecline && <button type="button" disabled={acting} onClick={() => onAction("decline_request")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60">Decline</button>}{request.canCancel && <button type="button" disabled={acting} onClick={() => onAction("cancel_request")} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60">Cancel request</button>}</div></div>;
}

function PendingSessions({ requests, role, timeZone, onAction, acting }: { requests: MentorBookingRequest[]; role: MentorBookingWorkspaceResponse["viewer"]["role"]; timeZone: string; onAction: (request: MentorBookingRequest, action: "accept_request" | "decline_request" | "cancel_request") => void; acting: string | null }) {
  if (requests.length === 0) return null;
  const description = role === "mentor" ? "Incoming requests awaiting your response." : "Your requests awaiting a mentor response.";
  return <SessionList title="Pending requests" description={description} requests={requests} role={role} timeZone={timeZone} onAction={onAction} acting={acting} tone="pending" />;
}

function UpcomingSessions({ requests, role, timeZone, onAction, acting }: { requests: MentorBookingRequest[]; role: MentorBookingWorkspaceResponse["viewer"]["role"]; timeZone: string; onAction: (request: MentorBookingRequest, action: "accept_request" | "decline_request" | "cancel_request") => void; acting: string | null }) {
  if (requests.length === 0) return null;
  return <SessionList title="Upcoming meetings" description="Confirmed sessions with your mentor or startup." requests={requests} role={role} timeZone={timeZone} onAction={onAction} acting={acting} tone="upcoming" />;
}

function SessionList({ title, description, requests, role, timeZone, onAction, acting, tone }: { title: string; description: string; requests: MentorBookingRequest[]; role: MentorBookingWorkspaceResponse["viewer"]["role"]; timeZone: string; onAction: (request: MentorBookingRequest, action: "accept_request" | "decline_request" | "cancel_request") => void; acting: string | null; tone: "pending" | "upcoming" }) {
  const pending = tone === "pending";
  return <section className="mt-6 border-t border-slate-100 pt-5" aria-label={title}><div className="flex items-baseline justify-between gap-3"><h2 className="text-xl font-semibold text-[#002147]">{title}</h2><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pending ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{requests.length}</span></div><p className="mt-1 text-sm text-slate-600">{description}</p><div className="mt-3 space-y-2">{requests.map((request) => <div key={request.requestId} className={`flex flex-col gap-2 rounded-lg border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${pending ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><div><strong className="text-[#002147]">{role === "mentor" ? request.startup.name : request.mentor.name}</strong><span className="ml-2 text-slate-600">{formatEnumLabel(request.status)}</span><p className="mt-1 text-xs text-slate-600">{bookingDateTime(request.startsAt, timeZone)} - {bookingDateTime(request.endsAt, timeZone)}</p><p className="text-xs text-slate-500"><span className="font-medium">Topic:</span> {request.topic}</p></div><div className="flex flex-wrap gap-2">{request.canAccept && <button type="button" disabled={acting !== null} onClick={() => onAction(request, "accept_request")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Accept</button>}{request.canDecline && <button type="button" disabled={acting !== null} onClick={() => onAction(request, "decline_request")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60">Decline</button>}{request.canCancel && <button type="button" disabled={acting !== null} onClick={() => onAction(request, "cancel_request")} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60">Cancel</button>}</div></div>)}</div></section>;
}

function History({ requests, role, timeZone }: { requests: MentorBookingRequest[]; role: MentorBookingWorkspaceResponse["viewer"]["role"]; timeZone: string }) {
  if (requests.length === 0) return null;
  void role;
  const onCancel = (request: MentorBookingRequest) => { void request; return undefined; };
  const acting: string | null = null;
  return <section className="mt-6 border-t border-slate-100 pt-5"><h2 className="font-semibold text-[#002147]">Booking history</h2><div className="mt-3 space-y-2">{requests.map((request) => <div key={request.requestId} className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-[#002147]">{request.mentor.name}</strong><span className="ml-2 text-slate-500">{formatEnumLabel(request.status)}</span><p className="mt-1 text-xs text-slate-600">{bookingDateTime(request.startsAt, timeZone)} – {bookingDateTime(request.endsAt, timeZone)}</p><p className="text-xs text-slate-500">Requested {bookingDateTime(request.requestedAt, timeZone)}</p></div>{request.canCancel && <button type="button" disabled={acting !== null} onClick={() => onCancel(request)} className="text-sm font-semibold text-rose-700 disabled:opacity-50">Cancel</button>}</div>)}</div></section>;
}

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isError(value: unknown): string | null { return isObject(value) && typeof value.error === "string" ? value.error : null; }

function previewUpdate(workspace: MentorBookingWorkspaceResponse, action: Action, extra: Record<string, string>): MentorBookingWorkspaceResponse {
  if (action === "withdraw_window") return { ...workspace, windows: workspace.windows.filter((window) => window.windowId !== extra.windowId) };
  if (action === "publish_window" && extra.startsAt && extra.endsAt) return { ...workspace, windows: [...workspace.windows, { windowId: extra.windowId ?? "preview-new-window", semesterId: workspace.semesterId, mentorSemesterId: workspace.viewer.mentorSemesterId ?? "preview-mentor", mentor: { profileId: workspace.viewer.profileId, name: "Preview mentor" }, startsAt: extra.startsAt, endsAt: extra.endsAt, status: "available", canWithdraw: true, canRequest: false, request: null }] };
  if (action === "request_window") {
    const selected = workspace.windows.find((window) => window.windowId === extra.windowId);
    if (!selected) return workspace;
    const request: MentorBookingRequest = { requestId: "preview-request", windowId: selected.windowId, mentorSemesterId: selected.mentorSemesterId, mentor: selected.mentor, startsAt: selected.startsAt, endsAt: selected.endsAt, startupSemesterId: workspace.viewer.startupSemesterId ?? "preview-startup", startup: { organizationId: "preview-startup-org", name: "Preview startup" }, topic: extra.topic ?? "Preview topic", status: "pending", requestedAt: "2026-09-12T15:00:00.000Z", respondedAt: null, cancelledAt: null, canAccept: false, canDecline: false, canCancel: true };
    return { ...workspace, windows: workspace.windows.map((window) => window.windowId === selected.windowId ? { ...window, status: "pending", canRequest: false, request } : window), history: [request, ...workspace.history] };
  }
  const nextStatus = action === "accept_request" ? "accepted" : action === "decline_request" ? "declined" : action === "cancel_request" ? "cancelled" : null;
  if (!nextStatus) return workspace;
  const changedRequest = workspace.history.find((request) => request.requestId === extra.requestId);
  const update = (request: MentorBookingRequest | null): MentorBookingRequest | null => request?.requestId === extra.requestId ? { ...request, status: nextStatus, canAccept: false, canDecline: false, canCancel: false, respondedAt: nextStatus === "declined" || nextStatus === "accepted" ? "2026-09-12T15:00:00.000Z" : request.respondedAt, cancelledAt: nextStatus === "cancelled" ? "2026-09-12T15:00:00.000Z" : request.cancelledAt } : request;
  const acceptedOccupancy = nextStatus === "accepted" && changedRequest
    ? [...workspace.acceptedOccupancy, { mentorSemesterId: changedRequest.mentorSemesterId, startsAt: changedRequest.startsAt, endsAt: changedRequest.endsAt }]
    : nextStatus === "cancelled" && changedRequest
      ? workspace.acceptedOccupancy.filter((occupancy) => occupancy.mentorSemesterId !== changedRequest.mentorSemesterId || occupancy.startsAt !== changedRequest.startsAt || occupancy.endsAt !== changedRequest.endsAt)
      : workspace.acceptedOccupancy;
  return { ...workspace, acceptedOccupancy, windows: workspace.windows.map((window) => ({ ...window, status: window.request?.requestId === extra.requestId && nextStatus !== "accepted" ? "available" : window.request?.requestId === extra.requestId ? "accepted" : window.status, request: update(window.request) })), history: workspace.history.map((request) => update(request) ?? request) };
}
