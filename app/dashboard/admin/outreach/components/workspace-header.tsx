"use client";

import { AlertTriangle, CalendarDays, Download, Plus, Search } from "lucide-react";
import { useState } from "react";

import type { WorkspaceHealth, WorkspaceSemester } from "./types";
import styles from "../outreach-workspace.module.css";
import { AddContactForm } from "./add-contact-form";

interface WorkspaceHeaderProps {
  health: WorkspaceHealth;
  search: string;
  semesters: readonly WorkspaceSemester[];
  semesterId: string;
  activeSemesterId: string;
  onSemesterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onImport: () => void;
}

const healthLabels: { key: keyof WorkspaceHealth; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "dueToday", label: "Due today" },
  { key: "unassigned", label: "Unassigned" },
  { key: "awaitingResponse", label: "Awaiting response" },
];

export function WorkspaceHeader({ health, search, semesters, semesterId, activeSemesterId, onSemesterChange, onSearchChange, onImport }: WorkspaceHeaderProps) {
  const [adding, setAdding] = useState(false);
  return <><header className={styles.header}>
    <div>
      <p className={styles.eyebrow}>Relationship operations</p>
      <div className={styles.titleLine}><h1>Outreach</h1><label className={styles.semester}><CalendarDays size={14} /><span className={styles.srOnly}>Semester</span><select value={semesterId} onChange={(event) => onSemesterChange(event.target.value)}>{semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}{semester.isActive ? " (active)" : ""}</option>)}</select></label></div>
      <p className={styles.subtitle}>Keep the next conversation clear, owned, and on time.</p>
    </div>
    <div className={styles.headerControls}>
      <label className={styles.search}><Search size={16} /><span className={styles.srOnly}>Search contacts and owners</span><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search people, company, owner" /></label>
      <button className={styles.secondaryButton} onClick={onImport}><Download size={16} /> Import</button>
      <button className={styles.primaryButton} onClick={() => setAdding(true)} disabled={!activeSemesterId}><Plus size={16} /> Add contact</button>
    </div>
    <div className={styles.health} aria-label="Outreach health">
      {healthLabels.map(({ key, label }) => <div key={key} className={key === "overdue" && health[key] > 0 ? styles.healthUrgent : ""}><span>{key === "overdue" && <AlertTriangle size={14} aria-hidden="true" />}{label}</span><strong>{health[key]}</strong></div>)}
    </div>
  </header>{adding && <AddContactForm semesterId={activeSemesterId} onClose={() => setAdding(false)} onCreated={() => window.location.reload()} />}</>;
}
