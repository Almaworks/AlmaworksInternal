"use client";

import { CalendarDays, UsersRound } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { DataLoading } from "@/components/DataLoading";

import {
  applyPublishedProgram,
  agendaTimeLabel,
  isCurrentFridayProgramResponse,
  isFridayProgramResponse,
  isFridayProgram,
  isFridaySpeaker,
  meetingProgramState,
  participantGroupLabel,
  selectDefaultFridayMeeting,
  type FridayProgramMeeting,
} from "./presentation";
import type { FridayProgramResponse as FridayProgramApiResponse } from "@/src/friday-program/types";
import type { FridaySpeaker } from "@/src/friday-program/types";

type FridayProgramResponse = FridayProgramApiResponse;

type FridayProgramPanelProps = {
  semesterId: string | null | undefined;
  focusedMeetingId?: string | null;
  startupSemesterId?: string | null;
  canGenerate?: boolean;
  canEditSpeaker?: boolean;
  previewData?: FridayProgramResponse;
  previewGeneratedProgram?: NonNullable<FridayProgramMeeting["program"]>;
  heading?: string;
};

function meetingTitle(meeting: FridayProgramMeeting): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(meeting.meetingDate + "T12:00:00Z"));
  return meeting.label ? meeting.label + " · " + date : date;
}

