import type { SupabaseClient } from '@supabase/supabase-js';

import { ALMAWORKS_SUPABASE_URL } from '../calendar/config.ts';
import type { Database } from '../db/types.ts';
import { renderBookingEmail } from './booking-email.ts';
import { submitSequenzyNotification } from './sequenzy.ts';

type Client = SupabaseClient<Database>;

/** Submit a newly saved startup request without requiring a background worker. */
export async function sendSavedBookingRequest(input: {
  client: Client;
  bookingId: string;
  semesterId: string;
  startupProfileId: string;
  startupSemesterId: string;
  env?: Readonly<Record<string, string | undefined>>;
  submit?: typeof submitSequenzyNotification;
}): Promise<'disabled' | 'skipped' | 'accepted' | 'rejected' | 'unknown'> {
  const env = input.env ?? process.env;
  if (env.BOOKING_REQUEST_EMAIL_ENABLED !== 'true') return 'disabled';
  if (env.NEXT_PUBLIC_SUPABASE_URL !== ALMAWORKS_SUPABASE_URL) throw new Error('Booking email Supabase project mismatch.');
  const allowlist = env.BOOKING_REQUEST_EMAIL_SEMESTER_IDS?.split(',').map(value => value.trim()) ?? [];
  if (!allowlist.includes(input.semesterId)) return 'disabled';
  const apiKey = env.SEQUENZY_API_KEY?.trim();
  const appOrigin = env.BOOKING_REQUEST_EMAIL_ORIGIN?.trim();
  if (!apiKey || !appOrigin) throw new Error('Booking email configuration is incomplete.');

  const bookingResult = await input.client.from('mentor_booking_requests')
    .select('id,semester_id,mentor_profile_id,mentor_name,startup_semester_id,startup_name,requested_by_profile_id,topic,status,starts_at,ends_at,requested_at')
    .eq('id', input.bookingId).eq('semester_id', input.semesterId).maybeSingle();
  if (bookingResult.error) throw new Error(`Booking email read failed: ${bookingResult.error.message}`);
  const booking = bookingResult.data;
  if (!booking || booking.status !== 'pending' || booking.requested_by_profile_id !== input.startupProfileId || booking.startup_semester_id !== input.startupSemesterId) return 'skipped';

  const [profileResult, membershipResult, mentorResult, semesterResult] = await Promise.all([
    input.client.from('profiles').select('id,email,status,is_active').eq('id', booking.mentor_profile_id).maybeSingle(),
    input.client.from('semester_memberships').select('id').eq('semester_id', input.semesterId).eq('profile_id', booking.mentor_profile_id).eq('role', 'mentor').eq('status', 'active').limit(1),
    input.client.from('mentor_profiles').select('biography').eq('profile_id', booking.mentor_profile_id).maybeSingle(),
    input.client.from('semesters').select('configuration').eq('id', input.semesterId).maybeSingle(),
  ]);
  for (const result of [profileResult, membershipResult, mentorResult, semesterResult]) {
    if (result.error) throw new Error(`Booking email recipient read failed: ${result.error.message}`);
  }
  const profile = profileResult.data;
  if (!profile || profile.status !== 'approved' || !profile.is_active || !profile.email?.trim() || !membershipResult.data?.length) return 'skipped';

  const recipientEmail = profile.email.trim().toLowerCase();
  const insert = await input.client.from('notification_deliveries').insert({
    semester_id: input.semesterId,
    event_kind: 'booking_requested',
    source_id: booking.id,
    source_version: booking.requested_at,
    recipient_profile_id: booking.mentor_profile_id,
    recipient_email: recipientEmail,
    status: 'queued',
    due_at: new Date().toISOString(),
  }).select('id').single();
  if (insert.error?.code === '23505') return 'skipped';
  if (insert.error || !insert.data) throw new Error(`Booking email claim failed: ${insert.error?.message ?? 'No delivery row returned.'}`);
  const deliveryId = insert.data.id;
  const claim = await input.client.from('notification_deliveries').update({ status: 'submitting', updated_at: new Date().toISOString() })
    .eq('id', deliveryId).eq('status', 'queued').select('id').maybeSingle();
  if (claim.error || !claim.data) throw new Error(`Booking email submission claim failed: ${claim.error?.message ?? 'No delivery row returned.'}`);

  try {
    const current = await input.client.from('mentor_booking_requests').select('status,requested_at')
      .eq('id', booking.id).eq('semester_id', input.semesterId).maybeSingle();
    if (current.error) throw new Error(`Booking email status check failed: ${current.error.message}`);
    if (!current.data || current.data.status !== 'pending' || current.data.requested_at !== booking.requested_at) {
      const suppressed = await input.client.from('notification_deliveries').update({ status: 'suppressed', updated_at: new Date().toISOString() })
        .eq('id', deliveryId).eq('status', 'submitting');
      if (suppressed.error) throw new Error(`Booking email suppression failed: ${suppressed.error.message}`);
      return 'skipped';
    }
    const configuration = semesterResult.data?.configuration;
    const timeZone = configuration && typeof configuration === 'object' && !Array.isArray(configuration) && 'timezone' in configuration && typeof configuration.timezone === 'string'
      ? configuration.timezone : 'America/New_York';
    const mail = renderBookingEmail({
      appOrigin,
      allowLocalOrigin: appOrigin === 'http://localhost:3000',
      semesterId: input.semesterId,
      requestId: booking.id,
      mentorName: booking.mentor_name,
      mentorBio: mentorResult.data?.biography ?? null,
      startupName: booking.startup_name,
      topic: booking.topic,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      timeZone,
      status: 'pending',
      recipientRole: 'mentor',
    });
    const result = await (input.submit ?? submitSequenzyNotification)({ apiKey, to: recipientEmail, subject: mail.subject, html: mail.html });
    const update = await input.client.from('notification_deliveries').update({
      status: result.kind,
      provider_id: result.kind === 'accepted' ? result.emailSendId : null,
      last_error: result.kind === 'accepted' ? null : result.error,
      updated_at: new Date().toISOString(),
    }).eq('id', deliveryId).eq('status', 'submitting');
    if (update.error) throw new Error(`Booking email delivery record failed: ${update.error.message}`);
    return result.kind;
  } catch (cause) {
    await input.client.from('notification_deliveries').update({
      status: 'unknown', last_error: 'Submission interrupted; check Sequenzy before retrying.', updated_at: new Date().toISOString(),
    }).eq('id', deliveryId).eq('status', 'submitting');
    throw cause;
  }
}
