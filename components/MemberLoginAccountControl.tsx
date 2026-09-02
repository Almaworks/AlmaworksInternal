"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { createClient } from "@/utils/supabase/client";
import {
  memberLoginPresentation,
  type MemberLoginPresentation,
  type MemberLoginState,
} from "@/src/auth/member-login-account";
import type { MemberLoginRemovalPreview } from "@/src/auth/member-login-account-server";
import {
  acceptMemberLoginPreflight,
  beginMemberLoginMutation,
  beginMemberLoginPreflight,
  completeMemberLoginRemoval,
  completeMemberLoginRestoration,
  containFocusIndex,
  createMemberLoginInteraction,
  failMemberLoginMutation,
  LatestMemberLoginPreflight,
  markMemberLoginPartialRemoval,
  memberLoginRequestHeaders,
  recordMemberLoginRefresh,
  synchronizeMemberLoginPresentation,
  type MemberLoginOperationMode,
} from "./member-login-account-model";

export type MemberLoginAccountControlProps = {
  profileId: string;
  name: string;
  email: string;
  authUserId: string | null;
  profileActive: boolean;
  canRemoveMemberLogin: boolean;
  accountPresentation?: MemberLoginPresentation;
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
      ...memberLoginRequestHeaders(data.session.access_token),
      ...init?.headers,
    },
  });
  const body = await response.json() as ApiEnvelope<T>;
  return { body, response };
}

