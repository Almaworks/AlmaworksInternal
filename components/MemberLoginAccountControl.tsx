"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import {
  memberLoginPresentation,
  type MemberLoginPresentation,
  type MemberLoginState,
} from "@/src/auth/member-login-account";
import type { MemberLoginRemovalPreview } from "@/src/auth/member-login-account-server";

export type MemberLoginAccountControlProps = {
  profileId: string;
  name: string;
  email: string;
  authUserId: string | null;
  profileActive: boolean;
  canRemoveMemberLogin: boolean;
  initialAccountPresentation?: MemberLoginPresentation;
  onChanged: () => void | Promise<void>;
};

type AccountStatus = Pick<MemberLoginPresentation, "label" | "tone">;

const accountStatuses: Record<MemberLoginState, AccountStatus> = {
  enabled: { label: "Login enabled", tone: "success" },
  disabled: { label: "Account disabled", tone: "warning" },
  removal_incomplete: { label: "Removal incomplete", tone: "warning" },
  removed: { label: "Login removed", tone: "muted" },
  not_configured: { label: "No login", tone: "muted" },
};

const statusClasses: Record<AccountStatus["tone"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  muted: "border-slate-200 bg-slate-100 text-slate-600",
};

type ApiError = {
  code?: string;
  databaseState?: string;
  message?: string;
  reconciliationRequired?: boolean;
};

type ApiEnvelope<T> = { data?: T; error?: ApiError };

type RestorationResult = {
  actionLink: string;
  mustSendLink: true;
  profileActive: true;
  profileId: string;
};

function initialPresentation(authUserId: string | null, profileActive: boolean): MemberLoginPresentation {
  return memberLoginPresentation({
    authUserId,
    latestRemovalAuditAction: null,
    profileActive,
  });
}

async function accountRequest<T>(profileId: string, init?: RequestInit): Promise<{
  body: ApiEnvelope<T>;
  response: Response;
}> {
  const { data, error } = await createClient().auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your session has expired. Sign out and sign in again.");
  }
  const response = await fetch(`/api/admin/members/${encodeURIComponent(profileId)}/login`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      ...init?.headers,
    },
  });
  const body = await response.json() as ApiEnvelope<T>;
  return { body, response };
}

function actionLabel(presentation: MemberLoginPresentation): string {
  if (presentation.action === "retry_removal") return "Retry removal";
  if (presentation.action === "restore") return "Restore login";
  return "Remove login account";
}

