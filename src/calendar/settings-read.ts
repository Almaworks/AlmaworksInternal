import { ALMAWORKS_SUPABASE_URL } from "./config.ts";
import { readCalendarSlotRanges } from "./slot-ranges.ts";
export interface MentorCalendarSettings {
  mode:"weekly"|"synced"|"manual";timeZone:string;connectionId:string|null;
  lastSuccessAt:string|null;syncUnavailable:boolean;
  workingHours:{weekday:number;startsAt:string;endsAt:string}[];
  overrides:{startsAt:string;endsAt:string;available:boolean}[];
  slots:{startsAt:string;endsAt:string}[];from:string;until:string;
}
const unavailable=()=>new Error("Calendar availability could not be loaded. Please try again.");
function row(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw unavailable();return value as Record<string,unknown>;}
function text(value:unknown):string{if(typeof value!=="string"||!value)throw unavailable();return value;}
function stamp(value:unknown):string{const result=text(value);if(!Number.isFinite(Date.parse(result)))throw unavailable();return result;}
function slots(value:unknown){const item=row(value);const startsAt=stamp(item.starts_at),endsAt=stamp(item.ends_at);if(Date.parse(endsAt)<=Date.parse(startsAt))throw unavailable();return{startsAt,endsAt};}
export async function readMentorCalendarSettings(input:{environment:{url:string;anonKey:string};token:string;semesterId:string;mentorSemesterId:string;programTimeZone:string;fetch?:typeof fetch;now?:number}):Promise<MentorCalendarSettings>{
  if(input.environment.url!==ALMAWORKS_SUPABASE_URL)throw new Error("Calendar Supabase project does not match the allowed Almaworks project.");
  const now=input.now??Date.now(),from=new Date(now).toISOString(),until=new Date(now+7*86400000).toISOString();
  const fetcher=input.fetch??fetch;
  async function read(path:string,select?:string,rangeFrom=from,rangeUntil=until):Promise<unknown[]>{
    const url=new URL(`/rest/v1/${path}`,input.environment.url);
    const rpc=path.startsWith("rpc/");
    if(!rpc){url.searchParams.set("select",select!);url.searchParams.set("semester_id",`eq.${input.semesterId}`);url.searchParams.set("mentor_semester_id",`eq.${input.mentorSemesterId}`);}
    if(path==="mentor_calendar_overrides"){url.searchParams.set("starts_at",`lt.${until}`);url.searchParams.set("ends_at",`gt.${from}`);}
    const response=await fetcher(new Request(url,{method:rpc?"POST":"GET",headers:{apikey:input.environment.anonKey,Authorization:`Bearer ${input.token}`,"Content-Type":"application/json"},body:rpc?JSON.stringify({p_semester_id:input.semesterId,p_mentor_semester_id:input.mentorSemesterId,p_from:rangeFrom,p_until:rangeUntil}):undefined,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(10000)}));
    if(!response.ok){const failure:unknown=await response.json().catch(()=>null);const code=failure&&typeof failure==="object"&&"code"in failure&&typeof failure.code==="string"&&/^[A-Z0-9]{5,12}$/.test(failure.code)?failure.code:"unknown";console.warn("Calendar settings read failed",JSON.stringify({resource:path,status:response.status,code}));throw unavailable();}const value:unknown=await response.json();if(!Array.isArray(value))throw unavailable();return value;
  }
  try{
    const [settings,hours,overrides,effective]=await Promise.all([
      read("mentor_calendar_settings","mode,time_zone,connection_id,last_success_at,sync_unavailable"),read("mentor_weekly_availability","weekday,starts_at,ends_at"),read("mentor_calendar_overrides","starts_at,ends_at,available"),readCalendarSlotRanges(from,until,(a,b)=>read("rpc/calendar_effective_slots",undefined,a,b))]);
    if(settings.length>1)throw unavailable();const setting=settings.length?row(settings[0]):null;
    const mode=setting?.mode??"weekly";if(mode!=="weekly"&&mode!=="manual"&&mode!=="synced")throw unavailable();
    if(setting&&typeof setting.sync_unavailable!=="boolean")throw unavailable();
    const timeZone=setting?text(setting.time_zone):input.programTimeZone;
    new Intl.DateTimeFormat("en-US",{timeZone}).format(now);
    return{mode,timeZone,connectionId:setting?.connection_id==null?null:text(setting.connection_id),lastSuccessAt:setting?.last_success_at==null?null:stamp(setting.last_success_at),syncUnavailable:setting?.sync_unavailable===true,from,until,
      workingHours:hours.map(value=>{const h=row(value);if(typeof h.weekday!=="number"||!Number.isInteger(h.weekday)||h.weekday<0||h.weekday>6)throw unavailable();const a=text(h.starts_at),b=text(h.ends_at);if(!/^\d\d:\d\d:00$/.test(a)||!/^\d\d:\d\d:00$/.test(b))throw unavailable();return{weekday:h.weekday,startsAt:a.slice(0,5),endsAt:b.slice(0,5)};}),
      overrides:overrides.map(value=>{const o=row(value);if(typeof o.available!=="boolean")throw unavailable();return{...slots(o),available:o.available};}),slots:effective.map(slots)};
  }catch(error){console.warn("Calendar settings unavailable",JSON.stringify({category:error instanceof Error?error.name:"unknown"}));throw unavailable();}
}
