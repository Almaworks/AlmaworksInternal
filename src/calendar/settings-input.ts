import { CalendarHttpError } from "./authorization.ts";
export interface CalendarSettingsInput { mode: "weekly" | "synced"; timeZone: string; connectionId: string | null; workingHours: { weekday: number; startsAt: string; endsAt: string }[] }
const invalid = () => new CalendarHttpError(400, "Check your Calendar settings and use non-overlapping 15-minute ranges.");
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(); return value as Record<string, unknown>; };
const time = /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/;
export function parseCalendarSettings(value: unknown): CalendarSettingsInput {
  const input = object(value);
  if (input.mode !== "weekly" && input.mode !== "synced") throw invalid();
  if (typeof input.timeZone !== "string" || input.timeZone.length > 100) throw invalid();
  try { new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone }).format(); } catch { throw invalid(); }
  const connectionId = input.connectionId ?? null;
  if (connectionId !== null && (typeof connectionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(connectionId))) throw invalid();
  if (input.mode === "synced" && !connectionId) throw invalid();
  if (!Array.isArray(input.workingHours) || input.workingHours.length > 56) throw invalid();
  const workingHours = input.workingHours.map(value => {
    const range = object(value);
    if (typeof range.weekday !== "number" || !Number.isInteger(range.weekday) || range.weekday < 0 || range.weekday > 6 || typeof range.startsAt !== "string" || typeof range.endsAt !== "string" || !time.test(range.startsAt) || !time.test(range.endsAt) || range.startsAt >= range.endsAt) throw invalid();
    return { weekday: range.weekday, startsAt: range.startsAt, endsAt: range.endsAt };
  });
  for (let i = 0; i < workingHours.length; i++) for (let j = i + 1; j < workingHours.length; j++) {
    const a = workingHours[i], b = workingHours[j];
    if (a.weekday === b.weekday && a.startsAt < b.endsAt && b.startsAt < a.endsAt) throw invalid();
  }
  return { mode: input.mode, timeZone: input.timeZone, connectionId, workingHours };
}
export function parseCalendarOverride(value: unknown, now = Date.now()): { startsAt: string; endsAt: string; available: boolean | null } {
  const input = object(value);
  const stamp = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
  if (typeof input.startsAt !== "string" || typeof input.endsAt !== "string" || !stamp.test(input.startsAt) || !stamp.test(input.endsAt) || (typeof input.available !== "boolean" && input.available !== null)) throw invalid();
  const start = Date.parse(input.startsAt), end = Date.parse(input.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start % 900_000 !== 0 || end - start !== 900_000 || start <= now || start > now + 90 * 86400_000) throw invalid();
  return { startsAt: input.startsAt, endsAt: input.endsAt, available: input.available };
}
export function parseCalendarImport(value: unknown, now = Date.now()): { from: string; until: string } {
  const input=object(value);
  const stamp=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;
  if(typeof input.from!=="string" || typeof input.until!=="string" || !stamp.test(input.from) || !stamp.test(input.until)) throw new CalendarHttpError(400,"Select an import date range with a timezone.");
  const from=Date.parse(input.from), until=Date.parse(input.until);
  if(!Number.isFinite(from) || !Number.isFinite(until) || until<=Math.max(from,now) || until-from>90*86400000 || from<now-15*60000) throw new CalendarHttpError(400,"Choose a current import range of at most ninety days.");
  return {from:input.from,until:input.until};
}
