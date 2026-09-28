import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFridayGroupEmail } from '../../src/notifications/friday-group-email.ts';
import { digestIsDue, fridayGroupVersion, fridayStartAt, newYorkDay } from '../../src/notifications/pipeline.ts';
import { handleNotificationWorker, notificationWorkerConfiguration } from '../../src/notifications/worker-endpoint.ts';

test('Friday group email gives one startup its group, rotation, speaker, and exact Friday link', () => {
  const mail = renderFridayGroupEmail({
    appOrigin: 'https://alma.works', semesterId: 'semester-1', meetingId: 'meeting-2', meetingDate: '2026-10-09',
    startupName: 'Founders & Co', group: 'B', firstFacilitator: 'Eric Chan', secondFacilitator: 'Les',
    speakerName: 'Ada <Speaker>', speakerTopic: 'Pricing', speakerBio: 'Built <tools>', status: 'assigned',
  });
  assert.match(mail.text, /Your group: B/);
  assert.match(mail.text, /4:00–4:30 PM: Eric Chan/);
  assert.match(mail.text, /4:30–5:00 PM: Les/);
  assert.match(mail.text, /meeting=meeting-2/);
  assert.match(mail.html, /Founders &amp; Co/);
  assert.match(mail.html, /Ada &lt;Speaker&gt;/);
  assert.doesNotMatch(mail.html, /<tools>/);
  assert.equal(mail.fridayUrl, 'https://alma.works/dashboard/participant?tab=friday-program&semester=semester-1&meeting=meeting-2');
});

test('Friday content identity does not change for the same assignment and changes for a new group', () => {
  const first = fridayGroupVersion('A', 1, 'Les', 'Eric Chan');
  assert.equal(first, fridayGroupVersion('A', 1, 'Les', 'Eric Chan'));
  assert.notEqual(first, fridayGroupVersion('B', 1, 'Eric Chan', 'Les'));
  assert.notEqual(first, fridayGroupVersion('A', 2, 'Les', 'Eric Chan'));
});

test('Friday start and 9am digest follow New York daylight saving and weekdays', () => {
  assert.equal(new Date(fridayStartAt('2026-10-30')).toISOString(), '2026-10-30T19:00:00.000Z');
  assert.equal(new Date(fridayStartAt('2026-11-06')).toISOString(), '2026-11-06T20:00:00.000Z');
  assert.equal(newYorkDay(new Date('2026-11-07T03:00:00Z')), '2026-11-06');
  assert.equal(digestIsDue(new Date('2026-10-30T13:00:00Z')), true);
  assert.equal(digestIsDue(new Date('2026-11-06T13:00:00Z')), false);
  assert.equal(digestIsDue(new Date('2026-11-06T14:00:00Z')), true);
  assert.equal(digestIsDue(new Date('2026-11-07T15:00:00Z')), false);
});

test('notification worker is disabled without explicit release configuration', async () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://layjdjfvxkowxidwuvbs.supabase.co' };
  assert.equal(notificationWorkerConfiguration(env), null);
  const response = await handleNotificationWorker(new Request('https://alma.works/api/internal/notification-worker'), env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('notification worker checks the project and secret before contacting services', async () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://layjdjfvxkowxidwuvbs.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-key',
    NOTIFICATION_ENABLED: 'true', NOTIFICATION_APP_ORIGIN: 'https://alma.works',
    NOTIFICATION_ACTIVATED_AT: '2026-09-26T00:00:00Z', NOTIFICATION_SEMESTER_IDS: '11111111-1111-4111-8111-111111111111',
    NOTIFICATION_WORKER_EMAIL: 'worker@example.test', NOTIFICATION_WORKER_PASSWORD: 'test-password',
    NOTIFICATION_CRON_SECRET: 'a'.repeat(32), SEQUENZY_API_KEY: 'test-key',
  };
  assert.equal((await handleNotificationWorker(new Request('https://alma.works/api/internal/notification-worker'), env)).status, 401);
  assert.throws(() => notificationWorkerConfiguration({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://another-project.supabase.co' }), /does not match/);
  assert.equal((await handleNotificationWorker(new Request('https://alma.works/api/internal/notification-worker', { method: 'POST' }), env)).status, 405);
});
