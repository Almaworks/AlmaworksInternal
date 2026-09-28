"use client";

import { CircleAlert, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { DataLoading } from "@/components/DataLoading";
import { classifyFollowUp, type FollowUpBucket } from "@/src/outreach/cadence";
import { buildOutreachWorkspaceQuery, filterOutreachWorkspaceForView, getOutreachScreenState, resolveOutreachSemesterId } from "@/src/outreach/workspace";
import type { OutreachStage } from "@/src/outreach/types";
import { CompaniesView } from "./components/companies-view";
import { ContactDrawer } from "./components/contact-drawer";
import { ImportReview } from "./components/import-review";
import { PeopleView } from "./components/people-view";
import { QueueView } from "./components/queue-view";
import { TeamView } from "./components/team-view";
import type { OutreachView, WorkspaceData, WorkspaceRow, WorkspaceSemester } from "./components/types";
import { WorkspaceHeader } from "./components/workspace-header";
import styles from "./outreach-workspace.module.css";

const views: { id: OutreachView; label: string }[] = [{ id: "mine", label: "My queue" }, { id: "team", label: "Team queue" }, { id: "people", label: "People" }, { id: "companies", label: "Companies" }, { id: "imports", label: "Imports" }];
const viewSet = new Set<OutreachView>(views.map((view) => view.id));
const stages = new Set<OutreachStage>(["not_contacted", "researching", "contacted", "replied", "conversation_scheduled", "ready", "declined", "closed"]);
const MAX_DEEP_LINK_PAGES = 20;
function object(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function validRow(value: unknown): value is WorkspaceRow { const row = object(value); return row !== null && typeof row.id === "string" && typeof row.semesterId === "string" && typeof row.semesterName === "string" && typeof row.contactId === "string" && typeof row.contactName === "string" && typeof row.stage === "string" && (typeof row.ownerProfileId === "string" || row.ownerProfileId === null) && (typeof row.ownerName === "string" || row.ownerName === null) && typeof row.ownerIsActive === "boolean" && (typeof row.nextFollowUpAt === "string" || row.nextFollowUpAt === null) && (typeof row.snoozedUntil === "string" || row.snoozedUntil === null) && typeof row.isSilenced === "boolean"; }
function asWorkspaceData(value: unknown): WorkspaceData | null { const root = object(value); const data = root ? object(root.data) : null; if (!data || !Array.isArray(data.rows) || !data.rows.every(validRow) || !Array.isArray(data.owners) || !object(data.health) || !object(data.semester) || (typeof data.nextCursor !== "string" && data.nextCursor !== null)) return null; const health = data.health as Record<string, unknown>; const semester = data.semester as Record<string, unknown>; if (!["overdue", "dueToday", "unassigned", "awaitingResponse"].every((key) => typeof health[key] === "number") || typeof semester.id !== "string" || typeof semester.name !== "string") return null; return data as unknown as WorkspaceData; }
function bucket(row: WorkspaceRow): FollowUpBucket { return stages.has(row.stage as OutreachStage) ? classifyFollowUp({ stage: row.stage as OutreachStage, ownerProfileId: row.ownerProfileId, ownerIsActive: row.ownerIsActive, nextFollowUpAt: row.nextFollowUpAt, snoozedUntil: row.snoozedUntil, isSilenced: row.isSilenced }, new Date().toISOString()) : "waiting"; }

export function OutreachWorkspace({ fixture, preview = false, previewState }: { fixture?: WorkspaceData; preview?: boolean; previewState?: "loading" | "error" } = {}) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams(); const client = useMemo(() => createClient(), []);
  const requestedView = params.get("view"); const view: OutreachView = requestedView !== null && viewSet.has(requestedView as OutreachView) ? requestedView as OutreachView : "mine"; const opportunityId = params.get("opportunityId");
  const [semesters, setSemesters] = useState<WorkspaceSemester[]>(fixture ? [{ id: fixture.semester.id, name: fixture.semester.name, isActive: true }] : []); const [currentProfileId, setCurrentProfileId] = useState<string | null>(null); const [data, setData] = useState<WorkspaceData | null>(fixture ?? null); const [semestersLoading, setSemestersLoading] = useState(!fixture); const [workspaceLoading, setWorkspaceLoading] = useState(false); const [bootstrapError, setBootstrapError] = useState<string | null>(null); const [workspaceError, setWorkspaceError] = useState<string | null>(null); const [search, setSearch] = useState(params.get("q") ?? ""); const [selected, setSelected] = useState<WorkspaceRow | null>(null); const [deepLinkUnavailable, setDeepLinkUnavailable] = useState(false); const [deepLinkLoading, setDeepLinkLoading] = useState(false); const [deepLinkError, setDeepLinkError] = useState<string | null>(null); const [loadingMore, setLoadingMore] = useState(false); const invokingElement = useRef<HTMLElement | null>(null); const loadGeneration = useRef(0);
  const activeSemesterId = semesters.find((semester) => semester.isActive)?.id ?? (fixture?.semester.isActive ? fixture.semester.id : "");
  const semesterId = resolveOutreachSemesterId(view, params.get("semesterId"), semesters.length ? semesters : fixture ? [{ id: fixture.semester.id, isActive: fixture.semester.isActive ?? true }] : []);
  const setUrl = useCallback((changes: Record<string, string | null>) => { const next = new URLSearchParams(params.toString()); for (const [key, value] of Object.entries(changes)) { if (value === null || value === "") next.delete(key); else next.set(key, value); } router.replace(`${pathname}?${next.toString()}`, { scroll: false }); }, [params, pathname, router]);
  const loadSemesters = useCallback(async () => { if (fixture) return; setSemestersLoading(true); setBootstrapError(null); try { const { data: { session }, error: sessionError } = await client.auth.getSession(); if (sessionError || !session?.access_token) throw new Error("Your session has expired. Sign out and sign in again."); const response = await fetch("/api/admin/outreach/semesters", { headers: { Authorization: `Bearer ${session.access_token}` } }); const payload = await response.json() as { semesters?: { id: string; name: string; is_active: boolean }[]; error?: string }; if (!response.ok) throw new Error(payload.error ?? "Semesters could not be loaded."); const next = (payload.semesters ?? []).map((semester) => ({ id: semester.id, name: semester.name, isActive: semester.is_active })); setSemesters(next); const { data: user } = await client.auth.getUser(); setCurrentProfileId(user.user?.id ?? null); if (!next.some((semester) => semester.isActive)) setBootstrapError("No active semester is configured. Create or activate a semester in Semester Settings."); } catch (cause) { setBootstrapError(cause instanceof Error ? cause.message : "Semesters could not be loaded. Try again."); } finally { setSemestersLoading(false); } }, [client, fixture]);
  useEffect(() => { void loadSemesters(); }, [loadSemesters]);
  const requestPage = useCallback(async (cursor?: string) => { if (fixture || !semesterId) throw new Error("Choose a semester to load outreach work."); const query = buildOutreachWorkspaceQuery({ semesterId, view, cursor }); const { data: { session }, error: sessionError } = await client.auth.getSession(); if (sessionError || !session?.access_token) throw new Error("Your session has expired. Sign out and sign in again."); const response = await fetch(`/api/admin/outreach/workspace?${query}`, { headers: { Authorization: `Bearer ${session.access_token}` } }); const parsed = asWorkspaceData(await response.json()); if (!response.ok || !parsed) throw new Error("We could not load outreach. Check your access and try again."); return parsed; }, [client, fixture, semesterId, view]);
  const load = useCallback(async () => { if (fixture) return; const generation = ++loadGeneration.current; setWorkspaceLoading(true); setWorkspaceError(null); try { const nextData = await requestPage(); if (generation === loadGeneration.current) setData(nextData); } catch (cause) { if (generation === loadGeneration.current) setWorkspaceError(cause instanceof Error ? cause.message : "We could not load outreach."); } finally { if (generation === loadGeneration.current) setWorkspaceLoading(false); } }, [fixture, requestPage]);
  useEffect(() => { if (!semesterId && !fixture) return; void load(); return () => { loadGeneration.current += 1; }; }, [fixture, load, semesterId]);
  useEffect(() => { const timer = window.setTimeout(() => { if (search !== (params.get("q") ?? "")) setUrl({ q: search }); }, 250); return () => window.clearTimeout(timer); }, [params, search, setUrl]);
  useEffect(() => { if (selected !== null && data !== null) setSelected(data.rows.find((row) => row.id === selected.id) ?? null); }, [data, selected]);
  useEffect(() => {
    let cancelled = false;
    if (opportunityId === null) { setDeepLinkUnavailable(false); setDeepLinkError(null); setDeepLinkLoading(false); return () => { cancelled = true; }; }
    if (data === null || data.semester.id !== semesterId) return () => { cancelled = true; };
    const deepLinkedRow = data.rows.find((row) => row.id === opportunityId);
    if (deepLinkedRow !== undefined) { setDeepLinkUnavailable(false); setDeepLinkError(null); setDeepLinkLoading(false); setSelected(deepLinkedRow); return () => { cancelled = true; }; }
    if (data.nextCursor === null || fixture) { setSelected(null); setDeepLinkUnavailable(true); setDeepLinkError(null); setDeepLinkLoading(false); return () => { cancelled = true; }; }
    const generation = loadGeneration.current;
    setDeepLinkUnavailable(false); setDeepLinkError(null); setDeepLinkLoading(true);
    void (async () => {
      let cursor: string | null = data.nextCursor;
      let pagesLoaded = 0;
      const loadedRows: WorkspaceRow[] = [];
      const loadedHealth = { overdue: 0, dueToday: 0, unassigned: 0, awaitingResponse: 0 };
      const seenCursors = new Set<string>();
      let match: WorkspaceRow | undefined;
      try {
        while (cursor !== null && pagesLoaded < MAX_DEEP_LINK_PAGES) {
          if (seenCursors.has(cursor)) throw new Error("Outreach pagination repeated a cursor.");
          seenCursors.add(cursor);
          const page = await requestPage(cursor);
          if (cancelled || generation !== loadGeneration.current) return;
          loadedRows.push(...page.rows);
          loadedHealth.overdue += page.health.overdue; loadedHealth.dueToday += page.health.dueToday; loadedHealth.unassigned += page.health.unassigned; loadedHealth.awaitingResponse += page.health.awaitingResponse;
          match = page.rows.find((row) => row.id === opportunityId);
          cursor = page.nextCursor;
          pagesLoaded += 1;
          if (match !== undefined) break;
        }
        if (cancelled || generation !== loadGeneration.current) return;
        setData((current) => current === null || current.semester.id !== semesterId ? current : { ...current, rows: [...current.rows, ...loadedRows], nextCursor: cursor, health: { overdue: current.health.overdue + loadedHealth.overdue, dueToday: current.health.dueToday + loadedHealth.dueToday, unassigned: current.health.unassigned + loadedHealth.unassigned, awaitingResponse: current.health.awaitingResponse + loadedHealth.awaitingResponse } });
        if (match !== undefined) { setSelected(match); return; }
        if (cursor === null) { setSelected(null); setDeepLinkUnavailable(true); return; }
        setDeepLinkError("The linked outreach opportunity could not be loaded safely. Open the outreach queue and try again.");
      } catch {
        if (!cancelled && generation === loadGeneration.current) setDeepLinkError("The linked outreach opportunity could not be loaded. Try again from the outreach queue.");
      } finally {
        if (!cancelled && generation === loadGeneration.current) setDeepLinkLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [data, fixture, opportunityId, requestPage, semesterId]);
  const rows = useMemo(() => (data?.rows ?? []).filter((row) => { const needle = search.trim().toLocaleLowerCase(); return !needle || [row.contactName, row.contactEmail, row.companyName, row.ownerName, row.biography, ...(row.labels ?? [])].filter((item): item is string => typeof item === "string").join(" ").toLocaleLowerCase().includes(needle); }), [data?.rows, search]);
  const mine = currentProfileId === null && !fixture ? null : filterOutreachWorkspaceForView(rows, "mine", fixture ? fixture.owners[0]?.profileId ?? null : currentProfileId, new Date().toISOString()); const queueGroups = useMemo(() => mine === null ? [] : (["overdue", "due_today", "upcoming", "waiting"] as FollowUpBucket[]).map((kind) => [kind, mine.filter((row) => bucket(row) === kind)] as const).filter(([, items]) => items.length > 0), [mine]);
  async function loadMore() { if (!data?.nextCursor || loadingMore) return; const generation = loadGeneration.current; setLoadingMore(true); try { const page = await requestPage(data.nextCursor); if (generation !== loadGeneration.current) return; setData((previous) => previous ? { ...previous, rows: [...previous.rows, ...page.rows], nextCursor: page.nextCursor, health: { overdue: previous.health.overdue + page.health.overdue, dueToday: previous.health.dueToday + page.health.dueToday, unassigned: previous.health.unassigned + page.health.unassigned, awaitingResponse: previous.health.awaitingResponse + page.health.awaitingResponse } } : page); } catch (cause) { if (generation === loadGeneration.current) setWorkspaceError(cause instanceof Error ? cause.message : "Could not load more outreach."); } finally { if (generation === loadGeneration.current) setLoadingMore(false); } }
  function open(row: WorkspaceRow, event?: React.SyntheticEvent) { invokingElement.current = event?.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement instanceof HTMLElement ? document.activeElement : null; setSelected(row); }
  const error = bootstrapError ?? workspaceError; const scopeMismatch = !fixture && semesterId !== "" && data?.semester.id !== semesterId; const screenState = getOutreachScreenState({ semestersLoading, workspaceLoading: workspaceLoading || scopeMismatch, hasData: data !== null, hasError: previewState === "error" || error !== null });
  if (previewState === "loading" || screenState === "loading") return <WorkspaceSkeleton />; if (screenState === "error" || data === null) return <section className={styles.error}><CircleAlert size={24} /><h1>Outreach could not load</h1><p>{error ?? "No outreach data was returned."}</p><button className={styles.primaryButton} onClick={() => { if (bootstrapError !== null || !semesterId) void loadSemesters(); else void load(); }}><RefreshCw size={16} /> Retry</button></section>;
  return <><div className={styles.shell} aria-hidden={selected ? "true" : undefined}><WorkspaceHeader health={data.health} semesters={semesters.length ? semesters : [{ id: data.semester.id, name: data.semester.name, isActive: true }]} semesterId={semesterId} activeSemesterId={activeSemesterId} onSemesterChange={(id) => setUrl({ semesterId: id })} search={search} onSearchChange={setSearch} onImport={() => setUrl({ view: "imports", semesterId: activeSemesterId || null })} /><a className={styles.secondaryButton} href={`/dashboard/admin/outreach/email?semesterId=${encodeURIComponent(semesterId)}`}>Gmail &amp; templates</a><nav className={styles.tabs} aria-label="Outreach views">{views.map((item) => <button key={item.id} className={view === item.id ? styles.activeTab : ""} onClick={() => setUrl({ view: item.id, semesterId })}>{item.label}</button>)}</nav><main className={styles.content}>{deepLinkLoading && <DataLoading label="Loading linked outreach opportunity" compact />}{deepLinkError && <p className={styles.formError} role="alert">{deepLinkError}</p>}{deepLinkUnavailable && <p className={styles.unavailable} role="alert">That outreach opportunity is unavailable or you no longer have access to it.</p>}{view === "mine" && (mine === null ? <div className={styles.empty}><h2>My queue needs your profile identity</h2><p>The workspace API does not identify the current profile yet, so this view will not guess ownership.</p></div> : queueGroups.length ? <div className={styles.groups}>{queueGroups.map(([kind, items]) => <section className={styles.queueGroup} key={kind}><div className={styles.groupHeading}><h2>{kind.replace(/_/gu, " ")}</h2><span>{items.length} opportunities</span></div><QueueView rows={items} onOpen={open} /></section>)}</div> : data.nextCursor ? <div className={styles.empty}><h2>Your complete queue is still loading</h2><p>More pages are available. Load them before treating this queue as clear.</p></div> : <QueueView rows={[]} onOpen={open} emptyTitle="Your queue is clear" emptyCopy="Nothing is due for you right now. Review the team queue for shared work." />)}{view === "team" && <TeamView rows={rows} onOpen={open} />}{view === "people" && <PeopleView key={`${semesterId}:${activeSemesterId}:${search}`} rows={rows} onOpen={open} sourceSemesterId={semesterId} activeSemester={semesters.find((semester) => semester.isActive)} onViewActive={() => { setSearch(""); setUrl({ view: "people", semesterId: activeSemesterId, q: null }); }} preview={preview} />}{view === "companies" && <CompaniesView rows={rows} onOpen={open} />}{view === "imports" && <ImportReview preview={preview} semesterId={semesterId} />}{data.nextCursor && <><p className={styles.unavailable}>Showing loaded pages only; load more before treating search or queues as complete.</p><button className={styles.secondaryButton} onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more outreach"}</button></>}</main></div>{selected && <ContactDrawer row={selected} data={data} returnFocus={invokingElement} onClose={() => setSelected(null)} onRefresh={load} />}</>;
}
export function WorkspaceSkeleton() { return <div className={styles.shell}><DataLoading label="Loading outreach" /></div>; }
