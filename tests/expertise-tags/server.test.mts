import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/db/types.ts';
import { createOrFindExpertiseTag } from '../../src/expertise-tags/server.ts';

for (const [name, storedKey] of [
  ['Marketing & Branding', 'marketing & branding'],
  ['Consumer/Media', 'consumer/media'],
  ['Café', 'café'],
  ['Multi   Word', 'multi   word'],
] as const) {
  test(`reuses the database's existing ${name} tag without inserting`, async () => {
    let inserts = 0;
    const client = createClient<Database>('https://example.supabase.co', 'test-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        if (request.method === 'GET') {
          assert.equal(url.searchParams.get('normalized_name'), `eq.${storedKey}`);
          return Response.json({ id: 'existing-tag', name });
        }
        inserts += 1;
        return Response.json({ code: '23514', message: 'normalized_name check rejected this value' }, { status: 400 });
      } },
    });
    assert.deepEqual(await createOrFindExpertiseTag(client, 'mentor', name), { id: 'existing-tag', name });
    assert.equal(inserts, 0);
  });
}

test('creates a new punctuation-bearing tag with the database storage key', async () => {
  let inserted = false;
  const client = createClient<Database>('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      if (request.method === 'GET') return Response.json(null);
      if (url.pathname.endsWith('/expertise_tag_aliases')) return Response.json(null, { status: 201 });
      assert.deepEqual(await request.json(), {
        name: 'FinTech / Payments', normalized_name: 'fintech / payments', created_by_profile_id: 'mentor',
      });
      inserted = true;
      return Response.json({ id: 'new-tag', name: 'FinTech / Payments' }, { status: 201 });
    } },
  });
  assert.deepEqual(await createOrFindExpertiseTag(client, 'mentor', ' FinTech / Payments '), { id: 'new-tag', name: 'FinTech / Payments' });
  assert.equal(inserted, true);
});
