"use client";

import { isActionableWorkspaceRow, type WorkspaceRow } from "./types";
import { QueueView } from "./queue-view";
import styles from "../outreach-workspace.module.css";

export function TeamView({ rows, onOpen }: { rows: readonly WorkspaceRow[]; onOpen: (row: WorkspaceRow, event?: React.SyntheticEvent) => void }) {
  const groups = new Map<string, { name: string; rows: WorkspaceRow[] }>();
  const now = new Date().toISOString();
  for (const row of rows.filter((item) => isActionableWorkspaceRow(item, now))) { const id = row.ownerProfileId ?? "__unassigned__"; const group = groups.get(id) ?? { name: row.ownerName ?? "Unassigned", rows: [] }; group.rows.push(row); groups.set(id, group); }
  const sorted = [...groups.entries()].sort(([first], [second]) => first === "__unassigned__" ? -1 : second === "__unassigned__" ? 1 : first.localeCompare(second));
  if (!sorted.length) return <QueueView rows={[]} onOpen={onOpen} emptyTitle="Every team queue is clear" emptyCopy="Open work will be grouped by its owner here." />;
  return <div className={styles.groups}>{sorted.map(([ownerId, group]) => <section key={ownerId} className={styles.queueGroup}><div className={styles.groupHeading}><h2>{group.name}</h2><span>{group.rows.length} open {group.rows.length === 1 ? "opportunity" : "opportunities"}</span></div><QueueView rows={group.rows} onOpen={onOpen} /></section>)}</div>;
}
