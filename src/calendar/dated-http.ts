import { AuthorizationError } from "../auth/server.ts";
import { readBearerToken } from "../auth/request.ts";
import { authorizeCalendar } from "./authorization.ts";
import { calendarAvailabilityEnabled, calendarSupabaseEnvironment } from "./config.ts";
import { CalendarHttpError } from "./http-error.ts";
import { parseDatedRange, parseDatedSave } from "./dated-input.ts";

type Actor = { role: string; mentorSemesterId: string | null };
type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
interface Dependencies {
  enabled: boolean;
  authorize(request: Request, semesterId: string): Promise<Actor>;
  rpc: Rpc;
  now?: () => number;
}

const noStore = { "Cache-Control": "no-store" };

function errorResponse(error: unknown): Response {
  const known = error instanceof CalendarHttpError || error instanceof AuthorizationError;
  return Response.json({ error: known ? error.message : "Dated availability could not be saved or loaded. Please try again." },
    { status: known ? error.status : 503, headers: noStore });
}

function requireOwner(actor: Actor): string {
  if (actor.role !== "mentor" || !actor.mentorSemesterId) throw new CalendarHttpError(403, "Only the owning mentor can manage dated availability.");
  return actor.mentorSemesterId;
}

function interval(value: unknown): { startsAt: string; endsAt: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid interval");
  const row = value as Record<string, unknown>;
  if (typeof row.startsAt !== "string" || typeof row.endsAt !== "string" || !Number.isFinite(Date.parse(row.startsAt)) || !Number.isFinite(Date.parse(row.endsAt))) throw new Error("invalid interval");
  return { startsAt: new Date(row.startsAt).toISOString(), endsAt: new Date(row.endsAt).toISOString() };
}

function projection(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid projection");
  const row = value as Record<string, unknown>;
  if (typeof row.timeZone !== "string" || typeof row.programTimeZone !== "string"
    || typeof row.semesterStart !== "string" || typeof row.semesterEnd !== "string"
    || typeof row.from !== "string" || typeof row.until !== "string"
    || !Array.isArray(row.offered) || !Array.isArray(row.busy) || !Array.isArray(row.bookings)
    || typeof row.syncUnavailable !== "boolean" || !["weekly", "manual", "synced"].includes(String(row.mode))
    || (row.lastSuccessAt !== null && typeof row.lastSuccessAt !== "string")) throw new Error("invalid projection");
  return { ...row, from: new Date(row.from).toISOString(), until: new Date(row.until).toISOString(),
    offered: row.offered.map(interval), busy: row.busy.map(interval), bookings: row.bookings.map(interval),
    lastSuccessAt: row.lastSuccessAt === null ? null : new Date(row.lastSuccessAt).toISOString() };
}

export async function handleDatedCalendarGet(request: Request, dependencies: Dependencies): Promise<Response> {
  try {
    if (!dependencies.enabled) throw new CalendarHttpError(503, "Calendar availability is not available yet.");
    const range = parseDatedRange(request.url, dependencies.now?.());
    const mentorSemesterId = requireOwner(await dependencies.authorize(request, range.semesterId));
    const result = await dependencies.rpc("calendar_owner_dated_availability", { p_semester_id: range.semesterId, p_mentor_semester_id: mentorSemesterId, p_from: range.from, p_until: range.until });
    return Response.json(projection(result), { headers: noStore });
  } catch (error) { return errorResponse(error); }
}

export async function handleDatedCalendarPost(request: Request, dependencies: Dependencies): Promise<Response> {
  try {
    if (!dependencies.enabled) throw new CalendarHttpError(503, "Calendar availability is not available yet.");
    let body: unknown;
    try { body = await request.json(); } catch { throw new CalendarHttpError(400, "Invalid dated availability request."); }
    const input = parseDatedSave(body, dependencies.now?.());
    const mentorSemesterId = requireOwner(await dependencies.authorize(request, input.semesterId));
    const saved = await dependencies.rpc("calendar_save_dated_availability", { p_semester_id: input.semesterId, p_mentor_semester_id: mentorSemesterId, p_changes: input.changes });
    if (saved !== true) throw new CalendarHttpError(409, "Dated availability was not saved. Reload and try again.");
    return Response.json({ saved: true }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}

function productionDependencies(request: Request): Dependencies {
  const token = readBearerToken(request.headers.get("authorization"));
  const rpc: Rpc = async (name, args) => {
    if (!token) throw new CalendarHttpError(401, "Sign in to manage dated availability.");
    const environment = calendarSupabaseEnvironment();
    const response = await fetch(`${environment.url}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: environment.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new CalendarHttpError(response.status === 400 ? 400 : response.status === 403 ? 403 : 503, response.status === 400 ? "Dated availability conflicts with the semester schedule or an accepted booking." : "Dated availability could not be saved or loaded. Please try again.");
    return response.json() as Promise<unknown>;
  };
  return { enabled: calendarAvailabilityEnabled(), authorize: authorizeCalendar, rpc };
}

export function runDatedCalendarGet(request: Request): Promise<Response> { return handleDatedCalendarGet(request, productionDependencies(request)); }
export function runDatedCalendarPost(request: Request): Promise<Response> { return handleDatedCalendarPost(request, productionDependencies(request)); }
