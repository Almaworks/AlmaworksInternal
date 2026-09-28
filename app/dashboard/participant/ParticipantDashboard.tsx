"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, BriefcaseBusiness, Building2, CalendarCheck, CalendarDays, CalendarPlus, Check, ChevronRight, CircleUserRound, Clock3, ExternalLink, LockKeyhole, LogOut, Mail, RefreshCw, Search, ShieldCheck, Sparkles, Target, UserRoundPen, UsersRound } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { AdminViewAsControl } from "@/components/AdminViewAsControl";
import { AdminViewTransitionShell } from "@/components/AdminViewTransitionShell";
import { AlmaworksBrand } from "@/components/AlmaworksBrand";
import MentorNeedsForm, { type MentorNeedsFormRecord } from "@/components/mentor-needs/MentorNeedsForm";
import { MentorNeedsSummaryCard } from "@/components/mentor-needs/MentorNeedsSummaryCard";
import { ExpertiseTagPicker } from "@/components/ExpertiseTagPicker";
import { ProfileAvatar } from "@/components/profile-photo/ProfileAvatar";
import { ProfilePhotoControl } from "@/components/profile-photo/ProfilePhotoControl";
import { FridayProgramPanel } from "@/components/friday-program/FridayProgramPanel";
import MentorBookingWorkspace from "@/components/mentor-booking/MentorBookingWorkspace";
import MentorAvailabilityOverview from "@/components/mentor-booking/MentorAvailabilityOverview";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { signOutParticipant } from "@/src/auth/participant-sign-out";
import { adminViewDestination, resolveAdminViewTransition, shouldShowAdminViewLoading, type AdminView } from "@/src/dashboard/participant-preview";
import type { ParticipantDashboardResponse, ParticipantProfileForm } from "@/src/dashboard/participant-dashboard-server";
import { markParticipantNotificationRead, unreadNotificationCount, type ParticipantDashboardView, type ParticipantDirectoryEntry, type ParticipantRole, type StartupProfileForm } from "@/src/dashboard/participant-dashboard";
import { participantNotificationReadCacheKey, persistParticipantNotificationRead } from "@/src/dashboard/participant-notification-read";
import { StartupStagePicker } from "@/components/StartupStagePicker";
import styles from "@/app/design-preview/participant-dashboard/participant-dashboard.module.css";
import StartupsDirectory from "./StartupsDirectory";

type TabId = "home" | "network" | "startups" | "availability" | "bookings" | "friday-program" | "mentor-needs" | "notifications" | "profile" | "startup-profile";
type NotificationReadScope = { profileId: string; semesterId: string };
function resolveParticipantTab(tab: string | null, role: ParticipantRole): TabId {
  if (["network", "bookings", "notifications", "profile"].includes(tab ?? "")) return tab as TabId;
  if (role === "mentor" && tab === "startups") return "startups";
  if (tab === "friday-program") return tab;
  if (role === "startup" && ["mentor-needs", "startup-profile"].includes(tab ?? "")) return tab as TabId;
  return "home";
}
function participantTabDestination(pathname: string, searchParams: { toString(): string }, tab: TabId): string {
  const next = new URLSearchParams(searchParams.toString());
  if (tab === "home") next.delete("tab");
  else next.set("tab", tab);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
const baseTabs = [
  { id: "home" as const, label: "Home", icon: Sparkles },
  { id: "network" as const, label: "Network", icon: UsersRound },
  { id: "startups" as const, label: "Startups", icon: Building2 },
  { id: "availability" as const, label: "Availability", icon: Clock3 },
  { id: "bookings" as const, label: "Bookings", icon: CalendarPlus },
  { id: "friday-program" as const, label: "Friday Program", icon: CalendarCheck },
  { id: "mentor-needs" as const, label: "Mentor Needs", icon: Target },
  { id: "startup-profile" as const, label: "Startup Profile", icon: BriefcaseBusiness },
  { id: "notifications" as const, label: "Notifications", icon: Bell },
  { id: "profile" as const, label: "Profile", icon: CircleUserRound },
];
const stepCopy: Record<string, { label: string; detail: string; action: string }> = {
  email: { label: "Verify your sign-in email", detail: "Secure your account and receive program updates.", action: "Check email" },
  profile: { label: "Complete your public profile", detail: "Add the details active participants can see.", action: "Edit profile" },
  semester: { label: "Almaworks activation", detail: "An administrator approves your membership for this cohort.", action: "Pending review" },
  "mentor-needs": { label: "Set your mentor needs", detail: "Choose priorities that guide mentor matching.", action: "Continue setup" },
};

function externalUrl(value: string) { return value.startsWith("http") ? value : `https://${value}`; }

function upcomingMeetingLabel(startsAt: string, endsAt: string) {
  const date = new Date(startsAt);
  const end = new Date(endsAt);
  return {
    day: new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date),
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
    weekday: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
    time: `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date)}–${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(end)}`,
  };
}

