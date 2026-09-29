import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAndDeliverMemberInvitation,
  MemberInvitationDeliveryError,
} from '../../src/program/server/member-invitation.ts';

const origin = 'https://almaworks-internal.vercel.app';
const email = 'member@example.test';
const tokenHash = 'private-invite-token';
const apiKey = 'private-provider-key';

function invitation(overrides: Partial<Parameters<typeof createAndDeliverMemberInvitation>[0]> = {}) {
  const events: string[] = [];
  const sent: { apiKey: string; to: string; subject: string; html: string }[] = [];
  const input = {
    apiKey,
    email,
    fullName: 'Taylor <Member>',
    origin,
    generateLink: async (redirectTo: string) => {
      events.push('generate');
      assert.equal(redirectTo, `${origin}/auth/callback?next=%2Faccount%2Fpassword%3Freset%3D1`);
      return { data: { user: { id: 'auth-user-1' }, properties: { hashed_token: tokenHash } }, error: null };
    },
    provision: async (userId: string) => {
      events.push('provision');
      assert.equal(userId, 'auth-user-1');
    },
    submit: async (options: { apiKey: string; to: string; subject: string; html: string }) => {
      events.push('submit');
      sent.push(options);
      return { kind: 'accepted' as const, emailSendId: 'send-1' };
    },
    ...overrides,
  };
  return { input, events, sent };
}

test('invitation provisions access before mailing a public token-hash link to password setup', async () => {
  const { input, events, sent } = invitation();
  assert.deepEqual(await createAndDeliverMemberInvitation(input), { userId: 'auth-user-1', emailSendId: 'send-1' });
  assert.deepEqual(events, ['generate', 'provision', 'submit']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.apiKey, apiKey);
  assert.equal(sent[0]?.to, email);
  assert.match(sent[0]?.html ?? '', /Taylor &lt;Member&gt;/u);
  const encodedLink = sent[0]?.html.match(/href="([^"]+)"/u)?.[1];
  assert.ok(encodedLink);
  const link = new URL(encodedLink.replaceAll('&amp;', '&'));
  assert.equal(link.origin, origin);
  assert.equal(link.pathname, '/auth/callback');
  assert.equal(link.searchParams.get('token_hash'), tokenHash);
  assert.equal(link.searchParams.get('type'), 'invite');
  assert.equal(link.searchParams.get('next'), '/account/password?reset=1');
});

test('missing mail configuration creates no account or access', async () => {
  const { input, events } = invitation({ apiKey: ' ' });
  await assert.rejects(createAndDeliverMemberInvitation(input), /No account was created/u);
  assert.deepEqual(events, []);
});

for (const invalidOrigin of [
  undefined,
  '',
  'not a URL',
  'http://almaworks-internal.vercel.app',
  'https://localhost:3000',
  'https://app.localhost',
  'https://127.0.0.1',
  'https://192.168.1.12',
  'https://[::1]',
  'https://almaworks-internal.vercel.app/path',
  'https://almaworks-internal.vercel.app?next=elsewhere',
  'https://user:password@almaworks-internal.vercel.app',
]) {
  test(`invalid invitation origin ${String(invalidOrigin)} fails before Auth account creation`, async () => {
    const { input, events } = invitation({ origin: invalidOrigin });
    await assert.rejects(createAndDeliverMemberInvitation(input), /public HTTPS URL. No account was created/u);
    assert.deepEqual(events, []);
  });
}

test('failed provisioning never submits the invite link', async () => {
  const { input, events } = invitation({ provision: async () => { events.push('provision'); throw new Error('access failed'); } });
  await assert.rejects(createAndDeliverMemberInvitation(input), /access failed/u);
  assert.deepEqual(events, ['generate', 'provision']);
});

test('missing token needs reconciliation and never provisions or emails', async () => {
  const { input, events } = invitation({
    generateLink: async () => {
      events.push('generate');
      return { data: { user: { id: 'auth-user-1' }, properties: {} }, error: null };
    },
  });
  await assert.rejects(createAndDeliverMemberInvitation(input), /Check the account before retrying/u);
  assert.deepEqual(events, ['generate']);
});

test('Auth link failures do not expose provider details or submit email', async () => {
  const { input, events } = invitation({
    generateLink: async () => {
      events.push('generate');
      return { data: null, error: { message: `secret ${tokenHash} ${apiKey}` } };
    },
  });
  await assert.rejects(createAndDeliverMemberInvitation(input), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /No email was submitted/u);
    assert.doesNotMatch(error.message, /private-invite-token|private-provider-key/u);
    return true;
  });
  assert.deepEqual(events, ['generate']);
});

for (const deliveryStatus of ['rejected', 'unknown'] as const) {
  test(`${deliveryStatus} mail submission reports the retained account without leaking credentials`, async () => {
    const { input, events } = invitation({
      submit: async () => {
        events.push('submit');
        return { kind: deliveryStatus, error: `secret ${tokenHash} ${apiKey}` };
      },
    });
    await assert.rejects(createAndDeliverMemberInvitation(input), (error: unknown) => {
      assert.ok(error instanceof MemberInvitationDeliveryError);
      assert.equal(error.accountCreated, true);
      assert.equal(error.deliveryStatus, deliveryStatus);
      assert.match(error.message, /do not create the account again/u);
      assert.doesNotMatch(error.message, /private-invite-token|private-provider-key/u);
      return true;
    });
    assert.deepEqual(events, ['generate', 'provision', 'submit']);
  });
}

test('unexpected mail exception is treated as uncertain submission after provisioning', async () => {
  const { input } = invitation({ submit: async () => { throw new Error(`secret ${tokenHash}`); } });
  await assert.rejects(createAndDeliverMemberInvitation(input), (error: unknown) => {
    assert.ok(error instanceof MemberInvitationDeliveryError);
    assert.equal(error.deliveryStatus, 'unknown');
    assert.doesNotMatch(error.message, /private-invite-token/u);
    return true;
  });
});
