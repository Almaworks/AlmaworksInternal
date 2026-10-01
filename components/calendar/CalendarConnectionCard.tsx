"use client";

import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { startCalendarConnection, requestCalendarDisconnect } from "@/src/calendar/connection-client";
import type { CalendarConnectionStatus } from "@/src/calendar/connection-status";
import { createBackgroundRefresh } from "@/src/calendar/background-refresh";
import { calendarCallbackNotice } from "@/src/calendar/callback-notice";
import { MentorCalendarSettings } from "./MentorCalendarSettings";

export function CalendarConnectionCard({ semesterId, role, returnTo, beforeConnect, onConnectingChange, onAvailabilityEditorChange, onAvailabilitySaved }: {
  semesterId: string; role: "mentor" | "startup"; returnTo: "onboarding" | "availability" | "bookings";
  beforeConnect?: () => Promise<boolean>; onConnectingChange?: (connecting: boolean) => void;
  onAvailabilityEditorChange?: (active: boolean) => void; onAvailabilitySaved?: () => void;
}) {
  const [status, setStatus] = useState<CalendarConnectionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [callbackNotice,setCallbackNotice]=useState<string|null>(null);
  const [connecting, setConnecting] = useState(false);
  const [retry, setRetry] = useState(0);
  const [disconnectRequested,setDisconnectRequested]=useState(false);
  const statusReads=useRef<ReturnType<typeof createBackgroundRefresh<CalendarConnectionStatus>>|null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const disconnecting = status?.connection?.status === "disconnecting";
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const reads=createBackgroundRefresh<CalendarConnectionStatus>({
      canRefresh:()=>!busy.current,
      load:async signal=>{
        const response=await authenticatedFetch(`/api/calendar/connection?semesterId=${encodeURIComponent(semesterId)}`, { signal:AbortSignal.any([signal,AbortSignal.timeout(20000)]) });
        const value: unknown = await response.json();
        if (!response.ok || !value || typeof value !== "object" || !("enabled" in value) || typeof value.enabled !== "boolean" || !("connection" in value)) throw new Error("Your Calendar connection could not be loaded.");
        const connection = value.connection;
        if (connection !== null && (typeof connection !== "object" || !("id" in connection) || typeof connection.id !== "string" || !("accountEmail" in connection) || typeof connection.accountEmail !== "string" || !("cleanupIncomplete" in connection) || typeof connection.cleanupIncomplete!=="boolean" || !("status" in connection) || !["connected", "reconnect_required", "disconnecting", "disconnected"].includes(String(connection.status)))) throw new Error("Your Calendar connection could not be loaded.");
        return value as CalendarConnectionStatus;
      },
      apply:value=>{setStatus(value);setError(null);setCallbackNotice(calendarCallbackNotice(window.location.search));},
      failed:()=>{setError("Your Calendar connection status could not be loaded. You can continue without connecting.");setCallbackNotice(calendarCallbackNotice(window.location.search));},
    });
    statusReads.current=reads;
    void reads.tick();
    const tick=()=>{if(document.visibilityState==="visible")void reads.tick();};
    const timer=disconnecting?window.setInterval(tick,5000):null;
    window.addEventListener("focus",tick);document.addEventListener("visibilitychange",tick);
    return()=>{reads.dispose();if(statusReads.current===reads)statusReads.current=null;if(timer!==null)window.clearInterval(timer);window.removeEventListener("focus",tick);document.removeEventListener("visibilitychange",tick);};
  }, [semesterId, retry, disconnecting]);

  const connect = async () => {
    if (busy.current) return;
    statusReads.current?.cancel();
    busy.current = true; setConnecting(true); setError(null); onConnectingChange?.(true);
    try {
      const destination = await startCalendarConnection({ semesterId, returnTo, beforeConnect, fetch: authenticatedFetch });
      if (mounted.current) window.location.assign(destination);
    } catch (error) {
      if (mounted.current) { setError(error instanceof Error ? error.message : "Calendar could not connect. Please try again."); setConnecting(false); onConnectingChange?.(false); }
      busy.current = false;
    }
  };
  const disconnect=async()=>{
    if(busy.current||!status?.connection)return;
    const connectionId=status.connection.id;
    statusReads.current?.cancel();busy.current=true;setDisconnectRequested(true);setError(null);
    try{
      await requestCalendarDisconnect({semesterId,connectionId,keepManual:role==="mentor",fetch:authenticatedFetch});
      if(mounted.current){setStatus(current=>current?.connection?{...current,connection:{...current.connection,status:"disconnecting"}}:current);setRetry(value=>value+1);onAvailabilitySaved?.();}
    }catch(error){if(mounted.current)setError(error instanceof Error?error.message:"Calendar disconnect could not be requested.");}
    finally{busy.current=false;if(mounted.current)setDisconnectRequested(false);}
  };
  const connected = status?.connection?.status === "connected";
  const hasAvailabilityEditor = Boolean(returnTo !== "onboarding" && (status?.availabilityEnabled || status?.enabled) && role === "mentor");
  useEffect(() => { if (status) onAvailabilityEditorChange?.(hasAvailabilityEditor); }, [status, hasAvailabilityEditor, onAvailabilityEditorChange]);
  return <section aria-label="Google Calendar connection" className="my-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left sm:p-5">
    <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-slate-900">{role === "mentor" && returnTo !== "onboarding" ? "Mentoring availability" : "Google Calendar"}</h3>{(role !== "mentor" || returnTo === "onboarding")&&<span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">Optional</span>}</div>
    <p className="mt-2 text-sm leading-6 text-slate-600">{role === "mentor" && returnTo !== "onboarding" ? "Set your mentoring hours below. Connecting Google Calendar is optional and keeps busy times out of your bookable schedule." : role === "mentor" ? "Connect your calendar to help keep your bookable time up to date." : "Connect your calendar to receive a hold for accepted mentorship meetings."} You can finish setup without connecting.</p>
    {connected && <p className="mt-3 break-words text-sm text-emerald-800">Connected as {status.connection!.accountEmail}.</p>}
    {disconnecting && <p role="status" className="mt-3 text-sm text-slate-700">Calendar cleanup is in progress. Automatic sync and new Google meeting holds are off. Stored calendar credentials will be removed after cleanup.</p>}
    {status?.connection?.status==="disconnected" && <p className="mt-3 text-sm text-slate-700">Google Calendar is disconnected.</p>}
    {status?.connection?.cleanupIncomplete && <p role="alert" className="mt-3 text-sm text-amber-800">Some Google cleanup could not be confirmed. Check your Google Calendar for remaining Almaworks meeting holds.</p>}
    {hasAvailabilityEditor && <MentorCalendarSettings key={`${semesterId}:${status?.connection?.id??"unconnected"}:${disconnecting||status?.connection?.status==="disconnected"?"detached":"attached"}`} semesterId={semesterId} connectionId={status?.connection?.id??null} canSync={status!.enabled&&connected} onSaved={onAvailabilitySaved} />}
    {status && !status.enabled && <p className="mt-3 text-sm text-slate-600">Google Calendar setup is not available yet. You can continue with manual scheduling.</p>}
    {!status && !error && <p role="status" className="mt-3 text-sm text-slate-500">Checking your connection…</p>}
    {callbackNotice && <p role="status" className="mt-3 text-sm text-slate-700">{callbackNotice}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {status?.enabled && !disconnecting && <>
      <aside aria-label="Google verification notice" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <p className="font-semibold">Before you connect to Google Calendar</p>
        <p className="mt-1">Google has not yet verified the Almaworks Calendar integration. You may see a warning that the app is unverified or unsafe when you continue to Google. Review the requested permissions and only continue if you are comfortable granting access.</p>
        <p className="mt-2">Some school or work accounts may block the connection entirely. You can skip connecting for now and continue using Almaworks, but automatic Google Calendar availability checks and meeting holds will not be available without a working connection.</p>
      </aside>
      <button type="button" onClick={() => void connect()} disabled={connecting||disconnectRequested} className="mt-4 rounded-lg bg-[#002147] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{connecting ? "Opening Google…" : connected || status.connection?.status === "reconnect_required" ? "Reconnect Google Calendar" : "Connect Google Calendar"}</button>
    </>}
    {(status?.availabilityEnabled||status?.enabled)&&status?.connection&&["connected","reconnect_required"].includes(status.connection.status)&&<div className="mt-5 border-t border-slate-200 pt-4">
      <p className="mt-2 text-xs leading-5 text-slate-600">Disconnecting stops automatic sync and new Google holds. Existing bookable times are retained. We’ll try to remove Almaworks meeting holds, then delete stored calendar credentials. Your mentorship bookings remain in Almaworks.</p>
      <button type="button" disabled={disconnectRequested||connecting} onClick={()=>void disconnect()} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{disconnectRequested?"Requesting disconnect…":"Disconnect Google Calendar"}</button>
    </div>}
    {error && !connecting && <button type="button" onClick={() => { setError(null); setRetry(value => value + 1); }} className="mt-3 text-sm font-semibold text-[#002147] underline">Try again</button>}
  </section>;
}
