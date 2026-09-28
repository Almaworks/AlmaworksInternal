import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { loadAdminOverview } from '../../src/dashboard/admin-overview.ts';

test('overview uses four small semester-scoped reads and never signs photos or reads attendance', async () => {
  const urls: URL[] = [];
  const client = createClient('https://example.supabase.co', 'test-key', { global: { fetch: async (input) => {
    const url = new URL(String(input)); urls.push(url);
    const data = url.pathname.endsWith('/startup_semesters')
      ? [{ mentorship_needs: ['Sales'] }, { mentorship_needs: [] }]
      : url.pathname.endsWith('/sessions') ? [{ status: 'confirmed' }, { status: 'requested' }, { status: 'declined' }, { status: 'cancelled' }]
      : url.pathname.endsWith('/mentor_booking_requests') ? [{ status: 'accepted' }, { status: 'pending' }, { status: 'declined' }]
      : [{ id: 'm1' }];
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' } });
  } } });
  assert.deepEqual(await loadAdminOverview(client, 'semester-a'), { startups: 2, openNeeds: 1, mentors: 1, confirmedSessions: 1, unconfirmedSessions: 1, acceptedMentorshipBookings: 1, pendingMentorshipBookings: 1 });
  assert.equal(urls.length, 4);
  for (const url of urls) {
    assert.equal(url.searchParams.get('semester_id'), 'eq.semester-a');
    assert.doesNotMatch(url.searchParams.get('select') ?? '', /photo|email|biography|full_name|organization/);
  }
});

test('overview without an active semester does not issue data requests', async () => {
  const client = createClient('https://example.supabase.co', 'test-key', { global: { fetch: async () => { throw new Error('unexpected network call'); } } });
  assert.deepEqual(await loadAdminOverview(client, null), { startups: 0, openNeeds: 0, mentors: 0, confirmedSessions: 0, unconfirmedSessions: 0, acceptedMentorshipBookings: 0, pendingMentorshipBookings: 0 });
});

test('overview surfaces database errors instead of showing false zero totals', async () => {
  const client = createClient('https://example.supabase.co', 'test-key', { global: { fetch: async () => new Response(JSON.stringify({ message: 'permission denied' }), { status: 403 }) } });
  await assert.rejects(loadAdminOverview(client, 'semester-a'), /permission denied/);
});
