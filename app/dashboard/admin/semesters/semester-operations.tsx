"use client";

import { ArrowLeft, ArrowRight, CalendarDays, Check, CircleAlert, Copy, LoaderCircle, Plus, Sparkles, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CohortMember } from "@/src/lifecycle/cohort-management";
import { buildWeeklyMeetingDates, type ReviewableMeetingDate } from "@/src/lifecycle/semester-transition";
import { createClient } from "@/utils/supabase/client";
import { DataLoading } from "@/components/DataLoading";
import styles from "./semester-transition.module.css";

type Step = "details" | "dates" | "people" | "review";
interface SemesterRow { id: string; name: string; start_date: string; end_date: string; is_active: boolean; lifecycle_status: "draft" | "active" | "closed" | "archived"; configuration: unknown; }
interface MeetingRow { id: string; semester_id: string; date: string; label: string; }
interface SemesterResponse { semesters: SemesterRow[]; meetings: MeetingRow[]; }
interface CohortResponse { members: CohortMember[]; }

const STEPS: { id: Step; label: string }[] = [
  { id: "details", label: "Details" }, { id: "dates", label: "Meeting weeks" },
  { id: "people", label: "Returning people" }, { id: "review", label: "Review" },
];
const readableDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Sign in again to manage semesters.");
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...init?.headers } });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Semester request failed.");
  return body;
}

