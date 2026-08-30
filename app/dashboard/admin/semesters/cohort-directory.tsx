"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import type { CohortMember, CohortSummary } from "@/src/lifecycle/cohort-management";

interface CohortResponse {
  cohorts: {
    current: CohortSummary | null;
    previous: CohortSummary | null;
    all: CohortSummary[];
  };
  members: CohortMember[];
}

async function bearerToken(): Promise<string> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sign in again to manage cohorts.");
  return data.session.access_token;
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await bearerToken();
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Cohort request failed.");
  return body;
}

export default function CohortDirectory() {
  const [cohorts, setCohorts] = useState<CohortResponse["cohorts"]>({ current: null, previous: null, all: [] });
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [scope, setScope] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [activity, setActivity] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (semesterId: string, allTime = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await jsonRequest<CohortResponse>(
        `/api/admin/lifecycle/cohorts?semesterId=${encodeURIComponent(semesterId)}&scope=${allTime ? "all" : "semester"}`,
      );
      setCohorts(result.cohorts);
      setMembers(result.members);
      setScope(allTime ? "all" : semesterId);
      setSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load cohorts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function start() {
      const client = createClient();
      const { data, error: semesterError } = await client
        .from("semesters")
        .select("id")
        .eq("is_active", true)
        .maybeSingle();
      if (semesterError || !data) {
        setError("No active cohort is configured.");
        setLoading(false);
        return;
      }
      await load(data.id);
    }
    void start();
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter((member) => {
      const matchesSearch = !query || `${member.name} ${member.email} ${member.semesterName}`.toLowerCase().includes(query);
      const matchesRole = role === "all" || member.role === role;
      const isActive = member.status === "active";
      const matchesActivity = activity === "all" || (activity === "active" ? isActive : !isActive);
      return matchesSearch && matchesRole && matchesActivity;
    });
  }, [activity, members, role, search]);

  async function changeScope(next: string) {
    if (next === "all") {
      if (!window.confirm("Load every cohort? The all-time view can take longer and bulk changes are disabled.")) return;
      if (cohorts.current) await load(cohorts.current.id, true);
      return;
    }
    await load(next);
  }

  async function setLifecycle(next: "active" | "inactive") {
    if (scope === "all" || selected.length === 0) return;
    setWorking(true);
    setError(null);
    try {
      const result = await jsonRequest<{ updated: number }>("/api/admin/lifecycle/memberships/activity", {
        method: "PATCH",
        body: JSON.stringify({ semesterId: scope, membershipIds: selected, activity: next }),
      });
      setNotice(`${result.updated} membership${result.updated === 1 ? "" : "s"} set ${next}.`);
      await load(scope);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update memberships.");
    } finally {
      setWorking(false);
    }
  }

  async function importIntoCurrent() {
    if (!cohorts.current || scope === "all" || scope === cohorts.current.id) return;
    setWorking(true);
    setError(null);
    try {
      const result = await jsonRequest<{ imported: number; skipped: number }>("/api/admin/lifecycle/memberships/import", {
        method: "POST",
        body: JSON.stringify({
          sourceSemesterId: scope,
          targetSemesterId: cohorts.current.id,
          membershipIds: selected.length > 0 ? selected : null,
        }),
      });
      setNotice(`${result.imported} imported; ${result.skipped} already present.`);
      setSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to import memberships.");
    } finally {
      setWorking(false);
    }
  }

  const allVisibleSelected = visible.length > 0 && visible.every((member) => selected.includes(member.membershipId));

  return (
    <main className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
        <div><p className="text-xs font-semibold uppercase tracking-widest text-[#75AADB]">Program operations</p><h1 className="text-2xl font-bold text-[#002147]">Cohort memberships</h1><p className="text-sm text-gray-500 mt-1">Filter current, previous, or all-time participation without changing durable profiles.</p></div>
        <label className="text-xs font-semibold text-gray-600">Cohort
          <select className="block mt-1 border border-gray-300 bg-white rounded-lg px-3 py-2 text-sm" value={scope} onChange={(event) => void changeScope(event.target.value)} disabled={loading || working}>
            {cohorts.all.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}{cohort.isActive ? " · Current" : cohorts.previous?.id === cohort.id ? " · Previous" : ""}</option>)}
            {cohorts.all.length > 0 && <option value="all">All time</option>}
          </select>
        </label>
      </div>

      {scope === "all" && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>All-time view:</strong> every manageable cohort is loaded. Choose one cohort before changing membership status or importing.</div>}
      {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3 lg:flex-row lg:items-center">
          <input className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" type="search" placeholder="Search name, email, or cohort" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={role} onChange={(event) => setRole(event.target.value)}><option value="all">All roles</option><option value="startup">Startups</option><option value="mentor">Mentors</option><option value="admin">Admins</option></select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm" value={activity} onChange={(event) => setActivity(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          <span className="text-xs text-gray-400">{visible.length} people</span>
        </div>

        {selected.length > 0 && scope !== "all" && <div className="px-4 py-3 bg-[#002147] text-white flex flex-wrap items-center gap-2"><strong className="text-sm mr-auto">{selected.length} selected</strong><button disabled={working} onClick={() => void setLifecycle("active")} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold">Set active</button><button disabled={working} onClick={() => void setLifecycle("inactive")} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold">Set inactive</button>{cohorts.current && scope !== cohorts.current.id && <button disabled={working} onClick={() => void importIntoCurrent()} className="rounded-lg bg-[#75AADB] px-3 py-1.5 text-xs font-semibold text-[#002147]">Import selected into {cohorts.current.name}</button>}<button onClick={() => setSelected([])} className="px-2 py-1.5 text-xs">Clear</button></div>}
        {scope !== "all" && cohorts.current && scope !== cohorts.current.id && selected.length === 0 && <div className="px-4 py-3 border-b border-gray-100 text-sm flex items-center justify-between gap-3"><span>Bring this entire prior cohort into {cohorts.current.name} as invited memberships.</span><button disabled={working} onClick={() => void importIntoCurrent()} className="rounded-lg bg-[#002147] text-white px-3 py-2 text-xs font-semibold">Import entire cohort</button></div>}

        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="p-3"><input aria-label="Select all filtered people" type="checkbox" checked={allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? visible.map((member) => member.membershipId) : [])} disabled={scope === "all"} /></th><th className="p-3">Person</th><th className="p-3">Role</th><th className="p-3">Cohort</th><th className="p-3">Status</th></tr></thead><tbody className="divide-y divide-gray-100">{visible.map((member) => <tr key={member.membershipId}><td className="p-3"><input aria-label={`Select ${member.name}`} type="checkbox" checked={selected.includes(member.membershipId)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, member.membershipId])] : current.filter((id) => id !== member.membershipId))} disabled={scope === "all"} /></td><td className="p-3"><strong className="block text-[#002147]">{member.name}</strong><span className="text-xs text-gray-400">{member.email}</span></td><td className="p-3 capitalize">{member.role}</td><td className="p-3"><span className="rounded-full bg-[#75AADB]/20 px-2 py-1 text-xs font-semibold text-[#002147]">{member.semesterName}</span></td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${member.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{member.status === "active" ? "Active" : "Inactive"} <span className="font-normal">· {member.status}</span></span></td></tr>)}</tbody></table></div>
        {!loading && visible.length === 0 && <div className="p-10 text-center text-sm text-gray-400">No memberships match these filters.</div>}
        {loading && <div className="p-10 text-center text-sm text-gray-400">Loading cohort memberships…</div>}
      </section>
    </main>
  );
}
