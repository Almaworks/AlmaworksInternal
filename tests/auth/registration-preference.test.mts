import assert from 'node:assert/strict';
import test from 'node:test';
import { saveRegistrationPreference } from '../../src/auth/registration-preference.ts';

test('requested participation is metadata only, never an assigned role', async () => {
  let received: unknown;
  const auth = { updateUser: async (input: unknown) => { received = input; return { error: null }; } };
  assert.equal((await saveRegistrationPreference(auth, 'mentor')).ok, true);
  assert.deepEqual(received, { data: { requested_role: 'mentor' } });
  received = undefined;
  assert.equal((await saveRegistrationPreference(auth, 'admin')).ok, false);
  assert.equal(received, undefined);
});
test('preference failures do not claim the request was saved', async () => {
  assert.equal((await saveRegistrationPreference({ updateUser: async () => ({ error: { message: 'failed' } }) }, 'startup')).ok, false);
});
