"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { outreachFetch } from "./authenticated-fetch";
import styles from "../outreach-workspace.module.css";

export function AddContactForm({ semesterId, onClose, onCreated }: { semesterId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ fullName: "", email: "", companyName: "", companyDomain: "", title: "", linkedinUrl: "", phone: "", biography: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  function update(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setStatus(null);
    try {
      const response = await outreachFetch("/api/admin/outreach/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, semesterId }) });
      const payload = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? "Contact could not be created.");
      onCreated(); onClose();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Contact could not be created."); }
    finally { setSaving(false); }
  }
  return <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="add-contact-title"><button className={styles.close} type="button" onClick={onClose} aria-label="Close"><X size={18} /></button><p className={styles.eyebrow}>New relationship</p><h2 id="add-contact-title">Add contact</h2><p className={styles.modalCopy}>Create a person and their first outreach opportunity for this semester.</p><form onSubmit={(event) => void submit(event)}><div className={styles.formGrid}><label>Full name *<input required value={form.fullName} onChange={(event) => update("fullName", event.target.value)} autoFocus /></label><label>Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label>Company<input value={form.companyName} onChange={(event) => update("companyName", event.target.value)} /></label><label>Title<input value={form.title} onChange={(event) => update("title", event.target.value)} /></label><label>Company domain<input placeholder="example.com" value={form.companyDomain} onChange={(event) => update("companyDomain", event.target.value)} /></label><label>LinkedIn URL<input type="url" value={form.linkedinUrl} onChange={(event) => update("linkedinUrl", event.target.value)} /></label><label>Phone<input value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label><label className={styles.fullWidth}>Notes / biography<textarea rows={3} value={form.biography} onChange={(event) => update("biography", event.target.value)} /></label></div>{status && <p className={styles.formError} role="alert">{status}</p>}<div className={styles.modalActions}><button className={styles.secondaryButton} type="button" onClick={onClose}>Cancel</button><button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? "Creating…" : "Create contact"}</button></div></form></section></div>;
}
