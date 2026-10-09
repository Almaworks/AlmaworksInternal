// These markers select setup screens only. Database memberships remain the
// authority for access; neither marker grants a role or program permission.
export type SetupIdentity = {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  invited_at?: string;
  email_confirmed_at?: string | null;
};

export function needsFirstSignInPassword(user: SetupIdentity): boolean {
  if (user.user_metadata?.almaworks_password_ready === true) return false;
  return user.app_metadata?.almaworks_added === true
    || Boolean(user.invited_at && !user.email_confirmed_at);
}

export async function startEmailSignIn(emailInput: string, dependencies: {
  lookup: (email: string) => Promise<SetupIdentity | null>;
  sendCode: (email: string) => Promise<void>;
}): Promise<'code' | 'password'> {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error('Enter a valid email address.');
  const user = await dependencies.lookup(email);
  // Unknown addresses get the ordinary password screen. This action never
  // creates an identity or registers a request for administrator approval.
  if (!user || !needsFirstSignInPassword(user)) return 'password';
  await dependencies.sendCode(email);
  return 'code';
}
