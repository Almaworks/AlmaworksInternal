import { createClient } from '@supabase/supabase-js';
import { startEmailSignIn } from './first-sign-in.ts';
import { lookupAuthEmail } from './auth-email-lookup.ts';

const projectUrl = 'https://layjdjfvxkowxidwuvbs.supabase.co';
export function authFlowClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== projectUrl || !anon || !service) throw new Error('Sign-in is not configured for this project.');
  const auth = { persistSession: false, autoRefreshToken: false };
  return { publicClient: createClient(url, anon, { auth }), adminAuth: createClient(url, service, { auth }).auth.admin };
}
export async function startConfiguredEmailSignIn(email: string) {
  const { publicClient } = authFlowClients();
  return startEmailSignIn(email, {
    lookup: async target => {
      // Auth metadata selects a setup screen only, never application permissions.
      // All application data continues to require an authenticated RLS context.
      return lookupAuthEmail(projectUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, target);
    },
    sendCode: async target => {
      const result = await publicClient.auth.signInWithOtp({ email: target, options: { shouldCreateUser: false } });
      if (result.error) throw new Error('Unable to send setup code.');
    },
  });
}
