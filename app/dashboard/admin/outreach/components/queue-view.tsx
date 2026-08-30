"use client";

import { ArrowUpRight, Clock3, Moon, VolumeX } from "lucide-react";

import { classifyWorkspaceRow, type WorkspaceRow } from "./types";
import styles from "../outreach-workspace.module.css";

interface QueueViewProps {
  rows: readonly WorkspaceRow[];
  onOpen: (row: WorkspaceRow, event?: React.SyntheticEvent) => void;
  emptyTitle?: string;
  emptyCopy?: string;
}

export function formatDate(value: string | null): string {
  if (value === null) return "No next action";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export function rowState(row: WorkspaceRow): string {
  const state = classifyWorkspaceRow(row);
  const labels: Record<ReturnType<typeof classifyWorkspaceRow>, string> = {
    closed: "Closed", silenced: "Silenced", snoozed: "Snoozed", unassigned: "Unassigned",
    overdue: "Overdue", due_today: "Due today", upcoming: "Next action", waiting: "Waiting",
  };
  return labels[state];
}

export function QueueView({ rows, onOpen, emptyTitle = "Nothing is due", emptyCopy = "When outreach needs attention, it will appear here." }: QueueViewProps) {
  if (rows.length === 0) return <div className={styles.empty}><Clock3 size={22} /><h2>{emptyTitle}</h2><p>{emptyCopy}</p></div>;
  return <div className={styles.tableWrap}>
    <table className={styles.table}><thead><tr><th>Contact</th><th>Company</th><th>Stage</th><th>Owner</th><th>Last touch</th><th>Next action</th><th><span className={styles.srOnly}>Open</span></th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} tabIndex={0} onClick={(event) => onOpen(row, event)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(row, event); } }}>
        <td><strong>{row.contactName}</strong><small>{row.contactEmail ?? "No email"}</small><small>{row.labels?.join(", ") ?? "Relationship labels unavailable"}</small></td><td>{row.companyName ?? "Company unavailable"}</td><td><span className={styles.stage}>{row.stage.replace(/_/gu, " ")}</span></td><td>{row.ownerName ?? "Unassigned"}</td><td>{formatDate(row.latestOutboundActivityAt)}</td><td><span className={rowState(row) === "Overdue" ? styles.overdue : styles.nextAction}>{row.isSilenced ? <VolumeX size={14} /> : row.snoozedUntil ? <Moon size={14} /> : null}{rowState(row) === "Overdue" ? "Overdue · " : ""}{formatDate(row.nextFollowUpAt)}</span><small>{row.cadenceDays ? `${row.cadenceDays}-day cadence` : "Cadence unavailable"}</small></td><td><button className={styles.rowOpen} aria-label={`Open ${row.contactName}`} onClick={(event) => { event.stopPropagation(); onOpen(row, event); }}><ArrowUpRight size={16} /></button></td>
      </tr>)}</tbody></table>
    <div className={styles.cards}>{rows.map((row) => <button className={styles.card} key={row.id} onClick={(event) => onOpen(row, event)}><span className={styles.cardTop}><strong>{row.contactName}</strong><span className={rowState(row) === "Overdue" ? styles.overdue : styles.nextAction}>{rowState(row)}</span></span><span>{row.companyName ?? "No company"} · {row.stage}</span><span className={styles.cardMeta}>{row.ownerName ?? "Unassigned"}<span>Next: {formatDate(row.nextFollowUpAt)}</span></span></button>)}</div>
  </div>;
}
