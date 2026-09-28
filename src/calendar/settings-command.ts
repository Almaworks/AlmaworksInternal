import { CalendarHttpError, authorizeCalendar } from "./authorization.ts";
import { AuthorizationError } from "../auth/server.ts";
import { readBearerToken } from "../auth/request.ts";
import { calendarAvailabilityEnabled, calendarConfiguration, calendarSupabaseEnvironment } from "./config.ts";
import { parseCalendarSettings, parseCalendarOverride, parseCalendarImport } from "./settings-input.ts";
import { syncAuthorizedMentorCalendar } from "./booking-refresh.ts";
type Command = "settings" | "override" | "import" | "sync";
interface Dependencies {
  enabled: boolean;
  authorize(request: Request, semesterId: string): Promise<{role: string; mentorSemesterId: string | null}>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  sync?(scope: {semesterId: string; mentorSemesterId: string}): Promise<boolean>;
}
export async function handleCalendarSettingsCommand(request: Request, kind: Command, dependencies: Dependencies): Promise<Response> {
  const headers = {"Cache-Control":"no-store"};
  try {
    if (!dependencies.enabled) throw new CalendarHttpError(503,"Google Calendar setup is not available yet. Manual scheduling remains available.");
    let value: unknown;
    try { value=await request.json(); } catch { throw new CalendarHttpError(400,"Invalid Calendar settings request."); }
    if (!value || typeof value!=="object" || Array.isArray(value) || !("semesterId" in value) || typeof value.semesterId!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.semesterId)) throw new CalendarHttpError(400,"Select your current semester.");
    const actor=await dependencies.authorize(request,value.semesterId);
    if (actor.role!=="mentor" || !actor.mentorSemesterId) throw new CalendarHttpError(403,"Only the owning mentor can change this availability.");
    if (kind!=="sync" && kind!=="settings") throw new CalendarHttpError(403,"This availability action is not available.");
    const scope={p_semester_id:value.semesterId,p_mentor_semester_id:actor.mentorSemesterId};
    let result: unknown;
    if (kind==="sync") {
      result=await dependencies.rpc("calendar_request_sync",scope);
      if(result!==true)throw new CalendarHttpError(409,"Calendar refresh could not be queued. Check that your calendar is connected and ongoing sync is enabled.");
      if (dependencies.sync && !await dependencies.sync({semesterId:value.semesterId,mentorSemesterId:actor.mentorSemesterId})) throw new CalendarHttpError(503,"Google Calendar could not be refreshed yet. Your refresh remains queued; retry shortly. Unverified times remain unavailable.");
      return Response.json({queued:true},{status:202,headers});
    } else if (kind==="settings") {
      const settings=parseCalendarSettings(value);
      result=await dependencies.rpc("calendar_save_settings",{...scope,p_mode:settings.mode,p_time_zone:settings.timeZone,p_connection_id:settings.connectionId,p_working_hours:settings.workingHours.map(range=>({weekday:range.weekday,starts_at:range.startsAt,ends_at:range.endsAt}))});
    } else if(kind==="import") {
      const range=parseCalendarImport(value);
      result=await dependencies.rpc("calendar_import_snapshot",{...scope,p_from:range.from,p_until:range.until});
      if(typeof result!=="number" || !Number.isSafeInteger(result) || result<0 || result>8640) throw new CalendarHttpError(409,"Calendar import was not confirmed. Refresh and try again.");
      return Response.json({saved:true,importedSlots:result},{headers});
    } else {
      const slot=parseCalendarOverride(value);
      result=await dependencies.rpc("calendar_set_override",{...scope,p_starts_at:slot.startsAt,p_ends_at:slot.endsAt,p_available:slot.available});
    }
    if (result!==true) throw new CalendarHttpError(409,"Calendar changed while saving. Refresh and try again.");
    if(kind==="settings" && "mode" in value && value.mode==="synced" && dependencies.sync) {
      // Settings are already committed; retain them even if Google is unavailable.
      try { await dependencies.sync({semesterId:value.semesterId,mentorSemesterId:actor.mentorSemesterId}); } catch { /* Queued work remains retryable. */ }
    }
    return Response.json({saved:true},{headers});
  } catch(error) {
    const known=error instanceof CalendarHttpError || error instanceof AuthorizationError;
    return Response.json({error:known?error.message:"Calendar settings could not be saved. Please try again."},{status:known?error.status:503,headers});
  }
}

export async function runCalendarSettingsCommand(request: Request, kind: Command): Promise<Response> {
  return handleCalendarSettingsCommand(request,kind,{
    enabled:kind==="sync"?calendarConfiguration()!==null:calendarAvailabilityEnabled(),authorize:authorizeCalendar,
    sync:syncAuthorizedMentorCalendar,
    rpc:async(name,args)=>{
      const env=calendarSupabaseEnvironment();
      const token=readBearerToken(request.headers.get("authorization"));
      if (!token) throw new CalendarHttpError(401,"Sign in before changing Calendar settings.");
      // The same verified participant bearer token is used for database RLS.
      const response=await fetch(`${env.url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:env.anonKey,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(args),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
      if (!response.ok) {
        const status=response.status===403?403:response.status===400?400:response.status===409?409:503;
        throw new CalendarHttpError(status,"Calendar settings could not be saved. Check your access and selected times, then retry.");
      }
      return response.json() as Promise<unknown>;
    },
  });
}
