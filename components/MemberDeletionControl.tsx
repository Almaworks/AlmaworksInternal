'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { authenticatedFetch } from '@/src/auth/authenticated-fetch';
import type { MemberDeletionPreview } from '@/src/auth/member-deletion';
import { DeletionRequestSequence, deletionOutcome, deletionReady, parseDeletionPreview } from './member-deletion-model';

interface Props {
  profileId: string;
  onLocked: () => void;
  onReady: () => void;
  onCompleted: () => void;
  onChanged: () => Promise<void>;
}

function errorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error && typeof payload.error === 'object' && 'message' in payload.error && typeof payload.error.message === 'string') return payload.error.message;
  return 'Deletion could not be completed. Reload the preview to check its current state.';
}

export function MemberDeletionControl({ profileId, onLocked, onReady, onCompleted, onChanged }: Props) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const requests = useRef(new DeletionRequestSequence());
  const busy = useRef(false);
  const mounted = useRef(true);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<MemberDeletionPreview | null>(null);
  const [email, setEmail] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const endpoint = `/api/admin/members/${encodeURIComponent(profileId)}/deletion`;

  useEffect(() => { const sequence = requests.current; mounted.current = true; return () => { mounted.current = false; sequence.invalidate(); }; }, []);
  useEffect(() => {
    if (open) { dialog.current?.showModal(); cancel.current?.focus(); }
    else dialog.current?.close();
  }, [open]);

  function close() {
    if (busy.current) return;
    requests.current.invalidate();
    setOpen(false);
    trigger.current?.focus();
  }

  async function loadPreview() {
    const sequence = requests.current.begin();
    setLoading(true); setPreview(null); setError(null); setEmail(''); setConfirmation('');
    try {
      const response = await authenticatedFetch(endpoint, { cache: 'no-store' });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload));
      const value = parseDeletionPreview(payload, profileId);
      if (!value) throw new Error('The deletion preview is incomplete. Deletion is disabled.');
      if (!mounted.current || !requests.current.current(sequence)) return;
      setPreview(value);
      if (value.status !== 'ready') onLocked();
      else onReady();
      if (value.status === 'completed') { setCompleted(true); onCompleted(); }
    } catch (failure) {
      if (mounted.current && requests.current.current(sequence)) setError(failure instanceof Error ? failure.message : 'Could not load deletion preview.');
    } finally {
      if (mounted.current && requests.current.current(sequence)) setLoading(false);
    }
  }

  async function refresh() {
    setError(null);
    try { await onChanged(); if (mounted.current) setRefreshed(true); }
    catch { if (mounted.current) setError('Deletion is complete, but the Members list could not refresh. Retry the refresh.'); }
  }

  async function submit() {
    if (busy.current || completed || loading || !deletionReady(preview, email, confirmation, reason)) return;
    busy.current = true; setSubmitting(true); setError(null); onLocked();
    requests.current.invalidate();
    try {
      const response = await authenticatedFetch(endpoint, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationEmail: email.trim(), confirmation, reason: reason.trim(), version: preview!.version }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(payload));
      const data = payload && typeof payload === 'object' && 'data' in payload ? payload.data : null;
      if (!data || typeof data !== 'object' || !('profileId' in data) || data.profileId !== profileId || !('status' in data) || data.status !== 'completed') throw new Error('Completion could not be verified. Reload the preview before continuing.');
      if (!mounted.current) return;
      setCompleted(true); setPreview(null); setEmail(''); setReason(''); setConfirmation('');
      onCompleted();
      await refresh();
    } catch (failure) {
      if (mounted.current) { setPreview(null); setConfirmation(''); setError(failure instanceof Error ? failure.message : 'Deletion was interrupted. Reload the preview to recover.'); }
    } finally { busy.current = false; if (mounted.current) setSubmitting(false); }
  }

  const outcome = deletionOutcome(completed ? 'completed' : preview?.status ?? 'ready', refreshed);
  const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
  return <>
    <button ref={trigger} type="button" className="mt-2 block text-xs text-red-700 hover:underline" onClick={() => { setOpen(true); if (!completed) void loadPreview(); }}>
      {completed ? 'Personal data deleted' : 'Delete account and personal data'}
    </button>
    <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); close(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 text-left whitespace-normal shadow-xl backdrop:bg-black/40">
      <h2 id={`${id}-title`} className="text-lg font-semibold text-gray-900">Delete account and personal data</h2>
      <p id={`${id}-description`} className="mt-2 text-sm text-gray-600">This permanently removes login access, personal details and personal files. Historical activity is anonymized. Shared startups and teammates remain. This cannot be undone.</p>
      {completed ? <p role="status" className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">Deletion complete. Historical activity has been anonymized.</p> : <>
        {loading && <p role="status" className="mt-4 text-sm">Loading deletion preview…</p>}
        {preview && <div className="mt-4 space-y-3 text-sm">
          <p className="break-words font-medium text-gray-900">{preview.fullName} · {preview.email}</p>
          <div className="space-y-3 rounded-lg border border-gray-200 p-3">
            <div><h3 className="font-medium">Affected semesters</h3><p className="text-gray-600">{preview.impact.semesters.join(', ') || 'No semester memberships'}</p></div>
            <div><h3 className="font-medium">Shared startups kept</h3><p className="text-gray-600">{preview.impact.sharedStartups.join(', ') || 'No linked startups'}</p></div>
            <div><h3 className="font-medium">Upcoming mentor meetings to cancel</h3>{preview.impact.upcomingMentorMeetings.length ? <ul className="list-disc pl-5 text-gray-600">{preview.impact.upcomingMentorMeetings.map((meeting, index) => <li key={`${index}-${meeting}`}>{meeting}</li>)}</ul> : <p className="text-gray-600">None</p>}</div>
            <p className="text-gray-600">Startup-owned bookings remain available to the remaining team. No cancellation emails or calendar updates are sent.</p>
          </div>
          {preview.status === 'in_progress' && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">Deletion is incomplete. Confirm again to resume cleanup.</p>}
          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-gray-50 p-3">{Object.entries(preview.counts).map(([label, count]) => <div key={label}><dt className="text-gray-600">{label.replace(/([A-Z])/g, ' $1')}</dt><dd className="font-medium">{count}</dd></div>)}</dl>
          {preview.blockers.length > 0 && <ul className="list-disc space-y-1 pl-5 text-red-700">{preview.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
          <label className="block">Reason (at least 10 characters; omit personal details)<textarea required minLength={10} maxLength={500} disabled={submitting} value={reason} onChange={event => setReason(event.target.value)} className={inputClass} /></label>
          <label className="block">Type the member’s email<input required autoComplete="off" disabled={submitting} value={email} onChange={event => setEmail(event.target.value)} className={inputClass} /></label>
          <label className="block">Type DELETE to confirm<input required autoComplete="off" disabled={submitting} value={confirmation} onChange={event => setConfirmation(event.target.value)} className={inputClass} /></label>
        </div>}
      </>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button ref={cancel} type="button" disabled={submitting} onClick={close} className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">{completed ? 'Close' : 'Cancel'}</button>
        {!completed && !loading && !preview && <button type="button" onClick={() => void loadPreview()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Reload preview</button>}
        {outcome.canRetryRefresh && <button type="button" disabled={submitting} onClick={() => void refresh()} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Retry refresh</button>}
        {!completed && <button type="button" disabled={loading || submitting || !deletionReady(preview, email, confirmation, reason)} onClick={() => void submit()} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">{submitting ? 'Deleting…' : outcome.canRetryDeletion ? 'Resume deletion' : 'Permanently delete'}</button>}
      </div>
    </dialog>
  </>;
}
