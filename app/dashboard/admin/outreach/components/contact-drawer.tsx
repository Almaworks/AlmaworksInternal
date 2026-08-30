"use client";

import { Building2, CalendarClock, Mail, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ActivityComposer } from "./activity-composer";
import { outreachFetch } from "./authenticated-fetch";
import { contactDetailFromResponse, type ContactDetail } from "./contact-detail-model";
import { EditContactForm } from "./edit-contact-form";
import { OwnerPicker } from "./owner-picker";
import type { WorkspaceData, WorkspaceRow } from "./types";
import type { OutreachStage } from "@/src/outreach/types";
import { formatDate } from "./queue-view";
import styles from "../outreach-workspace.module.css";

export function ContactDrawer({ row, data, returnFocus, onClose, onRefresh }: { row: WorkspaceRow; data: WorkspaceData; returnFocus: React.RefObject<HTMLElement | null>; onClose: () => void; onRefresh: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const [snoozeDate, setSnoozeDate] = useState("");
  const [silenceReason, setSilenceReason] = useState("");
  const [restoreDate, setRestoreDate] = useState("");
  const [stage, setStage] = useState(row.stage as OutreachStage);
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const available = row.updatedAt !== undefined;

  useEffect(() => {
    const focusTarget = returnFocus.current;
    closeButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); focusTarget?.focus(); };
  }, [onClose, returnFocus]);

  useEffect(() => {
    let cancelled = false;
    setDetailLoading(true);
    void outreachFetch(`/api/admin/outreach/contacts/${row.contactId}?semesterId=${encodeURIComponent(row.semesterId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Contact details could not be loaded.");
        const detailResponse = contactDetailFromResponse(await response.json());
        if (detailResponse === null) throw new Error("Contact details could not be read.");
        if (!cancelled) setDetail(detailResponse);
      })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [row.contactId, row.semesterId]);

  async function mutate(kind: "snooze" | "silence", payload: Record<string, unknown>) {
    if (!available) return;
    setMessage("Saving…");
    try {
      const response = await outreachFetch(`/api/admin/outreach/opportunities/${row.id}/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semesterId: row.semesterId, updatedAt: row.updatedAt, ...payload }) });
      if (!response.ok) throw new Error("Could not save this change. Refresh and try again.");
      setMessage("Saved."); onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this change."); }
  }

  async function changeStage() {
    if (!available || stage === row.stage) return;
    setMessage("Saving…");
    try {
      const response = await outreachFetch(`/api/admin/outreach/opportunities/${row.id}/stage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semesterId: row.semesterId, updatedAt: row.updatedAt, stage }) });
      if (!response.ok) throw new Error("Could not change stage. Refresh and try again.");
      setMessage("Saved."); onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not change stage."); }
  }

  const contact = detail?.contact;
  const activities = detail?.activities ?? [];
  return <div className={styles.contactModalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} className={styles.contactModal} role="dialog" aria-modal="true" aria-labelledby="outreach-contact-title" aria-describedby="outreach-contact-summary">
      <button ref={closeButton} className={styles.close} type="button" onClick={onClose} aria-label="Close contact workspace"><X size={18} /></button>
      <div className={styles.contactModalIdentity}><div><p className={styles.eyebrow}>Contact workspace</p><h2 id="outreach-contact-title">{contact?.fullName ?? row.contactName}</h2><p id="outreach-contact-summary"><Mail size={15} />{contact?.email ?? row.contactEmail ?? "No email on record"}</p>{row.companyName && <p><Building2 size={15} />{row.companyName}</p>}</div><button type="button" className={styles.secondaryButton} disabled={!contact} onClick={() => setEditing((current) => !current)}><Pencil size={15} />{editing ? "Close editor" : "Edit contact"}</button></div>
      {editing && contact ? <section className={styles.contactEditor} aria-labelledby="edit-contact-heading"><div className={styles.sectionTitle}><h3 id="edit-contact-heading">Edit contact</h3><span>Contact details</span></div><EditContactForm semesterId={row.semesterId} contact={contact} onCancel={() => setEditing(false)} onSaved={(saved) => { setDetail((current) => current ? { ...current, contact: saved } : current); setEditing(false); setMessage("Contact saved."); onRefresh(); }} /></section> : <>
        <section className={styles.contactModalSection}><div className={styles.sectionTitle}><h3>Current opportunity</h3><span className={styles.stage}>{row.stage}</span></div><dl className={styles.detailGrid}><div><dt>Cohort</dt><dd>{row.semesterName}</dd></div><div><dt>Next action</dt><dd>{formatDate(row.nextFollowUpAt)}</dd></div><div><dt>Cadence</dt><dd>{row.cadenceDays ? `${row.cadenceDays} days` : "Not available"}</dd></div><div><dt>Snooze</dt><dd>{row.snoozedUntil ? formatDate(row.snoozedUntil) : "Not snoozed"}</dd></div><div><dt>Silence</dt><dd>{row.isSilenced ? row.silenceReason ?? "Silenced" : "Active"}</dd></div></dl><div className={styles.controlRow}><label>Stage<select value={stage} onChange={(event) => setStage(event.target.value as OutreachStage)} disabled={!available}><option value="prospect">Prospect</option><option value="researching">Researching</option><option value="ready">Ready</option><option value="contacted">Contacted</option><option value="responded">Responded</option><option value="meeting">Meeting</option><option value="nurture">Nurture</option><option value="converted">Converted</option><option value="closed">Closed</option></select></label><button type="button" onClick={() => void changeStage()} disabled={!available || stage === row.stage}>Change stage</button></div><OwnerPicker row={row} owners={data.owners} semesterId={row.semesterId} onCommitted={onRefresh} /></section>
        <ActivityComposer row={row} semesterId={row.semesterId} onCommitted={onRefresh} />
        <section className={styles.contactModalSection}><div className={styles.sectionTitle}><h3>Queue controls</h3><CalendarClock size={16} /></div><div className={styles.controlRow}><label>Snooze until<input type="date" value={snoozeDate} onChange={(event) => setSnoozeDate(event.target.value)} disabled={!available} /></label><button type="button" onClick={() => void mutate("snooze", { snoozedUntil: snoozeDate ? new Date(`${snoozeDate}T12:00:00Z`).toISOString() : null })} disabled={!available || !snoozeDate}>Snooze</button></div><div className={styles.controlRow}><label>Silence reason<input value={silenceReason} onChange={(event) => setSilenceReason(event.target.value)} disabled={!available} /></label><button type="button" onClick={() => void mutate("silence", { silence: true, reason: silenceReason })} disabled={!available || !silenceReason.trim()}>Silence</button></div>{row.isSilenced && <div className={styles.controlRow}><label>Next action<input type="date" value={restoreDate} onChange={(event) => setRestoreDate(event.target.value)} disabled={!available} /></label><button type="button" onClick={() => void mutate("silence", { silence: false, nextFollowUpAt: restoreDate ? new Date(`${restoreDate}T12:00:00Z`).toISOString() : null })} disabled={!available || !restoreDate}>Restore</button></div>}{!available && <p className={styles.unavailable}>Queue controls are disabled until the workspace API returns the edit version.</p>}{message && <p role="status" className={styles.formStatus}>{message}</p>}</section>
        <section className={styles.contactModalSection}><div className={styles.sectionTitle}><h3>Activity timeline</h3><span>{detailLoading ? "Loading…" : `${activities.length} recorded`}</span></div>{detailLoading ? <p>Loading activity history…</p> : activities.length === 0 ? <p className={styles.unavailable}>No activity has been recorded yet.</p> : <ol className={styles.activityTimeline}>{activities.map((activity) => <li key={activity.id}><strong>{activity.activityKind}</strong> · {formatDate(activity.occurredAt)}<br />{activity.summary ?? "No summary"}</li>)}</ol>}</section>
      </>}
    </section>
  </div>;
}