function NetworkCard({ entry, preview }: { entry: ParticipantDirectoryEntry; preview: boolean }) {
  return <article className={styles.networkCard}>
    <div className={styles.networkTop}><ProfileAvatar name={entry.name} photoUrl={entry.photoUrl} /><span className={styles.eyebrow}>{entry.kind === "mentor" ? "Mentor" : "Startup member"}</span></div>
    <h3>{entry.name}</h3><p className={styles.headline}>{entry.headline || "Active participant"}</p>
    <p className={styles.summary}>{entry.summary || "This participant is completing their profile."}</p>
    <div className={styles.tags}>{entry.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}</div>
    <div className={styles.networkContacts} aria-label={`${entry.name} contact information`}>
      {entry.email ? (preview ? <span><Mail size={15} />{entry.email}</span> : <a href={`mailto:${entry.email}`}><Mail size={15} />{entry.email}</a>) : <span>Email not provided</span>}
      {entry.linkedinUrl && (preview ? <span>LinkedIn</span> : <a href={externalUrl(entry.linkedinUrl)} target="_blank" rel="noreferrer">LinkedIn<ExternalLink size={14} /></a>)}
      {entry.websiteUrl && (preview ? <span>Website</span> : <a href={externalUrl(entry.websiteUrl)} target="_blank" rel="noreferrer">Website<ExternalLink size={14} /></a>)}
    </div>
  </article>;
}

function Gate({ kind, retry }: { kind: "loading" | "pending" | "unavailable" | "error"; retry: () => void }) {
  const copy = kind === "loading" ? ["Loading your workspace", "We’re checking your active-semester membership and role."] : kind === "pending" ? ["Your account is waiting for activation", "Your sign-in works. An Almaworks administrator still needs to connect this account to the active semester."] : kind === "unavailable" ? ["No active semester is available", "Program scheduling will appear here after Almaworks activates a semester."] : ["We couldn’t load your workspace", "Your session may have expired, or dashboard data is temporarily unavailable."];
  return <main className={styles.page}><section className={styles.appShell}><div className={`${styles.workspace} ${styles.gateWorkspace}`}><div className={`${styles.content} ${styles.gateContent}`}><div className={styles.emptyState}>{kind === "loading" ? <RefreshCw className="animate-spin" size={26} /> : <ShieldCheck size={28} />}<h2>{copy[0]}</h2><p>{copy[1]}</p>{kind !== "loading" && <button onClick={retry}><RefreshCw size={15} />Try again</button>}</div></div></div></section></main>;
}

function formFromView(view: ParticipantDashboardView | null): ParticipantProfileForm {
  if (!view) return { fullName: "", headline: "", company: "", summary: "", tags: "", websiteUrl: "", linkedinUrl: "" };
  return { fullName: view.identity.fullName, headline: view.profile.headline, company: view.profile.company ?? "", summary: view.profile.summary, tags: view.profile.tags.join(", "), websiteUrl: view.profile.websiteUrl, linkedinUrl: view.profile.linkedinUrl };
}

function startupProfileFormFromView(view: ParticipantDashboardView | null): StartupProfileForm {
  return view?.startupProfile ?? { name: "", industry: "", stage: "mvp", description: "", websiteUrl: "" };
}

