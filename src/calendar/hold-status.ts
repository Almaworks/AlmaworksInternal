import { ALMAWORKS_SUPABASE_URL } from "./config.ts";

import type { CalendarHoldStatus } from "./hold-presentation.ts";
export type { CalendarHoldStatus } from "./hold-presentation.ts";

/** Owner-only status, never another participant's connection or provider details. */
export async function readCalendarHoldStatuses(input:{environment:{url:string;anonKey:string};token:string;semesterId:string;requestIds:readonly string[];fetch?:typeof fetch}):Promise<Record<string,CalendarHoldStatus>>{
  if(input.environment.url!==ALMAWORKS_SUPABASE_URL)throw new Error("Calendar Supabase project does not match the allowed Almaworks project.");
  const ids=[...new Set(input.requestIds)];
  const result:Record<string,CalendarHoldStatus>=Object.fromEntries(ids.map(id=>[id,"not_recorded"]));
  for(let offset=0;offset<ids.length;offset+=100){
    const batch=ids.slice(offset,offset+100);
    try{
      const response=await(input.fetch??fetch)(new Request(new URL("/rest/v1/rpc/calendar_hold_statuses",input.environment.url),{
        method:"POST",headers:{apikey:input.environment.anonKey,Authorization:`Bearer ${input.token}`,"Content-Type":"application/json"},
        body:JSON.stringify({p_semester_id:input.semesterId,p_request_ids:batch}),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),
      }));
      if(!response.ok)throw new Error("Unavailable");
      const rows:unknown=await response.json();if(!Array.isArray(rows))throw new Error("Invalid statuses");
      const seen=new Set<string>();
      for(const row of rows){
        if(!row||typeof row!=="object"||typeof row.request_id!=="string"||!batch.includes(row.request_id)||seen.has(row.request_id)
          ||!["present","absent"].includes(row.desired_state)||!["present","absent","unknown"].includes(row.applied_state)
          ||!(row.last_error===null||typeof row.last_error==="string"))throw new Error("Invalid status");
        seen.add(row.request_id);
        result[row.request_id]=row.last_error
          ? row.last_error==="conflict"?"conflict":row.last_error==="reconnect"?"reconnect_required":"failed"
          : row.desired_state==="present"?(row.applied_state==="present"?"placed":"queued"):(row.applied_state==="absent"?"removed":"removing");
      }
    }catch{for(const id of batch)result[id]="unavailable";}
  }
  return result;
}

