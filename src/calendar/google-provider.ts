import { createHash } from "node:crypto";

export interface BusyInterval { start: string; end: string }
export interface BusyQuery { accessToken: string; calendarId: string; from: string; to: string }
export interface HoldInput { accessToken: string; calendarId: string; bookingId: string; connectionId: string; start: string; end: string }
export type GoogleCalendarErrorKind = "reconnect" | "retryable" | "invalid" | "ownership" | "conflict";
export class GoogleCalendarError extends Error {
  readonly kind: GoogleCalendarErrorKind;
  constructor(kind: GoogleCalendarErrorKind) { super(`Google Calendar ${kind}`); this.name = "GoogleCalendarError"; this.kind = kind; }
}

export function holdEventId(bookingId: string, connectionId: string): string {
  if (!bookingId || !connectionId) throw new GoogleCalendarError("invalid");
  // Hex is a subset of Google event ID's base32hex alphabet. A domain separator avoids cross-purpose reuse.
  return `a${createHash("sha256").update(JSON.stringify(["almaworks-hold-v1", bookingId, connectionId])).digest("hex")}`;
}

function timestamp(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new GoogleCalendarError("invalid");
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new GoogleCalendarError("invalid");
  return time;
}
function range(start: string, end: string): [number, number] {
  const a = timestamp(start), b = timestamp(end);
  if (a >= b) throw new GoogleCalendarError("invalid");
  return [a, b];
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new GoogleCalendarError("retryable");
  return value as Record<string, unknown>;
}
function auth(accessToken: string): Headers {
  if (!accessToken) throw new GoogleCalendarError("invalid");
  return new Headers({ Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" });
}
function urlFor(calendarId: string, eventId?: string): string {
  if (!calendarId) throw new GoogleCalendarError("invalid");
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;
}
async function statusError(response: Response): Promise<GoogleCalendarError> {
  let reason: unknown;
  if (response.status === 403) {
    try {
      const body = await response.json() as { error?: { errors?: Array<{ reason?: unknown }> } };
      reason = body.error?.errors?.[0]?.reason;
    } catch { /* classify without logging provider data */ }
  }
  const retry = response.status === 429 || response.status === 408 || response.status === 409 || response.status === 412 || response.status >= 500 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
  return new GoogleCalendarError(retry ? "retryable" : response.status === 401 || response.status === 403 ? "reconnect" : "invalid");
}
async function request<T>(fetcher: typeof fetch, url: string, init: RequestInit, timeoutMilliseconds: number, read: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new GoogleCalendarError("retryable")); }, timeoutMilliseconds);
  });
  try {
    return await Promise.race([
      (async () => read(await fetcher(url, { ...init, cache: "no-store", signal: controller.signal })))(),
      deadline,
    ]);
  } catch (error) {
    if (error instanceof GoogleCalendarError) throw error;
    throw new GoogleCalendarError("retryable");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
async function json(response: Response): Promise<Record<string, unknown>> {
  try { return object(await response.json()); }
  catch { throw new GoogleCalendarError("retryable"); }
}
function owned(event: Record<string, unknown>, id: string): boolean {
  const properties = event.extendedProperties;
  if (!properties || typeof properties !== "object") return false;
  const marker = (properties as { private?: { almaworksHold?: unknown } }).private?.almaworksHold;
  return event.id === id && marker === id && event.status !== "cancelled";
}

export interface GoogleCalendarProvider {
  queryBusy(input: BusyQuery): Promise<BusyInterval[]>;
  upsertHold(input: HoldInput): Promise<{ eventId: string; status: "created" | "updated" | "current" }>;
  deleteHold(input: HoldInput): Promise<{ eventId: string; status: "deleted" | "absent" }>;
}

export function createGoogleCalendarProvider(options: { fetch?: typeof fetch; timeoutMilliseconds?: number } = {}): GoogleCalendarProvider {
  const fetcher = options.fetch ?? fetch;
  const timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;
  if (!Number.isFinite(timeoutMilliseconds) || timeoutMilliseconds <= 0) throw new GoogleCalendarError("invalid");
  async function getHold(input: HoldInput, id: string, forDeletion: boolean): Promise<Record<string, unknown> | null> {
    return request(fetcher, urlFor(input.calendarId, id), { method: "GET", headers: auth(input.accessToken) }, timeoutMilliseconds, async (response) => {
      if (response.status === 404 || response.status === 410) {
        if (forDeletion || response.status === 404) return null;
        throw new GoogleCalendarError("ownership");
      }
      if (!response.ok) throw await statusError(response);
      const event = await json(response);
      if (event.status === "cancelled") {
        if (forDeletion && event.id === id) return null;
        throw new GoogleCalendarError("ownership");
      }
      if (!owned(event, id)) throw new GoogleCalendarError("ownership");
      return event;
    });
  }
  const provider: GoogleCalendarProvider = {
    async queryBusy(input) {
      const [from, to] = range(input.from, input.to);
      if (!input.calendarId) throw new GoogleCalendarError("invalid");
      const result = await request(fetcher, "https://www.googleapis.com/calendar/v3/freeBusy", { method: "POST", headers: auth(input.accessToken), body: JSON.stringify({ timeMin: input.from, timeMax: input.to, timeZone: "UTC", items: [{ id: input.calendarId }] }) }, timeoutMilliseconds, async (response) => {
        if (!response.ok) throw await statusError(response);
        return json(response);
      });
      if (result.groups !== undefined && Object.keys(object(result.groups)).length) throw new GoogleCalendarError("retryable");
      if (result.kind !== "calendar#freeBusy" || timestamp(result.timeMin as string) !== from || timestamp(result.timeMax as string) !== to) throw new GoogleCalendarError("retryable");
      const calendars = object(result.calendars);
      const calendar = object(calendars[input.calendarId]);
      if (calendar.errors !== undefined && (!Array.isArray(calendar.errors) || calendar.errors.length) || !Array.isArray(calendar.busy)) throw new GoogleCalendarError("retryable");
      const intervals = calendar.busy.map((entry: unknown) => {
        const item = object(entry);
        const [start, end] = range(item.start as string, item.end as string);
        if (start < from || end > to) {
          // Providers may include intersecting ranges extending beyond the query's bounds.
          if (end <= from || start >= to) throw new GoogleCalendarError("retryable");
        }
        return { start: Math.max(start, from), end: Math.min(end, to) };
      }).sort((a: { start: number }, b: { start: number }) => a.start - b.start);
      const merged: Array<{ start: number; end: number }> = [];
      for (const interval of intervals) {
        const last = merged[merged.length - 1];
        if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
        else merged.push(interval);
      }
      return merged.map((interval) => ({ start: new Date(interval.start).toISOString(), end: new Date(interval.end).toISOString() }));
    },
    async upsertHold(input) {
      const [start, end] = range(input.start, input.end);
      const id = holdEventId(input.bookingId, input.connectionId);
      const current = await getHold(input, id, false);
      let needsAvailabilityCheck = !current;
      if (current) {
        const existingStart = (current.start as { dateTime?: string } | undefined)?.dateTime;
        const existingEnd = (current.end as { dateTime?: string } | undefined)?.dateTime;
        const sameInterval = Boolean(existingStart && existingEnd && timestamp(existingStart) === start && timestamp(existingEnd) === end);
        if (sameInterval && current.visibility === "private" && current.transparency === "opaque" && current.summary === "Almaworks mentorship" && (current.reminders as { useDefault?: unknown } | undefined)?.useDefault === false) return { eventId: id, status: "current" };
        if (typeof current.etag !== "string") throw new GoogleCalendarError("retryable");
        needsAvailabilityCheck = !sameInterval || current.transparency !== "opaque";
      }
      if (needsAvailabilityCheck) {
        // A moved or formerly nonblocking hold needs the same fresh check as a
        // new one. FreeBusy cannot distinguish an overlapping old hold from
        // another event, so do not subtract its interval and hide a conflict.
        // Google and our database cannot commit atomically; later collisions
        // still need reconciliation after this check.
        const busy = await provider.queryBusy({ accessToken: input.accessToken, calendarId: input.calendarId, from: input.start, to: input.end });
        if (busy.length) throw new GoogleCalendarError("conflict");
      }
      const event = { ...(!current ? { id } : {}), summary: "Almaworks mentorship", visibility: "private", transparency: "opaque", reminders: { useDefault: false }, start: { dateTime: new Date(start).toISOString() }, end: { dateTime: new Date(end).toISOString() }, ...(!current ? { extendedProperties: { private: { almaworksHold: id } } } : {}) };
      const headers = auth(input.accessToken);
      if (current) headers.set("If-Match", current.etag as string);
      const result = await request(fetcher, `${urlFor(input.calendarId, current ? id : undefined)}?sendUpdates=none`, { method: current ? "PATCH" : "POST", headers, body: JSON.stringify(event) }, timeoutMilliseconds, async (response) => {
        if (!response.ok) throw await statusError(response);
        return json(response);
      });
      if (result.id !== id) throw new GoogleCalendarError("retryable");
      return { eventId: id, status: current ? "updated" : "created" };
    },
    async deleteHold(input) {
      const id = holdEventId(input.bookingId, input.connectionId);
      const current = await getHold(input, id, true);
      if (!current) return { eventId: id, status: "absent" };
      if (typeof current.etag !== "string") throw new GoogleCalendarError("retryable");
      const headers = auth(input.accessToken);
      headers.set("If-Match", current.etag);
      return request(fetcher, `${urlFor(input.calendarId, id)}?sendUpdates=none`, { method: "DELETE", headers }, timeoutMilliseconds, async (response) => {
        if (response.status === 404 || response.status === 410) return { eventId: id, status: "absent" };
        if (!response.ok) throw await statusError(response);
        return { eventId: id, status: "deleted" };
      });
    },
  };
  return provider;
}
