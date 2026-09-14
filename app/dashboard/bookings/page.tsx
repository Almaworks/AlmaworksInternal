"use client";

import { useEffect, useMemo, useState } from "react";

import MentorBookingWorkspace from "@/components/mentor-booking/MentorBookingWorkspace";
import { createClient } from "@/utils/supabase/client";

type Semester = { id: string; name: string; is_active: boolean };

export default function BookingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const mentorSemesterId = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("mentor");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadSemesters() {
      const { data, error } = await supabase.from("semesters").select("id, name, is_active").order("is_active", { ascending: false }).order("name");
      if (!active) return;
      if (error) { setLoadError("Semesters could not be loaded."); return; }
      const rows = (data ?? []) as Semester[];
      setSemesters(rows);
      setSemesterId(rows.find((semester) => semester.is_active)?.id ?? rows[0]?.id ?? null);
    }
    void loadSemesters();
    return () => { active = false; };
  }, [supabase]);

  return <main className="mx-auto max-w-5xl"><div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold text-[#002147]">Bookings</h1><p className="mt-1 text-sm text-slate-600">Independent mentor availability and requests, separate from Friday program sessions.</p></div>{semesters.length > 1 && <label className="text-sm font-medium text-[#002147]">Semester<select value={semesterId ?? ""} onChange={(event) => setSemesterId(event.target.value || null)} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800"><option value="">Select semester</option>{semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}{semester.is_active ? " (active)" : ""}</option>)}</select></label>}</div>{loadError ? <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{loadError}</p> : <MentorBookingWorkspace key={semesterId ?? "no-semester"} semesterId={semesterId} mentorSemesterId={mentorSemesterId} />}</main>;
}
