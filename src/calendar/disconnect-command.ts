import { authorizeCalendar, CalendarHttpError } from "./authorization.ts";
import { AuthorizationError } from "../auth/server.ts";
import { readBearerToken } from "../auth/request.ts";
import { calendarAvailabilityEnabled, calendarSupabaseEnvironment } from "./config.ts";

const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function handleCalendarDisconnect(request:Request,deps:{enabled:boolean;authorize(request:Request,semesterId:string):Promise<{role:string}>;disconnect(connectionId:string,keepManual:boolean):Promise<unknown>}):Promise<Response>{
  const headers={"Cache-Control":"no-store"};
  try{
    if(!deps.enabled)throw new CalendarHttpError(503,"Calendar connection management is not available yet.");
    let value:unknown;try{value=await request.json();}catch{throw new CalendarHttpError(400,"Invalid disconnect request.");}
    if(!value||typeof value!=="object"||Array.isArray(value)||!("semesterId"in value)||!uuid(value.semesterId)||!("connectionId"in value)||!uuid(value.connectionId)||!("keepManual"in value)||typeof value.keepManual!=="boolean")throw new CalendarHttpError(400,"Select your connection and whether to keep imported availability.");
    const actor=await deps.authorize(request,value.semesterId);
    if(actor.role!=="mentor"&&actor.role!=="startup")throw new CalendarHttpError(403,"Only the connected participant can disconnect Google Calendar.");
    const result=await deps.disconnect(value.connectionId,actor.role==="mentor"&&value.keepManual);
    if(result!==true)throw new CalendarHttpError(409,"A calendar operation is still finishing. Please retry disconnecting shortly.");
    return Response.json({queued:true},{status:202,headers});
  }catch(error){
    const known=error instanceof CalendarHttpError||error instanceof AuthorizationError;
    return Response.json({error:known?error.message:"Calendar disconnect could not be requested. Please try again."},{status:known?error.status:503,headers});
  }
}

export async function runCalendarDisconnect(request:Request):Promise<Response>{
  return handleCalendarDisconnect(request,{
    enabled:calendarAvailabilityEnabled(),authorize:authorizeCalendar,
    disconnect:async(connectionId,keepManual)=>{
      const environment=calendarSupabaseEnvironment();
      const token=readBearerToken(request.headers.get("authorization"));
      if(!token)throw new CalendarHttpError(401,"Sign in before disconnecting your calendar.");
      const response=await fetch(`${environment.url}/rest/v1/rpc/calendar_disconnect`,{method:"POST",headers:{apikey:environment.anonKey,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({p_connection_id:connectionId,p_keep_manual:keepManual}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)});
      if(!response.ok){
        const value:unknown=await response.json().catch(()=>null);
        if(value&&typeof value==="object"&&"code"in value&&value.code==="55000")throw new CalendarHttpError(409,"A fresh successful sync is needed to keep imported availability. Refresh first, or choose to return to weekly hours.");
        throw new CalendarHttpError(response.status===403?403:503,"Calendar disconnect could not be requested. Check your access and try again.");
      }
      return response.json() as Promise<unknown>;
    },
  });
}
