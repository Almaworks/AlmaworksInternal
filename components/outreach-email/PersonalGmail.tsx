"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { outreachFetch } from "@/app/dashboard/admin/outreach/components/authenticated-fetch";
import styles from "./outreach-email.module.css";

type Delivery = { id: string; sender: string; recipient: string; subject: string; status: string; createdAt: string; threadId: string | null };
type Connection = { configured: boolean; profileId: string; ownsConversation: boolean; email: string | null; unresolved?: Delivery | null; messages: Delivery[] };
type Props = { semesterId: string; opportunityId?: string | null; recipient?: string; draft: { subject: string; body: string } | null; unsavedDraft: { subject: string; body: string }; onSent: () => void; onBusyChange: (busy: boolean) => void; onRestoreDraft: (draft: { subject: string; body: string }) => void };
export function PersonalGmail({ semesterId, opportunityId, recipient, draft, unsavedDraft, onSent, onBusyChange, onRestoreDraft }: Props) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const busyRef = useRef(false);
  const restore = useRef(onRestoreDraft);
  restore.current = onRestoreDraft;
  const key = useRef(crypto.randomUUID());
  const storageKey = `outreach-gmail-pending:${semesterId}:${opportunityId ?? "library"}`;
  const load = useCallback(async () => {
    const query = new URLSearchParams({ semesterId }); if (opportunityId) query.set("opportunityId", opportunityId);
    const response = await outreachFetch(`/api/admin/outreach/gmail?${query}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? "Gmail connection could not be loaded.");
    setConnection(result as Connection);
    const draftKey = `outreach-gmail-draft:${result.profileId}:${semesterId}:${opportunityId ?? "library"}`;
    const saved = sessionStorage.getItem(draftKey);
    if (saved) {
      sessionStorage.removeItem(draftKey);
      try { const parsed: unknown = JSON.parse(saved); if (parsed && typeof parsed === "object" && "subject" in parsed && typeof parsed.subject === "string" && "body" in parsed && typeof parsed.body === "string" && "expires" in parsed && typeof parsed.expires === "number" && parsed.expires > Date.now()) restore.current({ subject: parsed.subject, body: parsed.body }); } catch { /* Invalid or expired local draft is ignored. */ }
    }
  }, [opportunityId, semesterId]);
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) { key.current = saved; setPending(true); }
    void load().catch(cause => setError(cause instanceof Error ? cause.message : "Gmail unavailable."));
    const status = new URLSearchParams(window.location.search).get("gmail");
    if (status === "connected") setNotice("Gmail connected. Open a contact, review the draft, then send from your mailbox.");
    if (status === "failed") setError("Gmail connection did not finish. Try connecting again; check Google consent and the registered callback address.");
  }, [load, storageKey]);

  async function action(name: "connect" | "disconnect" | "send" | "review") {
    if (busyRef.current) return;
    if (name === "send" && (!draft || !recipient || !connection?.email || pending || connection.unresolved)) return;
    busyRef.current = true; setBusy(true); onBusyChange(true); setError(""); setNotice("");
    try {
      if (name === "send") { sessionStorage.setItem(storageKey, key.current); setPending(true); }
      const response = await outreachFetch("/api/admin/outreach/gmail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, semesterId, opportunityId, messageId: name === "review" ? connection?.unresolved?.id : undefined, ...(name === "send" ? { ...draft, recipient, sender: connection?.email, requestKey: key.current } : {}) }) });
      const result = await response.json();
      if (!response.ok) {
        // Safe pre-send failures allow correction. Network/5xx remain locked for inspection.
        if (name === "send" && [400,401,403,409,413].includes(response.status)) { sessionStorage.removeItem(storageKey); setPending(false); key.current = crypto.randomUUID(); }
        throw new Error(result.error?.message ?? "Gmail action failed. Check history and Gmail Sent before trying another email.");
      }
      if (name === "connect") { if (connection?.profileId) sessionStorage.setItem(`outreach-gmail-draft:${connection.profileId}:${semesterId}:${opportunityId ?? "library"}`, JSON.stringify({ ...unsavedDraft, expires: Date.now() + 600_000 })); window.location.assign(result.authorizationUrl); return; }
      if (name === "send") {
        if (result.message?.status === "sent") { sessionStorage.removeItem(storageKey); setPending(false); key.current = crypto.randomUUID(); onSent(); setNotice(result.stageUpdate === "pending" ? "Email sent, but the stage could not be updated. Refresh the contact and update its stage manually; do not resend the email." : result.stageUpdate === "updated" ? "Sent through your Gmail. Stage updated to Contacted. Delivery and replies have not been confirmed." : "Sent through your Gmail. Delivery and replies have not been confirmed."); }
        else if (result.message?.status === "rejected") { sessionStorage.removeItem(storageKey); setPending(false); key.current = crypto.randomUUID(); setError("Google rejected this email. Check your Gmail connection and draft before sending again."); }
        else setNotice("Sending result is uncertain. Check Gmail Sent before starting another email; this request will not be resent automatically.");
      }
      if (name === "review") { sessionStorage.removeItem(storageKey); setPending(false); key.current = crypto.randomUUID(); setNotice("Marked as manually reviewed. No email was sent."); }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gmail action failed."); await load().catch(() => undefined); }
    finally { busyRef.current = false; setBusy(false); onBusyChange(false); }
  }

  return <section className={styles.card} aria-label="Personal Gmail sending">
    <h2>Your Gmail</h2>
    <p className={styles.muted}>Send individually from your own connected mailbox. You must own the contact’s conversation. Gmail sending is separate from program notifications.</p>
    {error && <p className={styles.notice} role="alert">{error}</p>}
    {notice && <p className={styles.status} role="status">{notice}</p>}
    {connection && !connection.configured && <p className={styles.notice}>Gmail setup is pending. Drafts and templates still work. An administrator needs to finish the server and Google connection setup.</p>}
    {connection?.configured && <><p><strong>From:</strong> {connection.email ?? "No Gmail account connected"}</p><div className={styles.actions}>
      <button type="button" className={styles.secondary} disabled={busy || pending} onClick={() => void action("connect")}>{connection.email ? "Reconnect Gmail" : "Connect your Gmail"}</button>
      {connection.email && <button type="button" className={styles.secondary} disabled={busy || pending} onClick={() => void action("disconnect")}>Disconnect Gmail</button>}
    </div><p className={styles.muted}>Disconnect removes Almaworks’ stored Gmail credential. It does not change your Calendar connection.</p></>}
    {opportunityId && <><p className={styles.muted}>Review the recipient and personalized preview above. This sends immediately; scheduled sending and reply synchronization are not included yet.</p>{connection && !connection.ownsConversation && <p className={styles.notice}>Assign this conversation to yourself in Outreach before sending from your Gmail.</p>}<button type="button" className={styles.primary} disabled={busy || pending || !!connection?.unresolved || !connection?.email || !connection.ownsConversation || !draft || !recipient} onClick={() => void action("send")}>{busy ? "Working…" : "Send from my Gmail"}</button></>}
    {(pending || connection?.unresolved) && <p className={styles.notice}>A send request needs review. Check Gmail Sent before continuing. <button type="button" className={styles.secondary} disabled={busy} onClick={() => { if (window.confirm("Have you checked Gmail Sent? Marking this request reviewed allows another email to this contact. Nothing will be sent by this review action.")) { if (connection?.unresolved) void action("review"); else { sessionStorage.removeItem(storageKey); setPending(false); setNotice("No unresolved history record is loaded. The same request key is retained to prevent resending an accepted request."); } } }}>I checked Gmail Sent</button></p>}
    <div className={styles.actions}><h3>Gmail history</h3><button type="button" className={styles.secondary} disabled={busy} onClick={() => void load().catch(() => setError("Could not refresh Gmail history."))}>Refresh history</button></div>
    <ul className={styles.history}>{connection?.messages.map(message => <li key={message.id}><div><strong>{message.subject}</strong><small>{message.sender} → {message.recipient}</small><small>{new Date(message.createdAt).toLocaleString()}</small><span>{message.status === "sending" || message.status === "unknown" ? "Unconfirmed — check Gmail Sent" : message.status === "sent" ? "Sent through Gmail" : message.status === "reviewed" ? "Manually reviewed — delivery unverified" : "Rejected by Google"}</span></div>{message.threadId && /^[a-zA-Z0-9_-]+$/.test(message.threadId) && <a target="_blank" rel="noreferrer" href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(message.sender)}#all/${message.threadId}`}>Open in Gmail</a>}</li>)}</ul>
  </section>;
}
