import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import type { Database } from '@/src/db/types';
import { runNotificationPipeline } from '@/src/notifications/pipeline';

const LOCAL_ORIGIN = 'http://localhost:3000';

function configuredSemesterId(): string {
  const id = process.env.LOCAL_NOTIFICATION_TEST_SEMESTER_ID;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id)) throw new Error('Local notification test semester is invalid.');
  return id;
}

async function adminClient() {
  const cookieStore = await cookies();
  const client = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(items: { name: string; value: string; options: CookieOptions }[]) {
        try { items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* The proxy refreshes cookies when Server Components cannot. */ }
      },
    },
  }) as unknown as SupabaseClient<Database>;
  const userResult = await client.auth.getUser();
  if (userResult.error || !userResult.data.user) throw new Error('Sign in as an administrator to run the local email test.');
  const profile = await client.from('profiles').select('id').eq('auth_user_id', userResult.data.user.id).maybeSingle();
  if (profile.error || !profile.data) throw new Error('Administrator profile could not be found.');
  const access = await client.rpc('can_manage_semester', { candidate_id: profile.data.id, target_semester_id: configuredSemesterId() });
  if (access.error || access.data !== true) throw new Error('Fall semester administrator access is required.');
  return client;
}

async function sendTest() {
  'use server';
  if (process.env.NODE_ENV !== 'development' || process.env.LOCAL_NOTIFICATION_TEST_ENABLED !== 'true') notFound();
  const requestHeaders = await headers();
  if (requestHeaders.get('host') !== 'localhost:3000') notFound();
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://layjdjfvxkowxidwuvbs.supabase.co') throw new Error('Unexpected Supabase project.');
  const requestId = process.env.LOCAL_NOTIFICATION_TEST_BOOKING_ID;
  const recipientEmail = process.env.LOCAL_NOTIFICATION_TEST_RECIPIENT_EMAIL?.trim().toLowerCase();
  const apiKey = process.env.LOCAL_NOTIFICATION_TEST_SEQUENZY_API_KEY?.trim();
  if (!requestId || !recipientEmail || !apiKey) throw new Error('Local notification test is not configured.');
  const client = await adminClient();
  const semesterId = configuredSemesterId();
  const booking = await client.from('mentor_booking_requests').select('id,status,mentor_profile_id,requested_at,semester_id').eq('semester_id', semesterId).eq('id', requestId).maybeSingle();
  if (booking.error || !booking.data || !['pending', 'accepted'].includes(booking.data.status)) throw new Error('The designated booking is not pending or confirmed.');
  const mentor = await client.from('profiles').select('email').eq('id', booking.data.mentor_profile_id).maybeSingle();
  if (mentor.error || mentor.data?.email?.trim().toLowerCase() !== recipientEmail) throw new Error('Mentor email does not match the designated test recipient.');
  await runNotificationPipeline({
    client, apiKey, appOrigin: LOCAL_ORIGIN, activatedAt: booking.data.requested_at,
    semesterIds: [semesterId], localTest: { bookingRequestId: requestId, recipientEmail },
  });
  redirect('/dashboard/admin/notification-test');
}

export default async function LocalNotificationTestPage() {
  if (process.env.NODE_ENV !== 'development' || process.env.LOCAL_NOTIFICATION_TEST_ENABLED !== 'true') notFound();
  const requestId = process.env.LOCAL_NOTIFICATION_TEST_BOOKING_ID;
  const recipientEmail = process.env.LOCAL_NOTIFICATION_TEST_RECIPIENT_EMAIL?.trim().toLowerCase();
  if (!requestId || !recipientEmail) notFound();
  const client = await adminClient();
  const semesterId = configuredSemesterId();
  const booking = await client.from('mentor_booking_requests').select('id,status,starts_at,topic,startup_name,mentor_name').eq('semester_id', semesterId).eq('id', requestId).maybeSingle();
  if (booking.error || !booking.data) notFound();
  const eventKind = booking.data.status === 'pending' ? 'booking_requested' : 'booking_confirmed';
  const delivery = await client.from('notification_deliveries').select('status,provider_id,last_error,created_at').eq('semester_id', semesterId).eq('source_id', requestId).eq('recipient_email', recipientEmail).eq('event_kind', eventKind).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (delivery.error) throw new Error('Could not read the notification result.');
  return <main className="mx-auto max-w-2xl space-y-6 px-5 py-10 text-slate-900">
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">Local email test</p>
      <h1 className="mt-2 text-3xl font-semibold">Meeting notification</h1>
      <p className="mt-2 text-sm text-slate-600">This development-only action checks the saved request and sends one mentor notification through Sequenzy.</p>
    </div>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Startup</dt><dd className="font-medium">{booking.data.startup_name}</dd></div>
        <div><dt className="text-slate-500">Mentor</dt><dd className="font-medium">{booking.data.mentor_name}</dd></div>
        <div><dt className="text-slate-500">Topic</dt><dd className="font-medium">{booking.data.topic}</dd></div>
        <div><dt className="text-slate-500">Request status</dt><dd className="font-medium capitalize">{booking.data.status}</dd></div>
        <div className="sm:col-span-2"><dt className="text-slate-500">Recipient</dt><dd className="break-all font-medium">{recipientEmail}</dd></div>
      </dl>
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm">Delivery: <strong>{delivery.data?.status ?? 'Not sent'}</strong></p>
      {delivery.data?.provider_id && <p className="mt-2 break-all text-xs text-slate-600">Sequenzy ID: {delivery.data.provider_id}</p>}
      {delivery.data?.last_error && <p className="mt-2 text-sm text-rose-700">{delivery.data.last_error}</p>}
      <form action={sendTest} className="mt-5">
        <button type="submit" disabled={!['pending', 'accepted'].includes(booking.data.status) || !!delivery.data} className="rounded-lg bg-sky-800 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">Send test notification</button>
      </form>
      <p className="mt-3 text-xs text-slate-500">Sequenzy acceptance confirms submission, not Inbox placement. Check Spam too.</p>
    </section>
  </main>;
}
