"use client";

import { CalendarClock, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { calendarHoldStatusText } from "@/src/calendar/hold-presentation";
import { CalendarConnectionCard } from "@/components/calendar/CalendarConnectionCard";
import { createBackgroundRefresh } from "@/src/calendar/background-refresh";
import { formatEnumLabel, formatTimeZoneLabel } from "@/src/presentation/display-labels";
import { DataLoading } from "@/components/DataLoading";
import { bookingSections } from "@/src/mentor-booking/meeting-sections";
import { bookableCalendarWeek } from "@/src/mentor-booking/startup-availability";
import { createBookingCalendarOptions } from "@/src/mentor-booking/personal-calendar";
import { BookingDetailsPanel } from "./BookingDetailsPanel";
import { weeklyParticipation, participationLabels } from "@/src/mentor-booking/weekly-participation";
import { StartupAvailabilityBrowser } from "./StartupAvailabilityBrowser";

import { bookingDateTime, formatAvailabilityTimeLabel, isCurrentMentorBookingResponse, isMentorBookingResponse } from "./presentation";
import type { MentorBookingRequest, MentorBookingWorkspaceResponse } from "@/src/mentor-booking/types";

type Action = "publish_window" | "withdraw_window" | "request_window" | "replace_weekly_availability" | "request_booking" | "accept_request" | "decline_request" | "cancel_request";
type Props = { semesterId: string | null | undefined; mentorSemesterId?: string | null; focusedRequestId?: string | null; previewData?: MentorBookingWorkspaceResponse; heading?: string; semesterStartsOn?: string | null; semesterEndsOn?: string | null };

function readPayload(value: unknown): MentorBookingWorkspaceResponse | null {
  if (!isMentorBookingResponse(value)) return null;
  return value;
}

export default function MentorBookingWorkspace({ semesterId, mentorSemesterId, focusedRequestId, previewData, heading = "Bookings" }: Props) {
  const [workspaceData, setData] = useState<MentorBookingWorkspaceResponse | null>(previewData ?? null);
  const [loading, setLoading] = useState(previewData === undefined);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [topicByWindow, setTopicByWindow] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [details, setDetails] = useState<{ requestId: string; intent?: "declined" | "cancelled" } | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const loadController = useRef<AbortController | null>(null);
  const loadEpoch = useRef(0);
  const backgroundRefresh = useRef<ReturnType<typeof createBackgroundRefresh<MentorBookingWorkspaceResponse>> | null>(null);
  const mutationInFlight = useRef(false);
  const mutationEpoch = useRef(0);
  const scopeVersion = useRef(0);
  const actionScope = useRef<{ semesterId: string; version: number } | null>(null);
  const scopeRef = useRef(semesterId ?? "");
  const priorScope = useRef(semesterId);
  if (priorScope.current !== semesterId) { priorScope.current = semesterId; loadEpoch.current += 1; mutationEpoch.current += 1; scopeVersion.current += 1; }
  scopeRef.current = semesterId ?? "";

  const load = useCallback(async () => {
    backgroundRefresh.current?.cancel();
    const epoch = loadEpoch.current + 1;
    loadEpoch.current = epoch;
    loadController.current?.abort();
    loadController.current = null;
    if (previewData) { setData(previewData); setLoading(false); setError(null); return; }
    if (!semesterId) { setData(null); setLoading(false); setError("Select a semester to view bookings."); return; }
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true); setError(null);
    try {
      const response = await authenticatedFetch(`/api/mentor-booking?semesterId=${encodeURIComponent(semesterId)}&weekOffset=${weekOffset}`, { signal: controller.signal });
      const payload: unknown = await response.json().catch(() => null);
      const workspace = readPayload(payload);
      if (!response.ok || !workspace) throw new Error(isError(payload) ?? "Bookings could not be loaded.");
      if (controller.signal.aborted || loadEpoch.current !== epoch || scopeRef.current !== semesterId) return;
      if (!isCurrentMentorBookingResponse(semesterId, workspace)) throw new Error("The booking response did not match the selected semester.");
      setData(workspace); setRefreshFailed(false);
    } catch (cause) {
      if (controller.signal.aborted || loadEpoch.current !== epoch || scopeRef.current !== semesterId) return;
      setData(null); setError(cause instanceof Error ? cause.message : "Bookings could not be loaded.");
    } finally {
      if (!controller.signal.aborted && loadEpoch.current === epoch && scopeRef.current === semesterId) setLoading(false);
      if (loadController.current === controller) loadController.current = null;
    }
  }, [previewData, semesterId, weekOffset]);

  useEffect(() => { void load(); return () => { loadController.current?.abort(); loadController.current = null; loadEpoch.current += 1; mutationEpoch.current += 1; }; }, [load]);
  const usesCalendarAvailability = workspaceData?.effectiveAvailability !== undefined;
  useEffect(() => {
    if (previewData || !semesterId || !usesCalendarAvailability) return;
    const refresh = createBackgroundRefresh({
      canRefresh: () => document.visibilityState === "visible" && !mutationInFlight.current && !loadController.current && scopeRef.current === semesterId,
      load: async signal => {
        const response = await authenticatedFetch(`/api/mentor-booking?semesterId=${encodeURIComponent(semesterId)}&weekOffset=${weekOffset}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
        const payload: unknown = await response.json(); const workspace = readPayload(payload);
        if (!response.ok || !workspace || !isCurrentMentorBookingResponse(semesterId, workspace) || workspace.availabilityWeekOffset !== weekOffset || workspace.effectiveAvailability === undefined) throw new Error("Availability refresh failed.");
        return workspace;
      },
      apply: workspace => { setData(workspace); setRefreshFailed(false); },
      failed: () => setRefreshFailed(true),
    });
    backgroundRefresh.current = refresh;
    const tick = () => { void refresh.tick(); };
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick); document.addEventListener("visibilitychange", tick);
    return () => { refresh.dispose(); if (backgroundRefresh.current === refresh) backgroundRefresh.current = null; window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [previewData, semesterId, usesCalendarAvailability, weekOffset]);
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 60_000); return () => window.clearInterval(timer); }, []);

  const windows = useMemo(() => (workspaceData?.windows ?? []).filter((window) => !mentorSemesterId || window.mentorSemesterId === mentorSemesterId), [workspaceData, mentorSemesterId]);
  function scopedAction(): string | null {
    const activeActionScope = actionScope.current;
    return activeActionScope !== null && activeActionScope.semesterId === semesterId && activeActionScope.version === scopeVersion.current ? acting : null;
  }
  async function act(action: Action, key: string, extra: Record<string, unknown> = {}) {
    if (!semesterId || scopedAction() !== null || mutationInFlight.current || (action === "request_booking" && refreshFailed)) return false;
    if (previewData) {
      setData((current) => current === null ? current : previewUpdate(current, action, Object.fromEntries(Object.entries(extra).filter((entry): entry is [string, string] => typeof entry[1] === "string"))));
      setMessage("Preview updated on this page only.");
      return true;
    }
    const epoch = mutationEpoch.current + 1; mutationEpoch.current = epoch; const scope = semesterId; const version = scopeVersion.current;
    actionScope.current = { semesterId: scope, version };
    mutationInFlight.current = true;
    backgroundRefresh.current?.cancel(); loadController.current?.abort(); loadEpoch.current += 1;
    setActing(key); setError(null); setMessage(null);
    try {
      const response = await authenticatedFetch(`/api/mentor-booking?weekOffset=${weekOffset}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, semesterId, ...extra }) });
      const payload: unknown = await response.json().catch(() => null);
      const workspace = isObject(payload) ? readPayload(payload.workspace) : null;
      if (!response.ok || !workspace) throw new Error(isError(payload) ?? "The booking could not be updated.");
      if (mutationEpoch.current !== epoch || scopeRef.current !== scope) return false;
      if (!isCurrentMentorBookingResponse(scope, workspace)) throw new Error("The booking update did not match the selected semester.");
      setData(workspace); setRefreshFailed(false); setMessage("Booking updated."); setTopicByWindow((current) => ({ ...current, [key]: "" }));
      return true;
    } catch (cause) { if (mutationEpoch.current === epoch && scopeRef.current === scope) setError(cause instanceof Error ? cause.message : "The booking could not be updated."); return false; }
    finally { mutationInFlight.current = false; if (mutationEpoch.current === epoch && scopeRef.current === scope) setActing(null); }
  }


  const currentData = workspaceData?.semesterId === semesterId ? workspaceData : null;
  const currentActing = scopedAction();
  function calendarOptions(request: MentorBookingRequest) {
    const url = new URL('/dashboard/bookings', window.location.origin);
    url.searchParams.set('semester', semesterId ?? '');
    url.searchParams.set('booking', request.requestId);
    return createBookingCalendarOptions({
      requestId: request.requestId,
      mentorName: request.mentor.name,
      startupName: request.startup.name,
      topic: request.topic,
      startsAt: request.startsAt,
      endsAt: request.endsAt,
      bookingUrl: url.toString(),
      status: request.status,
      googleHoldStatus: request.calendarHoldStatus ?? null,
    });
  }
  function downloadCalendar(request: MentorBookingRequest) {
    const options = calendarOptions(request);
    const blobUrl = URL.createObjectURL(new Blob([options.ics], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = options.icsFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  }
  function addToGoogle(request: MentorBookingRequest) {
    const url = calendarOptions(request).googleAddUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }
  if (loading) return <DataLoading label="Loading bookings..." />;
  if (error && !currentData) return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5"><h1 className="font-semibold text-[#002147]">{heading}</h1><p role="alert" className="mt-2 text-sm text-rose-800">{error}</p><button type="button" className="mt-4 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-[#002147]" onClick={() => void load()}>Try again</button></section>;
  if (!currentData) return <DataLoading label="Loading bookings..." />;
  const data = currentData;
  const mentor = data.viewer.role === "mentor";
  const startup = data.viewer.role === "startup";
  const admin = data.viewer.role === "admin";
  const meetingSections = bookingSections(data.history);
  const focusedBooking = focusedRequestId ? data.history.find((request) => request.requestId === focusedRequestId) ?? null : null;
  const bookingWeek = bookableCalendarWeek(now, data.timeZone, data.semesterStartDate, weekOffset);
  const participation = weeklyParticipation(data.startupRoster ?? [], data.history, bookingWeek, data.timeZone, now);
  const programWeek = bookingWeek.endDate >= data.semesterStartDate && bookingWeek.startDate <= data.semesterEndDate;
  const openDetails = (request: MentorBookingRequest, intent?: "declined" | "cancelled") => setDetails({ requestId: request.requestId, intent });
  const handleAction = (request: MentorBookingRequest, action: "accept_request" | "decline_request" | "cancel_request") => {
    if (!previewData && action !== "accept_request") openDetails(request, action === "decline_request" ? "declined" : "cancelled");
    else void act(action, request.requestId, { requestId: request.requestId });
  };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite">
    <header className="flex flex-col gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#75AADB]">{formatTimeZoneLabel(data.timeZone)} · All times displayed in this timezone</p><span className="mt-2 inline-block w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{formatEnumLabel(data.viewer.role)} view</span></div>{!mentor && <div className="self-end text-right"><p className="text-xs font-medium text-slate-500">Booking week</p><p className="mt-1 text-2xl font-semibold tracking-tight text-[#002147] sm:text-3xl">{bookingWeek.label}</p></div>}</header>
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}{message && <p role="status" className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"><Check size={16} />{message}</p>}
    {refreshFailed && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Availability could not be refreshed. New requests are paused until it reloads. <button type="button" className="underline" onClick={() => void backgroundRefresh.current?.tick()}>Retry refresh</button></p>}
    {focusedRequestId && <section className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="Selected booking">
      {focusedBooking ? <><p className="text-xs font-semibold uppercase tracking-wide text-sky-800">Selected booking · {formatEnumLabel(focusedBooking.status)}</p><h2 className="mt-1 text-lg font-semibold text-[#002147]">{focusedBooking.mentor.name} and {focusedBooking.startup.name}</h2><p className="mt-2 text-sm text-slate-700">Topic: {focusedBooking.topic}</p><p className="mt-1 text-sm text-slate-700">{bookingDateTime(focusedBooking.startsAt, data.timeZone)} – {bookingDateTime(focusedBooking.endsAt, data.timeZone)}</p>{focusedBooking.calendarHoldStatus && <p className="mt-1 text-sm text-slate-600">{calendarHoldStatusText(focusedBooking.calendarHoldStatus)}</p>}<div className="mt-3 flex flex-wrap gap-2">{focusedBooking.canAccept && <button type="button" disabled={currentActing !== null} onClick={() => void act("accept_request", focusedBooking.requestId, { requestId: focusedBooking.requestId })} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">Accept request</button>}{focusedBooking.canDecline && <button type="button" disabled={currentActing !== null} onClick={() => handleAction(focusedBooking, "decline_request")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 disabled:opacity-60">Decline request</button>}{focusedBooking.canCancel && <button type="button" disabled={currentActing !== null} onClick={() => handleAction(focusedBooking, "cancel_request")} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-800 disabled:opacity-60">Cancel booking</button>}{focusedBooking.status === 'accepted' && <><button type="button" onClick={() => downloadCalendar(focusedBooking)} className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-900">Add to Apple or other calendar</button>{focusedBooking.calendarHoldStatus === 'not_recorded' && <button type="button" onClick={() => addToGoogle(focusedBooking)} className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-900">Add to Google Calendar</button>}</>}</div>{focusedBooking.status === 'accepted' && <p className="mt-2 text-xs text-slate-600">Manually added calendar copies may need an update if this booking changes. Check Almaworks for the latest status.</p>}</> : <p role="status" className="text-sm text-slate-700">This booking is not available in your semester.</p>}
    </section>}
    {details && !previewData && <BookingDetailsPanel key={`${data.semesterId}:${details.requestId}`} semesterId={data.semesterId} requestId={details.requestId} intent={details.intent} role={data.viewer.role} timeZone={data.timeZone} mentorSemesterId={data.history.find(request => request.requestId === details.requestId)?.mentorSemesterId} onTransitionWithoutNote={transition => act(transition === "declined" ? "decline_request" : "cancel_request", details.requestId, { requestId: details.requestId })} onClose={() => setDetails(null)} onChanged={() => { void load(); }} />}
    {(startup || admin) && <section aria-label="Weekly mentorship participation" className="mt-5 rounded-xl border border-slate-200 p-4"><h2 className="font-semibold text-[#002147]">{admin ? "Weekly mentorship participation" : "Your mentorship this week"}</h2><p className="mt-1 text-sm text-slate-600">{bookingWeek.label} · {formatTimeZoneLabel(data.timeZone)}</p>{!programWeek ? <p className="mt-2 text-sm">This week is outside the program dates.</p> : <><p className="mt-2 text-xs text-slate-600">Based on meetings scheduled for this week. Pending requests are not confirmed meetings; a past time does not establish attendance.</p>{participation.length === 0 && <p className="mt-2 text-sm">No enrolled startup records are available.</p>}<ul className="mt-3 space-y-2">{participation.map(row => <li key={row.startupSemesterId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><strong>{row.name}</strong><span className={row.status === "confirmed" ? "text-emerald-800" : "text-slate-700"}>{participationLabels[row.status]}</span></li>)}</ul>{admin && <p className="mt-3 text-sm font-medium">Needs attention: {participation.filter(row => !["confirmed", "meeting_passed"].includes(row.status)).length} startups</p>}</>}</section>}
    {(mentor || startup || admin) && <><PendingSessions requests={meetingSections.pending} role={data.viewer.role} timeZone={data.timeZone} onAction={handleAction} onDetails={openDetails} acting={currentActing} /><UpcomingSessions requests={meetingSections.upcoming} role={data.viewer.role} timeZone={data.timeZone} onAction={handleAction} onDetails={openDetails} acting={currentActing} /></>}
    {!previewData && (mentor || startup) && <CalendarConnectionCard key={`calendar-connection:${data.semesterId}`} semesterId={data.semesterId} role={mentor ? "mentor" : "startup"} returnTo={mentor ? "availability" : "bookings"} onAvailabilitySaved={() => void load()} />}
    {(startup || (admin && data.effectiveAvailability !== undefined)) && <StartupAvailabilityBrowser key={data.semesterId} data={data} weekOffset={weekOffset} onWeekChange={setWeekOffset} readOnly={!startup} acting={currentActing !== null || refreshFailed} requestError={error ?? (refreshFailed ? "Availability could not be refreshed. Retry before sending this request; your topic is retained." : null)} onRequest={(slot, topic) => startup ? act("request_booking", `${slot.mentorSemesterId}:${slot.startsAt}`, { mentorSemesterId: slot.mentorSemesterId, startsAt: slot.startsAt, endsAt: slot.endsAt, topic }) : Promise.resolve(false)} />}
    {admin && data.effectiveAvailability === undefined && <AdminWeeklyAvailability availability={data.availability ?? []} />}
    {!mentor && !startup && !admin && <div className="mt-5 space-y-3">{windows.map((window) => <article key={window.windowId} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="font-semibold text-[#002147]">{window.mentor.name}</p><p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><CalendarClock size={16} />{bookingDateTime(window.startsAt, data.timeZone)} – {bookingDateTime(window.endsAt, data.timeZone)}</p></div><span className={window.status === "available" ? "h-fit rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800" : "h-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"}>{formatEnumLabel(window.status)}</span></div>
      {window.request && <RequestCard request={window.request} timeZone={data.timeZone} onAction={(action) => void act(action, window.request!.requestId, { requestId: window.request!.requestId })} acting={currentActing !== null} />}
      {window.canWithdraw && <button type="button" disabled={currentActing !== null} onClick={() => void act("withdraw_window", window.windowId, { windowId: window.windowId })} className="mt-3 text-sm font-semibold text-rose-700 hover:text-rose-900 disabled:opacity-50">Withdraw window</button>}
      {window.canRequest && <div className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="sr-only" htmlFor={`topic-${window.windowId}`}>Request topic</label><input id={`topic-${window.windowId}`} value={topicByWindow[window.windowId] ?? ""} onChange={(event) => setTopicByWindow((current) => ({ ...current, [window.windowId]: event.target.value }))} placeholder="What would you like to discuss?" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button type="button" disabled={currentActing !== null || !(topicByWindow[window.windowId] ?? "").trim()} onClick={() => void act("request_window", window.windowId, { windowId: window.windowId, topic: (topicByWindow[window.windowId] ?? "").trim() })} className="rounded-lg bg-[#002147] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Request window</button></div>}
    </article>)}{windows.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">No mentor availability is available right now.</div>}</div>}
    <History onDetails={openDetails} requests={meetingSections.history.map((request) => ({ ...request, canCancel: false }))} role={data.viewer.role} timeZone={data.timeZone} />
  </section>;
}

function RequestCard({ request, timeZone, onAction, acting }: { request: MentorBookingRequest; timeZone: string; onAction: (action: "accept_request" | "decline_request" | "cancel_request") => void; acting: boolean }) {
  return <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold text-[#002147]">{request.startup.name} · {formatEnumLabel(request.status)}</p><p className="mt-1 text-slate-700"><span className="font-medium">Topic:</span> {request.topic}</p><p className="mt-1 text-xs text-slate-500">Requested {bookingDateTime(request.requestedAt, timeZone)}</p><div className="mt-3 flex flex-wrap gap-2">{request.canAccept && <button type="button" disabled={acting} onClick={() => onAction("accept_request")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Accept</button>}{request.canDecline && <button type="button" disabled={acting} onClick={() => onAction("decline_request")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60">Decline</button>}{request.canCancel && <button type="button" disabled={acting} onClick={() => onAction("cancel_request")} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60">Cancel request</button>}</div></div>;
}

function PendingSessions({ requests, role, timeZone, onAction, onDetails, acting }: { requests: MentorBookingRequest[]; role: MentorBookingWorkspaceResponse["viewer"]["role"]; timeZone: string; onDetails: (request: MentorBookingRequest) => void; onAction: (request: MentorBookingRequest, action: "accept_request" | "decline_request" | "cancel_request") => void; acting: string | null }) {
  if (requests.length === 0) return null;
  const description = role === "mentor" ? "Incoming requests awaiting your response." : role === "startup" ? "Your requests awaiting a mentor response." : "Requests awaiting a mentor response.";
  return <SessionList title="Pending requests" description={description} requests={requests} role={role} timeZone={timeZone} onAction={onAction} onDetails={onDetails} acting={acting} tone="pending" />;
}

function UpcomingSessions({ requests, role, timeZone, onAction, onDetails, acting }: { requests: MentorBookingRequest[]; role: MentorBookingWorkspaceResponse["viewer"]["role"]; timeZone: string; onDetails: (request: MentorBookingRequest) => void; onAction: (request: MentorBookingRequest, action: "accept_request" | "decline_request" | "cancel_request") => void; acting: string | null }) {
  if (requests.length === 0) return null;
  return <SessionList title="Upcoming meetings" description={role === "admin" ? "Confirmed mentor and startup sessions." : "Confirmed sessions with your mentor or startup."} requests={requests} role={role} timeZone={timeZone} onAction={onAction} onDetails={onDetails} acting={acting} tone="upcoming" />;
}

function SessionList({ title, description, requests, role, timeZone, onAction, onDetails, acting, tone }: { title: string; description: string; requests: MentorBookingRequest[]; role: MentorBookingWorkspaceResponse["viewer"]["role"]; timeZone: string; onDetails: (request: MentorBookingRequest) => void; onAction: (request: MentorBookingRequest, action: "accept_request" | "decline_request" | "cancel_request") => void; acting: string | null; tone: "pending" | "upcoming" }) {
  const pending = tone === "pending";
  return <section className="mt-6 border-t border-slate-100 pt-5" aria-label={title}><div className="flex items-baseline justify-between gap-3"><h2 className="text-xl font-semibold text-[#002147]">{title}</h2><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pending ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{requests.length}</span></div><p className="mt-1 text-sm text-slate-600">{description}</p><div className="mt-3 space-y-2">{requests.map((request) => <div key={request.requestId} className={`flex flex-col gap-2 rounded-lg border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${pending ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}><div><strong className="text-[#002147]">{participantLabel(request, role)}</strong><span className="ml-2 text-slate-600">{formatEnumLabel(request.status)}</span>{role !== "admin" && request.calendarHoldStatus && <p className="mt-1 text-xs text-slate-600">{calendarHoldStatusText(request.calendarHoldStatus)}</p>}<p className="mt-1 text-xs text-slate-600">{bookingDateTime(request.startsAt, timeZone)} - {bookingDateTime(request.endsAt, timeZone)}</p><p className="text-xs text-slate-500"><span className="font-medium">Topic:</span> {request.topic}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => onDetails(request)} className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900">Meeting details</button>{request.canAccept && <button type="button" disabled={acting !== null} onClick={() => onAction(request, "accept_request")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">Accept</button>}{request.canDecline && <button type="button" disabled={acting !== null} onClick={() => onAction(request, "decline_request")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 disabled:opacity-60">Decline</button>}{request.canCancel && <button type="button" disabled={acting !== null} onClick={() => onAction(request, "cancel_request")} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-60">Cancel</button>}</div></div>)}</div></section>;
}

function participantLabel(request: MentorBookingRequest, role: MentorBookingWorkspaceResponse["viewer"]["role"]) { return role === "admin" ? `${request.mentor.name} · ${request.startup.name}` : role === "mentor" ? request.startup.name : request.mentor.name; }

function AdminWeeklyAvailability({ availability }: { availability: Readonly<NonNullable<MentorBookingWorkspaceResponse["availability"]>> }) {
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const mentors = new Map<string, { name: string; ranges: string[] }>();
  for (const item of availability) {
    const mentor = mentors.get(item.mentorSemesterId) ?? { name: item.mentor.name, ranges: [] };
    mentor.ranges.push(`${weekday[item.weekday] ?? "Unknown day"} ${availabilityTime(item.startsAt)}–${availabilityTime(item.endsAt)}`);
    mentors.set(item.mentorSemesterId, mentor);
  }
  return <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Weekly availability"><h2 className="font-semibold text-[#002147]">Weekly availability</h2>{mentors.size === 0 ? <p className="mt-1 text-sm text-slate-600">No weekly availability has been shared for this semester.</p> : <div className="mt-3 space-y-3">{[...mentors.entries()].map(([mentorSemesterId, mentor]) => <div key={mentorSemesterId} className="rounded-lg border border-slate-200 bg-white p-3"><p className="font-medium text-[#002147]">{mentor.name}</p><ul className="mt-1 text-sm text-slate-600">{mentor.ranges.map((range) => <li key={range}>{range}</li>)}</ul></div>)}</div>}</section>;
}

function availabilityTime(value: string) {
  const normalized = value.slice(0, 5);
  const [hour, minute] = normalized.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return normalized;
  return formatAvailabilityTimeLabel(normalized) || new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}

function History({ requests, role, timeZone, onDetails }: { requests: MentorBookingRequest[]; role: MentorBookingWorkspaceResponse["viewer"]["role"]; timeZone: string; onDetails: (request: MentorBookingRequest) => void }) {
  if (requests.length === 0) return null;
  return <section className="mt-6 border-t border-slate-100 pt-5"><h2 className="font-semibold text-[#002147]">Booking history</h2><div className="mt-3 space-y-2">{requests.map(request => <article key={request.requestId} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-[#002147]">{participantLabel(request, role)}</strong><span className="ml-2 text-slate-600">{request.status === "accepted" ? "Meeting time passed" : request.status === "pending" ? "Request expired" : formatEnumLabel(request.status)}</span><p className="mt-1 text-xs text-slate-600">{bookingDateTime(request.startsAt, timeZone)} – {bookingDateTime(request.endsAt, timeZone)}</p><p className="mt-1 text-sm">Topic: {request.topic}</p><p className="mt-1 text-xs text-slate-600">{request.status === "accepted" ? "Attendance is not inferred. Open details to review or report an outcome." : "Open details for any explanation. A new time needs a new booking request."}</p></div><button type="button" onClick={() => onDetails(request)} className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-900">Details and outcome</button></article>)}</div></section>;
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
