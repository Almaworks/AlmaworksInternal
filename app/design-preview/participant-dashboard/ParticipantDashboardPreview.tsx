"use client";

import { Bell, CalendarDays, CircleUserRound, Compass, UsersRound } from "lucide-react";
import { useState } from "react";

import type { ParticipantRole } from "@/src/dashboard/participant-dashboard";

import styles from "./participant-dashboard.module.css";

type TabId = "home" | "network" | "availability" | "bookings" | "friday-program" | "notifications" | "profile";

export default function ParticipantDashboardPreview({ role }: { role: ParticipantRole }) {
  const isMentor = role === "mentor";
  const [tab, setTab] = useState<TabId>("home");
  const tabs = [
    { id: "home" as const, label: "Home", icon: Compass },
    { id: "network" as const, label: "Network", icon: UsersRound },
    ...(isMentor ? [{ id: "availability" as const, label: "Availability", icon: CalendarDays }] : [{ id: "bookings" as const, label: "Bookings", icon: CalendarDays }]),
    ...(!isMentor ? [{ id: "friday-program" as const, label: "Friday Program", icon: CalendarDays }] : []),
    { id: "notifications" as const, label: "Notifications", icon: Bell },
    { id: "profile" as const, label: "Profile", icon: CircleUserRound },
  ];
  const activityLabel = isMentor ? "Availability" : "Bookings";

  return <main className={styles.page}>
    <div className={styles.previewBar}>Interactive concept · {isMentor ? "mentor" : "startup"} experience · Mockup only</div>
    <section className={styles.appShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandMark}><span>AW</span><div><strong>Almaworks</strong><small>Fall 2026</small></div></div>
        <nav aria-label="Participant dashboard">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={tab === item.id ? styles.activeNav : ""}><Icon size={18} /><span>{item.label}</span></button>; })}</nav>
      </aside>
      <div className={styles.workspace}>
        {tab === "home" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Fall 2026 · {isMentor ? "Mentor" : "Startup"}</p><h1>Welcome to Almaworks</h1><p>Independent mentor bookings and the Friday Program are separate workflows.</p></div></div><section className={styles.primaryCard}><h2>{isMentor ? "Share your availability" : "Request mentor time"}</h2><p>{isMentor ? "Publish time windows from the weekly availability calendar." : "Browse open mentor windows and include a topic with your request."}</p><button className={styles.primaryButton} onClick={() => setTab(isMentor ? "availability" : "bookings")}>Open {activityLabel}</button></section></div>}
        {(tab === "availability" || tab === "bookings") && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Independent mentoring</p><h1>{activityLabel}</h1><p>{isMentor ? "The live workspace provides the weekly calendar for publishing availability." : "The live workspace provides available mentor windows and request controls."}</p></div></div></div>}
        {tab === "friday-program" && !isMentor && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Fall 2026</p><h1>Friday Program</h1><p>Startup standups, speaker session, and saved small-group rotations.</p></div></div></div>}
        {tab === "network" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Active semester network</p><h1>Network</h1><p>Browse active cohort members.</p></div></div></div>}
        {tab === "notifications" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Your account</p><h1>Notifications</h1><p>Account and activation updates.</p></div></div></div>}
        {tab === "profile" && <div className={styles.content}><div className={styles.pageHeading}><div><p className={styles.eyebrow}>Profile & account</p><h1>Profile</h1><p>Manage your public participant profile.</p></div></div></div>}
      </div>
    </section>
  </main>;
}
