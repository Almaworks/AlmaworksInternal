"use client";

import { useState } from "react";

import { outreachFetch } from "./authenticated-fetch";

export interface EditableOutreachContact {
  id: string;
  fullName: string;
  email: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  biography: string | null;
  expertiseTags: readonly string[];
  notes: string | null;
  updatedAt: string;
}

export interface EditContactFormProps {
  semesterId: string;
  contact: EditableOutreachContact;
  onCancel: () => void;
  onSaved: (contact: EditableOutreachContact) => void;
}

type Fields = Omit<EditableOutreachContact, "id" | "updatedAt">;

function fieldsFrom(contact: EditableOutreachContact): Fields {
  return {
    fullName: contact.fullName,
    email: contact.email,
    linkedinUrl: contact.linkedinUrl,
    phone: contact.phone,
    biography: contact.biography,
    expertiseTags: contact.expertiseTags,
    notes: contact.notes,
  };
}

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function validate(fields: Fields): string | null {
  if (fields.fullName.trim() === "") return "Full name is required.";
  if (fields.email !== null && !/^\S+@\S+\.\S+$/u.test(fields.email)) return "Email must be valid.";
  return null;
}

export function EditContactForm({ semesterId, contact, onCancel, onSaved }: EditContactFormProps) {
  const [fields, setFields] = useState<Fields>(() => fieldsFrom(contact));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = <Key extends keyof Fields>(key: Key, value: Fields[Key]) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized: Fields = {
      ...fields,
      fullName: fields.fullName.trim(),
      email: fields.email === null ? null : text(fields.email)?.toLowerCase() ?? null,
      linkedinUrl: fields.linkedinUrl === null ? null : text(fields.linkedinUrl),
      phone: fields.phone === null ? null : text(fields.phone),
      biography: fields.biography === null ? null : text(fields.biography),
      expertiseTags: fields.expertiseTags.map((tag) => tag.trim()).filter(Boolean),
      notes: fields.notes === null ? null : text(fields.notes),
    };
    const validationError = validate(normalized);
    if (validationError !== null) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await outreachFetch(`/api/admin/outreach/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          semesterId,
          contactId: contact.id,
          updatedAt: contact.updatedAt,
          changes: normalized,
        }),
      });
      const payload = await response.json() as { data?: EditableOutreachContact; error?: { message?: string } };
      if (!response.ok || payload.data === undefined) {
        throw new Error(payload.error?.message ?? "Contact could not be saved.");
      }
      onSaved(payload.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Contact could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={(event) => void submit(event)} aria-label="Edit contact">
    <label>Full name<input required disabled={saving} value={fields.fullName} onChange={(event) => update("fullName", event.target.value)} /></label>
    <label>Email<input type="email" disabled={saving} value={fields.email ?? ""} onChange={(event) => update("email", event.target.value)} /></label>
    <label>LinkedIn URL<input type="url" disabled={saving} value={fields.linkedinUrl ?? ""} onChange={(event) => update("linkedinUrl", event.target.value)} /></label>
    <label>Phone<input disabled={saving} value={fields.phone ?? ""} onChange={(event) => update("phone", event.target.value)} /></label>
    <label>Expertise tags (comma-separated)<input disabled={saving} value={fields.expertiseTags.join(", ")} onChange={(event) => update("expertiseTags", event.target.value.split(","))} /></label>
    <label>Biography<textarea disabled={saving} rows={3} value={fields.biography ?? ""} onChange={(event) => update("biography", event.target.value)} /></label>
    <label>Notes<textarea disabled={saving} rows={3} value={fields.notes ?? ""} onChange={(event) => update("notes", event.target.value)} /></label>
    {error !== null && <p role="alert">{error}</p>}
    <button type="button" disabled={saving} onClick={onCancel}>Cancel</button>
    <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
  </form>;
}
