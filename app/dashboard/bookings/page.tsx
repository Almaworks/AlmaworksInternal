"use client";

import { Suspense, useEffect, useMemo, useState } from "react";

import MentorBookingWorkspace from "@/components/mentor-booking/MentorBookingWorkspace";
import { DataLoading } from "@/components/DataLoading";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { selectBookingDeepLink } from "@/src/mentor-booking/booking-deep-link";

type Semester = { id: string; name: string; is_active: boolean };

function BookingsContent() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const requestedSemesterId = searchParams.get("semester");
  const requestedBookingId = searchParams.get("booking");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const mentorSemesterId = searchParams.get("mentor");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadSemesters() {
      setLoading(true);
      setLoadError(null);
      try {
      const { data, error } = await supabase.from("semesters").select("id, name, is_active").order("is_active", { ascending: false }).order("name");
      if (!active) return;
      if (error) throw new Error("Semesters could not be loaded.");
      const rows = (data ?? []) as Semester[];
      setSemesters(rows);
      const selection = selectBookingDeepLink(rows, requestedSemesterId, requestedBookingId);
      setSemesterId(selection.semesterId);
      if (selection.error) setLoadError(selection.error);
      } catch (cause) {
        if (active) setLoadError(cause instanceof Error ? cause.message : "Semesters could not be loaded.");
      } finally { if (active) setLoading(false); }
    }
    void loadSemesters();
    return () => { active = false; };
  }, [supabase, attempt, requestedSemesterId, requestedBookingId]);

  return <main className="mx-auto max-w-5xl"><div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold text-[#002147]">Bookings</h1><p className="mt-1 text-sm text-slate-600">Independent mentor availability and requests, separate from Friday program sessions.</p></div>{semesters.length > 1 && <label className="text-sm font-medium text-[#002147]">Semester<select value={semesterId ?? ""} onChange={(event) => setSemesterId(event.target.value || null)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800"><option value="">Select semester</option>{semesters.map((semester) => <option key={semester.id} value={semester.id} disabled={!semester.is_active}>{semester.name}{semester.is_active ? " (active)" : " (unavailable for bookings)"}</option>)}</select></label>}</div>{loading ? <DataLoading label="Loading booking semesters..." /> : loadError ? <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{loadError} <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : semesterId ? <MentorBookingWorkspace key={semesterId} semesterId={semesterId} mentorSemesterId={mentorSemesterId} focusedRequestId={requestedBookingId} /> : <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{semesters.some((semester) => semester.is_active) ? "Select a semester to view bookings." : semesters.length ? "No active semester is available for bookings." : "No semesters are available."}</p>}</main>;
}

export default function BookingsPage() {
  return <Suspense fallback={<DataLoading label="Loading bookings..." />}><BookingsContent /></Suspense>;
}