function tagValues(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

export default function ParticipantDashboard({ expectedRole, previewView }: { expectedRole: ParticipantRole; previewView?: ParticipantDashboardView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isPreview = previewView !== undefined;
  const requestedTab = useMemo(() => resolveParticipantTab(searchParams.get("tab"), expectedRole), [expectedRole, searchParams]);
  const [tab, setTab] = useState<TabId>(requestedTab);
  const [result, setResult] = useState<ParticipantDashboardResponse | null>(previewView ?? null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState(previewView?.identity.email ?? "");
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [pendingView, setPendingView] = useState<AdminView | null>(null);
  const [isViewTransitionPending, startViewTransition] = useTransition();
  const [form, setForm] = useState<ParticipantProfileForm>(() => formFromView(previewView ?? null));
  const [startupProfileForm, setStartupProfileForm] = useState<StartupProfileForm>(() => startupProfileFormFromView(previewView ?? null));
  const [startupProfileSaving, setStartupProfileSaving] = useState(false);
  const [startupProfileMessage, setStartupProfileMessage] = useState<string | null>(null);
  const [notificationReadFailure, setNotificationReadFailure] = useState<{
    notice: ParticipantDashboardView["notifications"][number];
    scope: NotificationReadScope;
    message: string;
  } | null>(null);
  const pendingNotificationReadsRef = useRef(new Map<string, symbol>());
  const locallyReadNotificationKeysRef = useRef(new Set<string>());
  const loadController = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setError(null);
    if (previewView) {
      setResult(previewView);
      setEmail(previewView.identity.email);
      setForm(formFromView(previewView));
      setStartupProfileForm(startupProfileFormFromView(previewView));
      return;
    }
    try {
      const response = await authenticatedFetch("/api/participant-dashboard", { signal: controller.signal });
      const payload = await response.json() as { data?: ParticipantDashboardResponse; error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Dashboard could not be loaded.");
      const dashboardData = payload.data;
      setResult(dashboardData.state === "participant" ? {
        ...dashboardData,
        notifications: dashboardData.notifications.map((notification) => (
          locallyReadNotificationKeysRef.current.has(participantNotificationReadCacheKey(
            dashboardData.identity.profileId,
            dashboardData.semester.id,
            notification.key,
          ))
            ? { ...notification, read: true }
            : notification
        )),
      } : dashboardData);
      if (dashboardData.state === "participant") {
        if (dashboardData.role !== expectedRole) { router.replace(`/dashboard/${dashboardData.role}`); return; }
        setEmail(dashboardData.identity.email);
        setForm(formFromView(dashboardData));
        setStartupProfileForm(startupProfileFormFromView(dashboardData));
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Dashboard could not be loaded.");
    }
  }, [expectedRole, previewView, router]);
  useEffect(() => { void load(); return () => loadController.current?.abort(); }, [load]);
  useEffect(() => { setTab(requestedTab); }, [requestedTab]);

  const viewTransition = resolveAdminViewTransition(pathname, pendingView, isViewTransitionPending);
  const showViewLoading = isPreview && viewTransition.loading;
  const view = result?.state === "participant" ? result : null;
  const directory = useMemo(() => { if (!view) return []; const needle = query.trim().toLowerCase(); return needle ? view.network.filter((entry) => `${entry.name} ${entry.headline} ${entry.summary} ${entry.tags.join(" ")}`.toLowerCase().includes(needle)) : view.network; }, [query, view]);
  if (showViewLoading && pendingView) return <AdminViewTransitionShell destination={pendingView} />;
  if (!result && !error) return <Gate kind="loading" retry={() => void load()} />;
  if (error) return <Gate kind="error" retry={() => void load()} />;
  if (result?.state === "pending") return <Gate kind="pending" retry={() => void load()} />;
  if (result?.state === "unavailable") return <Gate kind="unavailable" retry={() => void load()} />;
  if (!view) return <Gate kind="unavailable" retry={() => void load()} />;
  if (view.role !== expectedRole) return <Gate kind="loading" retry={() => void load()} />;
  const participantView = view;

  const isMentor = view.role === "mentor";
  const tabs = baseTabs.filter((item) => item.id !== "availability" && (item.id !== "mentor-needs" || !isMentor) && (item.id !== "startups" || isMentor) && (item.id !== "startup-profile" || !isMentor));
  const complete = view.activation.filter((step) => step.status === "complete").length;
  const unreadNotifications = unreadNotificationCount(view);
  function open(next: TabId) {
    if (next === tab) return;
    setTab(next);
    // Only the client-owned tab changes. Next synchronizes Back/Forward and
    // useSearchParams without repeating the authenticated server navigation.
    window.history.pushState(null, "", participantTabDestination(pathname, searchParams, next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateOwnPhoto(nextPhotoUrl: string | null) {
    setResult((current) => current?.state === "participant" ? {
      ...current,
      identity: { ...current.identity, photoUrl: nextPhotoUrl },
      network: current.network.map((entry) => entry.id === current.identity.profileId ? { ...entry, photoUrl: nextPhotoUrl } : entry),
      startups: current.startups.map((startup) => ({
        ...startup,
        people: startup.people.map((person) => person.id === current.identity.profileId ? { ...person, photoUrl: nextPhotoUrl } : person),
      })),
    } : current);
  }

  async function saveNotificationRead(
    notice: ParticipantDashboardView["notifications"][number],
    scope: NotificationReadScope,
  ) {
    if (participantView.identity.profileId !== scope.profileId || participantView.semester.id !== scope.semesterId) return;
    const cacheKey = participantNotificationReadCacheKey(scope.profileId, scope.semesterId, notice.key);
    if (locallyReadNotificationKeysRef.current.has(cacheKey)) return;
    const attempt = Symbol(cacheKey);
    locallyReadNotificationKeysRef.current.add(cacheKey);
    pendingNotificationReadsRef.current.set(cacheKey, attempt);
    setNotificationReadFailure((current) => (
      current?.scope.profileId === scope.profileId
      && current.scope.semesterId === scope.semesterId
      && current.notice.key === notice.key
        ? null
        : current
    ));
    setResult((current) => {
      if (current?.state !== "participant") return current;
      if (current.identity.profileId !== scope.profileId || current.semester.id !== scope.semesterId) return current;
      return markParticipantNotificationRead(current, notice.key);
    });
    if (isPreview) {
      pendingNotificationReadsRef.current.delete(cacheKey);
      return;
    }
    try {
      await persistParticipantNotificationRead(authenticatedFetch, {
        semesterId: scope.semesterId,
        notificationKey: notice.key,
      });
      if (pendingNotificationReadsRef.current.get(cacheKey) === attempt) {
        pendingNotificationReadsRef.current.delete(cacheKey);
      }
    } catch (cause) {
      if (pendingNotificationReadsRef.current.get(cacheKey) !== attempt) return;
      pendingNotificationReadsRef.current.delete(cacheKey);
      locallyReadNotificationKeysRef.current.delete(cacheKey);
      setResult((current) => {
        if (current?.state !== "participant") return current;
        if (current.identity.profileId !== scope.profileId || current.semester.id !== scope.semesterId) return current;
        return {
          ...current,
          notifications: current.notifications.map((notification) => (
            notification.key === notice.key ? { ...notification, read: false } : notification
          )),
        };
      });
      setNotificationReadFailure({
        notice,
        scope,
        message: cause instanceof Error ? cause.message : "Notification read status could not be saved.",
      });
    }
  }

  function openNotification(notice: ParticipantDashboardView["notifications"][number]) {
    open(notice.destination);
    if (!notice.read) void saveNotificationRead(notice, {
      profileId: participantView.identity.profileId,
      semesterId: participantView.semester.id,
    });
  }

  function savePreviewMentorNeeds(record: MentorNeedsFormRecord) {
    setResult((current) => current?.state === "participant" ? { ...current, mentorNeeds: record } : current);
  }

  async function saveProfile() {
    setSaving(true); setMessage(null);
    if (isPreview) {
      setMessage("Demo changes saved for this preview only");
      setSaving(false);
      return;
    }
    try {
      const profileResponse = await authenticatedFetch("/api/participant-dashboard", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const profilePayload = await profileResponse.json() as { error?: string };
      if (!profileResponse.ok) throw new Error(profilePayload.error ?? "Profile could not be saved.");
      if (isMentor) {
        const expertiseResponse = await authenticatedFetch("/api/expertise-tags/mentor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: tagValues(form.tags) }) });
        const expertisePayload = await expertiseResponse.json() as { error?: string };
        if (!expertiseResponse.ok) throw new Error(expertisePayload.error ?? "Mentor expertise could not be saved.");
      }
      setMessage("Changes saved"); await load();
    }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Profile could not be saved."); }
    finally { setSaving(false); }
  }

  async function saveStartupProfile() {
    setStartupProfileSaving(true); setStartupProfileMessage(null);
    if (isPreview) {
      setResult((current) => current?.state === "participant" ? { ...current, startupProfile: startupProfileForm } : current);
      setStartupProfileMessage("Demo changes saved for this preview only"); setStartupProfileSaving(false); return;
    }
    try {
      const response = await authenticatedFetch("/api/startup-profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(startupProfileForm) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Startup profile could not be saved.");
      setStartupProfileMessage("Startup profile saved");
      await load();
    } catch (cause) { setStartupProfileMessage(cause instanceof Error ? cause.message : "Startup profile could not be saved."); }
    finally { setStartupProfileSaving(false); }
  }
  async function changeEmail() {
    if (!view) return;
    setEmailMessage(null); const next = email.trim();
    if (!next || next === view.identity.email) { setEmailMessage("Enter a different email address."); return; }
    if (isPreview) { setEmailMessage("Email changes are disabled in demo mode."); return; }
    const { error: authError } = await createClient().auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard/${view.role}` });
    setEmailMessage(authError ? authError.message : "Confirmation sent. Your sign-in changes after the required verification links are approved.");
  }
  async function signOut() {
    if (isPreview) {
      changeAdminView("admin");
      return;
    }
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOutParticipant(createClient(), (href) => window.location.assign(href));
    } catch (cause) {
      setSignOutError(cause instanceof Error ? cause.message : "You could not be signed out. Please try again.");
      setSigningOut(false);
    }
  }

  function changeAdminView(next: AdminView) {
    if (!shouldShowAdminViewLoading(pathname, next)) return;
    setPendingView(next);
    startViewTransition(() => {
      router.push(adminViewDestination(next));
    });
  }

  return <main className={styles.page}>{isPreview && <div className={styles.demoBar}><span><strong>Demo mode</strong> · Fictional data · Changes are not saved</span><span>Development preview</span></div>}<section className={styles.appShell}>
    <aside className={styles.sidebar}><div className={styles.brandMark}><AlmaworksBrand tone="white" iconSize={32} /><small>{view.semester.name}</small></div>{isPreview && <AdminViewAsControl current={showViewLoading && pendingView ? pendingView : view.role} onChange={changeAdminView} disabled={showViewLoading} className="px-1 pt-0 pb-4" />}<nav aria-label={`${view.role} dashboard`}>{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => open(item.id)} className={tab === item.id ? styles.activeNav : ""}><Icon size={18} /><span>{item.label}</span>{item.id === "notifications" && unreadNotifications > 0 && <b>{unreadNotifications}</b>}</button>; })}</nav><div className={styles.scopeCard}><ShieldCheck size={17} /><div><strong>{isPreview ? "Fictional by design" : "Private by design"}</strong><span>Only {isPreview ? "demo" : `your ${view.semester.name}`} activity is shown.</span></div></div><div className={styles.participantFooter}><div className={styles.userMini}><ProfileAvatar name={view.identity.fullName} photoUrl={view.identity.photoUrl} size="small" /><div><strong>{view.identity.fullName}</strong><span>{isMentor ? "Mentor" : "Startup"}{isPreview ? " · Demo" : ""}</span></div></div><button type="button" className={styles.signOutButton} onClick={() => void signOut()} disabled={signingOut || showViewLoading}><LogOut size={16} /><span>{isPreview ? "Return to admin" : signingOut ? "Signing out..." : "Sign out"}</span></button>{signOutError && <p className={styles.signOutError} role="alert">{signOutError}</p>}</div></aside>
    <div className={styles.workspace}><header className={styles.mobileHeader}><div className={styles.brandMark}><AlmaworksBrand tone="white" iconSize={28} /></div><div className={styles.mobileActions}><button onClick={() => open("notifications")} className={styles.iconButton} aria-label="Open notifications"><Bell size={18} /></button><button type="button" onClick={() => void signOut()} disabled={signingOut || showViewLoading} className={styles.iconButton} aria-label={isPreview ? "Return to admin" : signingOut ? "Signing out" : "Sign out"}><LogOut size={18} /></button></div></header>{isPreview && <AdminViewAsControl current={showViewLoading && pendingView ? pendingView : view.role} onChange={changeAdminView} disabled={showViewLoading} className={styles.mobileViewAs} />}{signOutError && <p className={styles.mobileSignOutError} role="alert">{signOutError}</p>}
      {notificationReadFailure && notificationReadFailure.scope.profileId === view.identity.profileId && notificationReadFailure.scope.semesterId === view.semester.id && <div className={styles.content}><p className={styles.rsvpMessage} role="alert">{notificationReadFailure.message} <button type="button" onClick={() => void saveNotificationRead(notificationReadFailure.notice, notificationReadFailure.scope)}>Retry</button></p></div>}

      {tab === "home" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>{view.semester.name} · {isMentor ? "Mentor" : "Startup"}</p><h1>Welcome, {view.identity.fullName.split(" ")[0]}.</h1><p>{isMentor ? "Everything you need for this semester’s mentoring, in one place." : "Your matches, program progress, and network are ready when you are."}</p></div><button className={styles.secondaryButton} onClick={() => open("profile")}><UserRoundPen size={16} />Edit profile</button></div>
        {!isMentor && view.mentorNeeds && <MentorNeedsSummaryCard summary={view.mentorNeeds} onEdit={() => open("mentor-needs")} />}
        {complete < view.activation.length && <section className={styles.activationPanel}><div className={styles.activationIntro}><span className={styles.sparkIcon}><Sparkles size={19} /></span><div><p className={styles.eyebrow}>Account activation</p><h2>{`${view.activation.length - complete} step${view.activation.length - complete === 1 ? "" : "s"} until you’re ready`}</h2><p>Participant setup and administrator activation stay separate for account security.</p></div><div className={styles.progressRing} style={{ "--progress": `${complete / view.activation.length * 360}deg` } as React.CSSProperties}><span>{complete}/{view.activation.length}</span></div></div><div className={styles.activationSteps}>{view.activation.map((step, index) => { const copy = stepCopy[step.id]; return <div key={step.id} className={`${styles.activationStep} ${styles[step.status]}`}><span className={styles.stepNumber}>{step.status === "complete" ? <Check size={14} /> : step.status === "locked" ? <LockKeyhole size={13} /> : index + 1}</span><div><strong>{copy.label}</strong><p>{copy.detail}</p></div><button disabled={isPreview || step.status === "locked" || step.id === "semester"} onClick={() => step.id === "profile" ? open("profile") : step.id === "mentor-needs" ? open("mentor-needs") : router.push("/dashboard/onboarding")}>{step.status === "complete" ? "Done" : copy.action}<ChevronRight size={14} /></button></div>; })}</div></section>}
        <div className={styles.homeGrid}>
          <section className={styles.primaryCard}>
            <div className={styles.sectionHeading}><div><h2>{isMentor ? "Your mentoring schedule" : "Request mentor time"}</h2></div><button onClick={() => open("bookings")}>{isMentor ? "View schedule" : "Bookings"} <ChevronRight size={14} /></button></div>
            {isMentor ? <MentorAvailabilityOverview availability={view.weeklyAvailability} profileId={view.identity.profileId} semesterId={view.semester.id} onManage={() => open("bookings")} /> : <div className={styles.emptyState}><CalendarDays size={22} /><h2>Browse mentor availability</h2><p>Choose an open mentor window and send a topic with your request.</p><button onClick={() => open("bookings")}>Open bookings</button></div>}
          </section>
          <aside className={styles.notificationCard}><div className={styles.sectionHeading}><div><h2>Notifications</h2></div><button onClick={() => open("notifications")}>View all</button></div><div className={styles.notificationList}>{view.notifications.slice(0, 3).map((notice) => <button key={notice.id} onClick={() => void openNotification(notice)} className={notice.read ? styles.readNotification : styles.unread}><span className={styles.noticeIcon}><Bell size={15} /></span><span><strong>{notice.title}</strong><small>{notice.body}</small></span></button>)}</div></aside>
        </div>
        <section className={styles.sessionSection} aria-label="Upcoming meetings"><div className={styles.sectionHeading}><div><h2>Upcoming meetings</h2></div><button onClick={() => open("bookings")}>Manage bookings <ChevronRight size={14} /></button></div>{view.upcomingMeetings.length > 0 ? <div className={styles.upcomingMeetingList}>{view.upcomingMeetings.map((meeting) => { const label = upcomingMeetingLabel(meeting.startsAt, meeting.endsAt); return <article className={styles.sessionRow} key={`${meeting.startsAt}:${meeting.counterpartName}`}><div className={styles.dateTile}><strong>{label.month}</strong><span>{label.day}</span></div><div className={styles.sessionMain}><p>{label.weekday} · Confirmed</p><h3>{meeting.counterpartName}</h3><p>{meeting.topic || "Independent mentoring session"}</p></div><div className={styles.sessionWhen}><strong>{label.time}</strong></div></article>; })}</div> : <div className={styles.upcomingMeetingEmpty}><CalendarDays size={21} /><div><strong>No upcoming meetings</strong><p>{isMentor ? "Confirmed startup sessions will appear here." : "Confirmed mentor sessions will appear here."}</p></div></div>}</section>
        <section className={styles.discoveryStrip}><div className={styles.sectionHeading}><div><h2>{isMentor ? "Startup members you can support" : "Meet your cohort"}</h2></div><button onClick={() => open("network")}>Browse network <ChevronRight size={14} /></button></div><div className={styles.miniGrid}>{view.network.slice(0, 3).map((entry) => <button key={entry.id} onClick={() => open("network")}><ProfileAvatar name={entry.name} photoUrl={entry.photoUrl} /><div><strong>{entry.name}</strong><span>{entry.headline}</span></div></button>)}</div></section></div>}

      {tab === "network" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>{view.semester.name} network</p><h1>{isMentor ? "Browse startup members" : "Browse your cohort"}</h1><p>Active mentors and startup members from your cohort.</p></div></div><div className={styles.searchBar}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isMentor ? "Search members, startups, or industries" : "Search people, expertise, or companies"} /></div><div className={styles.filterRow}><button className={styles.selectedFilter} onClick={() => setQuery("")}>All</button><span>{directory.length} profiles</span></div><div className={styles.networkGrid}>{directory.map((entry) => <NetworkCard key={entry.id} entry={entry} preview={isPreview} />)}</div>{directory.length === 0 && <div className={styles.emptyState}><Search size={24} /><h2>No profiles match</h2><p>Try a broader search.</p><button onClick={() => setQuery("")}>Clear search</button></div>}</div>}

      {tab === "startups" && isMentor && <div className={styles.content}><StartupsDirectory startups={view.startups ?? []} semesterName={view.semester.name} preview={isPreview} /></div>}

      {tab === "bookings" && isMentor && <div className={styles.content}>
        <div className={styles.pageHeading}><div><p className={styles.eyebrow}>{view.semester.name}</p><h1>Your mentoring schedule</h1><p>Set your bookable hours and view upcoming meetings during the cohort.</p></div></div>
        {searchParams.get("setup") === "availability" && <section aria-label="Mentoring hours setup guide" className="mb-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700 sm:p-5"><p className="font-semibold text-[#002147]">Set your recurring mentoring hours</p><ol className="mt-2 list-decimal space-y-1 pl-5"><li>Use the mentoring schedule below to mark the hours startups may book.</li><li>Save your mentoring hours to publish them for this cohort.</li><li>Google Calendar removes conflicts from those hours when connected; it does not add bookable hours.</li></ol></section>}
        <MentorBookingWorkspace semesterId={view.semester.id} heading="Your mentoring schedule" />
      </div>}

      {tab === "bookings" && !isMentor && <div className={styles.content}>
        <div className={styles.pageHeading}><div><p className={styles.eyebrow}>{view.semester.name}</p><h1>Mentor bookings</h1><p>Choose an open mentor window and include a topic for your request.</p></div></div>
        <MentorBookingWorkspace semesterId={view.semester.id} heading="Mentor bookings" />
      </div>}

      {tab === "friday-program" && <div className={styles.content}>
        <div className={styles.pageHeading}><div><p className={styles.eyebrow}>{view.semester.name}</p><h1>Friday Program</h1><p>Review the weekly standups, speaker session, and small-group rotations.</p></div></div>
        <FridayProgramPanel semesterId={view.semester.id} focusedMeetingId={searchParams.get("semester") && searchParams.get("semester") !== view.semester.id ? 'unavailable-semester' : searchParams.get("meeting")} startupSemesterId={view.startupSemesterId} previewData={isPreview ? { semesterId: view.semester.id, agenda: [], meetings: [] } : undefined} />
      </div>}

      {tab === "mentor-needs" && !isMentor && view.mentorNeeds && <div className={styles.content}>
        <div className={styles.pageHeading}><div><p className={styles.eyebrow}>{view.semester.name} matching preferences</p><h1>Mentor needs</h1><p>Tell Almaworks which expertise and context would be most useful for your startup right now.</p></div></div>
        <MentorNeedsForm semesterId={view.semester.id} semesterName={view.semester.name} initialRecord={view.mentorNeeds} preview={isPreview} onSaved={(record) => isPreview ? savePreviewMentorNeeds(record) : void load()} />
      </div>}

      {tab === "startup-profile" && !isMentor && !view.startupProfile && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Shared company information</p><h1>Startup profile</h1></div></div><section className={styles.emptyState} aria-label="Startup assignment needed"><Building2 size={24} /><h2>Your startup assignment is pending</h2><p>Ask the Almaworks team to assign you to your startup for {view.semester.name}. Once assigned, you can edit your company profile and mentor needs here.</p><button className={styles.primaryButton} onClick={() => open("profile")}>Edit your personal profile</button></section></div>}

      {tab === "startup-profile" && !isMentor && view.startupProfile && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Shared company information</p><h1>Startup profile</h1><p>Changes appear for your startup team and throughout the Almaworks directory.</p></div><span className={styles.visibilityBadge}><Building2 size={15} />Shared with your team</span></div><section className={styles.formCard}><div className={styles.formHeading}><div><h2>About your startup</h2><p>Only active members assigned to this startup can save these details.</p></div></div><div className={styles.formGrid}><label><span>Name</span><input value={startupProfileForm.name} onChange={(event) => setStartupProfileForm((current) => ({ ...current, name: event.target.value }))} /></label><label><span>Field</span><input value={startupProfileForm.industry} placeholder="e.g. FinTech" onChange={(event) => setStartupProfileForm((current) => ({ ...current, industry: event.target.value }))} /></label><label><span>Stage</span><StartupStagePicker value={startupProfileForm.stage} onChange={stage => setStartupProfileForm(current => ({ ...current, stage }))} /></label><label className="self-start"><span>Website</span><input value={startupProfileForm.websiteUrl} placeholder="https://example.com" onChange={(event) => setStartupProfileForm((current) => ({ ...current, websiteUrl: event.target.value }))} /></label><label className={styles.fullField}><span>Description</span><textarea rows={5} value={startupProfileForm.description} onChange={(event) => setStartupProfileForm((current) => ({ ...current, description: event.target.value }))} /></label></div><div className={styles.formActions}>{startupProfileMessage && <span role="status"><Check size={15} />{startupProfileMessage}</span>}<button className={styles.primaryButton} disabled={startupProfileSaving || !startupProfileForm.name.trim()} onClick={() => void saveStartupProfile()}>{startupProfileSaving ? "Saving…" : "Save startup profile"}</button></div></section></div>}

      {tab === "notifications" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>{view.semester.name}</p><h1>Notifications</h1><p>Your session updates and account reminders, all in one place.</p></div></div><section className={styles.fullNotificationList} aria-label="Your notifications">{view.notifications.map((notice) => <button type="button" key={notice.key} onClick={() => void openNotification(notice)} className={notice.read ? styles.readNotification : styles.unreadArticle}><span className={styles.noticeIcon}>{notice.kind === "session" ? <CalendarDays size={18} /> : <CircleUserRound size={18} />}</span><span className={styles.notificationCopy}><span className={styles.notificationTitle}>{notice.title}{!notice.read && <span className={styles.notificationBadge}>Unread</span>}</span><span className={styles.notificationBody}>{notice.body}</span><span className={styles.notificationAction}>{notice.kind === "session" ? "View bookings" : "Continue setup"}</span></span><ChevronRight size={18} aria-hidden="true" /></button>)}</section>{view.notifications.length === 0 && <div className={styles.emptyState}><Bell size={24} /><h2>You’re all caught up</h2></div>}<div className={styles.privacyNote}><Bell size={18} /><div><strong>Updates for you</strong><p>Find session changes and account reminders for {view.semester.name} here.</p></div></div></div>}

      {tab === "profile" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Profile & account</p><h1>Manage your information</h1><p>Control your participant profile and keep sign-in details current.</p></div><span className={styles.visibilityBadge}><UsersRound size={15} />Visible to active participants</span></div><div className={styles.profileGrid}><section className={styles.formCard}><div className={styles.formHeading}><div><h2>{isMentor ? "Mentor profile" : "Startup participant profile"}</h2><p>Fields supported by your current database permissions.</p></div></div><ProfilePhotoControl name={view.identity.fullName} photoUrl={view.identity.photoUrl} preview={isPreview} onPhotoChange={updateOwnPhoto} /><div className={styles.formGrid}><label><span>Full name</span><input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} /></label><label><span>{isMentor ? "Title" : "Mentor need context"}</span><input value={form.headline} onChange={(event) => setForm((current) => ({ ...current, headline: event.target.value }))} /></label>{isMentor && <label><span>Company</span><input value={form.company ?? ""} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} /></label>}<label className={styles.fullField}><span>{isMentor ? "Biography" : "Company snapshot"}</span><textarea rows={4} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} /></label>{isMentor && <><div className={styles.fullField}><span>Expertise</span><ExpertiseTagPicker value={tagValues(form.tags)} onChange={(tags) => setForm((current) => ({ ...current, tags: tags.join(", ") }))} placeholder="Search or create expertise tags…" /></div><label><span>Website</span><input value={form.websiteUrl} onChange={(event) => setForm((current) => ({ ...current, websiteUrl: event.target.value }))} /></label><label><span>LinkedIn</span><input value={form.linkedinUrl} onChange={(event) => setForm((current) => ({ ...current, linkedinUrl: event.target.value }))} /></label></>}</div><div className={styles.formActions}>{message && <span role="status"><Check size={15} />{message}</span>}<button className={styles.primaryButton} disabled={saving} onClick={() => void saveProfile()}>{saving ? "Saving…" : "Save profile"}</button></div></section><aside className={styles.accountCard}><p className={styles.eyebrow}>Account access</p><h2>Sign-in & security</h2><div className={styles.accountItem}><span><Mail size={17} /></span><div><strong>Sign-in email</strong><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div><button onClick={() => void changeEmail()}>Change</button></div>{emailMessage && <p className={styles.summary} role="status">{emailMessage}</p>}<div className={styles.accountItem}><span><ShieldCheck size={17} /></span><div><strong>Email status</strong><p>{view.identity.emailVerified ? "Your current email is verified." : "Check your inbox to verify your email."}</p></div><i>{view.identity.emailVerified ? "Verified" : "Pending"}</i></div><div className={styles.accountItem}><span><ShieldCheck size={17} /></span><div><strong>Password</strong><p>Use a password to sign in without Google or an email link.</p></div><button onClick={() => router.push("/account/password")}>Change password</button></div><div className={styles.scopeCard}><ShieldCheck size={17} /><div><strong>Protected account change</strong><span>Email changes may require confirmation at both your current and new addresses.</span></div></div></aside></div></div>}
    </div>
    <nav className={styles.mobileTabs} aria-label="Mobile dashboard navigation">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? styles.activeMobileTab : ""} onClick={() => open(item.id)}><span><Icon size={19} /></span><small>{item.label}</small></button>; })}</nav>
  </section></main>;
}
