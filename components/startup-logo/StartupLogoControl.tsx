"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Trash2, Upload } from "lucide-react";

import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import styles from "./startup-logo.module.css";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 4 * 1024 * 1024;

interface LogoResponse {
  logoUrl?: string | null;
  eligible?: boolean;
  companyName?: string | null;
  reason?: string | null;
  error?: string;
}

async function readResponse(response: Response): Promise<LogoResponse> {
  try {
    const payload: unknown = await response.json();
    return payload && typeof payload === "object" ? payload as LogoResponse : {};
  } catch {
    return {};
  }
}

export function StartupLogoControl({ companyName, preview }: { companyName: string; preview: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [loading, setLoading] = useState(!preview);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error: boolean } | null>(null);

  const refresh = useCallback(async () => {
    const response = await authenticatedFetch("/api/startup-logo", { cache: "no-store" });
    const payload = await readResponse(response);
    if (!response.ok) throw new Error(payload.error ?? "Your startup logo could not be loaded.");
    setLogoUrl(payload.logoUrl ?? null);
    setImageError(false);
    setEligible(payload.eligible === true);
    if (payload.eligible === false) setFeedback({ message: payload.reason ?? "An active startup assignment is required.", error: true });
  }, []);

  useEffect(() => {
    if (preview) return;
    let active = true;
    void refresh().catch((cause: unknown) => {
      if (active) setFeedback({ message: cause instanceof Error ? cause.message : "Your startup logo could not be loaded.", error: true });
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [preview, refresh]);

  async function upload(file: File) {
    if (busy) return;
    setFeedback(null);
    if (file.size === 0 || file.size > maxBytes || !acceptedTypes.has(file.type)) {
      setFeedback({ message: "Choose a non-empty JPEG, PNG, or WebP image up to 4 MiB.", error: true });
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    let saved = false;
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await authenticatedFetch("/api/startup-logo", { method: "POST", body });
      const payload = await readResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "Your startup logo could not be uploaded.");
      saved = true;
      await refresh();
      setFeedback({ message: "Startup logo updated.", error: false });
    } catch (cause) {
      setFeedback({ message: saved ? "Logo saved, but its preview could not refresh. Reload this page." : cause instanceof Error ? cause.message : "Your startup logo could not be uploaded.", error: true });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (busy) return;
    setFeedback(null);
    setBusy(true);
    let saved = false;
    try {
      const response = await authenticatedFetch("/api/startup-logo", { method: "DELETE" });
      const payload = await readResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "Your startup logo could not be removed.");
      saved = true;
      await refresh();
      setFeedback({ message: "Startup logo removed.", error: false });
    } catch (cause) {
      setFeedback({ message: saved ? "Logo removed, but its preview could not refresh. Reload this page." : cause instanceof Error ? cause.message : "Your startup logo could not be removed.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return <section className={styles.control} aria-labelledby="startup-logo-heading">
    <div className={styles.preview}>
      {logoUrl && !preview && !imageError ? <img src={logoUrl} alt={`${companyName} logo`} onError={() => setImageError(true)} /> : <Building2 size={30} aria-hidden="true" />}
    </div>
    <div className={styles.copy}>
      <h3 id="startup-logo-heading">Company logo</h3>
      <p>JPEG, PNG, or WebP. Up to 4 MiB.</p>
      {preview ? <p className={styles.note}>Logo changes are disabled in this fictional preview.</p> : (
        <div className={styles.actions}>
          <label className={styles.uploadButton}>
            <Upload size={15} aria-hidden="true" />
            <span>{logoUrl ? "Replace logo" : "Upload logo"}</span>
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || loading || !eligible} onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }} />
          </label>
          {logoUrl && <button type="button" className={styles.removeButton} disabled={busy || loading || !eligible} onClick={() => void remove()}><Trash2 size={15} aria-hidden="true" />Remove logo</button>}
        </div>
      )}
      {(loading || busy) && <p className={styles.status} role="status">{busy ? "Saving logo…" : "Loading logo…"}</p>}
      {imageError && <p className={styles.error} role="alert">Logo preview is unavailable. You can replace or remove it.</p>}
      {feedback && <p className={feedback.error ? styles.error : styles.status} role={feedback.error ? "alert" : "status"}>{feedback.message}</p>}
    </div>
  </section>;
}
