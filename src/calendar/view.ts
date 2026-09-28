import { CalendarHttpError } from './authorization.ts';
import { AuthorizationError } from '../auth/server.ts';
interface Scope {semesterId:string;mentorSemesterId:string;weekStart:string|null}
function normalizeSyncAvailability(value:unknown):unknown{
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const view=value as Record<string,unknown>;
  if(view.syncUnavailable!==null&&view.syncUnavailable!==undefined)return value;
  if(view.mode==='synced')return{...view,syncUnavailable:true};
  if(view.mode==='weekly'||view.mode==='manual')return{...view,syncUnavailable:false};
  return value;
}
export async function handleCalendarView(request:Request,dependencies:{authorize(request:Request,semesterId:string):Promise<{role:string;mentorSemesterId:string|null}>;read(scope:Scope):Promise<unknown>}):Promise<Response>{
  const headers={'Cache-Control':'no-store'};
  try{
    const url=new URL(request.url),semesterId=url.searchParams.get('semesterId'),weekStart=url.searchParams.get('weekStart');
    if(!semesterId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(semesterId))throw new CalendarHttpError(400,'Select your current semester.');
    if(weekStart&&(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)||!Number.isFinite(Date.parse(weekStart))||new Date(weekStart).toISOString().slice(0,10)!==weekStart))throw new CalendarHttpError(400,'Choose a valid calendar week.');
    const actor=await dependencies.authorize(request,semesterId);
    if(actor.role!=='mentor'||!actor.mentorSemesterId)throw new CalendarHttpError(403,'Only the owning mentor can read this calendar.');
    return Response.json(normalizeSyncAvailability(await dependencies.read({semesterId,mentorSemesterId:actor.mentorSemesterId,weekStart})),{headers});
  }catch(error){const known=error instanceof CalendarHttpError||error instanceof AuthorizationError;return Response.json({error:known?error.message:'Your calendar could not be loaded. Please try again.'},{status:known?error.status:503,headers});}
}
