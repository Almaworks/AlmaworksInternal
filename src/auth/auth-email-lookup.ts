import type { SetupIdentity } from './first-sign-in.ts';

const allowedUrl = 'https://layjdjfvxkowxidwuvbs.supabase.co';

export async function lookupAuthEmail(url: string, serviceKey: string, email: string, request: typeof fetch = fetch): Promise<SetupIdentity | null> {
  if (url !== allowedUrl || !serviceKey) throw new Error('Sign-in is not configured for this project.');
  // Auth's filter uses LIKE against email/full_name. Escape pattern characters,
  // then require an exact email match before choosing a setup screen.
  const filter = email.replace(/[\\%_]/gu, character => `\\${character}`);
  for (let page = 1; page <= 10; page += 1) {
    const endpoint = new URL('/auth/v1/admin/users', url);
    endpoint.searchParams.set('filter', filter);
    endpoint.searchParams.set('page', String(page));
    endpoint.searchParams.set('per_page', '50');
    const response = await request(endpoint, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Unable to check sign-in.');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('users' in body) || !Array.isArray(body.users)) throw new Error('Unable to check sign-in.');
    for (const candidate of body.users as unknown[]) {
      if (candidate && typeof candidate === 'object' && 'email' in candidate && typeof candidate.email === 'string' && candidate.email.toLowerCase() === email) {
        return candidate as SetupIdentity;
      }
    }
    if (body.users.length < 50) return null;
  }
  throw new Error('Unable to check sign-in.');
}
