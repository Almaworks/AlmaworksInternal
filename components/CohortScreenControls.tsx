"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import {
  filterRecordsForCohort,
  membershipIdsForRecords,
  type CohortRecordReference,
} from "@/src/lifecycle/cohort-screen";
import type { CohortMember, CohortSummary } from "@/src/lifecycle/cohort-management";
import type { ProgramRole } from "@/src/lifecycle/types";

interface CohortResponse {
  cohorts: { current: CohortSummary | null; previous: CohortSummary | null; all: CohortSummary[] };
  members: CohortMember[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sign in again to manage cohorts.");
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...init?.headers },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Cohort request failed.");
  return body;
}

export function useCohortScreen(records: readonly CohortRecordReference[], role: ProgramRole | "all", preferredSemesterId?: string) {
  const [cohorts, setCohorts] = useState<CohortResponse["cohorts"]>({ current: null, previous: null, all: [] });
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [scope, setScope] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (semesterId: string, allTime = false) => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await requestJson<CohortResponse>(`/api/admin/lifecycle/cohorts?semesterId=${encodeURIComponent(semesterId)}&scope=${allTime ? "all" : "semester"}`);
      setCohorts(result.cohorts);
      setMembers(result.members);
      setScope(allTime ? "all" : semesterId);
      setSelected([]);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to load cohorts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      if (preferredSemesterId) { await load(preferredSemesterId); return; }
      const { data } = await createClient().from("semesters").select("id").eq("is_active", true).maybeSingle();
      if (data?.id) await load(data.id);
      else { setMessage("No active cohort is configured."); setLoading(false); }
    })();
  }, [load, preferredSemesterId]);

  const semesterId = scope === "all" ? null : scope || null;
  const scopedRecords = useMemo(
    () => semesterId === null && scope !== "all" ? [] : filterRecordsForCohort(records, members, { semesterId, role }),
    [members, records, role, scope, semesterId],
  );

  async function changeScope(next: string) {
    if (next === "all") {
      if (!window.confirm("Load every cohort? The all-time view can take longer and all changes will be disabled.")) return;
      if (cohorts.current) await load(cohorts.current.id, true);
    } else await load(next);
  }

  function membershipIds(visibleRecords: readonly CohortRecordReference[]) {
    return semesterId === null
      ? []
      : membershipIdsForRecords(visibleRecords, members, { semesterId, role });
  }

  async function setActivity(activity: "active" | "inactive") {
    if (!semesterId || selected.length === 0) return;
    setWorking(true); setMessage(null);
    try {
      const result = await requestJson<{ updated: number }>("/api/admin/lifecycle/memberships/activity", {
        method: "PATCH", body: JSON.stringify({ semesterId, membershipIds: selected, activity }),
      });
      setMessage(`${result.updated} membership${result.updated === 1 ? "" : "s"} set ${activity}.`);
      await load(semesterId);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to update memberships."); }
    finally { setWorking(false); }
  }

  async function importSelected(ids: readonly string[] | null) {
    if (!semesterId || !cohorts.current || semesterId === cohorts.current.id) return;
    setWorking(true); setMessage(null);
    try {
      const result = await requestJson<{ imported: number; skipped: number }>("/api/admin/lifecycle/memberships/import", {
        method: "POST",
        body: JSON.stringify({ sourceSemesterId: semesterId, targetSemesterId: cohorts.current.id, membershipIds: ids }),
      });
      setMessage(`${result.imported} imported; ${result.skipped} already present.`); setSelected([]);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to import memberships."); }
    finally { setWorking(false); }
  }

  return { cohorts, members, scope, semesterId, selected, setSelected, loading, working, message, scopedRecords, changeScope, membershipIds, setActivity, importSelected };
}

type Controller = ReturnType<typeof useCohortScreen>;

export function CohortScreenControls({ controller, visibleRecords }: { controller: Controller; visibleRecords: readonly CohortRecordReference[] }) {
  const visibleIds = controller.membershipIds(visibleRecords);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => controller.selected.includes(id));
  const prior = controller.semesterId !== null && controller.cohorts.current !== null && controller.semesterId !== controller.cohorts.current.id;
  return <div className="mb-4 space-y-3">
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-end">
      <label className="text-xs font-semibold text-gray-600">Cohort
        <select aria-label="Cohort scope" className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={controller.scope} onChange={(event) => void controller.changeScope(event.target.value)} disabled={controller.loading || controller.working}>
          {controller.cohorts.all.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}{cohort.id === controller.cohorts.current?.id ? " · Current" : cohort.id === controller.cohorts.previous?.id ? " · Previous" : ""}</option>)}
          {controller.cohorts.all.length > 0 && <option value="all">All time</option>}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600"><input type="checkbox" checked={allSelected} disabled={controller.scope === "all" || visibleIds.length === 0 || controller.working} onChange={(event) => controller.setSelected(event.target.checked ? visibleIds : controller.selected.filter((id) => !visibleIds.includes(id)))} />Select all filtered ({visibleIds.length})</label>
      {controller.scope !== "all" && visibleIds.length > 0 && <details className="relative text-xs text-gray-600"><summary className="cursor-pointer select-none font-medium">Choose filtered people</summary><div className="absolute z-20 mt-2 max-h-56 min-w-64 space-y-1 overflow-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg">{visibleIds.map((id) => { const member = controller.members.find((item) => item.membershipId === id); return <label key={id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"><input type="checkbox" className="mt-0.5" checked={controller.selected.includes(id)} disabled={controller.working} onChange={(event) => controller.setSelected(event.target.checked ? [...new Set([...controller.selected, id])] : controller.selected.filter((selectedId) => selectedId !== id))} /><span><strong className="block text-[#002147]">{member?.name ?? "Cohort member"}</strong><small>{member?.email}</small></span></label>; })}</div></details>}
      {controller.selected.length > 0 && controller.scope !== "all" && <div className="flex flex-wrap gap-2 sm:ml-auto"><span className="self-center text-xs text-gray-500">{controller.selected.length} selected</span><button className="rounded-lg bg-[#002147] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={controller.working} onClick={() => void controller.setActivity("active")}>Set Active</button><button className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50" disabled={controller.working} onClick={() => void controller.setActivity("inactive")}>Set Inactive</button>{prior && <button className="rounded-lg bg-[#75AADB] px-3 py-2 text-xs font-semibold text-[#002147] disabled:opacity-50" disabled={controller.working} onClick={() => void controller.importSelected(controller.selected)}>Import selected into {controller.cohorts.current?.name}</button>}</div>}
      {prior && controller.selected.length === 0 && visibleIds.length > 0 && <button className="rounded-lg border border-[#75AADB] px-3 py-2 text-xs font-semibold text-[#002147] sm:ml-auto" disabled={controller.working} onClick={() => void controller.importSelected(visibleIds)}>Import filtered into {controller.cohorts.current?.name}</button>}
    </div>
    {controller.scope === "all" && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>All-time view:</strong> every manageable cohort is loaded. Choose a specific cohort to change status or import people.</p>}
    {controller.message && <p role="status" className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{controller.message}</p>}
  </div>;
}
