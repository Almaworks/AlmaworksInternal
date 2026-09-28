"use client";

import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import type { BookingContextCommand, MentorBookingContext } from "@/src/mentor-booking/context";

const field = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900";
const button = "rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-900 disabled:opacity-50";
function safeHref(value: string | null): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}

export function BookingDetailsPanel({ semesterId, requestId, intent, role, timeZone, mentorSemesterId, onChanged, onClose, onTransitionWithoutNote }: {
  role: "mentor" | "startup" | "admin"; timeZone: string; mentorSemesterId?: string; semesterId: string; requestId: string; intent?: "declined" | "cancelled";
  onChanged: () => void; onClose: () => void; onTransitionWithoutNote: (transition: "declined" | "cancelled") => Promise<boolean>;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [requestId, intent]);
  const [context, setContext] = useState<MentorBookingContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [location, setLocation] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [note, setNote] = useState("");
  const [alternativeText, setAlternativeText] = useState("");
  const [attendance, setAttendance] = useState<"attended" | "missed">("attended");
  const [feedback, setFeedback] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function read() {
      try {
        const response = await authenticatedFetch(`/api/mentor-booking-context?semesterId=${semesterId}&requestId=${requestId}`, { signal: controller.signal });
        const payload = await response.json() as { context?: MentorBookingContext; error?: string };
        if (!response.ok || !payload.context) throw new Error(payload.error ?? "Meeting details could not be loaded.");
        if (controller.signal.aborted) return;
        setContext(payload.context);
        setLocation(payload.context.meeting?.location ?? ""); setVideoUrl(payload.context.meeting?.videoUrl ?? "");
        const own = payload.context.outcomes.find(outcome => outcome.reporterProfileId === payload.context!.viewerProfileId);
        setAttendance(own?.attendance ?? "attended"); setFeedback(own?.feedback ?? "");
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Meeting details could not be loaded."); }
    }
    setError(null); void read(); return () => controller.abort();
  }, [semesterId, requestId, revision]);
  async function save(command: BookingContextCommand) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const response = await authenticatedFetch("/api/mentor-booking-context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Your change could not be saved.");
      setNotice(command.action === "transition_with_note" ? "Booking status and explanation saved." : "Saved.");
      setRevision(value => value + 1); onChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your change could not be saved."); }
    finally { setBusy(false); }
  }
  const ids = { semesterId, requestId };
  const ownOutcome = context?.outcomes.find(outcome => outcome.reporterProfileId === context.viewerProfileId);
  const transitionAllowed = intent === "declined" ? context?.permissions.canDecline : context?.permissions.canCancel;
  return <section aria-label="Meeting details" className="my-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-slate-800">
    <header className="flex items-center justify-between gap-3"><h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-[#002147]">Meeting details</h2><button type="button" className={button} disabled={busy} onClick={onClose}>Close details</button></header>
    {error && <div role="alert" className="mt-3 text-sm text-rose-800">{error} <button type="button" disabled={busy} className="underline" onClick={() => setRevision(value => value + 1)}>Reload details</button></div>}
    {notice && <p role="status" className="mt-3 text-sm text-emerald-800">{notice}</p>}
    {!context && !error && <p role="status" className="mt-3">Loading meeting details…</p>}
    {context && <>
      <p className="mt-2 font-medium">{context.mentor.name} · {context.startup.name}</p><p className="mt-1 text-sm">Topic: {context.topic}</p><p className="mt-1 text-sm">{new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(context.startsAt))} – {new Intl.DateTimeFormat("en-US", { timeZone, timeStyle: "short" }).format(new Date(context.endsAt))} ({timeZone})</p>
      {!context.persistenceAvailable && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Shared meeting details, explanations, and outcome recording are awaiting database setup. Contact and startup information remain available.</p>}
      {intent && !context.persistenceAvailable && transitionAllowed && <div className="mt-3 rounded-lg border border-amber-300 p-3"><p className="text-sm">Explanations cannot be saved until setup is finished. You can still use the existing booking action.</p><button type="button" disabled={busy} className={`${button} mt-2`} onClick={async () => { setBusy(true); try { if (await onTransitionWithoutNote(intent)) onClose(); } finally { setBusy(false); } }}>{intent === "declined" ? "Decline without explanation" : "Cancel without explanation"}</button></div>}
      <div className="mt-4 grid gap-5 md:grid-cols-2"><section><h3 className="font-semibold">Where to meet</h3>
        <p className="mt-1 text-sm">{context.meeting?.location || "Location not provided. Coordinate with the other party before the meeting."}</p>
        {safeHref(context.meeting?.videoUrl ?? null) && <a className="mt-2 inline-block font-medium text-sky-800 underline" href={safeHref(context.meeting?.videoUrl ?? null)} target="_blank" rel="noopener noreferrer">Join meeting</a>}
        {!context.meeting?.videoUrl && <p className="mt-1 text-sm">No video link has been provided.</p>}
        {mentorSemesterId && <a className="mt-2 block text-sm text-sky-800 underline" href={`/dashboard/mentors/${mentorSemesterId}`}>View mentor profile</a>}<h3 className="mt-4 font-semibold">Participants and contacts</h3><p className="mt-1 text-sm">Mentor: {context.mentor.name} {context.mentor.email && <a className="break-all text-sky-800 underline" href={`mailto:${context.mentor.email}`}>{context.mentor.email}</a>}</p>
        <p className="mt-2 text-xs text-slate-600">Startup team contacts; attendance is not automatically confirmed.</p>
        <ul className="mt-1 space-y-1 text-sm">{context.startup.team.map(person => <li key={person.profileId}>{person.name} {person.email && <a className="break-all text-sky-800 underline" href={`mailto:${person.email}`}>{person.email}</a>}</li>)}</ul>
        {context.startup.team.length === 0 && <p className="text-sm">No active team contacts are available.</p>}
      </section><section><h3 className="font-semibold">About {context.startup.name}</h3><p className="mt-1 text-sm">{context.startup.description || "This startup has not added a description yet."}</p>{context.startup.industry && <p className="mt-1 text-sm">Industry: {context.startup.industry}</p>}
        {role === "mentor" && <a className="mt-2 inline-block text-sm text-sky-800 underline" href={`/dashboard/mentor?tab=startups#startup-${context.startup.startupSemesterId}`}>View startup profile</a>}<h4 className="mt-3 text-sm font-semibold">Goals</h4><p className="text-sm">{context.startup.goals.join(" · ") || "No goals provided yet."}</p>
        <h4 className="mt-3 text-sm font-semibold">Mentorship needs</h4><p className="text-sm">{context.startup.needs.join(" · ") || "No needs provided yet."}</p>{context.startup.needsContext && <p className="mt-2 whitespace-pre-wrap text-sm">{context.startup.needsContext}</p>}
        {safeHref(context.startup.websiteUrl) && <a className="mt-2 inline-block text-sm text-sky-800 underline" href={safeHref(context.startup.websiteUrl)} target="_blank" rel="noopener noreferrer">Startup website</a>}
      </section></div>
      {context.decision && <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3"><h3 className="font-semibold">{context.decision.kind === "declined" ? "Decline explanation" : "Cancellation explanation"}</h3><p className="mt-1 whitespace-pre-wrap text-sm">{context.decision.note}</p>{context.decision.alternativeText && <p className="mt-2 whitespace-pre-wrap text-sm">Suggested next step: {context.decision.alternativeText}</p>}<p className="mt-2 text-xs">Any alternative still needs a new confirmed booking.</p></section>}
      {context.permissions.canEditMeeting && <details className="mt-4"><summary className="cursor-pointer font-semibold">Edit shared meeting details</summary><form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void save({ action: "save_meeting", ...ids, location: location.trim() || null, videoUrl: videoUrl.trim() || null, expectedUpdatedAt: context.meeting?.updatedAt ?? null }); }}><label className="block text-sm">Location / joining instructions<input className={field} value={location} maxLength={500} disabled={busy} onChange={event => setLocation(event.target.value)} /></label><label className="block text-sm">Video meeting URL<input className={field} type="url" value={videoUrl} maxLength={2000} disabled={busy} onChange={event => setVideoUrl(event.target.value)} placeholder="https://…" /></label><p className="text-xs">Visible to this booking’s participants and program admins. These details do not create or update a video call or Google Calendar event.</p><button className={button} disabled={busy}>Save meeting details</button></form></details>}
      {intent && context.persistenceAvailable && transitionAllowed && <form className="mt-5 space-y-3 border-t border-sky-200 pt-4" onSubmit={event => { event.preventDefault(); void save({ action: "transition_with_note", ...ids, transition: intent, note: note.trim(), alternativeText: alternativeText.trim() || null }); }}><h3 className="font-semibold">{intent === "declined" ? "Decline this request" : "Cancel this booking"}</h3><label className="block text-sm">Explanation for the other party<textarea required maxLength={2000} className={field} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label><label className="block text-sm">Suggested alternative or next step (optional)<textarea maxLength={1000} className={field} value={alternativeText} disabled={busy} onChange={event => setAlternativeText(event.target.value)} /></label><button className={button} disabled={busy || !note.trim()}>Confirm {intent === "declined" ? "decline" : "cancellation"}</button></form>}
      <section className="mt-5 border-t border-sky-200 pt-4"><h3 className="font-semibold">Meeting outcome</h3><p className="mt-1 text-xs">Reports and feedback are shared with this booking’s mentor, startup, and program admins. A past meeting time does not confirm attendance.</p>
        {context.outcomes.length === 0 && <p className="mt-2 text-sm">No outcome reported.</p>}
        <ul className="mt-2 space-y-2">{context.outcomes.map(outcome => <li key={outcome.reporterProfileId} className="rounded-lg bg-white p-3 text-sm"><strong>{outcome.reporterName}</strong>: {outcome.attendance === "attended" ? "Attended" : "Missed"}{outcome.feedback && <p className="mt-1 whitespace-pre-wrap">{outcome.feedback}</p>}</li>)}</ul>
        {context.permissions.canRecordOutcome && <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void save({ action: "record_outcome", ...ids, attendance, feedback: feedback.trim() || null, expectedUpdatedAt: ownOutcome?.updatedAt ?? null }); }}><label className="block text-sm">Your attendance<select className={field} value={attendance} disabled={busy} onChange={event => setAttendance(event.target.value as "attended" | "missed")}><option value="attended">I attended</option><option value="missed">I missed this meeting</option></select></label><label className="block text-sm">Shared feedback (optional)<textarea className={field} value={feedback} disabled={busy} maxLength={2000} onChange={event => setFeedback(event.target.value)} /></label><button className={button} disabled={busy}>Save my outcome</button></form>}
      </section>
    </>}
  </section>;
}
