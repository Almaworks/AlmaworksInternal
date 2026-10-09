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

type SetupAuthError = { code?: string; status?: number; message?: string }
type SetupCodeRequestAuth = {
  signInWithOtp(input: { email: string; options: { shouldCreateUser: false } }): Promise<{ error: SetupAuthError | null }>
}
type SetupCodeVerifyAuth = {
  verifyOtp(input: { email: string; token: string; type: 'invite' | 'email' }): Promise<{
    data: { session: unknown | null }; error: SetupAuthError | null
  }>
}
const setupEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export async function requestAccountSetupCode(auth: SetupCodeRequestAuth, emailInput: string): Promise<AuthResult> {
  const email = emailInput.trim().toLowerCase()
  if (!setupEmailPattern.test(email)) return { ok: false, error: 'Enter your invited email address.' }
  try {
    const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
    // Keep missing-account responses indistinguishable from accepted requests.
    if (error?.code === 'signup_disabled' || error?.code === 'user_not_found') return { ok: true }
    if (error) return { ok: false, error: 'We could not send a code yet. Please wait a moment and try again.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Unable to connect. Please try again.' }
  }
}

export async function verifyAccountSetupCode(
  auth: SetupCodeVerifyAuth, emailInput: string, codeInput: string, type: string,
): Promise<AuthResult> {
  const email = emailInput.trim().toLowerCase()
  const token = codeInput.trim()
  if (!setupEmailPattern.test(email)) return { ok: false, error: 'Enter your invited email address.' }
  if (!/^(?:\d{6}|\d{8})$/u.test(token)) return { ok: false, error: 'Enter the 6- or 8-digit code from your email.' }
  if (type !== 'invite' && type !== 'email') return { ok: false, error: 'Request a new code and try again.' }
  try {
    const { data, error } = await auth.verifyOtp({ email, token, type })
    if (error || !data.session) return { ok: false, error: 'That code is invalid or expired. Request a new code and try again.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Unable to connect. Please try again.' }
  }
}

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
  auth: { updateUser(attributes: { password: string; data: { almaworks_password_ready: true } }): Promise<{ error: { message: string } | null }> },
  password: string,
  confirmation: string,
): Promise<AuthResult> {
  if (password.length < 12) return { ok: false, error: 'Use at least 12 characters.' }
  if (password !== confirmation) return { ok: false, error: 'Passwords do not match.' }
  try {
    const { error } = await auth.updateUser({ password, data: { almaworks_password_ready: true } })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Unable to connect. Please try again.' }
  }
}
