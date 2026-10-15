import type { CalendarInterval } from './types.ts';
export interface EditorSnapshot {
  timeZone:string; programTimeZone:string; semesterStart:string; semesterEnd:string; from:string; until:string;
  offered:CalendarInterval[]; busy:CalendarInterval[]; bookings:CalendarInterval[];
  syncUnavailable:boolean; mode:'weekly'|'manual'|'synced'; lastSuccessAt:string|null;
}
const SLOT=900_000;
const formatters=new Map<string,Intl.DateTimeFormat>();
const wallCache=new Map<string,number|null>();
const offsetCache=new Map<string,number[]>();
export function localParts(stamp:string|number,timeZone:string):{date:string;minute:number} {
  let format=formatters.get(timeZone);
  if(!format){format=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatters.set(timeZone,format);}
  const parts=format.formatToParts(new Date(stamp)),part=(type:Intl.DateTimeFormatPartTypes)=>parts.find(p=>p.type===type)?.value??'';
  return {date:`${part('year')}-${part('month')}-${part('day')}`,minute:Number(part('hour'))*60+Number(part('minute'))};
}
export function shiftDate(date:string,days:number):string {const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
function wallInstant(date:string,minute:number,timeZone:string):number|null {
  if(minute===1440)return wallInstant(shiftDate(date,1),0,timeZone);
  const key=`${timeZone}|${date}|${minute}`;
  if(wallCache.has(key))return wallCache.get(key)!;
  const base=Date.parse(date+'T00:00:00Z')+minute*60_000,offsetKey=`${timeZone}|${date}`;
  let offsets=offsetCache.get(offsetKey);
  if(!offsets){const values=new Set<number>();for(const hours of [-36,-12,0,12,36]){const instant=Date.parse(date+'T12:00:00Z')+hours*3600_000,p=localParts(instant,timeZone);values.add(Date.parse(p.date+'T00:00:00Z')+p.minute*60_000-instant);}offsets=[...values];offsetCache.set(offsetKey,offsets);}
  const matches=offsets.map(offset=>base-offset).filter(instant=>{const p=localParts(instant,timeZone);return p.date===date&&p.minute===minute;});
  const result=matches.length===1?matches[0]!:null;
  wallCache.set(key,result);return result;
}
/** Ambiguous fall-back and missing spring-forward wall times require a different slot. */
export function localSlot(date:string,minute:number,timeZone:string):CalendarInterval|null {
  if(!/^\d{4}-\d\d-\d\d$/.test(date)||!Number.isInteger(minute)||minute<0||minute>1425||minute%15!==0)return null;
  const start=wallInstant(date,minute,timeZone),end=wallInstant(date,minute+15,timeZone);
  return start!==null&&end!==null&&end-start===SLOT?{startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString()}:null;
}
export function offeredSlots(intervals:readonly CalendarInterval[]):Set<string> {
  const values=new Set<string>();
  for(const interval of intervals){const end=Date.parse(interval.endsAt);for(let start=Math.ceil(Date.parse(interval.startsAt)/SLOT)*SLOT;start+SLOT<=end;start+=SLOT)values.add(new Date(start).toISOString());}
  return values;
}
export function stageAvailability(draft:Map<string,boolean>,saved:ReadonlySet<string>,startsAt:string,available:boolean):void {
  if(saved.has(startsAt)===available)draft.delete(startsAt);else draft.set(startsAt,available);
}
export function overlaps(intervals:readonly CalendarInterval[],slot:CalendarInterval):boolean {return intervals.some(i=>Date.parse(i.startsAt)<Date.parse(slot.endsAt)&&Date.parse(i.endsAt)>Date.parse(slot.startsAt));}
export function slotBlock(data:EditorSnapshot,slot:CalendarInterval):string|null {
  if(Date.parse(slot.startsAt)<Date.parse(data.from)||Date.parse(slot.endsAt)>Date.parse(data.until))return 'Outside the editable date range';
  const start=localParts(slot.startsAt,data.programTimeZone),end=localParts(Date.parse(slot.endsAt)-1,data.programTimeZone);
  if(start.date<data.semesterStart||end.date>data.semesterEnd)return 'Outside this semester';
  if([start,end].some(p=>new Date(p.date+'T12:00:00Z').getUTCDay()===5&&p.minute>=900&&p.minute<1020))return 'Friday program reservation';
  if(overlaps(data.bookings,slot))return 'Confirmed meeting';
  if(overlaps(data.busy,slot))return 'Google Calendar busy';
  return null;
}
const offeredCache=new WeakMap<CalendarInterval[],Set<string>>();
export function copyDateState(data:EditorSnapshot,draft:ReadonlyMap<string,boolean>,date:string,start:number,end:number):{kind:'set'|'available'|'blocked';reason:string} {
  let saved=offeredCache.get(data.offered);if(!saved){saved=offeredSlots(data.offered);offeredCache.set(data.offered,saved);}
  let count=0,total=0;
  for(let minute=start;minute<end;minute+=15){total++;const slot=localSlot(date,minute,data.timeZone);if(!slot)return {kind:'blocked',reason:'Clock change: choose another time'};const blocked=slotBlock(data,slot);if(blocked)return {kind:'blocked',reason:blocked};if(draft.get(slot.startsAt)??saved.has(slot.startsAt))count++;}
  if(!total)return {kind:'blocked',reason:'Choose a time range'};
  return count===total?{kind:'set',reason:'Already set'}:count?{kind:'blocked',reason:'Part of this time is already set'}:{kind:'available',reason:'Available for a copy'};
}
export function parseEditorSnapshot(value:unknown):EditorSnapshot {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Calendar availability could not be loaded.');
  const v=value as Record<string,unknown>;
  for(const key of ['timeZone','programTimeZone','semesterStart','semesterEnd','from','until'])if(typeof v[key]!=='string')throw new Error('Calendar availability is incomplete.');
  for(const key of ['offered','busy','bookings'])if(!Array.isArray(v[key])||!v[key].every((item:unknown)=>!!item&&typeof item==='object'&&'startsAt'in item&&'endsAt'in item&&typeof item.startsAt==='string'&&typeof item.endsAt==='string'&&Number.isFinite(Date.parse(item.startsAt))&&Date.parse(item.endsAt)>Date.parse(item.startsAt)))throw new Error('Calendar intervals could not be loaded.');
  if(!['weekly','manual','synced'].includes(String(v.mode))||typeof v.syncUnavailable!=='boolean'||v.lastSuccessAt!==null&&typeof v.lastSuccessAt!=='string')throw new Error('Calendar status could not be loaded.');
  for(const key of ['semesterStart','semesterEnd'])if(!/^\d{4}-\d\d-\d\d$/.test(v[key] as string)||!Number.isFinite(Date.parse(v[key] as string))||new Date(v[key] as string).toISOString().slice(0,10)!==v[key])throw new Error('Calendar dates could not be loaded.');
  for(const key of ['timeZone','programTimeZone'])new Intl.DateTimeFormat('en',{timeZone:v[key] as string}).format();
  if(!Number.isFinite(Date.parse(v.from as string))||!Number.isFinite(Date.parse(v.until as string))||Date.parse(v.until as string)<=Date.parse(v.from as string)||Date.parse(v.until as string)-Date.parse(v.from as string)>90*86400_000)throw new Error('Calendar date range could not be loaded.');
  return v as unknown as EditorSnapshot;
}
