"use client";

import { Send } from "lucide-react";
import { useState } from "react";

import { outreachFetch } from "./authenticated-fetch";
import type { WorkspaceRow } from "./types";
import styles from "../outreach-workspace.module.css";

interface ActivityComposerProps { row: WorkspaceRow; semesterId: string; onCommitted: () => void; }

export function ActivityComposer({ row, semesterId, onCommitted }: ActivityComposerProps) {
  const [kind, setKind] = useState<"email" | "call" | "linkedin" | "meeting" | "reply" | "note">("note");
  const [summary, setSummary] = useState("");
  const [channel, setChannel] = useState("other");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const available = row.updatedAt !== undefined;
  const needsChannel = kind === "call" || kind === "meeting" || kind === "reply";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || saving) return;
    setSaving(true); setStatus(null);
    try {
      const activityChannel = kind === "email" ? "email" : kind === "linkedin" ? "linkedin" : needsChannel ? channel : undefined;
      const response = await outreachFetch(`/api/admin/outreach/opportunities/${row.id}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ semesterId, updatedAt: row.updatedAt, occurredAt: new Date().toISOString(), activityKind: kind, channel: activityChannel, summary }),
      });
      if (!response.ok) throw new Error("Could not save activity. Your draft is still here.");
      setSummary(""); setStatus("Activity saved."); onCommitted();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not save activity."); }
    finally { setSaving(false); }
  }

  return <form className={styles.composer} onSubmit={submit}>
    <div className={styles.sectionTitle}><h3>Log activity</h3><span>Append-only history</span></div>
    <div className={styles.composerFields}>
      <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} aria-label="Activity type" disabled={!available || saving}><option value="email">Email</option><option value="call">Call</option><option value="linkedin">LinkedIn</option><option value="meeting">Meeting</option><option value="reply">Reply</option><option value="note">Note</option></select>
      {needsChannel && <select value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="Activity channel"><option value="other">Other</option><option value="warm_intro">Warm intro</option><option value="referral">Referral</option><option value="event">Event</option></select>}
      <input value={summary} onChange={(event) => setSummary(event.target.value)} required placeholder="What happened?" disabled={!available || saving} />
      <button className={styles.primaryButton} disabled={!available || saving}><Send size={15} />{saving ? "Saving…" : "Log"}</button>
    </div>
    {!available && <p className={styles.unavailable}>Logging is unavailable because the workspace response does not include the edit version.</p>}
    {status && <p role="status" className={styles.formStatus}>{status}</p>}
  </form>;
}
