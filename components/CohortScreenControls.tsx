"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import { createReadCache } from "@/src/dashboard/read-cache";
import {
  filterRecordsForCohort,
  membershipIdsForRecords,
  selectedVisibleMembershipIds,
  type CohortRecordReference,
} from "@/src/lifecycle/cohort-screen";
import type { CohortMember, CohortSummary } from "@/src/lifecycle/cohort-management";
import {
  resolveBulkMembershipAction,
  type MembershipLifecycleAction,
} from "@/src/lifecycle/membership-presentation";
import type { ProgramRole } from "@/src/lifecycle/types";
import { persistAndRefreshMembership } from "@/src/lifecycle/membership-mutation";

interface CohortResponse {
  cohorts: { current: CohortSummary | null; previous: CohortSummary | null; all: CohortSummary[] };
  members: CohortMember[];
}

const cohortReads = createReadCache<unknown>(15_000);

export function invalidateCohortReads() { cohortReads.clear(); }

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sign in again to manage cohorts.");
  const read = async (): Promise<T> => {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...init?.headers },
    });
    const body = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Cohort request failed.");
    return body;
  };
  if ((init?.method ?? 'GET') !== 'GET') {
    cohortReads.clear();
    try { return await read(); } finally { cohortReads.clear(); }
  }
  // Token-scoped memory only: no private data in localStorage, no shared server cache.
  return await cohortReads.read(data.session.access_token, url, read) as T;
}

