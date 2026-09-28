import { authorizeCalendar, CalendarHttpError } from "@/src/calendar/authorization";
import { AuthorizationError } from "@/src/auth/server";
import { readBearerToken } from "@/src/auth/request";
import { calendarAvailabilityEnabled, calendarConfiguration, calendarSupabaseEnvironment } from "@/src/calendar/config";
import { readCalendarConnectionStatus } from "@/src/calendar/connection-status";

export async function GET(request: Request) {
  try {
    const semesterId = new URL(request.url).searchParams.get("semesterId");
    if (!semesterId || !/^[0-9a-f-]{36}$/i.test(semesterId)) throw new CalendarHttpError(400, "Select your current semester.");
    const actor = await authorizeCalendar(request, semesterId);
    const status = await readCalendarConnectionStatus({ enabled: calendarConfiguration() !== null, availabilityEnabled: calendarAvailabilityEnabled(), environment: calendarSupabaseEnvironment(), profileId: actor.profileId, token: readBearerToken(request.headers.get("authorization"))! });
    return Response.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof CalendarHttpError || error instanceof AuthorizationError;
    return Response.json({ error: known ? error.message : "Your Calendar connection could not be loaded. Please try again." }, { status: known ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
