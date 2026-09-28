type AuthResult = { ok: true } | { ok: false; error: string; reason?: 'email_unconfirmed'; email?: string }

type PasswordSignInAuth = {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{
    data: { session: unknown }
    error: { message: string; code?: string } | null
  }>
}

type PasswordResetAuth = {
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{
    error: { message: string; status?: number; name?: string } | null
  }>
}

const passwordResetDestination = '/account/password?reset=1'

export function passwordResetCallbackPath(): string {
  return `/auth/callback?next=${encodeURIComponent(passwordResetDestination)}`
}

export function resolvePasswordResetDestination(next: string | null, fallback: string | null): string | null {
  return next === passwordResetDestination ? passwordResetDestination : fallback
}

export async function requestPasswordReset(
  auth: PasswordResetAuth,
  email: string,
  origin: string,
): Promise<AuthResult> {
  try {
    const { error } = await auth.resetPasswordForEmail(email.trim(), {
      redirectTo: new URL(passwordResetCallbackPath(), origin).toString(),
    })
    if (error?.status === 429 || (error?.status ?? 0) >= 500 || error?.name === 'AuthRetryableFetchError') {
      return { ok: false, error: 'Password recovery is temporarily unavailable. Please wait a moment and try again.' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Unable to connect. Please try again.' }
  }
}

export async function passwordSignIn(auth: PasswordSignInAuth, email: string, password: string): Promise<AuthResult> {
  const normalizedEmail = email.trim().toLowerCase()
  try {
    const { data, error } = await auth.signInWithPassword({ email: normalizedEmail, password })
    if (error?.code === 'email_not_confirmed' || /email not confirmed/iu.test(error?.message ?? '')) {
      return {
        ok: false,
        error: 'Verify your email before signing in.',
        reason: 'email_unconfirmed',
        email: normalizedEmail,
      }
    }
    if (error || !data.session) return { ok: false, error: 'Unable to sign in. Check your email and password.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Unable to connect. Please try again.' }
  }
}

export async function setAccountPassword(
  auth: { updateUser(attributes: { password: string }): Promise<{ error: { message: string } | null }> },
  password: string,
  confirmation: string,
): Promise<AuthResult> {
  if (password.length < 12) return { ok: false, error: 'Use at least 12 characters.' }
  if (password !== confirmation) return { ok: false, error: 'Passwords do not match.' }
  try {
    const { error } = await auth.updateUser({ password })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Unable to connect. Please try again.' }
  }
}
