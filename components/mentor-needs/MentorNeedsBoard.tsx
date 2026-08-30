"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { MentorNeedsBoardRow } from "@/src/mentor-needs/domain";
import { createClient } from "@/utils/supabase/client";

type Cohort = { id: string; name: string; isActive: boolean };

export default function MentorNeedsBoard() {
  const [rows, setRows] = useState<MentorNeedsBoardRow[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [semesterId, setSemesterId] = useState("");
  const [scope, setScope] = useState<"semester" | "all">("semester");
  const [view, setView] = useState<"table" | "bars">("table");
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "gap" | "tracking">("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const visible = useMemo(() => rows.filter((row) => (filter === "all" || row.status === filter) && row.category.toLowerCase().includes(search.toLowerCase())), [filter, rows, search]);
  const stats = useMemo(() => ({ requests: rows.reduce((sum, row) => sum + row.requestCount, 0), mentors: new Set(rows.flatMap((row) => row.mentors.map((mentor) => mentor.id))).size, outreach: new Set(rows.flatMap((row) => row.outreach.map((contact) => contact.id))).size, gaps: rows.filter((row) => row.status === "gap").length }), [rows]);

  useEffect(() => {
    let active = true;
    async function load() {
      const client = createClient();
      const { data } = await client.auth.getSession();
      if (!data.session?.access_token) throw new Error("Your session has expired.");
      let selected = semesterId;
      if (!selected) {
        const semesters = await client.from("semesters").select("id").eq("is_active", true).maybeSingle();
        selected = semesters.data?.id ?? "";
      }
      if (!selected) throw new Error("No active semester is configured.");
      const response = await fetch(`/api/admin/mentor-needs?semesterId=${encodeURIComponent(selected)}&scope=${scope}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const payload = await response.json() as { rows?: MentorNeedsBoardRow[]; cohorts?: Cohort[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load mentor needs.");
      if (!active) return;
      setRows(payload.rows ?? []); setCohorts(payload.cohorts ?? []); setSemesterId(selected); setError(null);
    }
    load().catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load mentor needs."); });
    return () => { active = false; };
  }, [scope, semesterId]);

  const detail = (row: MentorNeedsBoardRow) => <div className="grid gap-5 bg-gray-50 p-4 md:grid-cols-3"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Startup requests</h3>{row.startups.map((startup) => <div key={startup.id} className="mt-2 text-sm"><strong className="text-[#002147]">{startup.name}</strong><span className="ml-2 text-xs text-gray-400">{startup.isPrimary ? "Primary" : "Secondary"}</span>{startup.context && <p className="mt-1 text-xs text-gray-600">{startup.context}</p>}</div>)}</div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active mentors</h3>{row.mentors.length ? row.mentors.map((mentor) => <p key={mentor.id} className="mt-2 text-sm text-[#002147]">{mentor.name}</p>) : <p className="mt-2 text-sm text-red-600">None tagged</p>}</div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active Outreach</h3>{row.outreach.length ? row.outreach.map((contact) => <p key={contact.id} className="mt-2 text-sm text-[#002147]">{contact.name} <span className="text-xs text-gray-400">· {contact.stage}</span></p>) : <p className="mt-2 text-sm text-gray-500">No manually tagged contacts</p>}</div></div>;

  return <div className="mx-auto max-w-6xl space-y-6"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0066a1]">Recruiting signal</p><h1 className="mt-1 text-2xl font-semibold text-[#002147]">Mentor Needs</h1><p className="mt-1 text-sm text-gray-500">Compare startup demand with active mentor capacity and manually tagged Outreach contacts.</p></div><div className="flex gap-2"><select aria-label="Cohort" value={semesterId} onChange={(event) => { setScope("semester"); setSemesterId(event.target.value); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">{cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.name}{cohort.isActive ? " (active)" : ""}</option>)}</select><button type="button" aria-pressed={scope === "all"} onClick={() => { if (scope === "all" || window.confirm("All-time demand is for trend review, not current recruiting decisions. Continue?")) setScope(scope === "all" ? "semester" : "all"); }} className={`rounded-lg border px-3 py-2 text-sm ${scope === "all" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-300 bg-white text-gray-600"}`}>All time</button></div></header>
    {scope === "all" && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><strong>All-time comparison.</strong> Use a cohort view for active recruiting decisions.</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[[stats.requests, "active startup requests"], [stats.mentors, "active mentors"], [stats.outreach, "active Outreach contacts"], [stats.gaps, "priority gaps"]].map(([value, label]) => <article key={label} className="rounded-xl border border-gray-100 bg-white p-4"><strong className="block text-2xl text-[#002147]">{value}</strong><span className="text-xs text-gray-500">{label}</span></article>)}</div>
    <section className="overflow-hidden rounded-xl border border-gray-100 bg-white"><button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between p-5 text-left"><span><strong className="block text-[#002147]">Individual mentor needs</strong><small className="text-gray-500">Filter categories and open a row for startup, mentor, and Outreach details.</small></span>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>{open && <div className="border-t border-gray-100 p-4"><div className="mb-4 flex flex-wrap gap-2"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter need types…" className="min-w-48 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" /><select aria-label="Gap status" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="all">All statuses</option><option value="gap">Gaps</option><option value="tracking">Tracking</option></select><div role="group" aria-label="Needs display" className="flex rounded-lg border border-gray-300 p-1"><button type="button" aria-pressed={view === "table"} onClick={() => setView("table")} className={`rounded-md px-3 py-1 text-xs ${view === "table" ? "bg-[#002147] text-white" : "text-gray-600"}`}>Table</button><button type="button" aria-pressed={view === "bars"} onClick={() => setView("bars")} className={`rounded-md px-3 py-1 text-xs ${view === "bars" ? "bg-[#002147] text-white" : "text-gray-600"}`}>Signal bars</button></div></div>
      {view === "table" ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead><tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500"><th className="p-3">Need type</th><th className="p-3">Requests</th><th className="p-3">Mentors</th><th className="p-3">Outreach</th><th className="p-3">Status</th></tr></thead><tbody>{visible.map((row) => <Fragment key={row.category}><tr className="border-b border-gray-100"><th className="p-3 text-left"><button type="button" aria-expanded={expanded === row.category} onClick={() => setExpanded(expanded === row.category ? null : row.category)} className="font-semibold text-[#002147] hover:underline">{row.category}</button></th><td className="p-3">{row.requestCount}</td><td className="p-3">{row.mentorCount}</td><td className="p-3">{row.outreachCount}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.status === "gap" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{row.status === "gap" ? "Gap" : "Tracking"}</span></td></tr>{expanded === row.category && <tr><td colSpan={5}>{detail(row)}</td></tr>}</Fragment>)}</tbody></table></div> : <div className="space-y-3">{visible.map((row) => { const max = Math.max(row.requestCount, 1); return <article key={row.category} className="rounded-lg border border-gray-100 p-4"><button type="button" onClick={() => setExpanded(expanded === row.category ? null : row.category)} className="flex w-full justify-between text-left"><strong className="text-[#002147]">{row.category}</strong><span className={row.status === "gap" ? "text-sm font-semibold text-red-600" : "text-sm text-blue-700"}>{row.status === "gap" ? "Gap" : "Tracking"}</span></button>{[["Requests", row.requestCount, "bg-[#002147]"], ["Mentors", row.mentorCount, "bg-[#75AADB]"], ["Outreach", row.outreachCount, "bg-amber-400"]] .map(([label, value, color]) => <div key={String(label)} className="mt-2 grid grid-cols-[5rem_2rem_1fr] items-center gap-2 text-xs"><span>{label}</span><strong>{value}</strong><span className="h-2 rounded-full bg-gray-100"><span className={`block h-2 rounded-full ${color}`} style={{ width: `${Math.min((Number(value) / max) * 100, 100)}%` }} /></span></div>)}{expanded === row.category && <div className="mt-4 -mx-4 -mb-4">{detail(row)}</div>}</article>; })}</div>}
      {visible.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No mentor needs match these filters.</p>}</div>}</section></div>;
}
