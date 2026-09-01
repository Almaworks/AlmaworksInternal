"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, Check, ChevronRight, CircleUserRound, Clock3, ExternalLink, LockKeyhole, Mail, RefreshCw, Search, ShieldCheck, Sparkles, UserRoundPen, UsersRound } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import type { ParticipantDashboardResponse, ParticipantProfileForm } from "@/src/dashboard/participant-dashboard-server";
import type { ParticipantDashboardView, ParticipantDirectoryEntry, ParticipantRole } from "@/src/dashboard/participant-dashboard";
import styles from "@/app/design-preview/participant-dashboard/participant-dashboard.module.css";

type TabId = "home" | "network" | "sessions" | "notifications" | "profile";
const tabs = [
  { id: "home" as const, label: "Home", icon: Sparkles },
  { id: "network" as const, label: "Network", icon: UsersRound },
  { id: "sessions" as const, label: "Sessions", icon: CalendarDays },
  { id: "notifications" as const, label: "Notifications", icon: Bell },
  { id: "profile" as const, label: "Profile", icon: CircleUserRound },
];
const stepCopy: Record<string, { label: string; detail: string; action: string }> = {
  email: { label: "Verify your sign-in email", detail: "Secure your account and receive program updates.", action: "Check email" },
  profile: { label: "Complete your public profile", detail: "Add the details active participants can see.", action: "Edit profile" },
  semester: { label: "Almaworks activation", detail: "An administrator activates your membership after setup.", action: "Pending review" },
  availability: { label: "Share your availability", detail: "Choose the meeting slots that work for you.", action: "Continue setup" },
  "mentor-needs": { label: "Set your mentor needs", detail: "Choose priorities that guide mentor matching.", action: "Continue setup" },
};

