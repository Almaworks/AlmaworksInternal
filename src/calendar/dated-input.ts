import { CalendarHttpError } from "./http-error.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const absoluteIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const quarterHour = 15 * 60 * 1000;
const ninetyDays = 90 * 24 * 60 * 60 * 1000;

export interface DatedAvailabilityChange {
  startsAt: string;
  endsAt: string;
  available: boolean;
}

function instant(value: unknown): { milliseconds: number; iso: string } {
  if (typeof value !== "string" || !absoluteIso.test(value)) throw new CalendarHttpError(400, "Use absolute ISO timestamps for dated availability.");
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new CalendarHttpError(400, "Use valid timestamps for dated availability.");
  return { milliseconds, iso: new Date(milliseconds).toISOString() };
}

export function parseDatedRange(url: string, now = Date.now()): { semesterId: string; from: string; until: string } {
  const params = new URL(url).searchParams;
  const semesterId = params.get("semesterId");
  if (!semesterId || !uuid.test(semesterId)) throw new CalendarHttpError(400, "Select a valid semester.");
  const from = instant(params.get("from"));
  const until = instant(params.get("until"));
  if (until.milliseconds <= from.milliseconds || until.milliseconds - from.milliseconds > ninetyDays
    || from.milliseconds < now - quarterHour || until.milliseconds <= now) {
    throw new CalendarHttpError(400, "Choose a current date range of at most ninety days.");
  }
  return { semesterId, from: from.iso, until: until.iso };
}

export function parseDatedSave(value: unknown, now = Date.now()): { semesterId: string; changes: DatedAvailabilityChange[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CalendarHttpError(400, "Invalid dated availability request.");
  const record = value as Record<string, unknown>;
  if (typeof record.semesterId !== "string" || !uuid.test(record.semesterId) || !Array.isArray(record.changes)
    || record.changes.length === 0 || record.changes.length > 512) {
    throw new CalendarHttpError(400, "Choose between one and 512 dated availability changes.");
  }
  const unique = new Map<string, DatedAvailabilityChange>();
  for (const entry of record.changes) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new CalendarHttpError(400, "Invalid dated availability change.");
    const change = entry as Record<string, unknown>;
    const start = instant(change.startsAt);
    const end = instant(change.endsAt);
    if (typeof change.available !== "boolean" || end.milliseconds - start.milliseconds !== quarterHour
      || start.milliseconds % quarterHour !== 0 || end.milliseconds % quarterHour !== 0
      || start.milliseconds <= now || end.milliseconds > now + ninetyDays) {
      throw new CalendarHttpError(400, "Choose future fifteen-minute slots within ninety days.");
    }
    const key = `${start.iso}/${end.iso}`;
    const prior = unique.get(key);
    if (prior && prior.available !== change.available) throw new CalendarHttpError(400, "A dated slot cannot be both available and unavailable.");
    unique.set(key, { startsAt: start.iso, endsAt: end.iso, available: change.available });
  }
  return { semesterId: record.semesterId, changes: [...unique.values()] };
}