function todayIsoDate(): string {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export function FridayProgramPanel({
  semesterId,
  focusedMeetingId,
  startupSemesterId,
  canGenerate = false,
  canEditSpeaker = false,
  previewData,
  previewGeneratedProgram,
  heading = "Friday program",
}: FridayProgramPanelProps) {
  const [data, setData] = useState<FridayProgramResponse | null>(previewData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(previewData === undefined);
  const [renderedSemesterId, setRenderedSemesterId] = useState<string | null>(previewData?.semesterId ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingSpeaker, setIsSavingSpeaker] = useState(false);
  const [isNotifyingSpeaker, setIsNotifyingSpeaker] = useState(false);
  const [isRemovingSpeaker, setIsRemovingSpeaker] = useState(false);
  const [isSavingCancellation, setIsSavingCancellation] = useState(false);
  const [isSavingLabel, setIsSavingLabel] = useState(false);
  const [isLabelEditorOpen, setIsLabelEditorOpen] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  const [labelMessage, setLabelMessage] = useState<string | null>(null);
  const [isSpeakerEditorOpen, setIsSpeakerEditorOpen] = useState(false);
  const [speakerDraft, setSpeakerDraft] = useState<FridaySpeaker>({ name: "", bio: "", expertise: "", topic: "", contactEmail: "", contactPhone: null, linkedinUrl: null, websiteUrl: null });
  const [speakerMessage, setSpeakerMessage] = useState<string | null>(null);
  const [cancellationMessage, setCancellationMessage] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(() => focusedMeetingId ?? selectDefaultFridayMeeting(previewData?.meetings ?? [], todayIsoDate())?.meeting.meetingId ?? null);
  const loadRequestId = useRef(0);
  const generationRequestId = useRef(0);
  const draftMeetingRef = useRef<string | null>(null);
  const scopeRef = useRef(semesterId ?? "");
  const priorScopeRef = useRef<string | null | undefined>(semesterId);
  if (priorScopeRef.current !== semesterId) {
    priorScopeRef.current = semesterId;
    loadRequestId.current += 1;
    generationRequestId.current += 1;
  }
  scopeRef.current = semesterId ?? "";
  const titleId = useId();
  const errorId = useId();

  const load = useCallback(async () => {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;
    if (previewData) {
      setData(previewData);
      setSelectedMeetingId((current) => focusedMeetingId ?? current ?? selectDefaultFridayMeeting(previewData.meetings, todayIsoDate())?.meeting.meetingId ?? null);
      setError(null);
      setIsLoading(false);
      setRenderedSemesterId(previewData.semesterId);
      return;
    }
    if (!semesterId) {
      setData(null);
      setError("A semester must be selected before the Friday program can be shown.");
      setIsLoading(false);
      setRenderedSemesterId(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setData(null);
    setSelectedMeetingId(null);
    try {
      const response = await authenticatedFetch("/api/friday-program?semesterId=" + encodeURIComponent(semesterId));
      const payload = await response.json() as FridayProgramResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The Friday program could not be loaded.");
      if (!isFridayProgramResponse(payload)) throw new Error("The Friday program response was incomplete. Please try again.");
      if (loadRequestId.current !== requestId) return;
      if (!isCurrentFridayProgramResponse(semesterId, payload)) throw new Error("The Friday program response did not match the selected semester.");
      setData(payload);
      setRenderedSemesterId(semesterId);
      setSelectedMeetingId((current) => focusedMeetingId ?? current ?? selectDefaultFridayMeeting(payload.meetings, todayIsoDate())?.meeting.meetingId ?? null);
    } catch (cause) {
      if (loadRequestId.current !== requestId) return;
      setData(null);
      setRenderedSemesterId(semesterId);
      setError(cause instanceof Error ? cause.message : "The Friday program could not be loaded.");
    } finally {
      if (loadRequestId.current === requestId) setIsLoading(false);
    }
  }, [previewData, semesterId, focusedMeetingId]);

  useEffect(() => {
    void load();
    return () => {
      loadRequestId.current += 1;
      generationRequestId.current += 1;
    };
  }, [load]);

  useEffect(() => {
    setIsGenerating(false);
  }, [semesterId, previewData]);

  const selectedMeeting = useMemo(
    () => data?.meetings.find((meeting) => meeting.meetingId === selectedMeetingId) ?? (focusedMeetingId ? null : data?.meetings[0] ?? null),
    [data, selectedMeetingId, focusedMeetingId],
  );
  useEffect(() => {
    const key = selectedMeeting ? `${semesterId}/${selectedMeeting.meetingId}` : null;
    if (draftMeetingRef.current === key) return;
    draftMeetingRef.current = key;
    setSpeakerDraft(selectedMeeting?.speaker ?? { name: "", bio: "", expertise: "", topic: "", contactEmail: "", contactPhone: null, linkedinUrl: null, websiteUrl: null });
    setSpeakerMessage(null);
    setCancellationMessage(null);
    setLabelDraft(selectedMeeting?.label ?? "");
    setLabelMessage(null);
    setIsLabelEditorOpen(false);
    setIsSpeakerEditorOpen(false);
  }, [selectedMeeting, semesterId]);
  const selectedWeekNumber = data && selectedMeeting ? data.meetings.findIndex((meeting) => meeting.meetingId === selectedMeeting.meetingId) + 1 : null;
  const defaultMeeting = data ? selectDefaultFridayMeeting(data.meetings, todayIsoDate()) : null;
  const selectedTiming = defaultMeeting && defaultMeeting.meeting.meetingId === selectedMeeting?.meetingId ? defaultMeeting.timing : null;
  const selectedIsCanceled = selectedMeeting?.status === "canceled";
  const canManageWeek = canGenerate || canEditSpeaker;

  async function saveWeekLabel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!semesterId || !selectedMeeting || !canManageWeek || isSavingLabel || previewData) return;
    const label = labelDraft.trim();
    if (!label || label.length > 160) {
      setLabelMessage("Enter a week label of 1–160 characters.");
      return;
    }
    const meetingId = selectedMeeting.meetingId;
    const scope = semesterId;
    setIsSavingLabel(true);
    setLabelMessage(null);
    try {
      const response = await authenticatedFetch("/api/admin/friday-program/label", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semesterId, meetingId, label }),
      });
      const payload = await response.json() as { error?: string; label?: string; meetingId?: string };
      if (!response.ok || payload.label !== label || payload.meetingId !== meetingId) throw new Error(payload.error ?? "The week label could not be saved.");
      if (scopeRef.current !== scope) return;
      setData((current) => current === null ? current : { ...current, meetings: current.meetings.map((meeting) => meeting.meetingId === meetingId ? { ...meeting, label } : meeting) });
      setIsLabelEditorOpen(false);
      setLabelMessage("Week label saved.");
    } catch (cause) {
      if (scopeRef.current === scope) setLabelMessage(cause instanceof Error ? cause.message : "The week label could not be saved.");
    } finally { if (scopeRef.current === scope) setIsSavingLabel(false); }
  }

  async function generateGroups(regenerate = false) {
    if (!semesterId || !selectedMeeting || !canGenerate || selectedMeeting.status === "canceled" || isGenerating) return;
    if (previewData) {
      if (!previewGeneratedProgram) return;
      setData((current) => current === null ? current : {
        ...current,
        meetings: applyPublishedProgram(current.meetings, selectedMeeting.meetingId, previewGeneratedProgram),
      });
      return;
    }
    const generationId = generationRequestId.current + 1;
    generationRequestId.current = generationId;
    const scopeAtStart = semesterId;
    setIsGenerating(true);
    setError(null);
    try {
      const response = await authenticatedFetch("/api/admin/friday-program/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semesterId, meetingId: selectedMeeting.meetingId, regenerate }),
      });
      const payload = await response.json() as { created?: boolean; program?: FridayProgramMeeting["program"]; error?: string };
      if (!response.ok || !isFridayProgram(payload.program)) throw new Error(payload.error ?? "Groups could not be generated.");
      const savedProgram = payload.program;
      if (generationRequestId.current !== generationId || scopeRef.current !== scopeAtStart) return;
      setData((current) => current === null ? current : {
        ...current,
        meetings: applyPublishedProgram(current.meetings, selectedMeeting.meetingId, savedProgram),
      });
    } catch (cause) {
      if (generationRequestId.current !== generationId || scopeRef.current !== scopeAtStart) return;
      setError(cause instanceof Error ? cause.message : "Groups could not be generated.");
    } finally {
      if (generationRequestId.current === generationId && scopeRef.current === scopeAtStart) setIsGenerating(false);
    }
  }

  function regenerateGroups() {
    if (!selectedMeeting || !window.confirm(`Regenerate groups for ${meetingTitle(selectedMeeting)}? This replaces that week's saved group assignments.`)) return;
    void generateGroups(true);
  }

  async function saveSpeaker(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!semesterId || !selectedMeeting || selectedMeeting.status === "canceled" || !canEditSpeaker || isSavingSpeaker || isRemovingSpeaker || previewData) return;
    const meetingId = selectedMeeting.meetingId;
    const scope = semesterId;
    setIsSavingSpeaker(true);
    setSpeakerMessage(null);
    try {
      const response = await authenticatedFetch("/api/admin/friday-program/speaker", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semesterId, meetingId, ...speakerDraft }),
      });
      const payload = await response.json() as { speaker?: unknown; error?: string; notificationError?: string; notification?: { accepted: number; queued: number; rejected: number; unknown: number; skipped: number } };
      if (!response.ok || !isFridaySpeaker(payload.speaker)) throw new Error(payload.error ?? "Speaker details could not be saved.");
      if (scopeRef.current !== scope) return;
      const speaker = payload.speaker;
      setData((current) => current === null ? current : { ...current, meetings: current.meetings.map((meeting) => meeting.meetingId === meetingId ? { ...meeting, speaker } : meeting) });
      const delivery = payload.notification;
      setSpeakerMessage(payload.notificationError ?? (delivery?.accepted ? `Speaker saved. Sequenzy accepted ${delivery.accepted} email${delivery.accepted === 1 ? '' : 's'}; delivery is still pending.` : delivery?.queued ? `Speaker saved. ${delivery.queued} email${delivery.queued === 1 ? ' is' : 's are'} queued; sending is not configured yet.` : delivery && (delivery.rejected || delivery.unknown) ? 'Speaker saved. Some email submissions need administrator review.' : 'Speaker details saved. No new email was sent.'));
      setIsSpeakerEditorOpen(false);
    } catch (cause) {
      if (scopeRef.current === scope) setSpeakerMessage(cause instanceof Error ? cause.message : "Speaker details could not be saved.");
    } finally { if (scopeRef.current === scope) setIsSavingSpeaker(false); }
  }

  async function notifyStartupsOfSpeaker() {
    if (!semesterId || !selectedMeeting?.speaker || selectedMeeting.status === 'canceled' || !canEditSpeaker || isNotifyingSpeaker || previewData) return;
    if (!window.confirm(`Send the saved speaker announcement for ${meetingTitle(selectedMeeting)} to active startup members? Repeated sends for this version are skipped.`)) return;
    const scope = semesterId;
    setIsNotifyingSpeaker(true);
    setSpeakerMessage(null);
    try {
      const response = await authenticatedFetch('/api/admin/friday-program/speaker', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ semesterId, meetingId: selectedMeeting.meetingId }) });
      const payload = await response.json() as { notification?: { accepted: number; queued: number; rejected: number; unknown: number; skipped: number }; error?: string };
      if (!response.ok || !payload.notification) throw new Error(payload.error ?? 'The speaker announcement could not be processed.');
      if (scopeRef.current !== scope) return;
      const result = payload.notification;
      setSpeakerMessage(result.accepted ? `Sequenzy accepted ${result.accepted} email${result.accepted === 1 ? '' : 's'}; delivery is still pending.` : result.queued ? `${result.queued} email${result.queued === 1 ? ' is' : 's are'} queued; sending is not configured yet.` : result.rejected || result.unknown ? 'Some email submissions need administrator review.' : result.skipped ? 'This speaker announcement was already processed. No duplicate email was sent.' : 'No eligible startup members were found.');
    } catch (cause) {
      if (scopeRef.current === scope) setSpeakerMessage(cause instanceof Error ? cause.message : 'The speaker announcement could not be processed.');
    } finally { if (scopeRef.current === scope) setIsNotifyingSpeaker(false); }
  }

  async function removeSpeaker() {
    if (!semesterId || !selectedMeeting?.speaker || selectedMeeting.status === "canceled" || !canEditSpeaker || isSavingSpeaker || isRemovingSpeaker || previewData) return;
    if (!window.confirm(`Remove ${selectedMeeting.speaker.name} from ${meetingTitle(selectedMeeting)}?`)) return;
    const meetingId = selectedMeeting.meetingId;
    const scope = semesterId;
    setIsRemovingSpeaker(true);
    setSpeakerMessage(null);
    try {
      const response = await authenticatedFetch("/api/admin/friday-program/speaker", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semesterId, meetingId }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== "object" || !("speaker" in payload) || payload.speaker !== null) {
        throw new Error(payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "Speaker could not be removed.");
      }
      if (scopeRef.current !== scope) return;
      setData((current) => current === null ? current : { ...current, meetings: current.meetings.map((meeting) => meeting.meetingId === meetingId ? { ...meeting, speaker: null } : meeting) });
      setSpeakerDraft({ name: "", bio: "", expertise: "", topic: "", contactEmail: "", contactPhone: null, linkedinUrl: null, websiteUrl: null });
      setIsSpeakerEditorOpen(false);
      setSpeakerMessage("Speaker removed from this Friday.");
    } catch (cause) {
      if (scopeRef.current === scope) setSpeakerMessage(cause instanceof Error ? cause.message : "Speaker could not be removed.");
    } finally { if (scopeRef.current === scope) setIsRemovingSpeaker(false); }
  }

  async function setWeekCanceled(canceled: boolean) {
    if (!semesterId || !selectedMeeting || !canManageWeek || data?.cancellationSetupPending || isSavingCancellation || previewData) return;
    const action = canceled ? "Cancel" : "Restore";
    if (!window.confirm(`${action} ${meetingTitle(selectedMeeting)}? ${canceled ? "Saved groups and speaker details will be preserved, but this week cannot be edited while canceled." : "Administrators will be able to edit this week again."}`)) return;
    const meetingId = selectedMeeting.meetingId;
    const scope = semesterId;
    setIsSavingCancellation(true);
    setCancellationMessage(null);
    try {
      const response = await authenticatedFetch("/api/admin/friday-program/cancellation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semesterId, meetingId, canceled }),
      });
      const payload = await response.json() as { meeting?: unknown; error?: string };
      if (!response.ok || !isFridayProgramResponse({ semesterId, agenda: data?.agenda ?? [], meetings: payload.meeting ? [payload.meeting] : [] }) || !payload.meeting) {
        throw new Error(payload.error ?? `The Friday week could not be ${canceled ? "canceled" : "restored"}.`);
      }
      if (scopeRef.current !== scope) return;
      const savedMeeting = payload.meeting as FridayProgramMeeting;
      setData((current) => current === null ? current : { ...current, meetings: current.meetings.map((meeting) => meeting.meetingId === meetingId ? savedMeeting : meeting) });
      setIsSpeakerEditorOpen(false);
      setCancellationMessage(canceled ? "Friday week canceled. Saved details were preserved." : "Friday week restored.");
    } catch (cause) {
      if (scopeRef.current === scope) setCancellationMessage(cause instanceof Error ? cause.message : `The Friday week could not be ${canceled ? "canceled" : "restored"}.`);
    } finally { if (scopeRef.current === scope) setIsSavingCancellation(false); }
  }

  if (isLoading || (semesterId !== undefined && semesterId !== null && renderedSemesterId !== semesterId)) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-busy="true">
      <DataLoading label="Loading Friday program" compact />
    </section>;
  }

  if (error) {
    return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5" aria-labelledby={errorId}>
      <h2 id={errorId} className="font-semibold text-[#002147]">{heading}</h2>
      <p className="mt-2 text-sm text-rose-800" role="alert">{error}</p>
      <button type="button" onClick={() => void load()} className="mt-4 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-[#002147]">Try again</button>
    </section>;
  }

  if (!data || data.meetings.length === 0) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 text-[#75AADB]" size={20} /><div><h2 className="font-semibold text-[#002147]">{heading}</h2><p className="mt-1 text-sm text-slate-600">No Friday meetings are scheduled for this semester yet.</p></div></div>
    </section>;
  }

  if (focusedMeetingId && !selectedMeeting) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Friday session unavailable"><h2 className="font-semibold text-[#002147]">Friday session unavailable</h2><p className="mt-2 text-sm text-slate-600">This Friday session is not available in your semester.</p></section>;
  }

  const programState = selectedMeeting ? meetingProgramState(selectedMeeting) : null;
  const ownGroup = selectedMeeting ? participantGroupLabel(selectedMeeting, startupSemesterId) : null;
  const selectedProgram = selectedMeeting?.program ?? null;

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby={titleId}>
    <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#75AADB]">{selectedWeekNumber ? `Week ${selectedWeekNumber} · ` : ""}{selectedTiming === "current" ? "Current Friday · " : selectedTiming === "upcoming" ? "Next Friday · " : selectedTiming === "most-recent" ? "Most recent Friday · " : ""}120 minutes · Minutes from start</p><h2 id={titleId} className="mt-1 text-xl font-semibold text-[#002147]">{heading}</h2><p className="mt-1 text-sm text-slate-600">Startup standups, a speaker session, and two small-group rounds.</p></div>
      {ownGroup && <span className="w-fit rounded-full bg-[#e7f2f9] px-3 py-1.5 text-sm font-semibold text-[#002147]">Your company: {ownGroup}</span>}
    </div>

    <div className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Friday program weeks">
      {data.meetings.map((meeting, index) => <button type="button" key={meeting.meetingId} aria-label={`Week ${index + 1}: ${meetingTitle(meeting)}`} aria-pressed={selectedMeeting?.meetingId === meeting.meetingId} onClick={() => setSelectedMeetingId(meeting.meetingId)} className={"whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium " + (selectedMeeting?.meetingId === meeting.meetingId ? "border-[#002147] bg-[#002147] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-[#75AADB]")}>
        {`Week ${index + 1} · ${meetingTitle(meeting)}`}
      </button>)}
    </div>

    {selectedMeeting && canManageWeek && <div className="mt-4">
      {!isLabelEditorOpen && <button type="button" onClick={() => { setLabelDraft(selectedMeeting.label ?? ""); setLabelMessage(null); setIsLabelEditorOpen(true); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-[#002147]">Edit week label</button>}
      {isLabelEditorOpen && <form onSubmit={(event) => void saveWeekLabel(event)} className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 p-3">
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium text-[#002147]">Week label<input value={labelDraft} onChange={(event) => setLabelDraft(event.target.value)} maxLength={160} required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <button type="submit" disabled={isSavingLabel || Boolean(previewData)} className="rounded-lg bg-[#002147] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{isSavingLabel ? "Saving…" : "Save label"}</button>
        <button type="button" onClick={() => setIsLabelEditorOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-[#002147]">Cancel</button>
      </form>}
      {labelMessage && <p className="mt-2 text-sm text-slate-700" role="status">{labelMessage}</p>}
    </div>}

    {selectedMeeting?.status === "canceled" && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4" role="status">
      <p className="font-semibold text-rose-900">This Friday program week is canceled.</p>
      <p className="mt-1 text-sm text-rose-800">Saved speaker details and group history remain available for reference.</p>
    </div>}

    {canManageWeek && data.cancellationSetupPending && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">Week cancellation controls will be available after the database update is installed. The existing Friday program remains readable.</p>}
    {selectedMeeting && canManageWeek && !data.cancellationSetupPending && <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" disabled={isSavingCancellation || Boolean(previewData)} onClick={() => void setWeekCanceled(!selectedIsCanceled)} className={selectedIsCanceled ? "rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-60" : "rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"}>{isSavingCancellation ? "Saving…" : selectedIsCanceled ? "Restore week" : "Cancel week"}</button>
      {cancellationMessage && <p className="text-sm text-slate-700" role="status">{cancellationMessage}</p>}
    </div>}

    <ol className="mt-5 grid gap-2 sm:grid-cols-2" aria-label="Friday agenda">
      {data.agenda.map((item) => <li key={item.key} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
        <div className="flex items-center justify-between gap-3"><strong className="text-sm text-[#002147]">{item.label}</strong><span className="text-xs font-semibold text-slate-500">{agendaTimeLabel(item)}</span></div>
        {"facilitators" in item && <p className="mt-1 text-xs text-slate-600">Group A: {item.facilitators.A} · Group B: {item.facilitators.B}</p>}
      </li>)}
    </ol>

    {data.speakerSetupPending && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">Speaker details are unavailable until an administrator completes database setup. The Friday schedule remains available.</p>}
    {selectedMeeting?.speaker && <section className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4" aria-label="Friday speaker">
      <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">This week&apos;s speaker</p>
      <h3 className="mt-1 text-lg font-semibold text-[#002147]">{selectedMeeting.speaker.name}</h3>
      <p className="mt-1 text-sm font-medium text-slate-800">{selectedMeeting.speaker.topic}</p>
      <p className="mt-2 text-sm text-slate-700">{selectedMeeting.speaker.bio}</p>
      <p className="mt-2 text-sm text-slate-600">Expertise: {selectedMeeting.speaker.expertise}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <a className="font-medium text-sky-800 underline" href={`mailto:${selectedMeeting.speaker.contactEmail}`}>{selectedMeeting.speaker.contactEmail}</a>
        {selectedMeeting.speaker.contactPhone && <span className="font-medium text-sky-800">{selectedMeeting.speaker.contactPhone}</span>}
        {selectedMeeting.speaker.linkedinUrl && <a className="font-medium text-sky-800 underline" href={selectedMeeting.speaker.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
        {selectedMeeting.speaker.websiteUrl && <a className="font-medium text-sky-800 underline" href={selectedMeeting.speaker.websiteUrl} target="_blank" rel="noopener noreferrer">Website</a>}
      </div>
    </section>}

    {selectedMeeting && !selectedIsCanceled && canEditSpeaker && !data.speakerSetupPending && <div className="mt-4 flex flex-wrap items-center gap-3">
      {!isSpeakerEditorOpen && <button type="button" onClick={() => { setSpeakerDraft(selectedMeeting.speaker ?? { name: "", bio: "", expertise: "", topic: "", contactEmail: "", contactPhone: null, linkedinUrl: null, websiteUrl: null }); setSpeakerMessage(null); setIsSpeakerEditorOpen(true); }} className="rounded-lg border border-[#002147] px-4 py-2 text-sm font-semibold text-[#002147]">{selectedMeeting.speaker ? "Edit speaker" : "Assign speaker"}</button>}
      {selectedMeeting.speaker && <button type="button" disabled={isSavingSpeaker || isRemovingSpeaker || isNotifyingSpeaker || Boolean(previewData)} onClick={() => void notifyStartupsOfSpeaker()} className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-[#002147] disabled:opacity-60">{isNotifyingSpeaker ? 'Checking announcement…' : 'Notify startups'}</button>}
      {selectedMeeting.speaker && <button type="button" disabled={isSavingSpeaker || isRemovingSpeaker || Boolean(previewData)} onClick={() => void removeSpeaker()} className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60">{isRemovingSpeaker ? "Removing…" : "Remove speaker"}</button>}
      {speakerMessage && <p className="text-sm text-slate-700" role="status">{speakerMessage}</p>}
    </div>}

    {selectedMeeting && !selectedIsCanceled && canEditSpeaker && !data.speakerSetupPending && isSpeakerEditorOpen && <form className="mt-5 rounded-xl border border-slate-200 p-4" onSubmit={(event) => void saveSpeaker(event)}>
      <h3 className="font-semibold text-[#002147]">Speaker assignment</h3>
      <p className="mt-1 text-sm text-slate-600">Set the speaker for {meetingTitle(selectedMeeting)}. Mentors can view these details in Friday Program.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {([['name', 'Name'], ['topic', 'Session topic'], ['expertise', 'Expertise'], ['contactEmail', 'Contact email'], ['contactPhone', 'Contact phone'], ['linkedinUrl', 'LinkedIn URL'], ['websiteUrl', 'Website URL']] as const).map(([key, label]) => <label key={key} className="text-sm font-medium text-slate-700">{label}{key === 'contactPhone' || key === 'linkedinUrl' || key === 'websiteUrl' ? ' (optional)' : ''}<input className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" type={key === 'contactEmail' ? 'email' : key === 'linkedinUrl' || key === 'websiteUrl' ? 'url' : 'text'} required={key !== 'contactPhone' && key !== 'linkedinUrl' && key !== 'websiteUrl'} value={speakerDraft[key] ?? ''} onChange={(event) => setSpeakerDraft((current) => ({ ...current, [key]: event.target.value || (key === 'contactPhone' || key === 'linkedinUrl' || key === 'websiteUrl' ? null : '') }))} /></label>)}
      </div>
      <label className="mt-3 block text-sm font-medium text-slate-700">Bio<textarea className="mt-1 block min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" required value={speakerDraft.bio} onChange={(event) => setSpeakerDraft((current) => ({ ...current, bio: event.target.value }))} /></label>
      <div className="mt-3 flex flex-wrap gap-2"><button className="rounded-lg bg-[#002147] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={isSavingSpeaker || Boolean(previewData)}>{isSavingSpeaker ? "Saving…" : "Save speaker"}</button><button type="button" disabled={isSavingSpeaker} onClick={() => { setIsSpeakerEditorOpen(false); setSpeakerMessage(null); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Cancel</button></div>
    </form>}

    {selectedMeeting && !selectedIsCanceled && programState?.kind === "unpublished" && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-950">{programState.message}</p>
      {canGenerate && <button type="button" disabled={isGenerating} onClick={() => void generateGroups()} className="mt-3 rounded-lg bg-[#002147] px-3 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70">{isGenerating ? "Generating groups…" : "Generate weekly groups"}</button>}
    </div>}

    {selectedProgram && <div className="mt-5 grid gap-3 md:grid-cols-2">
      {(["A", "B"] as const).map((group) => <section key={group} className="rounded-xl border border-slate-200 p-4" aria-label={"Group " + group}>
        <div className="flex items-center gap-2"><UsersRound size={17} className="text-[#75AADB]" /><h3 className="font-semibold text-[#002147]">Group {group}</h3><span className="text-xs text-slate-500">{selectedProgram.groups[group].length} companies</span></div>
        <ul className="mt-3 space-y-2">{selectedProgram.groups[group].map((startup) => <li key={startup.startupSemesterId} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{startup.name}</li>)}</ul>
      </section>)}
    </div>}

    {selectedProgram && !selectedIsCanceled && canGenerate && <button type="button" disabled={isGenerating} onClick={regenerateGroups} className="mt-5 rounded-lg border border-[#002147] px-3 py-2 text-sm font-semibold text-[#002147] disabled:cursor-wait disabled:opacity-70">{isGenerating ? "Regenerating groups..." : "Regenerate weekly groups"}</button>}
  </section>;
}

export type { FridayProgramResponse };
