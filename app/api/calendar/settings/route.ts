import { runCalendarSettingsCommand } from "@/src/calendar/settings-command";
import { authorizeCalendar, CalendarHttpError } from "@/src/calendar/authorization";
import { AuthorizationError } from "@/src/auth/server";
import { readBearerToken } from "@/src/auth/request";
import { calendarAvailabilityEnabled, calendarSupabaseEnvironment } from "@/src/calendar/config";
import { readMentorCalendarSettings } from "@/src/calendar/settings-read";
import { refreshCalendarForBooking } from "@/src/calendar/booking-refresh";
export const maxDuration = 60;
export async function POST(request: Request) { return runCalendarSettingsCommand(request,"settings"); }
export async function GET(request:Request){
  const headers={"Cache-Control":"no-store"};
  try{
    const semesterId=new URL(request.url).searchParams.get("semesterId");
    if(!semesterId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(semesterId))throw new CalendarHttpError(400,"Select your current semester.");
    const actor=await authorizeCalendar(request,semesterId);
    if(actor.role!=="mentor"||!actor.mentorSemesterId)throw new CalendarHttpError(403,"Only the owning mentor can read these Calendar settings.");
    if(!calendarAvailabilityEnabled())throw new CalendarHttpError(503,"Google Calendar setup is not available yet.");
    const token=readBearerToken(request.headers.get("authorization"))!;
    // Refresh stale synced snapshots while the mentor has this editor open.
    // Failure keeps the existing fail-closed database availability predicate.
    try { await refreshCalendarForBooking({token,semesterId,mentorSemesterId:actor.mentorSemesterId}); } catch { /* Status below reports missing/stale provider coverage. */ }
    const settings=await readMentorCalendarSettings({environment:calendarSupabaseEnvironment(),token,semesterId,mentorSemesterId:actor.mentorSemesterId,programTimeZone:actor.programTimeZone});
    return Response.json(settings,{headers});
  }catch(error){const known=error instanceof CalendarHttpError||error instanceof AuthorizationError;return Response.json({error:known?error.message:"Calendar availability could not be loaded. Please try again."},{status:known?error.status:503,headers});}
}
