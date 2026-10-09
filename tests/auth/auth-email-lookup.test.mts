import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupAuthEmail } from '../../src/auth/auth-email-lookup.ts';

const project = 'https://layjdjfvxkowxidwuvbs.supabase.co';
test('email lookup filters Auth records, escapes patterns and requires an exact email', async () => {
  const request: typeof fetch = async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.origin, project);
    assert.equal(url.searchParams.get('filter'), 'first\\_name@example.test');
    assert.equal(options?.redirect, 'error');
    return Response.json({ users: [
      { email: 'other@example.test', app_metadata: { almaworks_added: false } },
      { email: 'first_name@example.test', app_metadata: { almaworks_added: true } },
    ] });
  };
  assert.deepEqual(await lookupAuthEmail(project, 'test-only', 'first_name@example.test', request), {
    email: 'first_name@example.test', app_metadata: { almaworks_added: true },
  });
});
test('lookup refuses other projects before contacting Auth and fails closed on API errors', async () => {
  await assert.rejects(lookupAuthEmail('https://other.supabase.co', 'test-only', 'test@example.test', async () => assert.fail('must not contact another project')));
  await assert.rejects(lookupAuthEmail(project, 'test-only', 'test@example.test', async () => new Response('', { status: 500 })), /Unable to check sign-in/);
  assert.equal(await lookupAuthEmail(project, 'test-only', 'test@example.test', async () => Response.json({ users: [{ email: 'prefix-test@example.test' }] })), null);
});