export function MemberLoginAccountControl({
  profileId,
  name,
  email,
  authUserId,
  profileActive,
  canRemoveMemberLogin,
  initialAccountPresentation,
  onChanged,
}: MemberLoginAccountControlProps) {
  const initialAccountAction = initialAccountPresentation?.action;
  const initialAccountLabel = initialAccountPresentation?.label;
  const initialAccountState = initialAccountPresentation?.state;
  const initialAccountTone = initialAccountPresentation?.tone;
  const [presentation, setPresentation] = useState(() => initialAccountPresentation ?? initialPresentation(authUserId, profileActive));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<MemberLoginRemovalPreview | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [actionLink, setActionLink] = useState<string | null>(null);
  const [mustSendLink, setMustSendLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const isRestoration = presentation.action === "restore";
  const removalReady = reason.trim().replace(/\s/gu, "").length >= 3 && confirmation === "REMOVE";
  const currentStatus = accountStatuses[presentation.state];

  useEffect(() => {
    setPresentation(
      initialAccountAction && initialAccountLabel && initialAccountState && initialAccountTone
        ? {
            action: initialAccountAction,
            label: initialAccountLabel,
            state: initialAccountState,
            tone: initialAccountTone,
          }
        : initialPresentation(authUserId, profileActive),
    );
  }, [
    authUserId,
    initialAccountAction,
    initialAccountLabel,
    initialAccountState,
    initialAccountTone,
    profileActive,
  ]);

  const closeDialog = useCallback(() => {
    if (pending) return;
    setDialogOpen(false);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, [pending]);

  useEffect(() => {
    if (!dialogOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    cancelRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeDialog, dialogOpen]);

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setErrorMessage(null);
    try {
      const { body, response } = await accountRequest<MemberLoginRemovalPreview>(profileId);
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Account impact could not be loaded.");
      setPreview(body.data);
      setPresentation(memberLoginPresentation({
        authUserId: body.data.hasLogin ? "linked" : null,
        latestRemovalAuditAction: body.data.alreadyPrepared ? "member.login_removal_prepared" : null,
        profileActive: body.data.profileActive,
      }));
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Account impact could not be loaded.");
    } finally {
      setLoadingPreview(false);
    }
  }, [profileId]);

  const openDialog = () => {
    setDialogOpen(true);
    setReason("");
    setConfirmation("");
    setMessage(null);
    setErrorMessage(null);
    setRefreshRequired(false);
    setActionLink(null);
    setMustSendLink(false);
    setCopied(false);
    void loadPreview();
  };

  const refreshMembers = useCallback(async (successMessage?: string) => {
    try {
      await onChanged();
      setRefreshRequired(false);
      if (successMessage) setMessage(successMessage);
    } catch {
      setRefreshRequired(true);
      setMessage("Login updated, but the Members list could not refresh");
    }
  }, [onChanged]);

  const submit = async () => {
    if (pending) return;
    if (!preview) return;
    if (!isRestoration && !removalReady) return;
    setPending(true);
    setErrorMessage(null);
    setMessage(null);
    setRefreshRequired(false);
    try {
      if (isRestoration) {
        const { body, response } = await accountRequest<RestorationResult>(profileId, {
          method: "POST",
          body: JSON.stringify({ confirmation: "RESTORE" }),
        });
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Login could not be restored.");
        setPresentation({ action: "remove", label: "Login enabled", state: "enabled", tone: "success" });
        setActionLink(body.data.actionLink);
        setMustSendLink(body.data.mustSendLink);
        setMessage("Sign-in is restored. Semester membership remains suspended until you restore it separately.");
      } else {
        const { body, response } = await accountRequest<{ removed: true }>(profileId, {
          method: "DELETE",
          body: JSON.stringify({ confirmation: "REMOVE", reason }),
        });
        if (response.status === 502) {
          setPresentation({ action: "retry_removal", label: "Removal incomplete", state: "removal_incomplete", tone: "warning" });
          setErrorMessage("Program access is blocked, but login deletion needs to be retried");
          return;
        }
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Login account could not be removed.");
        setPresentation({ action: "restore", label: "Login removed", state: "removed", tone: "muted" });
        setMessage("Login removed. Contact information and program history were retained.");
      }
      await refreshMembers();
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "The login account could not be updated.");
    } finally {
      setPending(false);
    }
  };

  const copyLink = async () => {
    if (!actionLink) return;
    try {
      await navigator.clipboard.writeText(actionLink);
      setCopied(true);
    } catch {
      setErrorMessage("The link could not be copied. Select and copy it manually.");
    }
  };

  const dialogTitle = isRestoration ? "Restore login" : actionLabel(presentation);
  const impactName = preview?.fullName ?? name;
  const impactEmail = preview?.email ?? email;

  return <div className="flex flex-wrap items-center gap-2">
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[currentStatus.tone]}`}>
      {currentStatus.label}
    </span>
    {canRemoveMemberLogin && <button
      ref={triggerRef}
      type="button"
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#75AADB]"
      onClick={openDialog}
    >
      {actionLabel(presentation)}
    </button>}

    {dialogOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-login-dialog-title"
        aria-describedby="member-login-dialog-description"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Account access</p>
            <h2 id="member-login-dialog-title" className="mt-1 text-xl font-semibold text-[#002147]">{dialogTitle}</h2>
            <p className="mt-1 text-sm text-slate-600">{impactName} · {impactEmail}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[currentStatus.tone]}`}>{currentStatus.label}</span>
        </div>

        <p id="member-login-dialog-description" className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          {isRestoration
            ? "This creates a replacement sign-in for the retained profile. It does not reactivate semester membership."
            : "This removes sign-in access and suspends current program access. Contact information, profile details, semester history, and mentorship sessions will remain available to authorized Almaworks administrators."}
        </p>

        {loadingPreview && <p role="status" className="mt-4 text-sm text-slate-500">Loading account impact…</p>}
        {preview && !isRestoration && <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-slate-200 p-3"><dt className="text-slate-500">Semesters retained</dt><dd className="mt-1 text-lg font-semibold text-[#002147]">{preview.semesterCount}</dd></div>
          <div className="rounded-xl border border-slate-200 p-3"><dt className="text-slate-500">Sessions retained</dt><dd className="mt-1 text-lg font-semibold text-[#002147]">{preview.sessionCount}</dd></div>
          <div className="rounded-xl border border-slate-200 p-3"><dt className="text-slate-500">Memberships suspended</dt><dd className="mt-1 text-lg font-semibold text-[#002147]">{preview.suspendMembershipIds.length}</dd></div>
          <div className="rounded-xl border border-slate-200 p-3"><dt className="text-slate-500">Contact information</dt><dd className="mt-1 font-semibold text-[#002147]">Retained</dd></div>
        </dl>}

        {!isRestoration && <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Reason for removal
            <textarea
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={pending}
              rows={3}
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 font-normal focus:border-[#75AADB] focus:outline-none focus:ring-2 focus:ring-[#75AADB]/30"
              placeholder="Record why sign-in access is being removed"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">Type <span className="font-mono">REMOVE</span> to confirm
            <input
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={pending}
              autoComplete="off"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono font-normal focus:border-[#75AADB] focus:outline-none focus:ring-2 focus:ring-[#75AADB]/30"
            />
          </label>
        </div>}

        {errorMessage && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>}
        {message && <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</p>}

        {mustSendLink && actionLink && <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="font-semibold">You must now send the generated link to the member so they can sign in.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input aria-label="Generated sign-in link" readOnly value={actionLink} className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs" />
            <button type="button" onClick={() => void copyLink()} className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold">{copied ? "Copied" : "Copy link"}</button>
          </div>
        </div>}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" disabled={pending} onClick={closeDialog} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
          {refreshRequired
            ? <button type="button" disabled={pending} onClick={() => void refreshMembers("Members list refreshed.")} className="rounded-xl bg-[#002147] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Retry refresh</button>
            : <button
                type="button"
                disabled={pending || loadingPreview || !preview || (!isRestoration && !removalReady)}
                onClick={() => void submit()}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 ${isRestoration ? "bg-[#002147]" : "bg-red-700 hover:bg-red-800"}`}
              >
                {pending ? "Updating…" : actionLabel(presentation)}
              </button>}
        </div>
      </section>
    </div>}
  </div>;
}
