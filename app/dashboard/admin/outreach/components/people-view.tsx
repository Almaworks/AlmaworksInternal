"use client";

import { useRef, useState } from "react";
import { MAX_CARRY_FORWARD_CONTACTS, selectedVisibleContacts, submitCarryForward, type CarryForwardResult } from "@/src/outreach/carry-forward-client";
import { filterOutreachWorkspaceForView } from "@/src/outreach/workspace";
import { outreachFetch } from "./authenticated-fetch";
import type { WorkspaceRow, WorkspaceSemester } from "./types";
import { QueueView } from "./queue-view";
import styles from "../outreach-workspace.module.css";

interface PeopleViewProps {
  rows: readonly WorkspaceRow[];
  onOpen: (row: WorkspaceRow) => void;
  sourceSemesterId: string;
  activeSemester?: WorkspaceSemester;
  onViewActive: () => void;
  preview?: boolean;
}

export function PeopleView({ rows, onOpen, sourceSemesterId, activeSemester, onViewActive, preview = false }: PeopleViewProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CarryForwardResult | null>(null);
  const submitting = useRef(false);
  const visible = filterOutreachWorkspaceForView(rows, "people", null, new Date().toISOString());
  const selectedIds = selectedVisibleContacts(selected, visible, sourceSemesterId);
  const eligibleIds = [...new Set(visible.filter((row) => row.semesterId === sourceSemesterId).map((row) => row.contactId))];
  const canCarry = Boolean(activeSemester && activeSemester.id !== sourceSemesterId && sourceSemesterId !== "all");
  const allSelected = eligibleIds.length > 0 && eligibleIds.every((id) => selectedIds.includes(id));

  function toggle(contactId: string) {
    setResult(null); setError(null);
    setSelected(selectedIds.includes(contactId) ? selectedIds.filter((id) => id !== contactId) : [...selectedIds, contactId]);
  }

  async function addToActive() {
    if (!activeSemester || !canCarry || !selectedIds.length || selectedIds.length > MAX_CARRY_FORWARD_CONTACTS || submitting.current || preview) return;
    submitting.current = true; setBusy(true); setError(null); setResult(null);
    try {
      const next = await submitCarryForward(outreachFetch, { sourceSemesterId, targetSemesterId: activeSemester.id, contactIds: selectedIds });
      setResult(next); setSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Contacts could not be added. Please try again.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return <section aria-label="Outreach people">
    {canCarry && <div className={styles.carryPanel} aria-busy={busy}>
      <div><h2>Add past contacts to {activeSemester?.name}</h2><p>Select people below to add them to the active semester. Past outreach history stays in place. New entries start as Not contacted and unassigned. Existing contacts in the destination are skipped.</p></div>
      <div className={styles.carryActions}>
        <label className={styles.contactSelection}><input type="checkbox" checked={allSelected} ref={(node) => { if (node) node.indeterminate = selectedIds.length > 0 && !allSelected; }} disabled={busy || eligibleIds.length === 0 || preview} onChange={() => { setSelected(allSelected ? [] : eligibleIds.slice(0, MAX_CARRY_FORWARD_CONTACTS)); setResult(null); setError(null); }} />Select visible{eligibleIds.length > MAX_CARRY_FORWARD_CONTACTS ? ` (first ${MAX_CARRY_FORWARD_CONTACTS})` : ""}</label>
        <span aria-live="polite">{selectedIds.length} selected</span>
        {selectedIds.length > 0 && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setSelected([])}>Clear</button>}
        <button type="button" className={styles.primaryButton} disabled={busy || !selectedIds.length || preview} onClick={() => void addToActive()}>{busy ? "Adding contacts…" : "Add to active semester"}</button>
      </div>
      <p className={styles.carryHint}>Selection applies to the visible, loaded contacts. Add up to {MAX_CARRY_FORWARD_CONTACTS} at a time.</p>
      {error && <p className={styles.unavailable} role="alert">{error}</p>}
      {result && <div className={styles.carryResult} role="status"><p>{result.addedCount} added to {activeSemester?.name}. {result.skippedCount} skipped because they already exist or are no longer eligible.</p><button type="button" className={styles.secondaryButton} onClick={onViewActive}>View active semester</button></div>}
    </div>}
    <QueueView rows={visible} onOpen={onOpen} emptyTitle="No outreach contacts match this search" emptyCopy="Try a different name, company, label, or owner."
      selection={canCarry ? { selectedIds, onToggle: toggle, isDisabled: (row) => busy || preview || row.semesterId !== sourceSemesterId || (selectedIds.length >= MAX_CARRY_FORWARD_CONTACTS && !selectedIds.includes(row.contactId)) } : undefined} />
  </section>;
}
