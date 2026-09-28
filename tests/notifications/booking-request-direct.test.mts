import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../src/db/types.ts';
import { sendSavedBookingRequest } from '../../src/notifications/booking-request-direct.ts';

const url = 'https://layjdjfvxkowxidwuvbs.supabase.co';
const semesterId = '11111111-1111-4111-8111-111111111111';
const bookingId = '22222222-2222-4222-8222-222222222222';
const mentorId = '33333333-3333-4333-8333-333333333333';
const startupId = '44444444-4444-4444-8444-444444444444';
const startupSemesterId = '55555555-5555-4555-8555-555555555555';
const deliveryId = '66666666-6666-4666-8666-666666666666';
const requestedAt = '2026-09-26T12:00:00+00:00';
const env = {
  BOOKING_REQUEST_EMAIL_ENABLED: 'true',
  BOOKING_REQUEST_EMAIL_SEMESTER_IDS: semesterId,
  BOOKING_REQUEST_EMAIL_ORIGIN: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: url,
  SEQUENZY_API_KEY: 'test-server-only-key',
};

test('a saved startup booking submits one mentor email with a direct Bookings link', async () => {
  const requests: Request[] = [];
  let inserted = false;
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const path = new URL(request.url).pathname;
    if (path.endsWith('/mentor_booking_requests')) return Response.json([{
      id: bookingId, semester_id: semesterId, mentor_profile_id: mentorId,
      mentor_name: 'Layth Rahman', startup_semester_id: startupSemesterId,
      startup_name: 'Acme Inc.', requested_by_profile_id: startupId,
      topic: 'Product strategy', status: 'pending',
      starts_at: '2026-10-03T14:00:00Z', ends_at: '2026-10-03T14:30:00Z', requested_at: requestedAt,
    }]);
    if (path.endsWith('/profiles')) return Response.json([{ id: mentorId, email: 'mentor@example.com', status: 'approved', is_active: true }]);
    if (path.endsWith('/semester_memberships')) return Response.json([{ id: 'member' }]);
    if (path.endsWith('/mentor_profiles')) return Response.json([{ biography: 'Product mentor' }]);
    if (path.endsWith('/semesters')) return Response.json([{ configuration: { timezone: 'America/New_York' } }]);
    if (path.endsWith('/notification_deliveries')) {
      if (request.method === 'POST') {
        if (inserted) return Response.json({ code: '23505', message: 'duplicate key' }, { status: 409 });
        inserted = true;
        const payload = await request.json() as Record<string, unknown>;
        assert.equal(payload.event_kind, 'booking_requested');
        assert.equal(payload.source_id, bookingId);
        assert.equal(payload.recipient_profile_id, mentorId);
        return Response.json([{ id: deliveryId }]);
      }
      if (request.method === 'PATCH') return Response.json([{ id: deliveryId }]);
    }
    assert.fail(`Unexpected request: ${request.method} ${path}`);
  };
  const client = createClient<Database>(url, 'test-public-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: fetcher } });
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const submit = async (options: { apiKey: string; to: string; subject: string; html: string }) => {
    sent.push(options);
    return { kind: 'accepted' as const, emailSendId: 'provider-123' };
  };
  const input = { client, bookingId, semesterId, startupProfileId: startupId, startupSemesterId, env, submit };
  assert.equal(await sendSavedBookingRequest(input), 'accepted');
  assert.equal(await sendSavedBookingRequest(input), 'skipped');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'mentor@example.com');
  assert.match(sent[0].subject, /Acme Inc/);
  assert.match(sent[0].html, /Product strategy/);
  assert.match(sent[0].html, /dashboard\/bookings\?semester=/);
  assert.equal(requests.filter(request => request.method === 'POST' && request.url.includes('notification_deliveries')).length, 2);
});

test('booking notification stays off without explicit semester activation', async () => {
  const client = { from: () => assert.fail('disabled notification accessed the database') } as unknown as ReturnType<typeof createClient<Database>>;
  assert.equal(await sendSavedBookingRequest({ client, bookingId, semesterId, startupProfileId: startupId,
    startupSemesterId, env: { ...env, BOOKING_REQUEST_EMAIL_SEMESTER_IDS: '' } }), 'disabled');
});
