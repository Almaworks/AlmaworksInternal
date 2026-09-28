import assert from "node:assert/strict";
import test from "node:test";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

import type { Database } from "../../src/db/types.ts";
import { AuthorizationError } from "../../src/auth/server.ts";
import { createRequireAllTimeOutreachAccess } from "../../src/outreach/server/all-time-authorization.ts";

const user = { id: "00000000-0000-4000-8000-000000000001" } as User;
const semesterRows = [
  { id: "00000000-0000-4000-8000-000000000101", name: "Spring 2027", start_date: "2027-01-01", end_date: "2027-05-01", is_active: true },
  { id: "00000000-0000-4000-8000-000000000102", name: "Fall 2026", start_date: "2026-08-01", end_date: "2026-12-01", is_active: false },
];

function clientWithAccess(canManageAny: boolean, manageableIds: readonly string[], calls: string[] = []): SupabaseClient<Database> {
  return createClient<Database>('https://example.supabase.co', 'test-key', { global: { fetch: async (input) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').at(-1) ?? '';
    calls.push(table);
    if (table === 'platform_roles' || table === 'semester_memberships') {
      assert.equal(url.searchParams.get('profile_id'), 'eq.profile-a');
      assert.equal(url.searchParams.get('role'), table === 'platform_roles' ? 'eq.super_admin' : 'eq.admin');
      if (table === 'semester_memberships') assert.equal(url.searchParams.get('status'), 'eq.active');
    }
    const data = table === 'semesters' ? semesterRows
      : table === 'platform_roles' ? []
      : table === 'semester_memberships' ? (canManageAny ? manageableIds.map(semester_id => ({ semester_id })) : [])
      : null;
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } } });
}

test("all-time outreach rejects an authenticated user without explicit cross-cohort access", async () => {
  const authorize = createRequireAllTimeOutreachAccess(async () => ({
    user, profileId: "profile-a",
    userClient: clientWithAccess(false, []),
  }));

  await assert.rejects(
    authorize(new Request("https://almaworks.example.test/outreach")),
    (error: unknown) => error instanceof AuthorizationError
      && error.status === 403
      && /all-time outreach administrator access required/i.test(error.message),
  );
});

test('all-time outreach fails closed on an authority query error', async () => {
  const client = createClient<Database>('https://example.supabase.co', 'test-key', { global: { fetch: async () =>
    new Response(JSON.stringify({ message: 'denied' }), { status: 403 }) } });
  const authorize = createRequireAllTimeOutreachAccess(async () => ({ user, profileId: 'profile-a', userClient: client }));
  await assert.rejects(authorize(new Request('https://almaworks.example.test/outreach')), (error: unknown) => error instanceof AuthorizationError && error.status === 500);
});

test('all-time super-admin access still enforces the semester bound', async () => {
  let count = 2;
  const client = createClient<Database>('https://example.supabase.co', 'test-key', { global: { fetch: async (input) => {
    const table = new URL(String(input)).pathname.split('/').at(-1);
    const data = table === 'platform_roles' ? [{ role: 'super_admin' }] : table === 'semester_memberships' ? []
      : Array.from({ length: count }, (_, i) => ({ ...semesterRows[0], id: String(i) }));
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  } } });
  const authorize = createRequireAllTimeOutreachAccess(async () => ({ user, profileId: 'profile-a', userClient: client }));
  assert.equal((await authorize(new Request('https://almaworks.example.test/outreach'))).manageableSemesters.length, 2);
  count = 501;
  await assert.rejects(authorize(new Request('https://almaworks.example.test/outreach')), /500-semester authorization bound/);
});

test("all-time outreach passes only individually manageable cohort IDs to the workspace query", async () => {
  const authorize = createRequireAllTimeOutreachAccess(async () => ({
    user, profileId: "profile-a",
    userClient: clientWithAccess(true, [semesterRows[1].id]),
  }));

  const context = await authorize(new Request("https://almaworks.example.test/outreach"));

  assert.deepEqual(context.manageableSemesters, [{
    id: semesterRows[1].id,
    name: "Fall 2026",
    startsOn: "2026-08-01",
    endsOn: "2026-12-01",
    isActive: false,
  }]);
});

test('all-time outreach authorization uses three parallel reads without per-semester RPCs', async () => {
  const calls: string[] = [];
  const authorize = createRequireAllTimeOutreachAccess(async () => ({
    user, profileId: 'profile-a', userClient: clientWithAccess(true, [semesterRows[0].id], calls),
  }));
  await authorize(new Request('https://almaworks.example.test/outreach'));
  assert.deepEqual(calls.sort(), ['platform_roles', 'semester_memberships', 'semesters']);
});
