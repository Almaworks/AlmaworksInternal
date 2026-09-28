export interface PendingCalendarSync { queuedAt: number; baseline: string | null }
type Snapshot = { lastSuccessAt: string | null; syncUnavailable: boolean };
const FUTURE_CLOCK_SKEW_MILLISECONDS = 5_000;

/** Quiet reads may update derived slots, but must never reset an editor draft. */
export function mergeCalendarSyncSnapshot(current: MentorCalendarSettings, incoming: MentorCalendarSettings): MentorCalendarSettings {
  const hours = (value: MentorCalendarSettings) => JSON.stringify(value.workingHours.map(item => `${item.weekday}:${item.startsAt}:${item.endsAt}`).sort());
  if (current.mode !== incoming.mode || current.timeZone !== incoming.timeZone || current.connectionId !== incoming.connectionId || hours(current) !== hours(incoming)) {
    throw new Error("Calendar settings changed. Reload settings before making another change.");
  }
  return { ...current, lastSuccessAt: incoming.lastSuccessAt, syncUnavailable: incoming.syncUnavailable, slots: incoming.slots, overrides: incoming.overrides, from: incoming.from, until: incoming.until };
}

/** An acknowledgement means queued. Only a fresh successful read means synced. */
export function calendarSyncState(snapshot: Snapshot, pending: PendingCalendarSync | null, now = Date.now()): "waiting" | "delayed" | "fresh" | "unavailable" {
  const last = snapshot.lastSuccessAt === null ? NaN : Date.parse(snapshot.lastSuccessAt);
  // The database and browser clocks can differ slightly; larger future values remain untrusted.
  const fresh = !snapshot.syncUnavailable && Number.isFinite(last) && last <= now + FUTURE_CLOCK_SKEW_MILLISECONDS && now - last <= 900_000;
  if (pending && !(fresh && (pending.baseline === null || last > Date.parse(pending.baseline)))) {
    return now - pending.queuedAt >= 360_000 ? "delayed" : "waiting";
  }
  return fresh ? "fresh" : "unavailable";
}

export async function requestCalendarSync(input: { semesterId: string; fetch: typeof fetch }): Promise<void> {
  const response = await input.fetch("/api/calendar/sync", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ semesterId: input.semesterId }), signal: AbortSignal.timeout(60_000),
  });
  const value: unknown = await response.json();
  if (!response.ok || !value || typeof value !== "object" || !("queued" in value) || value.queued !== true) {
    throw new Error(value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "Calendar refresh was not confirmed. Please try again.");
  }
}
import type { MentorCalendarSettings } from "./settings-read.ts";
