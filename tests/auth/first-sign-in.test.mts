import assert from 'node:assert/strict';
import test from 'node:test';
import { needsFirstSignInPassword, startEmailSignIn } from '../../src/auth/first-sign-in.ts';
import { resolvePostLoginDestination } from '../../src/auth/profile-access.ts';
import { handleEmailSignInStart } from '../../src/auth/sign-in-http.ts';

test('first sign-in sends a fresh code only when the user starts sign-in', async () => {
  const sent: string[] = [];
  const mode = await startEmailSignIn(' Member@Example.Test ', {
    lookup: async () => ({ app_metadata: { almaworks_added: true }, user_metadata: {} }),
    sendCode: async email => { sent.push(email); },
  });
  assert.equal(mode, 'code');
  assert.deepEqual(sent, ['member@example.test']);
});
test('password setup completion sends returning users to password without another code', async () => {
  const mode = await startEmailSignIn('member@example.test', {
    lookup: async () => ({ app_metadata: { almaworks_added: true }, user_metadata: { almaworks_password_ready: true } }),
    sendCode: async () => { assert.fail('must not send a code'); },
  });
  assert.equal(mode, 'password');
});
test('unknown email never creates an identity or an access request', async () => {
  assert.equal(await startEmailSignIn('unknown@example.test', {
    lookup: async () => null,
    sendCode: async () => { assert.fail('must not send'); },
  }), 'password');
});
test('legacy unused invitation can start from normal sign-in', () => {
  assert.equal(needsFirstSignInPassword({ invited_at: '2026-01-01', email_confirmed_at: null }), true);
  assert.equal(needsFirstSignInPassword({ invited_at: '2026-01-01', email_confirmed_at: '2026-01-02' }), false);
});
test('ordinary Google identities, declined requests, and missing memberships have distinct destinations', () => {
  const base = { is_active: true, role: null };
  assert.equal(resolvePostLoginDestination({ ...base, status: 'unregistered' }), '/request-access');
  assert.equal(resolvePostLoginDestination({ ...base, status: 'pending' }), '/pending');
  assert.equal(resolvePostLoginDestination({ ...base, status: 'rejected' }), '/access-rejected');
  assert.equal(resolvePostLoginDestination({ ...base, status: 'approved' }), '/membership-unavailable');
});
test('browser proxy origins work while foreign origins cannot trigger code delivery', async () => {
  let calls = 0;
  const start = async () => { calls += 1; return 'code' as const; };
  const request = (origin: string, body = JSON.stringify({ email: 'first@example.test' })) => new Request('http://localhost:3108/api/auth/sign-in/start', {
    method: 'POST', headers: { origin, host: '127.0.0.1:3108', 'x-forwarded-proto': 'http' }, body,
  });
  assert.equal((await handleEmailSignInStart(request('https://other.example.test'), start)).status, 403);
  assert.equal(calls, 0);
  assert.equal((await handleEmailSignInStart(request('http://127.0.0.1:3108', 'null'), start)).status, 400);
  assert.equal(calls, 0);
  assert.equal((await handleEmailSignInStart(request('http://127.0.0.1:3108'), start)).status, 200);
  assert.equal(calls, 1);
});