function operationMode(presentation: MemberLoginPresentation): MemberLoginOperationMode {
  return presentation.action === "restore" ? "restore" : "remove";
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
  accountPresentation,
  onChanged,
}: MemberLoginAccountControlProps) {
  const controlledPresentation = accountPresentation ?? initialPresentation(authUserId, profileActive);
  const controlledAction = controlledPresentation.action;
  const controlledLabel = controlledPresentation.label;
  const controlledState = controlledPresentation.state;
  const controlledTone = controlledPresentation.tone;
  const [presentation, setPresentation] = useState(controlledPresentation);
  const [interaction, setInteraction] = useState(() => createMemberLoginInteraction(operationMode(controlledPresentation)));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [preview, setPreview] = useState<MemberLoginRemovalPreview | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const preflightRef = useRef(new LatestMemberLoginPreflight());
  const mutationInFlightRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  const pending = interaction.pending;
  const isRestoration = interaction.mode === "restore";
  const removalReady = reason.trim().replace(/\s/gu, "").length >= 3 && confirmation === "REMOVE";
  const currentStatus = accountStatuses[presentation.state];

  useEffect(() => {
    const nextPresentation: MemberLoginPresentation = {
      action: controlledAction,
      label: controlledLabel,
      state: controlledState,
      tone: controlledTone,
    };
    if (!dialogOpen || interaction.completed === null) setPresentation(nextPresentation);
    setInteraction((current) => synchronizeMemberLoginPresentation(
      current,
      operationMode(nextPresentation),
      dialogOpen,
    ));
  }, [
    controlledAction,
    controlledLabel,
    controlledState,
    controlledTone,
    dialogOpen,
    interaction.completed,
  ]);

  const closeDialog = useCallback(() => {
    if (pending) return;
    preflightRef.current.invalidate();
    dialogRef.current?.close();
    setDialogOpen(false);
    setPreview(null);
    setLoadingPreview(false);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, [pending]);

  useEffect(() => {
    if (!dialogOpen) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [dialogOpen]);

  useEffect(() => () => preflightRef.current.invalidate(), []);

  const loadPreview = useCallback(async () => {
    const request = preflightRef.current.begin();
    setPreview(null);
    setInteraction((current) => beginMemberLoginPreflight(current));
    setLoadingPreview(true);
    setErrorMessage(null);
    try {
      const { body, response } = await accountRequest<MemberLoginRemovalPreview>(profileId, {
        signal: request.signal,
      });
      if (!preflightRef.current.isCurrent(request.id)) return;
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Account impact could not be loaded.");
      setPreview(body.data);
      const previewPresentation = memberLoginPresentation({
        authUserId: body.data.hasLogin ? "linked" : null,
        latestRemovalAuditAction: body.data.alreadyPrepared ? "member.login_removal_prepared" : null,
        profileActive: body.data.profileActive,
      });
      setPresentation(previewPresentation);
      setInteraction((current) => acceptMemberLoginPreflight(
        synchronizeMemberLoginPresentation(current, operationMode(previewPresentation), true),
      ));
    } catch (cause) {
      if (!preflightRef.current.isCurrent(request.id)) return;
      setErrorMessage(cause instanceof Error ? cause.message : "Account impact could not be loaded.");
    } finally {
      if (preflightRef.current.isCurrent(request.id)) setLoadingPreview(false);
    }
  }, [profileId]);

  const openDialog = () => {
    setDialogOpen(true);
    setReason("");
    setConfirmation("");
    setErrorMessage(null);
    setCopied(false);
    setInteraction(beginMemberLoginPreflight(createMemberLoginInteraction(operationMode(presentation))));
    void loadPreview();
  };

  const refreshMembers = useCallback(async () => {
    try {
      await onChanged();
      setInteraction((current) => recordMemberLoginRefresh(current, true));
    } catch {
      setInteraction((current) => recordMemberLoginRefresh(current, false));
    }
  }, [onChanged]);

  const submit = async () => {
    if (pending) return;
    if (mutationInFlightRef.current) return;
    if (!preview) return;
    if (!isRestoration && !removalReady) return;
    const started = beginMemberLoginMutation(interaction, removalReady);
    if (started === interaction) return;
    mutationInFlightRef.current = true;
    setInteraction(started);
    setErrorMessage(null);
    try {
      if (isRestoration) {
        const { body, response } = await accountRequest<RestorationResult>(profileId, {
          method: "POST",
          body: JSON.stringify({ confirmation: "RESTORE" }),
        });
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Login could not be restored.");
        setPresentation({ action: "remove", label: "Login enabled", state: "enabled", tone: "success" });
        setInteraction((current) => completeMemberLoginRestoration(current, body.data!));
      } else {
        const { body, response } = await accountRequest<{ removed: true }>(profileId, {
          method: "DELETE",
          body: JSON.stringify({ confirmation: "REMOVE", reason }),
        });
        if (response.status === 502) {
          setPresentation({ action: "retry_removal", label: "Removal incomplete", state: "removal_incomplete", tone: "warning" });
          setInteraction((current) => markMemberLoginPartialRemoval(current));
          await refreshMembers();
          return;
        }
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Login account could not be removed.");
        setPresentation({ action: "restore", label: "Login removed", state: "removed", tone: "muted" });
        setInteraction((current) => completeMemberLoginRemoval(current));
      }
      await refreshMembers();
    } catch (cause) {
      setInteraction((current) => failMemberLoginMutation(current));
      setErrorMessage(cause instanceof Error ? cause.message : "The login account could not be updated.");
    } finally {
      mutationInFlightRef.current = false;
    }
  };

  const copyLink = async () => {
    if (!interaction.actionLink) return;
    try {
      await navigator.clipboard.writeText(interaction.actionLink);
      setCopied(true);
    } catch {
      setErrorMessage("The link could not be copied. Select and copy it manually.");
    }
  };

  const dialogTitle = interaction.completed === "remove"
    ? "Login removed"
    : interaction.completed === "restore"
      ? "Sign-in restored"
      : isRestoration
        ? "Restore login"
        : actionLabel(presentation);
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

    {dialogOpen && <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); closeDialog(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeDialog();
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.offsetParent !== null);
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
        const nextIndex = containFocusIndex(
          currentIndex < 0 ? (event.shiftKey ? 0 : focusable.length - 1) : currentIndex,
          event.shiftKey ? -1 : 1,
          focusable.length,
        );
        if (nextIndex >= 0 && (
          currentIndex < 0
          || (event.shiftKey && currentIndex === 0)
          || (!event.shiftKey && currentIndex === focusable.length - 1)
        )) {
          event.preventDefault();
          focusable[nextIndex]?.focus();
        }
      }}
      className="m-auto max-h-[92vh] w-[calc(100%_-_1rem)] max-w-xl overflow-y-auto rounded-2xl bg-white p-0 shadow-2xl backdrop:bg-slate-950/45 sm:w-[calc(100%_-_3rem)]"
    >
      <section
        className="w-full p-5 sm:p-6"
      >
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Account access</p>
            <h2 id={titleId} className="mt-1 text-xl font-semibold text-[#002147]">{dialogTitle}</h2>
            <p className="mt-1 break-words text-sm text-slate-600">{impactName} · <span className="break-all">{impactEmail}</span></p>
          </div>
          <span className={`shrink-0 self-start rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[currentStatus.tone]}`}>{currentStatus.label}</span>
        </div>

        <p id={descriptionId} className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
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
        {interaction.primaryMessage && <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{interaction.primaryMessage}</p>}
        {interaction.refreshMessage && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{interaction.refreshMessage}</p>}

        {interaction.mustSendLink && interaction.actionLink && <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <p className="font-semibold">You must now send the generated link to the member so they can sign in.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input aria-label="Generated sign-in link" readOnly value={interaction.actionLink} className="min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs" />
            <button type="button" onClick={() => void copyLink()} className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold">{copied ? "Copied" : "Copy link"}</button>
          </div>
        </div>}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" disabled={pending} onClick={closeDialog} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
          {interaction.refreshRequired
            ? <button type="button" disabled={pending} onClick={() => void refreshMembers()} className="rounded-xl bg-[#002147] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Retry refresh</button>
            : interaction.completed !== null
              ? null
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
    </dialog>}
  </div>;
}
