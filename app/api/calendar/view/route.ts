import {handleCalendarView} from '@/src/calendar/view';
import {authorizeCalendar,CalendarHttpError} from '@/src/calendar/authorization';
import {calendarAvailabilityEnabled,calendarSupabaseEnvironment} from '@/src/calendar/config';
import {readBearerToken} from '@/src/auth/request';
export const maxDuration=60;
export async function GET(request:Request){
  return handleCalendarView(request,{
    authorize:authorizeCalendar,
    read:async scope=>{
      if(!calendarAvailabilityEnabled())throw new CalendarHttpError(503,'Calendar setup is unavailable.');
      const env=calendarSupabaseEnvironment(),token=readBearerToken(request.headers.get('authorization'));
      if(!token)throw new CalendarHttpError(401,'Sign in to view your calendar.');
      const response=await fetch(`${env.url}/rest/v1/rpc/calendar_owner_week`,{method:'POST',headers:{apikey:env.anonKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({p_semester_id:scope.semesterId,p_mentor_semester_id:scope.mentorSemesterId,p_week_start:scope.weekStart}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new CalendarHttpError(response.status===403?403:503,'Your calendar could not be loaded. Please try again.');
      return response.json() as Promise<unknown>;
    }
  });
}
