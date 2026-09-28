"use client";

import { useEffect, useState } from "react";
import { AlertCircle, RefreshCw, ShieldCheck } from "lucide-react";

import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { DataLoading } from "@/components/DataLoading";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfilePhotoControl } from "./ProfilePhotoControl";

export type AdminProfilePhotoResponse = {
  fullName: string;
  email: string;
  photoUrl: string | null;
  eligible: boolean;
  reason: string | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAdminProfilePhotoResponse(value: unknown): value is AdminProfilePhotoResponse {
  return isObject(value)
    && typeof value.fullName === "string"
    && typeof value.email === "string"
    && (typeof value.photoUrl === "string" || value.photoUrl === null)
    && typeof value.eligible === "boolean"
    && (typeof value.reason === "string" || value.reason === null)
    && (value.eligible || typeof value.reason === "string");
}

function errorMessage(value: unknown): string | null {
  return isObject(value) && typeof value.error === "string" ? value.error : null;
}

export function AdminProfilePhotoWorkspace({ previewData }: { previewData?: AdminProfilePhotoResponse }) {
  const [loadedProfile, setLoadedProfile] = useState<AdminProfilePhotoResponse | null>(null);
  const [loading, setLoading] = useState(previewData === undefined);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (previewData) {
      return;
    }
    let current = true;
    void authenticatedFetch("/api/profile-photo")
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isAdminProfilePhotoResponse(payload)) {
          throw new Error(errorMessage(payload) ?? "Your profile could not be loaded.");
        }
        if (current) setLoadedProfile(payload);
      })
      .catch((cause: unknown) => {
        if (current) setError(cause instanceof Error ? cause.message : "Your profile could not be loaded.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [previewData, retry]);

  const profile = previewData ?? loadedProfile;

  function retryLoad() {
    setLoading(true);
    setError(null);
    setRetry((value) => value + 1);
  }

  if (loading) {
    return <main className="mx-auto max-w-2xl py-10"><DataLoading label="Loading your profile" /></main>;
  }

  if (error || !profile) {
    return <main className="mx-auto max-w-2xl py-10"><section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-950" role="alert"><AlertCircle className="mb-3 text-rose-700" size={24} /><h1 className="text-lg font-semibold">Profile unavailable</h1><p className="mt-1 text-sm">{error ?? "Your profile could not be loaded."}</p><button type="button" onClick={retryLoad} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#002147] px-3 py-2 text-sm font-semibold text-white"><RefreshCw size={15} />Try again</button></section></main>;
  }

  return <main className="mx-auto max-w-2xl py-6 md:py-10"><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-sky-100 bg-gradient-to-r from-[#002147] to-[#123b68] px-6 py-7 text-white"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Admin account</p><h1 className="mt-2 text-2xl font-semibold">Your profile</h1><p className="mt-2 max-w-xl text-sm text-sky-100">Manage the personal photo that appears with your account.</p></header><div className="p-6 md:p-8"><div className="mb-7 flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><ProfileAvatar name={profile.fullName} photoUrl={profile.photoUrl} size="large" /><div className="min-w-0"><h2 className="truncate font-semibold text-[#002147]">{profile.fullName}</h2><p className="truncate text-sm text-slate-600">{profile.email}</p></div></div>{profile.eligible ? <ProfilePhotoControl name={profile.fullName} photoUrl={profile.photoUrl} preview={previewData !== undefined} onPhotoChange={(photoUrl) => setLoadedProfile((current) => current ? { ...current, photoUrl } : current)} /> : <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><ShieldCheck className="mb-2 text-amber-700" size={20} /><h2 className="font-semibold">Photo changes are unavailable</h2><p className="mt-1 text-sm">{profile.reason}</p></section>}<p className="mt-5 text-xs leading-5 text-slate-500">Your photo is personal to your account. It is separate from startup organization branding.</p></div></section></main>;
}