export default function SemesterOperations() {
  const [step, setStep] = useState<Step>("details");
  const [source, setSource] = useState<SemesterRow | null>(null);
  const [draft, setDraft] = useState<SemesterRow | null>(null);
  const [dates, setDates] = useState<ReviewableMeetingDate[]>([]);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("Fall 2026");
  const [startDate, setStartDate] = useState("2026-08-24");
  const [endDate, setEndDate] = useState("2026-12-11");
  const [firstMeetingDate, setFirstMeetingDate] = useState("2026-09-03");
  const [location, setLocation] = useState("New York");
  const [format, setFormat] = useState<"online" | "in-person">("online");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closeAcknowledged, setCloseAcknowledged] = useState(false);
  const activeDates = useMemo(() => dates.filter((date) => date.included), [dates]);
  const skippedDates = dates.length - activeDates.length;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: active, error: activeError } = await createClient().from("semesters").select("id,name,start_date,end_date,is_active,lifecycle_status,configuration").eq("is_active", true).maybeSingle();
      if (activeError || !active) throw new Error("No active semester is configured.");
      const result = await requestJson<SemesterResponse>(`/api/admin/lifecycle/semesters?sourceSemesterId=${encodeURIComponent(active.id)}`);
      const activeSemester = result.semesters.find((semester) => semester.id === active.id) ?? active;
      const draftSemester = result.semesters.find((semester) => semester.lifecycle_status === "draft") ?? null;
      setSource(activeSemester); setDraft(draftSemester);
      if (draftSemester) {
        setName(draftSemester.name); setStartDate(draftSemester.start_date); setEndDate(draftSemester.end_date);
        const saved = result.meetings.filter((meeting) => meeting.semester_id === draftSemester.id);
        if (saved.length > 0) { setDates(saved.map((date) => ({ date: date.date, label: date.label, included: true }))); setFirstMeetingDate(saved[0].date); }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load semester setup."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createDraft() {
    if (!source) return; setWorking(true); setError(null);
    try {
      const created = await requestJson<{ id: string; name: string }>("/api/admin/lifecycle/semesters", { method: "POST", body: JSON.stringify({ sourceSemesterId: source.id, name, startDate, endDate, location, sessionCadence: "weekly", defaultFormat: format }) });
      setDraft({ id: created.id, name: created.name, start_date: startDate, end_date: endDate, is_active: false, lifecycle_status: "draft", configuration: { location, sessionCadence: "weekly", defaultFormat: format } });
      setDates(buildWeeklyMeetingDates(firstMeetingDate, endDate)); setStep("dates"); setNotice("Draft created. Now choose the weeks when meetings will happen.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create the draft."); }
    finally { setWorking(false); }
  }
  function generateDates() { try { setDates(buildWeeklyMeetingDates(firstMeetingDate, endDate)); setError(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to generate meeting dates."); } }
  async function saveDates() {
    if (!draft) return; setWorking(true); setError(null);
    try {
      await requestJson("/api/admin/lifecycle/semesters/meetings", { method: "POST", body: JSON.stringify({ semesterId: draft.id, dates }) });
      setNotice(`${activeDates.length} meeting dates saved; ${skippedDates} break ${skippedDates === 1 ? "week" : "weeks"} excluded.`); setStep("people");
      if (source && members.length === 0) {
        const response = await requestJson<CohortResponse>(`/api/admin/lifecycle/cohorts?semesterId=${encodeURIComponent(source.id)}&scope=semester`);
        const eligible = response.members.filter((member) => member.role !== "admin" && member.status !== "suspended");
        setMembers(eligible); setSelected(eligible.filter((member) => member.status === "active").map((member) => member.membershipId));
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save the meeting calendar."); }
    finally { setWorking(false); }
  }
  async function importPeople() {
    if (!source || !draft) return; setWorking(true); setError(null);
    try {
      if (selected.length > 0) await requestJson("/api/admin/lifecycle/memberships/import", { method: "POST", body: JSON.stringify({ sourceSemesterId: source.id, targetSemesterId: draft.id, membershipIds: selected }) });
      setNotice(`${selected.length} returning memberships added to the draft.`); setStep("review");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to carry people forward."); }
    finally { setWorking(false); }
  }
  async function activate() {
    if (!source || !draft) return; setWorking(true); setError(null);
    try {
      await requestJson("/api/admin/lifecycle/semesters/activate", { method: "POST", body: JSON.stringify({ sourceSemesterId: source.id, targetSemesterId: draft.id, closeAcknowledged }) });
      setNotice(`${draft.name} is now active. ${source.name} was closed and its history remains available.`); setCloseAcknowledged(false); await load(); setStep("details");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to activate the semester."); }
    finally { setWorking(false); }
  }

  if (loading) return <main className={styles.loading}><DataLoading label="Loading semester setup" /></main>;
  return <main className={styles.shell}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Program settings</p><h1>Semester transition</h1><p>Prepare the next cohort, choose its exact meeting weeks, and activate it when everything is ready.</p></div><Link className={styles.historyLink} href="/dashboard/admin/semesters?view=cohorts">Cohort history <ArrowRight size={15} /></Link></header>
    {source && <section className={styles.statusStrip}><div><span className={styles.liveDot} /><small>Current semester</small><strong>{source.name}</strong><p>{readableDate(source.start_date)} – {readableDate(source.end_date)}</p></div><ArrowRight size={20} /><div className={draft ? styles.draftReady : styles.emptyDraft}><small>{draft ? "Draft in progress" : "Next semester"}</small><strong>{draft?.name ?? "Not created yet"}</strong><p>{draft ? `${readableDate(draft.start_date)} – ${readableDate(draft.end_date)}` : "Start the guided setup below"}</p></div></section>}
    <nav className={styles.steps} aria-label="Semester setup progress">{STEPS.map((item, index) => { const activeIndex = STEPS.findIndex((candidate) => candidate.id === step); return <button key={item.id} onClick={() => draft && setStep(item.id)} disabled={!draft && item.id !== "details"} className={item.id === step ? styles.stepActive : index < activeIndex ? styles.stepComplete : ""}><span>{index < activeIndex ? <Check size={14} /> : index + 1}</span>{item.label}</button>; })}</nav>
    {error && <div className={styles.error} role="alert"><CircleAlert size={18} />{error}</div>}{notice && <div className={styles.notice} role="status"><Check size={18} />{notice}</div>}
    {step === "details" && <section className={styles.card}><Heading icon={<Sparkles size={20} />} step="Step 1" title={draft ? "Draft details" : "Create the next semester"}>This is private to admins until you activate it.</Heading><div className={styles.formGrid}><label className={styles.full}>Semester name<input value={name} onChange={(event) => setName(event.target.value)} disabled={Boolean(draft)} /></label><label>Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={Boolean(draft)} /></label><label>End date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} disabled={Boolean(draft)} /></label><label>Location<input value={location} onChange={(event) => setLocation(event.target.value)} disabled={Boolean(draft)} /></label><label>Default format<select value={format} onChange={(event) => setFormat(event.target.value as typeof format)} disabled={Boolean(draft)}><option value="online">Online</option><option value="in-person">In person</option></select></label></div><div className={styles.actions}>{draft ? <button className={styles.primary} onClick={() => setStep("dates")}>Continue setup <ArrowRight size={16} /></button> : <button className={styles.primary} onClick={createDraft} disabled={working}>{working ? <LoaderCircle className={styles.spin} size={16} /> : <Plus size={16} />} Create draft</button>}</div></section>}
    {step === "dates" && draft && <section className={styles.card}><Heading icon={<CalendarDays size={20} />} step="Step 2" title="Choose meeting weeks">Generate the weekly rhythm, then turn off Thanksgiving, holidays, or any no-meeting week.</Heading><div className={styles.generator}><label>First mentorship meeting<input type="date" value={firstMeetingDate} min={startDate} max={endDate} onChange={(event) => setFirstMeetingDate(event.target.value)} /></label><button onClick={generateDates}><Copy size={15} /> Generate weekly dates</button></div><div className={styles.calendarSummary}><strong>{activeDates.length} meeting weeks</strong><span>{skippedDates} excluded</span><span>{dates.length} weeks reviewed</span></div><div className={styles.dateList}>{dates.map((item, index) => <div className={`${styles.dateRow} ${item.included ? "" : styles.dateSkipped}`} key={`${item.date}-${index}`}><label className={styles.switch}><input type="checkbox" checked={item.included} onChange={(event) => setDates((current) => current.map((date, row) => row === index ? { ...date, included: event.target.checked } : date))} /><span aria-hidden="true" /></label><input type="date" value={item.date} min={startDate} max={endDate} onChange={(event) => setDates((current) => current.map((date, row) => row === index ? { ...date, date: event.target.value } : date))} aria-label={`Date for week ${index + 1}`} /><input value={item.label} onChange={(event) => setDates((current) => current.map((date, row) => row === index ? { ...date, label: event.target.value } : date))} placeholder={item.included ? "Session label" : "Break reason (for your review)"} aria-label={`Label for week ${index + 1}`} /><strong>{item.included ? "Meeting" : "No meeting"}</strong></div>)}</div><p className={styles.help}>Tip: turn off Thanksgiving week and label it “Thanksgiving break.” Excluded weeks are not written to the mentorship calendar.</p><Actions back={() => setStep("details")} next={saveDates} disabled={working || activeDates.length === 0} label="Save meeting calendar" /></section>}
    {step === "people" && draft && <section className={styles.card}><Heading icon={<UsersRound size={20} />} step="Step 3" title="Choose returning people">Selected mentors and startups receive membership in {draft.name}. Their profiles and history stay intact.</Heading><div className={styles.selectBar}><strong>{selected.length} selected</strong><button onClick={() => setSelected(selected.length === members.length ? [] : members.map((member) => member.membershipId))}>{selected.length === members.length ? "Clear all" : "Select all"}</button></div><div className={styles.peopleList}>{members.map((member) => <label key={member.membershipId}><input type="checkbox" checked={selected.includes(member.membershipId)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, member.membershipId] : current.filter((id) => id !== member.membershipId))} /><span>{member.name.slice(0, 1)}</span><div><strong>{member.name}</strong><small>{member.email}</small></div><em>{member.role}</em></label>)}{members.length === 0 && <p className={styles.empty}>No eligible returning people were found. You can continue and invite people later.</p>}</div><Actions back={() => setStep("dates")} next={importPeople} disabled={working} label="Continue to review" /></section>}
    {step === "review" && source && draft && <section className={styles.card}><Heading icon={<Check size={20} />} step="Step 4" title="Review and activate">Activation makes {draft.name} the current semester. It does not send invitations automatically.</Heading><div className={styles.reviewGrid}><article><small>Semester</small><strong>{draft.name}</strong><p>{readableDate(draft.start_date)} – {readableDate(draft.end_date)}</p></article><article><small>Meeting calendar</small><strong>{activeDates.length} sessions</strong><p>{skippedDates} excluded break {skippedDates === 1 ? "week" : "weeks"}</p></article><article><small>Returning cohort</small><strong>{selected.length} people</strong><p>Additional invitations can be sent later</p></article></div><label className={styles.acknowledge}><input type="checkbox" checked={closeAcknowledged} onChange={(event) => setCloseAcknowledged(event.target.checked)} /><span><strong>Close {source.name} and activate {draft.name}</strong><small>Existing semester records remain available as history.</small></span></label><Actions back={() => setStep("people")} next={activate} disabled={working || !closeAcknowledged} label="Activate semester" /></section>}
  </main>;
}

function Heading({ icon, step, title, children }: { icon: ReactNode; step: string; title: string; children: ReactNode }) { return <div className={styles.cardHeading}><span className={styles.icon}>{icon}</span><div><p className={styles.eyebrow}>{step}</p><h2>{title}</h2><p>{children}</p></div></div>; }
function Actions({ back, next, disabled, label }: { back: () => void; next: () => void; disabled: boolean; label: string }) { return <div className={styles.actions}><button className={styles.secondary} onClick={back}><ArrowLeft size={16} /> Back</button><button className={styles.primary} onClick={next} disabled={disabled}>{label} <ArrowRight size={16} /></button></div>; }
