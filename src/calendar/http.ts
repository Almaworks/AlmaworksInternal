import { CalendarHttpError } from "./authorization.ts";
import { AuthorizationError } from "../auth/server.ts";
import type { CalendarConfiguration } from "./config.ts";
import { beginCalendarConnection, finishCalendarConnection, CalendarCallbackFailure, type CalendarConnectionActor, type CalendarConnectionRepository, type CalendarReturnTarget } from "./connection-service.ts";

interface Dependencies {
  config: CalendarConfiguration | null;
  authorize(request: Request, semesterId: string): Promise<CalendarConnectionActor>;
  repository(): Promise<CalendarConnectionRepository>;
  googleFetch?: typeof fetch;
  afterConnect?(actor: CalendarConnectionActor): Promise<void>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cookieName = "almaworks_calendar_semester";
function cookie(config: CalendarConfiguration, semesterId: string, age = 600): string {
  return `${cookieName}=${semesterId}; Path=/api/calendar/callback; HttpOnly; SameSite=Lax; Max-Age=${age}${config.appOrigin.startsWith("https:") ? "; Secure" : ""}`;
}
function errorResponse(error: unknown): Response {
  const known = error instanceof CalendarHttpError || error instanceof AuthorizationError;
  return Response.json({ error: known ? error.message : "Calendar could not connect. Please try again or continue without connecting." }, { status: known ? error.status : 503, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
function configured(config: CalendarConfiguration | null): asserts config is CalendarConfiguration {
  if (!config) throw new CalendarHttpError(503, "Google Calendar is not configured yet. You can continue without connecting.");
}

export async function handleCalendarConnect(request: Request, dependencies: Dependencies): Promise<Response> {
  try {
    const { config } = dependencies; configured(config);
    if (request.headers.get("origin") !== config.appOrigin) throw new CalendarHttpError(403, "Calendar connection must start from Almaworks.");
    let body: unknown;
    try { body = await request.json(); } catch { throw new CalendarHttpError(400, "Invalid Calendar connection request."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new CalendarHttpError(400, "Invalid Calendar connection request.");
    const { semesterId, returnTo } = body as Record<string, unknown>;
    if (typeof semesterId !== "string" || !uuid.test(semesterId) || typeof returnTo !== "string" || !["onboarding", "availability", "bookings"].includes(returnTo)) throw new CalendarHttpError(400, "Invalid Calendar connection request.");
    const actor = await dependencies.authorize(request, semesterId);
    const result = await beginCalendarConnection({ actor, returnTo: returnTo as CalendarReturnTarget, config, repository: await dependencies.repository() });
    return Response.json(result, { headers: { "Cache-Control": "no-store", "Set-Cookie": cookie(config, semesterId) } });
  } catch (error) { return errorResponse(error); }
}

export async function handleCalendarCallback(request: Request, dependencies: Dependencies): Promise<Response> {
  let response: Response;
  try {
    const { config } = dependencies; configured(config);
    const semesterId = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!semesterId || !uuid.test(semesterId)) throw new CalendarHttpError(400, "Calendar connection expired. Return to Almaworks and connect again.");
    const params = new URL(request.url).searchParams;
    const state = params.get("state") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new CalendarHttpError(400, "Calendar connection link is invalid.");
    const actor = await dependencies.authorize(request, semesterId);
    const result = await finishCalendarConnection({ actor, config, repository: await dependencies.repository(), state, code: params.get("code") ?? undefined, error: params.get("error") ?? undefined, fetch: dependencies.googleFetch });
    // The connection is saved. A provider refresh failure must not undo consent.
    try { await dependencies.afterConnect?.(actor); } catch { /* Queued sync can be retried from availability. */ }
    response = new Response(null, { status: 303, headers: { Location: new URL(result.returnPath, config.appOrigin).toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    response=error instanceof CalendarCallbackFailure && dependencies.config
      ?new Response(null,{status:303,headers:{Location:new URL(error.returnPath,dependencies.config.appOrigin).toString(),"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}})
      :errorResponse(error);
  }
  if (dependencies.config) response.headers.append("Set-Cookie", cookie(dependencies.config, "", 0));
  return response;
}
