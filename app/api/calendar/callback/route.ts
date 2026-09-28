import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { CalendarHttpError, authorizeCalendar } from "@/src/calendar/authorization";
import { calendarConfiguration, calendarSupabaseEnvironment } from "@/src/calendar/config";
import { handleCalendarCallback } from "@/src/calendar/http";
import { createCalendarRepositories } from "@/src/calendar/repository";
import { syncAuthorizedMentorCalendar } from "@/src/calendar/booking-refresh";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const config = calendarConfiguration();
  const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  const response = await handleCalendarCallback(request, {
    config,
    afterConnect: async actor => {
      if(actor.role==="mentor" && actor.mentorSemesterId) await syncAuthorizedMentorCalendar({semesterId:actor.semesterId,mentorSemesterId:actor.mentorSemesterId});
    },
    authorize: async (_request, semesterId) => {
      const environment = calendarSupabaseEnvironment();
      const cookieClient = createServerClient(environment.url, environment.anonKey, { cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => { pendingCookies.push(...cookies); },
      } });
      const { data, error } = await cookieClient.auth.getSession();
      if (error || !data.session?.access_token) throw new CalendarHttpError(401, "Sign in to Almaworks again before connecting Calendar.");
      // Cookie contents only supply the token. authorizeCalendar validates it with
      // Auth getUser and resolves fresh RLS membership before trusting the actor.
      return authorizeCalendar(new Request(request.url, { headers: { Authorization: `Bearer ${data.session.access_token}` } }), semesterId);
    },
    repository: async () => {
      if (!config) throw new Error("Calendar is unavailable");
      return (await createCalendarRepositories(config)).connection;
    },
  });
  const result = new NextResponse(response.body, { status: response.status, headers: response.headers });
  for (const entry of pendingCookies) result.cookies.set(entry.name, entry.value, entry.options);
  return result;
}
