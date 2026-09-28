"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DataLoading } from "@/components/DataLoading";
import { invalidateCohortReads } from "@/components/CohortScreenControls";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import type {
  AdminAccessQuery,
  AdminAccessWorkspace as AdminAccessWorkspaceData,
} from "@/src/dashboard/admin-access";
import { membersReadyForActivation } from "@/src/lifecycle/admin-activation";
import { resolveBulkMembershipAction } from "@/src/lifecycle/membership-presentation";

const roleColors: Record<string, string> = {
  admin: "bg-purple-50 text-purple-700",
  mentor: "bg-blue-50 text-blue-700",
  startup: "bg-green-50 text-green-700",
};

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? fallback);
  return body;
}

function workspaceUrl(query: AdminAccessQuery): string {
  const parameters = new URLSearchParams({ scope: query.scope });
  if (query.semesterId) parameters.set("semesterId", query.semesterId);
  return `/api/admin/access?${parameters}`;
}

export function AdminAccessWorkspace() {
  const [workspace, setWorkspace] = useState<AdminAccessWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [roleSelections, setRoleSelections] = useState<Record<string, string>>({});
  const loadEpoch = useRef(0);
  const mutationEpoch = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const lastQuery = useRef<AdminAccessQuery>({ scope: "semester", semesterId: null });

  const load = useCallback(async (query: AdminAccessQuery): Promise<boolean> => {
    const epoch = ++loadEpoch.current;
    lastQuery.current = query;
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    setLoading(true);
    setLoadError(null);
    setWorkspace(null);
    setSelected([]);
    try {
      const response = await authenticatedFetch(workspaceUrl(query), { signal: controller.signal });
      const next = await responseJson<AdminAccessWorkspaceData>(response, "Unable to load access queues.");
      if (!mounted.current || epoch !== loadEpoch.current) return false;
      setWorkspace(next);
      return true;
    } catch (cause) {
      if (!mounted.current || epoch !== loadEpoch.current || controller.signal.aborted) return false;
      setLoadError(cause instanceof Error ? cause.message : "Unable to load access queues.");
      return false;
    } finally {
      if (loadAbort.current === controller) loadAbort.current = null;
      if (mounted.current && epoch === loadEpoch.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void load({ scope: "semester", semesterId: null });
    return () => {
      mounted.current = false;
      loadEpoch.current += 1;
      mutationEpoch.current += 1;
      loadAbort.current?.abort();
    };
  }, [load]);

  const reload = useCallback(async (): Promise<boolean> => {
    return await load(lastQuery.current);
  }, [load]);

  const mutate = useCallback(async (
    key: string,
    action: () => Promise<string | null>,
  ) => {
    if (working !== null) return;
    const epoch = ++mutationEpoch.current;
    setWorking(key);
    setMutationError(null);
    setMessage(null);
    invalidateCohortReads();
    try {
      const successMessage = await action();
      if (!mounted.current || epoch !== mutationEpoch.current) return;
      const refreshed = await reload();
      if (!mounted.current || epoch !== mutationEpoch.current) return;
      setMessage(refreshed
        ? successMessage
        : "Access updated, but the queues could not be refreshed. Try again.");
    } catch (cause) {
      if (!mounted.current || epoch !== mutationEpoch.current) return;
      setMutationError(cause instanceof Error ? cause.message : "Unable to update access.");
    } finally {
      invalidateCohortReads();
      if (mounted.current && epoch === mutationEpoch.current) setWorking(null);
    }
  }, [reload, working]);

  const readyMembers = useMemo(
    () => membersReadyForActivation(workspace?.currentMembers ?? []),
    [workspace],
  );
  const visibleIds = useMemo(
    () => workspace?.members.map((member) => member.membershipId) ?? [],
    [workspace],
  );
  const selectedMembers = useMemo(
    () => workspace?.members.filter((member) => selected.includes(member.membershipId)) ?? [],
    [selected, workspace],
  );
  const bulkAction = selectedMembers.length === selected.length
    ? resolveBulkMembershipAction(selectedMembers)
    : null;
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  async function changeScope(next: string) {
    if (!workspace) return;
    setMessage(null);
    setMutationError(null);
    if (next === "all") {
      if (!window.confirm("Load every cohort? The all-time view can take longer. Bulk changes and imports require a specific cohort.")) return;
      await load({ scope: "all", semesterId: workspace.cohorts.current.id });
      return;
    }
    await load({ scope: "semester", semesterId: next });
  }

  function postJson<T>(url: string, method: "PATCH" | "POST", body: unknown, fallback: string): Promise<T> {
    return authenticatedFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (response) => await responseJson<T>(response, fallback));
  }

  function updateMemberships(
    membershipIds: string[],
    activity: "active" | "inactive",
    key: string,
    targetSemesterId = workspace?.semesterId,
  ) {
    if (
      !workspace
      || !targetSemesterId
      || targetSemesterId !== workspace.cohorts.current.id
      || membershipIds.length === 0
    ) return;
    const semesterId = targetSemesterId;
    void mutate(key, async () => {
      const result = await postJson<{ updated: number }>(
        "/api/admin/lifecycle/memberships/activity",
        "PATCH",
        { semesterId, membershipIds, activity },
        "Unable to update memberships.",
      );
      return `${result.updated} membership${result.updated === 1 ? "" : "s"} ${activity === "active" ? "activated" : "suspended"}.`;
    });
  }

  function importMemberships(membershipIds: string[]) {
    if (!workspace?.semesterId || membershipIds.length === 0) return;
    const current = workspace.cohorts.current;
    const sourceSemesterId = workspace.semesterId;
    void mutate("import", async () => {
      const result = await postJson<{ imported: number; skipped: number }>(
        "/api/admin/lifecycle/memberships/import",
        "POST",
        { sourceSemesterId, targetSemesterId: current.id, membershipIds },
        "Unable to import memberships.",
      );
      return `${result.imported} imported; ${result.skipped} already present.`;
    });
  }

  function approveUser(userId: string) {
    const role = roleSelections[userId];
    if (!role || (role !== "admin" && role !== "mentor" && role !== "startup")) return;
    void mutate(`approve:${userId}`, async () => {
      await postJson<{ ok: true }>(
        "/api/admin/users/approve",
        "POST",
        { userId, role },
        "Unable to approve registration.",
      );
      return "Registration approved.";
    });
  }

  function rejectUser(userId: string) {
    if (!window.confirm("Reject this user?")) return;
    void mutate(`reject:${userId}`, async () => {
      await postJson<{ ok: true }>(
        "/api/admin/users/reject",
        "POST",
        { userId },
        "Unable to reject registration.",
      );
      return "Registration rejected.";
    });
  }

  if (loading) return <DataLoading label="Loading access queues…" />;
  if (loadError || !workspace) {
    return <div className="max-w-5xl space-y-3">
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <span>{loadError ?? "Unable to load access queues."}</span>{" "}
        <button type="button" className="font-semibold underline" onClick={() => void reload()}>Try again</button>
      </div>
      {message && <p role="status" className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</p>}
    </div>;
  }

  const prior = workspace.scope === "semester"
    && workspace.semesterId !== null
    && workspace.semesterId !== workspace.cohorts.current.id;
  const canSelect = workspace.scope === "semester" && workspace.semesterId !== null;
  const canSetActivity = workspace.scope === "semester"
    && workspace.semesterId === workspace.cohorts.current.id;

  return <div className="max-w-5xl space-y-4">
    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-end">
      <label className="text-xs font-semibold text-gray-600">Cohort
        <select
          aria-label="Cohort scope"
          className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          value={workspace.scope === "all" ? "all" : workspace.semesterId ?? ""}
          onChange={(event) => void changeScope(event.target.value)}
          disabled={working !== null}
        >
          {workspace.cohorts.all.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}{cohort.id === workspace.cohorts.current.id ? " · Current" : cohort.id === workspace.cohorts.previous?.id ? " · Previous" : ""}</option>)}
          <option value="all">All time</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        <input type="checkbox" checked={allSelected} disabled={!canSelect || visibleIds.length === 0 || working !== null} onChange={(event) => setSelected(event.target.checked ? visibleIds : [])} />
        Select all filtered ({visibleIds.length})
      </label>
      {canSelect && visibleIds.length > 0 && <details className="relative text-xs text-gray-600">
        <summary className="cursor-pointer select-none font-medium">Choose filtered people</summary>
        <div className="absolute z-20 mt-2 max-h-56 min-w-64 space-y-1 overflow-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          {visibleIds.map((id) => {
            const member = workspace.members.find((item) => item.membershipId === id);
            return <label key={id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <input type="checkbox" className="mt-0.5" checked={selected.includes(id)} disabled={working !== null} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, id])] : selected.filter((selectedId) => selectedId !== id))} />
              <span><strong className="block text-[#002147]">{member?.name ?? "Cohort member"}</strong><small>{member?.email}</small></span>
            </label>;
          })}
        </div>
      </details>}
      {selected.length > 0 && canSelect && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <span className="self-center text-xs text-gray-500">{selected.length} selected</span>
        {canSetActivity && bulkAction === "activate" && <button className="rounded-lg bg-[#002147] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={working !== null} onClick={() => updateMemberships(selected, "active", "bulk-activate")}>Activate selected</button>}
        {canSetActivity && bulkAction === "suspend" && <button className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50" disabled={working !== null} onClick={() => updateMemberships(selected, "inactive", "bulk-suspend")}>Suspend selected</button>}
        {canSetActivity && bulkAction === "restore" && <button className="rounded-lg bg-[#75AADB] px-3 py-2 text-xs font-semibold text-[#002147] disabled:opacity-50" disabled={working !== null} onClick={() => updateMemberships(selected, "active", "bulk-restore")}>Restore selected</button>}
        {canSetActivity && bulkAction === null && <span className="text-xs text-gray-500">Select members with the same available lifecycle action.</span>}
        {prior && <button className="rounded-lg bg-[#75AADB] px-3 py-2 text-xs font-semibold text-[#002147] disabled:opacity-50" disabled={working !== null} onClick={() => importMemberships(selected)}>Import selected into {workspace.cohorts.current.name}</button>}
      </div>}
      {prior && selected.length === 0 && visibleIds.length > 0 && <button className="rounded-lg border border-[#75AADB] px-3 py-2 text-xs font-semibold text-[#002147] sm:ml-auto" disabled={working !== null} onClick={() => importMemberships(visibleIds)}>Import filtered into {workspace.cohorts.current.name}</button>}
    </div>

    {workspace.scope === "all" && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>All-time view:</strong> every cohort is loaded. Bulk changes and imports require a specific cohort; current-cohort activation remains available.</p>}
    {mutationError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{mutationError}</p>}
    {message && <p role="status" className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</p>}

    <section>
      <div className="mb-4"><h1 className="text-base font-semibold text-[#002147]">Ready for activation</h1><p className="mt-1 text-sm text-gray-500">People who completed onboarding in the current cohort can now access the program.</p></div>
      {readyMembers.length > 0 && <div className="space-y-3">{readyMembers.map((member) => <div key={member.membershipId} className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50/40 px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#002147]">{member.name}</p><p className="truncate text-xs text-gray-500">{member.email}</p></div>
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2.5 py-1 font-semibold capitalize ${roleColors[member.role] ?? "bg-gray-100 text-gray-600"}`}>{member.role}</span><span className="rounded-full bg-white px-2.5 py-1 font-medium text-gray-600 ring-1 ring-gray-200">{member.semesterName}</span></div>
        <button type="button" onClick={() => updateMemberships([member.membershipId], "active", `activate:${member.membershipId}`, member.semesterId)} disabled={working !== null} className="shrink-0 rounded-lg bg-[#002147] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#002147]/90 disabled:opacity-50">{working === `activate:${member.membershipId}` ? "Activating…" : "Activate"}</button>
      </div>)}</div>}
    </section>

    <section>
      <div className="mb-4"><h2 className="text-base font-semibold text-[#002147]">Registration requests</h2><p className="mt-1 text-sm text-gray-500">Approve new registrations and assign their role before they can access the platform.</p></div>
      <p className="mb-4 text-sm text-gray-500">Pending profiles are kept here until you approve or reject them.</p>
      {workspace.pendingUsers.length === 0
        ? <p className="text-sm text-gray-400">No pending registrations.</p>
        : <div className="space-y-3">{workspace.pendingUsers.map((user) => <div key={user.id} className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#002147]">{user.full_name ?? "—"}</p><p className="truncate text-xs text-gray-500">{user.email}</p>{user.requested_role && <p className="mt-1 text-xs font-medium text-[#477f9f]">Requested: {user.requested_role === "mentor" ? "Mentor" : "Startup"} <span className="font-normal text-gray-400">(not assigned)</span></p>}<p className="mt-0.5 text-xs text-gray-400">Registered {new Date(user.created_at).toLocaleDateString()}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={roleSelections[user.id] ?? ""} onChange={(event) => setRoleSelections((priorSelections) => ({ ...priorSelections, [user.id]: event.target.value }))} disabled={workspace.scope === "all" || working !== null} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 disabled:opacity-50"><option value="">Select role…</option><option value="mentor">Mentor</option><option value="startup">Startup</option><option value="admin">Admin</option></select>
            <button type="button" onClick={() => approveUser(user.id)} disabled={workspace.scope === "all" || working !== null || !roleSelections[user.id]} className="rounded-lg bg-[#002147] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{working === `approve:${user.id}` ? "Approving…" : "Approve"}</button>
            <button type="button" onClick={() => rejectUser(user.id)} disabled={workspace.scope === "all" || working !== null} className="rounded-lg px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-50">{working === `reject:${user.id}` ? "Rejecting…" : "Reject"}</button>
          </div>
        </div>)}</div>}
    </section>

    {readyMembers.length === 0 && workspace.pendingUsers.length === 0 && <p className="text-sm text-gray-400">Everyone is up to date.</p>}
  </div>;
}