function initials(name: string) { return name.split(/\s+/u).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AW"; }
function dateParts(value: string) { const date = new Date(`${value}T12:00:00`); return { month: date.toLocaleDateString(undefined, { month: "short" }), day: date.toLocaleDateString(undefined, { day: "numeric" }) }; }
function externalUrl(value: string) { return value.startsWith("http") ? value : `https://${value}`; }

function NetworkCard({ entry }: { entry: ParticipantDirectoryEntry }) {
  return <article className={styles.networkCard}><div className={styles.networkTop}><div className={styles.avatar}>{initials(entry.name)}</div>{entry.websiteUrl && <a className={styles.iconButton} href={externalUrl(entry.websiteUrl)} target="_blank" rel="noreferrer" aria-label={`Open ${entry.name}`}><ExternalLink size={16} /></a>}</div><h3>{entry.name}</h3><p className={styles.headline}>{entry.headline || "Active participant"}</p><p className={styles.summary}>{entry.summary || "This participant is completing their profile."}</p><div className={styles.tags}>{entry.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div></article>;
}

function Gate({ kind, retry }: { kind: "loading" | "pending" | "unavailable" | "error"; retry: () => void }) {
  const copy = kind === "loading" ? ["Loading your workspace", "We’re checking your active-semester membership and role."] : kind === "pending" ? ["Your account is waiting for activation", "Your sign-in works. An Almaworks administrator still needs to connect this account to the active semester."] : kind === "unavailable" ? ["No active semester is available", "Program scheduling will appear here after Almaworks activates a semester."] : ["We couldn’t load your workspace", "Your session may have expired, or dashboard data is temporarily unavailable."];
  return <main className={styles.page}><section className={styles.appShell}><div className={styles.workspace}><div className={styles.content}><div className={styles.emptyState}>{kind === "loading" ? <RefreshCw className="animate-spin" size={26} /> : <ShieldCheck size={28} />}<h2>{copy[0]}</h2><p>{copy[1]}</p>{kind !== "loading" && <button onClick={retry}><RefreshCw size={15} />Try again</button>}</div></div></div></section></main>;
}

export default function ParticipantDashboard({ expectedRole }: { expectedRole: ParticipantRole }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("home");
  const [result, setResult] = useState<ParticipantDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [form, setForm] = useState<ParticipantProfileForm>({ fullName: "", headline: "", summary: "", tags: "", websiteUrl: "", linkedinUrl: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await authenticatedFetch("/api/participant-dashboard");
      const payload = await response.json() as { data?: ParticipantDashboardResponse; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Dashboard could not be loaded.");
      setResult(payload.data);
      if (payload.data.state === "participant") {
        if (payload.data.role !== expectedRole) { router.replace(`/dashboard/${payload.data.role}`); return; }
        setEmail(payload.data.identity.email);
        setForm({ fullName: payload.data.identity.fullName, headline: payload.data.profile.headline, summary: payload.data.profile.summary, tags: payload.data.profile.tags.join(", "), websiteUrl: payload.data.profile.websiteUrl, linkedinUrl: payload.data.profile.linkedinUrl });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Dashboard could not be loaded."); }
  }, [expectedRole, router]);
  useEffect(() => { void load(); }, [load]);

  const view = result?.state === "participant" ? result : null;
  const directory = useMemo(() => { if (!view) return []; const needle = query.trim().toLowerCase(); return needle ? view.network.filter((entry) => `${entry.name} ${entry.headline} ${entry.summary} ${entry.tags.join(" ")}`.toLowerCase().includes(needle)) : view.network; }, [query, view]);
  if (!result && !error) return <Gate kind="loading" retry={() => void load()} />;
  if (error) return <Gate kind="error" retry={() => void load()} />;
  if (result?.state === "pending") return <Gate kind="pending" retry={() => void load()} />;
  if (result?.state === "unavailable" || !view) return <Gate kind="unavailable" retry={() => void load()} />;

  const isMentor = view.role === "mentor";
  const upcoming = view.sessions.filter((session) => session.timing === "upcoming" && session.status !== "cancelled");
  const past = view.sessions.filter((session) => session.timing === "past");
  const complete = view.activation.filter((step) => step.status === "complete").length;
  function open(next: TabId) { setTab(next); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function saveProfile() {
    setSaving(true); setMessage(null);
    try { const response = await authenticatedFetch("/api/participant-dashboard", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error ?? "Profile could not be saved."); setMessage("Changes saved"); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Profile could not be saved."); }
    finally { setSaving(false); }
  }
  async function changeEmail() {
    if (!view) return;
    setEmailMessage(null); const next = email.trim();
    if (!next || next === view.identity.email) { setEmailMessage("Enter a different email address."); return; }
    const { error: authError } = await createClient().auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard/${view.role}` });
    setEmailMessage(authError ? authError.message : "Confirmation sent. Your sign-in changes after the required verification links are approved.");
  }

  return <main className={styles.page}><section className={styles.appShell}>
    <aside className={styles.sidebar}><div className={styles.brandMark}><span>AW</span><div><strong>Almaworks</strong><small>{view.semester.name}</small></div></div><nav aria-label={`${view.role} dashboard`}>{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => open(item.id)} className={tab === item.id ? styles.activeNav : ""}><Icon size={18} /><span>{item.label}</span>{item.id === "notifications" && view.notifications.length > 0 && <b>{view.notifications.length}</b>}</button>; })}</nav><div className={styles.scopeCard}><ShieldCheck size={17} /><div><strong>Private by design</strong><span>Only your {view.semester.name} activity is shown.</span></div></div><div className={styles.userMini}><div className={styles.avatarSmall}>{initials(view.identity.fullName)}</div><div><strong>{view.identity.fullName}</strong><span>{isMentor ? "Mentor" : "Startup"}</span></div></div></aside>
    <div className={styles.workspace}><header className={styles.mobileHeader}><div className={styles.brandMark}><span>AW</span><strong>Almaworks</strong></div><button onClick={() => open("notifications")} className={styles.iconButton} aria-label="Open notifications"><Bell size={18} /></button></header>

      {tab === "home" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>{view.semester.name} · {isMentor ? "Mentor" : "Startup"}</p><h1>Welcome, {view.identity.fullName.split(" ")[0]}.</h1><p>{isMentor ? "Everything you need for this semester’s mentoring, in one place." : "Your matches, program progress, and network are ready when you are."}</p></div><button className={styles.secondaryButton} onClick={() => open("profile")}><UserRoundPen size={16} />Edit profile</button></div>
        <section className={styles.activationPanel}><div className={styles.activationIntro}><span className={styles.sparkIcon}><Sparkles size={19} /></span><div><p className={styles.eyebrow}>Account activation</p><h2>{complete === view.activation.length ? "You’re ready for the semester" : `${view.activation.length - complete} step${view.activation.length - complete === 1 ? "" : "s"} until you’re ready`}</h2><p>Participant setup and administrator activation stay separate for account security.</p></div><div className={styles.progressRing} style={{ "--progress": `${complete / view.activation.length * 360}deg` } as React.CSSProperties}><span>{complete}/{view.activation.length}</span></div></div><div className={styles.activationSteps}>{view.activation.map((step, index) => { const copy = stepCopy[step.id]; return <div key={step.id} className={`${styles.activationStep} ${styles[step.status]}`}><span className={styles.stepNumber}>{step.status === "complete" ? <Check size={14} /> : step.status === "locked" ? <LockKeyhole size={13} /> : index + 1}</span><div><strong>{copy.label}</strong><p>{copy.detail}</p></div><button disabled={step.status === "locked" || step.id === "semester"} onClick={() => step.id === "profile" ? open("profile") : router.push("/dashboard/onboarding")}>{step.status === "complete" ? "Done" : copy.action}<ChevronRight size={14} /></button></div>; })}</div></section>
        <div className={styles.homeGrid}><section className={styles.primaryCard}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Coming up</p><h2>Your next session</h2></div><button onClick={() => open("sessions")}>All sessions <ChevronRight size={14} /></button></div>{upcoming[0] ? <div className={styles.nextSession}><div className={styles.dateTile}><strong>{dateParts(upcoming[0].meetingDate).month}</strong><span>{dateParts(upcoming[0].meetingDate).day}</span></div><div className={styles.sessionMain}><span className={styles.statusPill}>{upcoming[0].status}</span><h3>{upcoming[0].partnerName}</h3><p>{upcoming[0].topic || "Mentorship session"}</p><div className={styles.meta}><span><Clock3 size={14} />{upcoming[0].startsAt.slice(0, 5)}–{upcoming[0].endsAt.slice(0, 5)}</span><span>{upcoming[0].format || "Details pending"}</span></div></div></div> : <div className={styles.emptyState}><CalendarDays size={22} /><h2>No upcoming session yet</h2><p>Confirmed sessions will appear here.</p></div>}</section><aside className={styles.notificationCard}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>For you</p><h2>Notifications</h2></div><button onClick={() => open("notifications")}>View all</button></div><div className={styles.notificationList}>{view.notifications.slice(0, 3).map((notice) => <button key={notice.id} onClick={() => open("notifications")} className={styles.unread}><span className={styles.noticeIcon}><Bell size={15} /></span><span><strong>{notice.title}</strong><small>{notice.body}</small></span></button>)}</div></aside></div>
        <section className={styles.discoveryStrip}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Active semester network</p><h2>{isMentor ? "Startups you can support" : "Mentors you can learn from"}</h2></div><button onClick={() => open("network")}>Browse network <ChevronRight size={14} /></button></div><div className={styles.miniGrid}>{view.network.slice(0, 3).map((entry) => <button key={entry.id} onClick={() => open("network")}><div className={styles.avatar}>{initials(entry.name)}</div><div><strong>{entry.name}</strong><span>{entry.headline}</span></div></button>)}</div></section></div>}

      {tab === "network" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>{view.semester.name} network</p><h1>{isMentor ? "Browse startups" : "Browse mentors"}</h1><p>Only profiles available to your active-semester membership are shown.</p></div></div><div className={styles.searchBar}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isMentor ? "Search startups, industries, or stages" : "Search mentors, expertise, or companies"} /></div><div className={styles.filterRow}><button className={styles.selectedFilter} onClick={() => setQuery("")}>All</button><span>{directory.length} profiles</span></div><div className={styles.networkGrid}>{directory.map((entry) => <NetworkCard key={entry.id} entry={entry} />)}</div>{directory.length === 0 && <div className={styles.emptyState}><Search size={24} /><h2>No profiles match</h2><p>Try a broader search.</p><button onClick={() => setQuery("")}>Clear search</button></div>}</div>}

      {tab === "sessions" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Your activity only · {view.semester.name}</p><h1>Mentorship sessions</h1><p>Upcoming and earlier conversations from this active semester only.</p></div></div>{([ ["Upcoming", upcoming], ["Earlier this semester", past] ] as Array<[string, ParticipantDashboardView["sessions"]]>).map(([label, sessions]) => <section className={styles.sessionSection} key={label}><div className={styles.sectionHeading}><h2>{label}</h2><span>{sessions.length}</span></div>{sessions.map((session) => <article className={styles.sessionRow} key={session.id}><div className={`${styles.dateTile} ${session.timing === "past" ? styles.pastDate : ""}`}><strong>{dateParts(session.meetingDate).month}</strong><span>{dateParts(session.meetingDate).day}</span></div><div><span className={session.timing === "past" ? styles.completedPill : styles.statusPill}>{session.status}</span><h3>{session.partnerName}</h3><p>{session.topic || "Mentorship session"}</p></div><div className={styles.sessionWhen}><strong>{session.startsAt.slice(0, 5)}–{session.endsAt.slice(0, 5)}</strong><span>{session.format || "Details pending"}</span></div></article>)}{sessions.length === 0 && <p className={styles.summary}>No {label.toLowerCase()} sessions.</p>}</section>)}<div className={styles.privacyNote}><ShieldCheck size={18} /><div><strong>Your session history is private.</strong><p>You only see sessions belonging to you or your startup team in {view.semester.name}.</p></div></div></div>}

      {tab === "notifications" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Derived for you · {view.semester.name}</p><h1>Notifications</h1><p>Account readiness and owned-session updates relevant to your role.</p></div></div><section className={styles.fullNotificationList}>{view.notifications.map((notice) => <article key={notice.id} className={styles.unreadArticle}><span className={styles.noticeIcon}>{notice.kind === "session" ? <CalendarDays size={18} /> : <CircleUserRound size={18} />}</span><div><div><h2>{notice.title}</h2></div><p>{notice.body}</p></div></article>)}</section>{view.notifications.length === 0 && <div className={styles.emptyState}><Bell size={24} /><h2>You’re all caught up</h2></div>}<div className={styles.privacyNote}><Bell size={18} /><div><strong>No program-wide inbox.</strong><p>These notices are calculated from your account and active-semester sessions.</p></div></div></div>}

      {tab === "profile" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Profile & account</p><h1>Manage your information</h1><p>Control your participant profile and keep sign-in details current.</p></div><span className={styles.visibilityBadge}><UsersRound size={15} />Visible to active participants</span></div><div className={styles.profileGrid}><section className={styles.formCard}><div className={styles.formHeading}><div className={styles.profileAvatar}>{initials(view.identity.fullName)}</div><div><h2>{isMentor ? "Mentor profile" : "Startup participant profile"}</h2><p>Fields supported by your current database permissions.</p></div></div><div className={styles.formGrid}><label><span>Full name</span><input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></label><label><span>{isMentor ? "Title" : "Mentor need context"}</span><input value={form.headline} onChange={(event) => setForm((current) => ({ ...current, headline: event.target.value }))} /></label><label className={styles.fullField}><span>{isMentor ? "Biography" : "Company snapshot"}</span><textarea rows={4} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} /></label><label className={styles.fullField}><span>{isMentor ? "Expertise" : "Preferred expertise"}</span><input value={form.tags} onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))} /></label>{isMentor && <><label><span>Website</span><input value={form.websiteUrl} onChange={(event) => setForm((current) => ({ ...current, websiteUrl: event.target.value }))} /></label><label><span>LinkedIn</span><input value={form.linkedinUrl} onChange={(event) => setForm((current) => ({ ...current, linkedinUrl: event.target.value }))} /></label></>}</div><div className={styles.formActions}>{message && <span role="status"><Check size={15} />{message}</span>}<button className={styles.primaryButton} disabled={saving} onClick={() => void saveProfile()}>{saving ? "Saving…" : "Save profile"}</button></div></section><aside className={styles.accountCard}><p className={styles.eyebrow}>Account access</p><h2>Sign-in & security</h2><div className={styles.accountItem}><span><Mail size={17} /></span><div><strong>Sign-in email</strong><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><button onClick={() => void changeEmail()}>Change</button></div>{emailMessage && <p className={styles.summary} role="status">{emailMessage}</p>}<div className={styles.accountItem}><span><ShieldCheck size={17} /></span><div><strong>Email status</strong><p>{view.identity.emailVerified ? "Your current email is verified." : "Check your inbox to verify your email."}</p></div><i>{view.identity.emailVerified ? "Verified" : "Pending"}</i></div><div className={styles.scopeCard}><ShieldCheck size={17} /><div><strong>Protected account change</strong><span>Email changes may require confirmation at both your current and new addresses.</span></div></div></aside></div></div>}
    </div>
    <nav className={styles.mobileTabs} aria-label="Mobile dashboard navigation">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? styles.activeMobileTab : ""} onClick={() => open(item.id)}><span><Icon size={19} /></span><small>{item.label}</small></button>; })}</nav>
  </section></main>;
}
