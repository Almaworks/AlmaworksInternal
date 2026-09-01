"use client";

import {
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Compass,
  ExternalLink,
  LockKeyhole,
  Mail,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundPen,
  UsersRound,
  Video,
} from "lucide-react";
import { useState } from "react";

import {
  buildActivationSteps,
  scopeParticipantDashboard,
  type ActivationState,
  type ParticipantDashboardSource,
  type ParticipantNetworkEntry,
  type ParticipantRole,
} from "@/src/dashboard/participant-dashboard";

import styles from "./participant-dashboard.module.css";

type TabId = "home" | "network" | "sessions" | "notifications" | "profile";

const tabs: Array<{ id: TabId; label: string; icon: typeof Compass }> = [
  { id: "home", label: "Home", icon: Compass },
  { id: "network", label: "Network", icon: UsersRound },
  { id: "sessions", label: "Sessions", icon: CalendarDays },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "profile", label: "Profile", icon: CircleUserRound },
];

const dashboardSource: ParticipantDashboardSource = {
  notifications: [
    { id: "mentor-confirmed", semesterId: "fall-2026", recipientProfileIds: ["mentor-maya"], startupSemesterId: null, title: "Session confirmed", body: "Your session with Luma Health is confirmed for Friday at 3:30 PM.", createdAt: "2026-09-01T14:30:00Z", read: false },
    { id: "mentor-profile", semesterId: "fall-2026", recipientProfileIds: ["mentor-maya"], startupSemesterId: null, title: "Finish your availability", body: "Add your Friday availability to complete account activation.", createdAt: "2026-08-31T17:20:00Z", read: true },
    { id: "startup-match", semesterId: "fall-2026", recipientProfileIds: [], startupSemesterId: "startup-northstar", title: "You have a new mentor match", body: "Maya Chen was matched with your team for September 11.", createdAt: "2026-09-01T13:00:00Z", read: false },
    { id: "startup-needs", semesterId: "fall-2026", recipientProfileIds: [], startupSemesterId: "startup-northstar", title: "Complete your mentor needs", body: "Tell us your top two priorities so we can improve future matches.", createdAt: "2026-08-31T16:00:00Z", read: false },
    { id: "other-private", semesterId: "fall-2026", recipientProfileIds: ["another-person"], startupSemesterId: "another-startup", title: "Private notification", body: "This never appears in either preview.", createdAt: "2026-09-01T18:00:00Z", read: false },
    { id: "prior-semester", semesterId: "spring-2026", recipientProfileIds: ["mentor-maya"], startupSemesterId: null, title: "Prior cohort message", body: "This is outside the active semester.", createdAt: "2026-04-01T12:00:00Z", read: true },
  ],
  sessions: [
    { id: "mentor-next", semesterId: "fall-2026", mentorProfileId: "mentor-maya", startupSemesterId: "startup-luma", partnerName: "Luma Health", date: "Sep 11", topic: "Enterprise partnerships", format: "In person", status: "confirmed" },
    { id: "mentor-past", semesterId: "fall-2026", mentorProfileId: "mentor-maya", startupSemesterId: "startup-forge", partnerName: "Forge Robotics", date: "Aug 28", topic: "First sales hire", format: "Online", status: "completed" },
    { id: "startup-next", semesterId: "fall-2026", mentorProfileId: "mentor-maya", startupSemesterId: "startup-northstar", partnerName: "Maya Chen", date: "Sep 11", topic: "Enterprise sales motion", format: "In person", status: "confirmed" },
    { id: "startup-past", semesterId: "fall-2026", mentorProfileId: "mentor-jordan", startupSemesterId: "startup-northstar", partnerName: "Jordan Ellis", date: "Aug 28", topic: "Pricing strategy", format: "Online", status: "completed" },
    { id: "private-session", semesterId: "fall-2026", mentorProfileId: "mentor-private", startupSemesterId: "startup-private", partnerName: "Hidden", date: "Sep 4", topic: "Hidden", format: "Online", status: "confirmed" },
    { id: "prior-session", semesterId: "spring-2026", mentorProfileId: "mentor-maya", startupSemesterId: "startup-prior", partnerName: "Prior cohort", date: "Mar 7", topic: "Hidden", format: "Online", status: "completed" },
  ],
  network: [
    { id: "mentor-maya-card", semesterId: "fall-2026", kind: "mentor", name: "Maya Chen", headline: "VP Revenue · Helio", tags: ["Enterprise sales", "Go-to-market", "Hiring"], summary: "Helps early teams build repeatable revenue systems and land their first enterprise customers." },
    { id: "mentor-jordan-card", semesterId: "fall-2026", kind: "mentor", name: "Jordan Ellis", headline: "Founder · Fieldwork", tags: ["Fundraising", "Pricing", "Product"], summary: "Former founder and operator focused on sharp positioning, pricing, and fundraising narratives." },
    { id: "mentor-amara-card", semesterId: "fall-2026", kind: "mentor", name: "Amara Okafor", headline: "COO · Current Labs", tags: ["Operations", "Leadership", "Scaling"], summary: "Partners with founders on operating cadence, team design, and scaling through inflection points." },
    { id: "startup-northstar-card", semesterId: "fall-2026", kind: "startup", name: "Northstar Labs", headline: "Climate intelligence · Seed", tags: ["Climate", "B2B SaaS", "Data"], summary: "Decision tools that help industrial teams forecast and manage climate-related operational risk." },
    { id: "startup-luma-card", semesterId: "fall-2026", kind: "startup", name: "Luma Health", headline: "Care navigation · Pre-seed", tags: ["Healthtech", "Marketplace", "Consumer"], summary: "A guided care platform that helps families understand options and find trusted providers faster." },
    { id: "startup-forge-card", semesterId: "fall-2026", kind: "startup", name: "Forge Robotics", headline: "Warehouse automation · Seed", tags: ["Robotics", "Hardware", "Logistics"], summary: "Modular robotic systems that make warehouse automation accessible to mid-market operators." },
    { id: "prior-network", semesterId: "spring-2026", kind: "mentor", name: "Prior cohort", headline: "Hidden", tags: [], summary: "Hidden" },
  ],
};

