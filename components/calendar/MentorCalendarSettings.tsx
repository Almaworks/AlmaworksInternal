"use client";

import { useRef, useState } from 'react';
import { authenticatedFetch } from '@/src/auth/authenticated-fetch';
import { requestCalendarSync } from '@/src/calendar/sync-status';
import { DatedAvailabilityCalendar } from './DatedAvailabilityCalendar';

export function MentorCalendarSettings({semesterId,canSync=false,onSaved}:{semesterId:string;connectionId:string|null;canSync?:boolean;onSaved?:()=>void}) {
  const [busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0),[error,setError]=useState<string|null>(null),[message,setMessage]=useState<string|null>(null);
  const syncing=useRef(false);
  async function sync(){
    if(syncing.current||!canSync)return;
    syncing.current=true;setBusy(true);setError(null);setMessage(null);
    try{await requestCalendarSync({semesterId,fetch:authenticatedFetch});setMessage('Calendar refresh queued. Your availability view will update after the next successful check.');setRefresh(value=>value+1);}
    catch(cause){setError(cause instanceof Error?cause.message:'Calendar refresh could not be requested.');}
    finally{syncing.current=false;setBusy(false);}
  }
  return <div className="mt-5 border-t border-slate-200 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold text-slate-900">Mentoring schedule</h4>{canSync&&<button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-[#002147] disabled:opacity-50" disabled={busy} onClick={()=>void sync()}>Refresh Google Calendar</button>}</div>{error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}{message&&<p role="status" className="mt-3 text-sm text-emerald-800">{message}</p>}<DatedAvailabilityCalendar key={semesterId} semesterId={semesterId} refreshKey={refresh} onSaved={onSaved} disabled={busy}/></div>;
}