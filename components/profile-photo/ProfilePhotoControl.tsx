"use client";

import { useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";

import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { ProfileAvatar } from "./ProfileAvatar";
import styles from "./profile-photo.module.css";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 4 * 1024 * 1024;

type PhotoResponse = { photoUrl?: string | null; error?: string };

async function readResponse(response: Response): Promise<PhotoResponse> {
  try {
    const payload = await response.json() as unknown;
    return payload && typeof payload === "object" ? payload as PhotoResponse : {};
  } catch {
    return {};
  }
}

export function ProfilePhotoControl({
  name,
  photoUrl,
  preview,
  onPhotoChange,
}: {
  name: string;
  photoUrl?: string | null;
  preview: boolean;
  onPhotoChange: (photoUrl: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);
  const normalizedPhotoUrl = photoUrl?.trim() || null;

  function clearInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  async function upload(file: File) {
    if (busy) return;
    setFeedback(null);
    if (file.size === 0) {
      setFeedback({ message: "Choose an image file that is not empty.", error: true });
      clearInput();
      return;
    }
    if (!acceptedTypes.has(file.type)) {
      setFeedback({ message: "Choose a JPEG, PNG, or WebP image.", error: true });
      clearInput();
      return;
    }
    if (file.size > maxBytes) {
      setFeedback({ message: "Choose an image 4 MB or smaller.", error: true });
      clearInput();
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await authenticatedFetch("/api/profile-photo", { method: "POST", body });
      const payload = await readResponse(response);
      if (!response.ok || !payload.photoUrl) throw new Error(payload.error ?? "Your photo could not be uploaded.");
      onPhotoChange(payload.photoUrl);
      setFeedback({ message: "Profile photo updated.", error: false });
    } catch (cause) {
      setFeedback({ message: cause instanceof Error ? cause.message : "Your photo could not be uploaded.", error: true });
    } finally {
      setBusy(false);
      clearInput();
    }
  }

  async function remove() {
    if (busy) return;
    setFeedback(null);
    setBusy(true);
    try {
      const response = await authenticatedFetch("/api/profile-photo", { method: "DELETE" });
      const payload = await readResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "Your photo could not be removed.");
      onPhotoChange(payload.photoUrl ?? null);
      setFeedback({ message: "Profile photo removed.", error: false });
    } catch (cause) {
      setFeedback({ message: cause instanceof Error ? cause.message : "Your photo could not be removed.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.control} aria-labelledby="profile-photo-heading">
      <ProfileAvatar name={name} photoUrl={normalizedPhotoUrl} size="large" />
      <div className={styles.copy}>
        <h3 id="profile-photo-heading">Profile photo</h3>
        <p>JPEG, PNG, or WebP. Maximum file size 4 MB.</p>
        {preview ? <p className={styles.previewNote}>Photo changes are disabled in this fictional preview.</p> : (
          <div className={styles.actions}>
            <label className={styles.uploadButton}>
              <Upload size={15} aria-hidden="true" />
              <span>{normalizedPhotoUrl ? "Replace photo" : "Upload photo"}</span>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }} />
            </label>
            {normalizedPhotoUrl && <button type="button" className={styles.removeButton} disabled={busy} onClick={() => void remove()}><Trash2 size={15} aria-hidden="true" />Remove</button>}
          </div>
        )}
        {busy && <p className={styles.status} role="status"><Camera size={14} aria-hidden="true" />Saving photo…</p>}
        {feedback && <p className={feedback.error ? styles.error : styles.status} role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
      </div>
    </section>
  );
}
