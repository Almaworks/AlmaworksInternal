"use client";

import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { requestCalendarSync } from "@/src/calendar/sync-status";
import { IntegratedAvailabilityCalendar, type CalendarWorkingHours } from "./IntegratedAvailabilityCalendar";

type Settings = { mode: "weekly" | "synced" | "manual"; timeZone: string; connectionId: string | null; workingHours: CalendarWorkingHours[] };
function readSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") throw new Error("Calendar settings could not be loaded.");
  const item = value as Record<string, unknown>;
  if ((item.mode !== "weekly" && item.mode !== "synced" && item.mode !== "manual") || typeof item.timeZone !== "string" || (item.connectionId !== null && typeof item.connectionId !== "string") || !Array.isArray(item.workingHours)) throw new Error("Calendar settings could not be loaded.");
  const workingHours = item.workingHours.map((hour: unknown) => {
    if (!hour || typeof hour !== "object") throw new Error("Calendar settings could not be loaded.");
    const range = hour as Record<string, unknown>;
    if (typeof range.weekday !== "number" || typeof range.startsAt !== "string" || typeof range.endsAt !== "string") throw new Error("Calendar settings could not be loaded.");
    return { weekday: range.weekday, startsAt: range.startsAt, endsAt: range.endsAt };
  });
  return { mode: item.mode, timeZone: item.timeZone, connectionId: item.connectionId, workingHours };
}

export function MentorCalendarSettings({ semesterId, canSync = false, onSaved }: { semesterId: string; connectionId: string | null; canSync?: boolean; onSaved?: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<CalendarWorkingHours[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const syncing = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void authenticatedFetch(`/api/calendar/settings?semesterId=${encodeURIComponent(semesterId)}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Calendar settings could not be loaded.");
        const value: unknown = await response.json();
        const next = readSettings(value);
        if (!controller.signal.aborted) { setSettings(next); setError(null); }
      })
      .catch(() => { if (!controller.signal.aborted) setError("Could not load Calendar settings. The calendar below can still be viewed."); });
    return () => controller.abort();
  }, [semesterId, refresh]);

  async function sync() {
    if (syncing.current || !canSync) return;
    syncing.current = true;
    setBusy(true); setError(null); setMessage(null);
    try {
      await requestCalendarSync({ semesterId, fetch: authenticatedFetch });
      setMessage("Calendar refresh queued. Your availability view will update after the next successful check.");
      setRefresh(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Calendar refresh could not be requested.");
    } finally {
      syncing.current = false;
      setBusy(false);
    }
  }

  async function save() {
    if (!settings || !draft || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await authenticatedFetch("/api/calendar/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semesterId, mode: settings.mode === "synced" ? "synced" : "weekly", timeZone: settings.timeZone, connectionId: settings.connectionId, workingHours: draft }) });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        throw new Error(payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "Mentoring hours could not be saved.");
      }
      setSettings({ ...settings, workingHours: draft }); setDraft(null); setRefresh(value => value + 1); setMessage("Mentoring hours saved for the cohort."); onSaved?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Mentoring hours could not be saved."); }
    finally { setBusy(false); }
  }

  return <div className="mt-5 border-t border-slate-200 pt-5">
    <h4 className="font-semibold text-slate-900">Mentoring schedule</h4>
    <p className="mt-2 text-sm text-slate-600">Drag across the calendar to set recurring hours that startups can book during the cohort. Save to publish your changes.</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {settings && <button type="button" className="rounded-lg bg-[#002147] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!draft || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save mentoring hours"}</button>}
      {draft && <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" disabled={busy} onClick={() => setDraft(null)}>Discard changes</button>}
      {settings?.mode === "synced" && <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-[#002147] disabled:opacity-50" disabled={!canSync || busy} onClick={() => void sync()}>Refresh Google Calendar</button>}
    </div>
    <IntegratedAvailabilityCalendar semesterId={semesterId} refreshKey={refresh} workingHours={draft ?? settings?.workingHours} onWorkingHoursChange={settings ? setDraft : undefined} disabled={busy} />
  </div>;
}
