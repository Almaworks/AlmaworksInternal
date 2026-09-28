import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../db/types.ts';
import type { FridaySpeaker } from '../friday-program/types.ts';
import { renderFridaySpeakerEmail } from './friday-speaker-email.ts';
import { submitSequenzyNotification, type SequenzySubmission } from './sequenzy.ts';

export type FridaySpeakerDeliverySummary = {
  accepted: number;
  queued: number;
  rejected: number;
  unknown: number;
  skipped: number;
};

type Input = {
  client: SupabaseClient<Database>;
  semesterId: string;
  meetingId: string;
  previousSpeaker: FridaySpeaker | null;
  currentSpeaker: FridaySpeaker;
  appOrigin: string | null;
  apiKey: string | null;
  submit?: typeof submitSequenzyNotification;
};

export function speakerAnnouncementChanged(previous: FridaySpeaker | null, current: FridaySpeaker): boolean {
  if (!previous) return true;
  return ['name', 'bio', 'expertise', 'topic'].some((field) => previous[field as keyof FridaySpeaker]?.trim() !== current[field as keyof FridaySpeaker]?.trim());
}

function failure(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`Friday speaker notification ${operation} failed: ${error.message}`);
}

export async function dispatchFridaySpeakerAnnouncement(input: Input): Promise<FridaySpeakerDeliverySummary> {
  const summary: FridaySpeakerDeliverySummary = { accepted: 0, queued: 0, rejected: 0, unknown: 0, skipped: 0 };
  if (!speakerAnnouncementChanged(input.previousSpeaker, input.currentSpeaker)) return summary;

  const [meetingResult, speakerResult, membershipResult] = await Promise.all([
    input.client.from('meetings').select('meeting_date,friday_canceled_at').eq('semester_id', input.semesterId).eq('id', input.meetingId).maybeSingle(),
    input.client.from('friday_speakers').select('name,bio,expertise,topic,updated_at').eq('semester_id', input.semesterId).eq('meeting_id', input.meetingId).maybeSingle(),
    input.client.from('semester_memberships').select('profile_id').eq('semester_id', input.semesterId).eq('role', 'startup').eq('status', 'active'),
  ]);
  failure(meetingResult.error, 'meeting read');
  failure(speakerResult.error, 'speaker read');
  failure(membershipResult.error, 'recipient read');
  if (!meetingResult.data || !speakerResult.data || meetingResult.data.friday_canceled_at) return summary;
  const savedSpeaker = speakerResult.data;
  if (['name', 'bio', 'expertise', 'topic'].some((field) => savedSpeaker[field as keyof typeof savedSpeaker] !== input.currentSpeaker[field as keyof FridaySpeaker])) return summary;

  const ids = [...new Set((membershipResult.data ?? []).map((membership) => membership.profile_id))];
  if (ids.length === 0) return summary;
  const profileResult = await input.client.from('profiles').select('id,email').in('id', ids).eq('status', 'approved').eq('is_active', true);
  failure(profileResult.error, 'profile read');
  const eventKind = input.previousSpeaker ? 'friday_speaker_updated' : 'friday_speaker_confirmed';
  let message: ReturnType<typeof renderFridaySpeakerEmail> | null = null;
  if (input.apiKey && input.appOrigin) {
    try {
      message = renderFridaySpeakerEmail({
        appOrigin: input.appOrigin,
        semesterId: input.semesterId,
        meetingId: input.meetingId,
        meetingDate: meetingResult.data.meeting_date,
        speakerName: input.currentSpeaker.name,
        topic: input.currentSpeaker.topic,
        bio: input.currentSpeaker.bio,
        status: input.previousSpeaker ? 'updated' : 'confirmed',
      });
    } catch {
      // Keep the record queued until a verified public HTTPS origin is configured.
    }
  }

  for (const profile of profileResult.data ?? []) {
    const email = profile.email.trim().toLowerCase();
    if (!email) continue;
    const existing = await input.client.from('notification_deliveries').select('id,status,recipient_email')
      .eq('semester_id', input.semesterId).eq('source_id', input.meetingId)
      .eq('source_version', savedSpeaker.updated_at).eq('recipient_profile_id', profile.id)
      .limit(1).maybeSingle();
    failure(existing.error, 'duplicate check');
    if (existing.data && existing.data.status !== 'queued') { summary.skipped += 1; continue; }
    if (existing.data && existing.data.recipient_email !== email) {
      const suppressed = await input.client.from('notification_deliveries').update({ status: 'suppressed', last_error: 'Recipient address changed before submission.', updated_at: new Date().toISOString() }).eq('id', existing.data.id).eq('status', 'queued');
      failure(suppressed.error, 'address suppression');
      summary.skipped += 1;
      continue;
    }
    let deliveryId = existing.data?.id ?? null;
    if (!deliveryId) {
      const insert = await input.client.from('notification_deliveries').insert({
        semester_id: input.semesterId,
        event_kind: eventKind,
        source_id: input.meetingId,
        source_version: savedSpeaker.updated_at,
        recipient_profile_id: profile.id,
        recipient_email: email,
        status: 'queued',
      }).select('id').maybeSingle();
      if (insert.error?.code === '23505') { summary.skipped += 1; continue; }
      failure(insert.error, 'queue insert');
      if (!insert.data) throw new Error('Friday speaker notification queue did not return its row.');
      deliveryId = insert.data.id;
    }
    if (!input.apiKey || !message) { summary.queued += 1; continue; }
    const submitting = await input.client.from('notification_deliveries').update({ status: 'submitting', updated_at: new Date().toISOString() }).eq('id', deliveryId).eq('status', 'queued').select('id').maybeSingle();
    failure(submitting.error, 'submission claim');
    if (!submitting.data) { summary.skipped += 1; continue; }
    let result: SequenzySubmission;
    try {
      result = await (input.submit ?? submitSequenzyNotification)({ apiKey: input.apiKey, to: email, subject: message.subject, html: message.html });
    } catch {
      result = { kind: 'unknown', error: 'Sequenzy delivery status is unknown. Check its dashboard before retrying.' };
    }
    const terminal = result.kind === 'accepted' ? 'accepted' : result.kind === 'rejected' ? 'rejected' : 'unknown';
    const update = await input.client.from('notification_deliveries').update({
      status: terminal,
      provider_id: result.kind === 'accepted' ? result.emailSendId : null,
      last_error: result.kind === 'accepted' ? null : result.error,
      updated_at: new Date().toISOString(),
    }).eq('id', deliveryId).eq('status', 'submitting');
    failure(update.error, 'result recording');
    summary[terminal] += 1;
  }
  return summary;
}