const activationState: Record<ParticipantRole, ActivationState> = {
  mentor: { emailVerified: true, profileComplete: true, semesterActive: true, roleSetupComplete: false },
  startup: { emailVerified: true, profileComplete: false, semesterActive: false, roleSetupComplete: false },
};

const activationCopy: Record<string, { label: string; detail: string; action: string }> = {
  email: { label: "Verify your sign-in email", detail: "Secure your account and receive program updates.", action: "Verified" },
  profile: { label: "Complete your public profile", detail: "Add the details other active participants can see.", action: "Edit profile" },
  semester: { label: "Activate for Fall 2026", detail: "Confirm this semester's participation and program terms.", action: "Activate" },
  availability: { label: "Share your availability", detail: "Choose the Friday slots that work for mentoring.", action: "Add availability" },
  "mentor-needs": { label: "Set your mentor needs", detail: "Choose priorities that guide your mentor matches.", action: "Add priorities" },
};

const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2);

function NetworkCard({ entry, action }: { entry: ParticipantNetworkEntry; action: string }) {
  return <article className={styles.networkCard}>
    <div className={styles.networkTop}>
      <div className={styles.avatar}>{initials(entry.name)}</div>
      <button className={styles.iconButton} aria-label={`Open ${entry.name}`}><ExternalLink size={16} /></button>
    </div>
    <h3>{entry.name}</h3>
    <p className={styles.headline}>{entry.headline}</p>
    <p className={styles.summary}>{entry.summary}</p>
    <div className={styles.tags}>{entry.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    <button className={styles.cardAction}>{action}<ChevronRight size={15} /></button>
  </article>;
}

export default function ParticipantDashboardPreview({ role }: { role: ParticipantRole }) {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [query, setQuery] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const isMentor = role === "mentor";
  const identity = isMentor
    ? { profileId: "mentor-maya", startupSemesterId: null, name: "Maya Chen", entity: "Mentor", email: "maya@helio.com" }
    : { profileId: "founder-nadia", startupSemesterId: "startup-northstar", name: "Nadia Rahman", entity: "Northstar Labs", email: "nadia@northstarlabs.co" };
  const dashboard = scopeParticipantDashboard({ role, profileId: identity.profileId, startupSemesterId: identity.startupSemesterId, activeSemesterId: "fall-2026", source: dashboardSource });
  const activation = buildActivationSteps(role, activationState[role]);
  const completedSteps = activation.filter((step) => step.status === "complete").length;
  const unreadCount = dashboard.notifications.filter((notification) => !notification.read).length;
  const filteredNetwork = (() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return dashboard.network;
    return dashboard.network.filter((entry) => `${entry.name} ${entry.headline} ${entry.tags.join(" ")}`.toLowerCase().includes(needle));
  })();
  const upcoming = dashboard.sessions.filter((session) => session.status === "confirmed");
  const completed = dashboard.sessions.filter((session) => session.status === "completed");

  function openTab(tab: TabId) {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return <main className={styles.page}>
    <div className={styles.previewBar}>
      <span>Interactive concept · {isMentor ? "mentor" : "startup"} experience</span>
      <span>Mockup only · active semester data</span>
    </div>
    <section className={styles.appShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandMark}><span>AW</span><div><strong>Almaworks</strong><small>Fall 2026</small></div></div>
        <nav aria-label={`${identity.entity} dashboard`}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return <button key={tab.id} onClick={() => openTab(tab.id)} className={activeTab === tab.id ? styles.activeNav : ""}>
              <Icon size={18} /><span>{tab.label}</span>
              {tab.id === "notifications" && unreadCount > 0 && <b>{unreadCount}</b>}
            </button>;
          })}
        </nav>
        <div className={styles.scopeCard}><ShieldCheck size={17} /><div><strong>Private by design</strong><span>Only your Fall 2026 activity is shown.</span></div></div>
        <div className={styles.userMini}><div className={styles.avatarSmall}>{initials(identity.name)}</div><div><strong>{identity.name}</strong><span>{identity.entity}</span></div><ChevronRight size={15} /></div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.mobileHeader}><div className={styles.brandMark}><span>AW</span><strong>Almaworks</strong></div><button onClick={() => openTab("notifications")} className={styles.iconButton}><Bell size={18} />{unreadCount > 0 && <i />}</button></header>

        {activeTab === "home" && <div className={styles.content}>
          <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Fall 2026 · {identity.entity}</p><h1>Good morning, {identity.name.split(" ")[0]}.</h1><p>{isMentor ? "Everything you need for this semester's mentoring, in one place." : "Your matches, program progress, and network are ready when you are."}</p></div><button className={styles.secondaryButton} onClick={() => openTab("profile")}><UserRoundPen size={16} />Edit profile</button></div>

          <section className={styles.activationPanel}>
            <div className={styles.activationIntro}><span className={styles.sparkIcon}><Sparkles size={19} /></span><div><p className={styles.eyebrow}>Account activation</p><h2>{completedSteps === activation.length ? "You're ready for the semester" : `${activation.length - completedSteps} step${activation.length - completedSteps === 1 ? "" : "s"} until you're ready`}</h2><p>Complete setup to unlock scheduling and improve your program experience.</p></div><div className={styles.progressRing} style={{ "--progress": `${completedSteps / activation.length * 360}deg` } as React.CSSProperties}><span>{completedSteps}/{activation.length}</span></div></div>
            <div className={styles.activationSteps}>{activation.map((step, index) => {
              const copy = activationCopy[step.id]!;
              return <div key={step.id} className={`${styles.activationStep} ${styles[step.status]}`}>
                <span className={styles.stepNumber}>{step.status === "complete" ? <Check size={14} /> : step.status === "locked" ? <LockKeyhole size={13} /> : index + 1}</span>
                <div><strong>{copy.label}</strong><p>{copy.detail}</p></div>
                <button disabled={step.status === "locked"}>{step.status === "complete" ? "Done" : copy.action}<ChevronRight size={14} /></button>
              </div>;
            })}</div>
          </section>

          <div className={styles.homeGrid}>
            <section className={styles.primaryCard}>
              <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Coming up</p><h2>Your next session</h2></div><button onClick={() => openTab("sessions")}>All sessions <ChevronRight size={14} /></button></div>
              {upcoming[0] && <div className={styles.nextSession}>
                <div className={styles.dateTile}><strong>{upcoming[0].date.split(" ")[0]}</strong><span>{upcoming[0].date.split(" ")[1]}</span></div>
                <div className={styles.sessionMain}><span className={styles.statusPill}>Confirmed</span><h3>{upcoming[0].partnerName}</h3><p>{upcoming[0].topic}</p><div className={styles.meta}><span><Clock3 size={14} />3:30–4:15 PM</span><span>{upcoming[0].format === "Online" ? <Video size={14} /> : <MapPin size={14} />}{upcoming[0].format}</span></div></div>
                <button className={styles.primaryButton}>View details</button>
              </div>}
            </section>
            <aside className={styles.notificationCard}>
              <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>For you</p><h2>Notifications</h2></div><button onClick={() => openTab("notifications")}>View all</button></div>
              <div className={styles.notificationList}>{dashboard.notifications.slice(0, 2).map((notification) => <button key={notification.id} onClick={() => openTab("notifications")} className={!notification.read ? styles.unread : ""}><span className={styles.noticeIcon}><Bell size={15} /></span><span><strong>{notification.title}</strong><small>{notification.body}</small></span><ChevronRight size={14} /></button>)}</div>
            </aside>
          </div>

          <section className={styles.discoveryStrip}>
            <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Active semester network</p><h2>{isMentor ? "Startups you can support" : "Mentors you can learn from"}</h2></div><button onClick={() => openTab("network")}>Browse network <ChevronRight size={14} /></button></div>
            <div className={styles.miniGrid}>{dashboard.network.slice(0, 3).map((entry) => <button key={entry.id} onClick={() => openTab("network")}><div className={styles.avatar}>{initials(entry.name)}</div><div><strong>{entry.name}</strong><span>{entry.headline}</span></div><ChevronRight size={16} /></button>)}</div>
          </section>
        </div>}

        {activeTab === "network" && <div className={styles.content}>
          <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Fall 2026 network</p><h1>{isMentor ? "Browse startups" : "Browse mentors"}</h1><p>{isMentor ? "Explore active startups and understand where your experience could help." : "Discover active mentors by expertise, background, and the challenges they support."}</p></div></div>
          <div className={styles.searchBar}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isMentor ? "Search by startup, industry, or stage" : "Search by name, expertise, or company"} /><kbd>⌘ K</kbd></div>
          <div className={styles.filterRow}><button className={styles.selectedFilter}>All</button>{(isMentor ? ["B2B SaaS", "Healthtech", "Seed"] : ["Go-to-market", "Fundraising", "Operations"]).map((filter) => <button key={filter} onClick={() => setQuery(filter)}>{filter}</button>)}<span>{filteredNetwork.length} active profiles</span></div>
          <div className={styles.networkGrid}>{filteredNetwork.map((entry) => <NetworkCard key={entry.id} entry={entry} action={isMentor ? "View startup" : "View mentor"} />)}</div>
          {filteredNetwork.length === 0 && <div className={styles.emptyState}><Search size={24} /><h2>No profiles match that search</h2><p>Try a broader expertise area or clear your filters.</p><button onClick={() => setQuery("")}>Clear search</button></div>}
        </div>}

        {activeTab === "sessions" && <div className={styles.content}>
          <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Your activity only · Fall 2026</p><h1>Mentorship sessions</h1><p>Upcoming and completed conversations for your current semester.</p></div><button className={styles.secondaryButton}><CalendarDays size={16} />Calendar view</button></div>
          <section className={styles.sessionSection}><div className={styles.sectionHeading}><h2>Upcoming</h2><span>{upcoming.length}</span></div>{upcoming.map((session) => <article className={styles.sessionRow} key={session.id}><div className={styles.dateTile}><strong>{session.date.split(" ")[0]}</strong><span>{session.date.split(" ")[1]}</span></div><div><span className={styles.statusPill}>Confirmed</span><h3>{session.partnerName}</h3><p>{session.topic}</p></div><div className={styles.sessionWhen}><strong>3:30–4:15 PM</strong><span>{session.format}</span></div><button className={styles.iconButton}><ChevronRight size={17} /></button></article>)}</section>
          <section className={styles.sessionSection}><div className={styles.sectionHeading}><h2>Completed this semester</h2><span>{completed.length}</span></div>{completed.map((session) => <article className={styles.sessionRow} key={session.id}><div className={`${styles.dateTile} ${styles.pastDate}`}><Check size={17} /><span>{session.date}</span></div><div><span className={styles.completedPill}>Completed</span><h3>{session.partnerName}</h3><p>{session.topic}</p></div><div className={styles.sessionWhen}><strong>{session.format}</strong><span>Private session details</span></div><button className={styles.iconButton}><ChevronRight size={17} /></button></article>)}</section>
          <div className={styles.privacyNote}><ShieldCheck size={18} /><div><strong>Your session history is private.</strong><p>You only see your own Fall 2026 sessions and basic shared details—never admin notes, matching rationale, or another participant&apos;s activity.</p></div></div>
        </div>}

        {activeTab === "notifications" && <div className={styles.content}>
          <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Scoped to you · Fall 2026</p><h1>Notifications</h1><p>Account, activation, and session updates relevant to your role.</p></div><button className={styles.secondaryButton}><Check size={16} />Mark all read</button></div>
          <section className={styles.fullNotificationList}>{dashboard.notifications.map((notification) => <article key={notification.id} className={!notification.read ? styles.unreadArticle : ""}><span className={styles.noticeIcon}>{notification.title.toLowerCase().includes("session") || notification.title.toLowerCase().includes("match") ? <CalendarDays size={18} /> : <CircleUserRound size={18} />}</span><div><div><h2>{notification.title}</h2>{!notification.read && <span>New</span>}</div><p>{notification.body}</p><small>{notification.createdAt.startsWith("2026-09-01") ? "Today" : "Yesterday"}</small></div><button className={styles.iconButton}><ChevronRight size={17} /></button></article>)}</section>
          <div className={styles.privacyNote}><Bell size={18} /><div><strong>No program-wide inbox.</strong><p>This feed includes only messages addressed to you{isMentor ? "" : " or your startup team"} in the active semester.</p></div></div>
        </div>}

        {activeTab === "profile" && <div className={styles.content}>
          <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Profile & account</p><h1>Manage your information</h1><p>Control what the active network sees and keep your sign-in details current.</p></div><span className={styles.visibilityBadge}><UsersRound size={15} />Visible to Fall 2026 participants</span></div>
          <div className={styles.profileGrid}>
            <section className={styles.formCard}><div className={styles.formHeading}><div className={styles.profileAvatar}>{initials(identity.name)}</div><div><h2>{isMentor ? "Mentor profile" : "Startup profile"}</h2><p>Public details for the current network.</p></div><button className={styles.secondaryButton}>Change photo</button></div>
              <div className={styles.formGrid}>
                <label><span>{isMentor ? "Full name" : "Startup name"}</span><input defaultValue={isMentor ? identity.name : "Northstar Labs"} /></label>
                <label><span>{isMentor ? "Role & company" : "Industry & stage"}</span><input defaultValue={isMentor ? "VP Revenue · Helio" : "Climate intelligence · Seed"} /></label>
                <label className={styles.fullField}><span>{isMentor ? "Short biography" : "Company summary"}</span><textarea rows={4} defaultValue={isMentor ? "Revenue leader helping early teams build repeatable enterprise sales systems." : "Decision tools that help industrial teams forecast and manage climate-related operational risk."} /></label>
                <label className={styles.fullField}><span>{isMentor ? "Expertise" : "Mentorship priorities"}</span><input defaultValue={isMentor ? "Enterprise sales, Go-to-market, Hiring" : "Enterprise sales, Pricing, Fundraising"} /></label>
                <label><span>LinkedIn</span><input defaultValue="linkedin.com/in/example" /></label>
                <label><span>Contact phone</span><input defaultValue="+1 (202) 555-0147" /></label>
              </div>
              <div className={styles.formActions}>{profileSaved && <span><Check size={15} />Changes saved</span>}<button className={styles.primaryButton} onClick={() => { setProfileSaved(true); window.setTimeout(() => setProfileSaved(false), 1800); }}>Save profile</button></div>
            </section>
            <aside className={styles.accountCard}><p className={styles.eyebrow}>Account access</p><h2>Sign-in & security</h2><div className={styles.accountItem}><span><Mail size={17} /></span><div><strong>Sign-in email</strong><p>{identity.email}</p></div><button>Change</button></div><div className={styles.accountItem}><span><ShieldCheck size={17} /></span><div><strong>Email verified</strong><p>Your account can receive secure updates.</p></div><i>Verified</i></div><div className={styles.accountItem}><span><LockKeyhole size={17} /></span><div><strong>Password</strong><p>Last updated 4 months ago.</p></div><button>Reset</button></div><div className={styles.scopeCard}><ShieldCheck size={17} /><div><strong>Protected account change</strong><span>Email changes require verification before your sign-in is updated.</span></div></div></aside>
          </div>
        </div>}
      </div>

      <nav className={styles.mobileTabs} aria-label="Mobile dashboard navigation">{tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} className={activeTab === tab.id ? styles.activeMobileTab : ""} onClick={() => openTab(tab.id)}><span><Icon size={19} />{tab.id === "notifications" && unreadCount > 0 && <i />}</span><small>{tab.label}</small></button>; })}</nav>
    </section>
  </main>;
}