export function useCohortScreen(records: readonly CohortRecordReference[], role: ProgramRole | "all", preferredSemesterId?: string, enabled = true) {
  const [cohorts, setCohorts] = useState<CohortResponse["cohorts"]>({ current: null, previous: null, all: [] });
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [currentMembers, setCurrentMembers] = useState<CohortMember[]>([]);
  const [scope, setScope] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [refreshRetryRequired, setRefreshRetryRequired] = useState(false);
  const loadEpoch = useRef(0);
  const currentLoadEpoch = useRef(0);
  const bootstrapEpoch = useRef(0);
  const appliedPreferredSemester = useRef<{ value: string | undefined } | null>(null);

  const load = useCallback(async (semesterId: string, allTime = false) => {
    bootstrapEpoch.current += 1;
    const epoch = ++loadEpoch.current;
    const currentEpoch = ++currentLoadEpoch.current;
    const requestedScope = allTime ? "all" : semesterId;
    setLoading(true);
    setReady(false);
    setLoadError(null);
    setMessage(null);
    setScope(requestedScope);
    setMembers([]);
    setCurrentMembers([]);
    setSelected([]);
    try {
      const result = await requestJson<CohortResponse>(`/api/admin/lifecycle/cohorts?semesterId=${encodeURIComponent(semesterId)}&scope=${allTime ? "all" : "semester"}`);
      if (epoch !== loadEpoch.current) return null;
      const currentSemesterId = result.cohorts.current?.id ?? null;
      let nextCurrentMembers = currentSemesterId === null
        ? []
        : result.members.filter((member) => member.semesterId === currentSemesterId);
      if (!allTime && currentSemesterId && currentSemesterId !== semesterId) {
        const currentResult = await requestJson<CohortResponse>(`/api/admin/lifecycle/cohorts?semesterId=${encodeURIComponent(currentSemesterId)}&scope=semester`);
        if (epoch !== loadEpoch.current) return null;
        nextCurrentMembers = currentResult.members.filter((member) => member.semesterId === currentSemesterId);
      }
      setCohorts(result.cohorts);
      setMembers(result.members);
      if (currentEpoch === currentLoadEpoch.current) setCurrentMembers(nextCurrentMembers);
      setReady(true);
      return result;
    } catch (cause) {
      if (epoch !== loadEpoch.current) return null;
      setLoadError(cause instanceof Error ? cause.message : "Unable to load cohorts.");
      setMembers([]);
      setCurrentMembers([]);
      setSelected([]);
      setReady(false);
      return null;
    } finally {
      if (epoch === loadEpoch.current) setLoading(false);
    }
  }, []);

  const loadCurrent = useCallback(async (semesterId: string): Promise<boolean> => {
    const epoch = ++currentLoadEpoch.current;
    setLoadError(null);
    setCurrentMembers([]);
    try {
      const result = await requestJson<CohortResponse>(`/api/admin/lifecycle/cohorts?semesterId=${encodeURIComponent(semesterId)}&scope=semester`);
      if (epoch !== currentLoadEpoch.current) return false;
      setCohorts(result.cohorts);
      setCurrentMembers(result.members.filter((member) => member.semesterId === semesterId));
      return true;
    } catch (cause) {
      if (epoch !== currentLoadEpoch.current) return false;
      setLoadError(cause instanceof Error ? cause.message : "Unable to load the current activation queue.");
      setCurrentMembers([]);
      return false;
    }
  }, []);

  const loadActiveSemester = useCallback(async (): Promise<boolean> => {
    const epoch = ++bootstrapEpoch.current;
    loadEpoch.current += 1;
    currentLoadEpoch.current += 1;
    setLoading(true);
    setReady(false);
    setLoadError(null);
    setMessage(null);
    setScope("");
    setMembers([]);
    setCurrentMembers([]);
    setSelected([]);
    try {
      const { data, error } = await createClient().from("semesters").select("id").eq("is_active", true).maybeSingle();
      if (epoch !== bootstrapEpoch.current) return false;
      if (error) throw new Error(error.message);
      if (!data?.id) {
        setLoadError("No active cohort is configured.");
        setLoading(false);
        return false;
      }
      return await load(data.id) !== null;
    } catch (cause) {
      if (epoch !== bootstrapEpoch.current) return false;
      setLoadError(cause instanceof Error ? cause.message : "Unable to load the active cohort.");
      setLoading(false);
      return false;
    }
  }, [load]);

  useEffect(() => {
    appliedPreferredSemester.current = { value: preferredSemesterId };
    if (!enabled) {
      bootstrapEpoch.current += 1;
      loadEpoch.current += 1;
      currentLoadEpoch.current += 1;
      setMembers([]);
      setCurrentMembers([]);
      setSelected([]);
      setScope("");
      setLoadError(null);
      setReady(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setReady(false);
    setLoadError(null);
    setMembers([]);
    setCurrentMembers([]);
    setSelected([]);
    void (async () => {
      if (preferredSemesterId) {
        await load(preferredSemesterId);
        return;
      }
      await loadActiveSemester();
    })();
    return () => {
      bootstrapEpoch.current += 1;
      loadEpoch.current += 1;
      currentLoadEpoch.current += 1;
    };
  }, [enabled, load, loadActiveSemester, preferredSemesterId]);

  const preferredScopePending = enabled && (
    appliedPreferredSemester.current === null
    || appliedPreferredSemester.current.value !== preferredSemesterId
  );
  const presentedScope = preferredScopePending ? (preferredSemesterId ?? "") : scope;
  const presentedLoadError = preferredScopePending ? null : loadError;
  const presentedLoading = enabled && (loading || preferredScopePending);
  const presentedReady = enabled && ready && !preferredScopePending && presentedLoadError === null;
  const presentedMembers = useMemo(() => presentedReady ? members : [], [members, presentedReady]);
  const presentedCurrentMembers = useMemo(() => presentedReady ? currentMembers : [], [currentMembers, presentedReady]);
  const semesterId = presentedScope === "all" ? null : presentedScope || null;
  const scopedRecords = useMemo(
    () => semesterId === null && presentedScope !== "all" ? [] : filterRecordsForCohort(records, presentedMembers, { semesterId, role }),
    [presentedMembers, records, role, presentedScope, semesterId],
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
      : membershipIdsForRecords(visibleRecords, presentedMembers, { semesterId, role });
  }

  async function setActivity(action: MembershipLifecycleAction) {
    if (!semesterId || selected.length === 0) return;
    const selectedMembers = members.filter((member) => member.semesterId === semesterId && selected.includes(member.membershipId));
    if (selectedMembers.length !== selected.length || resolveBulkMembershipAction(selectedMembers) !== action) {
      setMessage("Select members that all have the same available lifecycle action.");
      return;
    }
    const activity = action === "suspend" ? "inactive" : "active";
    setWorking(true); setMessage(null);
    let updated = 0;
    const outcome = await persistAndRefreshMembership({
      persist: async () => {
        const result = await requestJson<{ updated: number }>("/api/admin/lifecycle/memberships/activity", {
          method: "PATCH", body: JSON.stringify({ semesterId, membershipIds: selected, activity }),
        });
        updated = result.updated;
      },
      refreshes: [reload],
    });
    if (outcome.status === "mutation_failed") {
      setMessage(outcome.message);
    } else if (outcome.status === "updated_refresh_failed") {
      setMessage("Membership updated; refresh failed.");
      setRefreshRetryRequired(true);
    } else {
      setMessage(`${updated} membership${updated === 1 ? "" : "s"} ${activity === "active" ? "activated" : "suspended"}.`);
      setRefreshRetryRequired(false);
    }
    setWorking(false);
  }

  async function importSelected(ids: readonly string[] | null) {
    if (!semesterId || !cohorts.current || semesterId === cohorts.current.id || !ids?.length) return;
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

  async function reload(): Promise<boolean> {
    cohortReads.clear();
    if (scope === "all") {
      return cohorts.current ? await load(cohorts.current.id, true) !== null : false;
    }
    if (semesterId) return await load(semesterId) !== null;
    return loadActiveSemester();
  }

  async function reloadCurrent(): Promise<boolean> {
    cohortReads.clear();
    return cohorts.current ? loadCurrent(cohorts.current.id) : false;
  }

  async function retryRefresh() {
    setWorking(true);
    const refreshed = await reload();
    setRefreshRetryRequired(!refreshed);
    setMessage(refreshed ? "Membership data refreshed." : "Membership updated; refresh failed.");
    setWorking(false);
  }

  return { cohorts, members: presentedMembers, currentMembers: presentedCurrentMembers, scope: presentedScope, semesterId, selected: presentedReady ? selected : [], setSelected, loading: presentedLoading, ready: presentedReady, loadError: presentedLoadError, working, message, refreshRetryRequired, scopedRecords, changeScope, membershipIds, setActivity, importSelected, reload, reloadCurrent, retryRefresh };
}

type Controller = ReturnType<typeof useCohortScreen>;

export function CohortScreenControls({ controller, visibleRecords, rowSelection = false }: { controller: Controller; visibleRecords: readonly CohortRecordReference[]; rowSelection?: boolean }) {
  const visibleIds = controller.membershipIds(visibleRecords);
  const selectedVisibleIds = selectedVisibleMembershipIds(controller.selected, visibleIds);
  const allSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;
  const prior = controller.semesterId !== null && controller.cohorts.current !== null && controller.semesterId !== controller.cohorts.current.id;
  const canSetActivity = controller.semesterId !== null && controller.semesterId === controller.cohorts.current?.id;
  const selectedMembers = controller.members.filter((member) => controller.semesterId !== null && member.semesterId === controller.semesterId && controller.selected.includes(member.membershipId));
  const bulkAction = selectedMembers.length === controller.selected.length ? resolveBulkMembershipAction(selectedMembers) : null;
  return <div className="mb-4 space-y-3">
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-end">
      <label className="text-xs font-semibold text-gray-600">Cohort
        <select aria-label="Cohort scope" className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={controller.scope} onChange={(event) => void controller.changeScope(event.target.value)} disabled={controller.loading || controller.working}>
          {controller.cohorts.all.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}{cohort.id === controller.cohorts.current?.id ? " · Current" : cohort.id === controller.cohorts.previous?.id ? " · Previous" : ""}</option>)}
          {controller.cohorts.all.length > 0 && <option value="all">All time</option>}
        </select>
      </label>
      {rowSelection && prior && <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 sm:ml-auto">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" aria-label="Select visible mentors" checked={allSelected} disabled={visibleIds.length === 0 || controller.working} onChange={() => controller.setSelected(allSelected ? [] : visibleIds)} />Select visible</label>
        <span aria-live="polite">{selectedVisibleIds.length} selected</span>
        {selectedVisibleIds.length > 0 && <button type="button" className="font-medium text-[#002147] underline-offset-2 hover:underline" disabled={controller.working} onClick={() => controller.setSelected([])}>Clear</button>}
        <button type="button" className="rounded-lg bg-[#002147] px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={controller.working || selectedVisibleIds.length === 0} onClick={() => void controller.importSelected(selectedVisibleIds)}>{controller.working ? "Importing…" : `Import selected into ${controller.cohorts.current?.name}`}</button>
      </div>}
      {(!rowSelection || !prior) && <>
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600"><input type="checkbox" checked={allSelected} disabled={controller.scope === "all" || visibleIds.length === 0 || controller.working} onChange={(event) => controller.setSelected(event.target.checked ? visibleIds : controller.selected.filter((id) => !visibleIds.includes(id)))} />Select all filtered ({visibleIds.length})</label>
      {controller.scope !== "all" && visibleIds.length > 0 && <details className="relative text-xs text-gray-600"><summary className="cursor-pointer select-none font-medium">Choose filtered people</summary><div className="absolute z-20 mt-2 max-h-56 min-w-64 space-y-1 overflow-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg">{visibleIds.map((id) => { const member = controller.members.find((item) => item.membershipId === id); return <label key={id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"><input type="checkbox" className="mt-0.5" checked={controller.selected.includes(id)} disabled={controller.working} onChange={(event) => controller.setSelected(event.target.checked ? [...new Set([...controller.selected, id])] : controller.selected.filter((selectedId) => selectedId !== id))} /><span><strong className="block text-[#002147]">{member?.name ?? "Cohort member"}</strong><small>{member?.email}</small></span></label>; })}</div></details>}
      {controller.selected.length > 0 && controller.scope !== "all" && <div className="flex flex-wrap items-center gap-2 sm:ml-auto"><span className="self-center text-xs text-gray-500">{controller.selected.length} selected</span>{canSetActivity && bulkAction === "activate" && <button className="rounded-lg bg-[#002147] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={controller.working} onClick={() => void controller.setActivity("activate")}>Activate selected</button>}{canSetActivity && bulkAction === "suspend" && <button className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50" disabled={controller.working} onClick={() => void controller.setActivity("suspend")}>Suspend selected</button>}{canSetActivity && bulkAction === "restore" && <button className="rounded-lg bg-[#75AADB] px-3 py-2 text-xs font-semibold text-[#002147] disabled:opacity-50" disabled={controller.working} onClick={() => void controller.setActivity("restore")}>Restore selected</button>}{canSetActivity && bulkAction === null && <span className="text-xs text-gray-500">Select members with the same available lifecycle action.</span>}{prior && <button className="rounded-lg bg-[#75AADB] px-3 py-2 text-xs font-semibold text-[#002147] disabled:opacity-50" disabled={controller.working} onClick={() => void controller.importSelected(controller.selected)}>Import selected into {controller.cohorts.current?.name}</button>}</div>}
      {prior && controller.selected.length === 0 && visibleIds.length > 0 && <button className="rounded-lg border border-[#75AADB] px-3 py-2 text-xs font-semibold text-[#002147] sm:ml-auto" disabled={controller.working} onClick={() => void controller.importSelected(visibleIds)}>Import filtered into {controller.cohorts.current?.name}</button>}
      </>}
    </div>
    {controller.loadError && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{controller.loadError}</span><button type="button" className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50" disabled={controller.loading || controller.working} onClick={() => void controller.reload()}>Try again</button></div>}
    {controller.scope === "all" && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>All-time view:</strong> every manageable cohort is loaded. Choose a specific cohort to change status or import people.</p>}
    {controller.message && <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700"><span>{controller.message}</span>{controller.refreshRetryRequired && <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50" disabled={controller.working} onClick={() => void controller.retryRefresh()}>Retry refresh</button>}</div>}
  </div>;
}
