import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

type ResolveResult = { shortCircuit?: boolean; url: string };
type RegisterHooks = (hooks: { resolve: (specifier: string, context: unknown, nextResolve: (specifier: string, context: unknown) => ResolveResult) => ResolveResult }) => void;
const registerHooks = (nodeModule as unknown as { registerHooks: RegisterHooks }).registerHooks;
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') return { shortCircuit: true, url: pathToFileURL(resolve('node_modules/next/server.js')).href };
  if (specifier.startsWith('@/')) return { shortCircuit: true, url: pathToFileURL(resolve(specifier.slice(2) + '.ts')).href };
  return nextResolve(specifier, context);
}});

test('generated email tokens establish server cookies and use the authorized role destination', async () => {
  const { GET } = await import('../../app/auth/callback/route.ts');
  const { NextRequest } = await import('next/server.js');
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://callback.example.test';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key';
  const calls: string[] = [];
  let rejectToken = false;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request.url);
    if (request.url.endsWith('/auth/v1/verify')) {
      const body = await request.json() as { token_hash: string; type: string };
      assert.equal(body.token_hash, 'test-hash');
      assert.ok(['email', 'signup', 'invite', 'recovery'].includes(body.type));
      if (rejectToken) return Response.json({ msg: 'Token expired', code: 'otp_expired' }, { status: 403, headers: { 'x-supabase-api-version': '2024-01-01' } });
      return Response.json({ access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600,
        user: { id: 'test-user', email: 'mentor@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' } });
    }
    if (request.url.includes('/rest/v1/profiles?')) return Response.json([{ id: 'test-profile', status: 'approved', is_active: true }]);
    if (request.url.includes('/rest/v1/platform_roles?')) return Response.json([]);
    if (request.url.includes('/rest/v1/semester_memberships?')) return Response.json([{ role: 'mentor' }]);
    throw new Error('Unexpected callback request');
  };
  try {
    const response = await GET(new NextRequest('https://almaworks.example.test/auth/callback?token_hash=test-hash&type=email&next=https://evil.example'));
    assert.equal(response.headers.get('location'), 'https://almaworks.example.test/dashboard/mentor');
    assert.ok(response.headers.get('set-cookie')?.includes('auth-token'));
    assert.equal(calls.filter(url => url.endsWith('/auth/v1/verify')).length, 1);
    const recovery = await GET(new NextRequest('https://almaworks.example.test/auth/callback?token_hash=test-hash&type=recovery'));
    assert.equal(recovery.headers.get('location'), 'https://almaworks.example.test/account/password?reset=1');
    assert.ok(recovery.headers.get('set-cookie')?.includes('auth-token'));
    rejectToken = true;
    const expired = await GET(new NextRequest('https://almaworks.example.test/auth/callback?token_hash=test-hash&type=email'));
    assert.equal(expired.headers.get('location'), 'https://almaworks.example.test/?error=link_expired');
    const before = calls.length;
    const invalid = await GET(new NextRequest('https://almaworks.example.test/auth/callback?token_hash=test-hash&type=sms'));
    assert.equal(invalid.headers.get('location'), 'https://almaworks.example.test/?error=no_session');
    assert.equal(calls.length, before);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
});
