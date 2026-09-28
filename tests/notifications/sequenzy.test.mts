import assert from 'node:assert/strict';
import test from 'node:test';

import { sendSequenzyNotification } from '../../src/notifications/sequenzy.ts';

const message = {
  apiKey: 'test-secret',
  to: 'recipient@example.test',
  subject: 'Session reminder',
  html: '<p>See you soon</p>',
};

test('session notification uses the verified alerts sender and a server-side bearer key', async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const result = await sendSequenzyNotification({
    ...message,
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ success: true, emailSendId: 'send-123' }), { status: 200 });
    },
  });

  assert.deepEqual(result, { ok: true, emailSendId: 'send-123' });
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.url, 'https://api.sequenzy.com/api/v1/transactional/send');
  assert.equal((request.init?.headers as Record<string, string>).Authorization, 'Bearer test-secret');
  assert.deepEqual(JSON.parse(String(request.init?.body)), {
    to: 'recipient@example.test',
    from: 'Almaworks <alerts@almaworks.sequenzymail.com>',
    subject: 'Session reminder',
    html: '<p>See you soon</p>',
    emailType: 'transactional',
  });
});

test('provider rejection and ambiguous acceptance are reported without leaking provider responses', async () => {
  const rejected = await sendSequenzyNotification({
    ...message,
    fetch: async () => new Response('private provider response', { status: 403 }),
  });
  assert.deepEqual(rejected, { ok: false, error: 'Sequenzy rejected the email (HTTP 403).' });

  const ambiguous = await sendSequenzyNotification({
    ...message,
    fetch: async () => new Response('{broken', { status: 200 }),
  });
  assert.deepEqual(ambiguous, { ok: false, error: 'Sequenzy delivery status is unknown. Check its dashboard before retrying.' });
});
