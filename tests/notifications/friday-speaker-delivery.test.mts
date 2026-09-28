import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/db/types.ts';
import { dispatchFridaySpeakerAnnouncement, speakerAnnouncementChanged } from '../../src/notifications/friday-speaker-delivery.ts';

const speaker = { name: 'Jordan', bio: 'Founder', expertise: 'Pricing', topic: 'Growth', contactEmail: 'speaker@example.com', contactPhone: null, linkedinUrl: null, websiteUrl: null };
const semesterId = '11111111-1111-4111-8111-111111111111';
const meetingId = '22222222-2222-4222-8222-222222222222';

function fakeStore(options: { canceled?: boolean } = {}) {
  const deliveries: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      let operation = 'select';
      let row: Record<string, unknown> = {};
      let statusFilter: string | null = null;
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { if (column === 'status') statusFilter = String(value); return query; },
        in() { return query; },
        limit() { return query; },
        insert(value: Record<string, unknown>) { operation = 'insert'; row = value; return query; },
        update(value: Record<string, unknown>) { operation = 'update'; row = value; return query; },
        async maybeSingle() {
          if (table === 'meetings') return { data: { meeting_date: '2026-10-09', friday_canceled_at: options.canceled ? '2026-10-08T10:00:00Z' : null }, error: null };
          if (table === 'friday_speakers') return { data: { ...speaker, updated_at: '2026-10-01T10:00:00Z' }, error: null };
          if (table === 'notification_deliveries' && operation === 'select') return { data: deliveries.find((existing) => existing.source_version === '2026-10-01T10:00:00Z') ?? null, error: null };
          if (table === 'notification_deliveries' && operation === 'insert') {
            if (deliveries.some((existing) => existing.recipient_profile_id === row.recipient_profile_id && existing.source_version === row.source_version)) return { data: null, error: { code: '23505', message: 'duplicate' } };
            const inserted = { ...row, id: `delivery-${deliveries.length + 1}` };
            deliveries.push(inserted);
            return { data: { id: inserted.id }, error: null };
          }
          if (table === 'notification_deliveries' && operation === 'update') {
            const existing = deliveries[deliveries.length - 1];
            if (!existing || existing.status !== statusFilter) return { data: null, error: null };
            Object.assign(existing, row);
            return { data: { id: existing.id }, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: (value: unknown) => unknown) {
          if (table === 'notification_deliveries' && operation === 'update') {
            const existing = deliveries[deliveries.length - 1];
            if (existing && existing.status === statusFilter) Object.assign(existing, row);
            return Promise.resolve(resolve({ data: null, error: null }));
          }
          if (table === 'semester_memberships') return Promise.resolve(resolve({ data: [{ profile_id: 'active' }, { profile_id: 'inactive' }], error: null }));
          if (table === 'profiles') return Promise.resolve(resolve({ data: [{ id: 'active', email: 'STARTUP@example.com' }], error: null }));
          return Promise.resolve(resolve({ data: null, error: null }));
        },
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, deliveries };
}

test('material speaker comparison ignores repeated save and catches topic edit', () => {
  assert.equal(speakerAnnouncementChanged(speaker, speaker), false);
  assert.equal(speakerAnnouncementChanged(speaker, { ...speaker, topic: 'Hiring' }), true);
});

test('speaker announcement sends to active startup profiles once and records provider acceptance', async () => {
  const store = fakeStore();
  let submissions = 0;
  const input = { client: store.client, semesterId, meetingId, previousSpeaker: null, currentSpeaker: speaker, appOrigin: 'https://app.alma.works', apiKey: 'fake', submit: async () => { submissions += 1; return { kind: 'accepted' as const, emailSendId: 'send-1' }; } };
  const result = await dispatchFridaySpeakerAnnouncement(input);
  assert.deepEqual(result, { accepted: 1, queued: 0, rejected: 0, unknown: 0, skipped: 0 });
  assert.equal(store.deliveries[0]?.recipient_email, 'startup@example.com');
  assert.equal(store.deliveries[0]?.status, 'accepted');
  assert.equal(store.deliveries[0]?.provider_id, 'send-1');
  assert.equal(submissions, 1);
  const repeated = await dispatchFridaySpeakerAnnouncement(input);
  assert.equal(repeated.skipped, 1);
  assert.equal(submissions, 1);
});

test('missing provider configuration leaves queued work; canceled week suppresses it', async () => {
  const store = fakeStore();
  const queued = await dispatchFridaySpeakerAnnouncement({ client: store.client, semesterId, meetingId, previousSpeaker: null, currentSpeaker: speaker, appOrigin: null, apiKey: null });
  assert.equal(queued.queued, 1);
  assert.equal(store.deliveries[0]?.status, 'queued');
  const resumed = await dispatchFridaySpeakerAnnouncement({ client: store.client, semesterId, meetingId, previousSpeaker: null, currentSpeaker: speaker, appOrigin: 'https://app.alma.works', apiKey: 'fake', submit: async () => ({ kind: 'accepted', emailSendId: 'send-resumed' }) });
  assert.equal(resumed.accepted, 1);
  assert.equal(store.deliveries.length, 1);
  assert.equal(store.deliveries[0]?.status, 'accepted');
  const canceledStore = fakeStore({ canceled: true });
  const canceled = await dispatchFridaySpeakerAnnouncement({ client: canceledStore.client, semesterId, meetingId, previousSpeaker: null, currentSpeaker: speaker, appOrigin: 'https://app.alma.works', apiKey: 'fake' });
  assert.equal(canceledStore.deliveries.length, 0);
  assert.equal(canceled.accepted, 0);
  const localOriginStore = fakeStore();
  const localOrigin = await dispatchFridaySpeakerAnnouncement({ client: localOriginStore.client, semesterId, meetingId, previousSpeaker: null, currentSpeaker: speaker, appOrigin: 'http://localhost:3000', apiKey: 'fake' });
  assert.equal(localOrigin.queued, 1);
  assert.equal(localOriginStore.deliveries[0]?.status, 'queued');
});

test('an uncertain provider response is quarantined and not submitted again', async () => {
  const store = fakeStore();
  let attempts = 0;
  const input = { client: store.client, semesterId, meetingId, previousSpeaker: null, currentSpeaker: speaker, appOrigin: 'https://app.alma.works', apiKey: 'fake', submit: async () => { attempts += 1; return { kind: 'unknown' as const, error: 'Status unknown' }; } };
  const first = await dispatchFridaySpeakerAnnouncement(input);
  assert.equal(first.unknown, 1);
  assert.equal(store.deliveries[0]?.status, 'unknown');
  const second = await dispatchFridaySpeakerAnnouncement(input);
  assert.equal(second.skipped, 1);
  assert.equal(attempts, 1);
});

test('an explicit provider rejection is recorded without a retry', async () => {
  const store = fakeStore();
  const input = { client: store.client, semesterId, meetingId, previousSpeaker: null, currentSpeaker: speaker, appOrigin: 'https://app.alma.works', apiKey: 'fake', submit: async () => ({ kind: 'rejected' as const, error: 'HTTP 400' }) };
  const first = await dispatchFridaySpeakerAnnouncement(input);
  assert.equal(first.rejected, 1);
  assert.equal(store.deliveries[0]?.status, 'rejected');
  const second = await dispatchFridaySpeakerAnnouncement(input);
  assert.equal(second.skipped, 1);
});
