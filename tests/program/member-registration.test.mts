import assert from 'node:assert/strict';
import test from 'node:test';
import { addProgramMember } from '../../src/program/server/member-registration.ts';

const member = { email: 'member@example.test', fullName: 'Test Member', role: 'mentor' as const, restoreAccess: false };
function fixture(status: string | null = null) {
  const events: string[] = [];
  return { events, dependencies: {
    lookup: async () => status ? { id: 'existing', authUserId: 'existing', status, isActive: true, membership: null } : null,
    createIdentity: async () => { events.push('create'); return 'new'; },
    grantAccess: async (id: string) => { events.push(`grant:${id}`); },
    removeNewIdentity: async () => { events.push('cleanup'); },
    notify: async () => { events.push('notify'); return 'not_configured' as const; },
  } };
}
test('adding saves membership without any verification or mail configuration', async () => {
  const f = fixture();
  const result = await addProgramMember(member, f.dependencies);
  assert.equal(result.notification, 'not_configured');
  assert.deepEqual(f.events, ['create', 'grant:new', 'notify']);
});
test('adding an existing request grants access to the same identity', async () => {
  const f = fixture('pending');
  await addProgramMember(member, f.dependencies);
  assert.deepEqual(f.events, ['grant:existing', 'notify']);
});
test('rejected access requires an explicit restore and does not delete the identity', async () => {
  const f = fixture('rejected');
  await assert.rejects(addProgramMember(member, f.dependencies), /restore/i);
  assert.deepEqual(f.events, []);
  await addProgramMember({ ...member, restoreAccess: true }, f.dependencies);
  assert.deepEqual(f.events, ['grant:existing', 'notify']);
});
test('notification failure leaves successfully granted access intact', async () => {
  const f = fixture();
  f.dependencies.notify = async () => { throw new Error('mail unavailable'); };
  const result = await addProgramMember(member, f.dependencies);
  assert.equal(result.notification, 'unknown');
  assert.deepEqual(f.events, ['create', 'grant:new']);
});
test('grant failure never deletes an existing registration', async () => {
  const f = fixture('pending');
  f.dependencies.grantAccess = async () => { throw new Error('database unavailable'); };
  await assert.rejects(addProgramMember(member, f.dependencies));
  assert.deepEqual(f.events, []);
});
