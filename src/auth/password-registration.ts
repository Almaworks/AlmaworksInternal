export type RegistrationPreference = 'mentor' | 'startup'

type AuthError = { message: string; code?: string }
type AuthResult = { ok: true } | { ok: false; error: string }
type RegistrationResult = { ok: true; email: string } | { ok: false; error: string }

type PasswordRegistrationAuth = {
  signUp(credentials: {
    email: string
    password: string
    options: { data: { full_name: string; requested_role: RegistrationPreference; access_request_submitted: true } }
  }): Promise<{
    data: { user: { id: string } | null; session: unknown | null }
    error: AuthError | null
  }>
}

type SignupOtpAuth = {
  verifyOtp(params: { email: string; token: string; type: 'signup' }): Promise<{
    data: { session: unknown | null }
    error: AuthError | null
  }>
}

type SignupResendAuth = {
  resend(params: { type: 'signup'; email: string }): Promise<{ error: AuthError | null }>
}

type RegistrationStorage = Pick<Storage, 'getItem' | 'setItem'>

const registrationEmailKey = 'almaworks.registration.email'
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isExistingAccountError(error: AuthError): boolean {
  return error.code === 'user_already_exists' || /already (?:been )?registered|already exists/iu.test(error.message)
}

export async function requestPasswordRegistration(
  auth: PasswordRegistrationAuth,
  input: { fullName: string; email: string; password: string; requestedRole: RegistrationPreference },
): Promise<RegistrationResult> {
  const fullName = input.fullName.trim()
  const email = normalizeEmail(input.email)
  if (!fullName) return { ok: false, error: 'Enter your full name.' }
  if (!emailPattern.test(email)) return { ok: false, error: 'Enter a valid email address.' }
  if (input.password.length < 12) return { ok: false, error: 'Use at least 12 characters.' }

  try {
    const { error } = await auth.signUp({
      email,
      password: input.password,
      options: { data: { full_name: fullName, requested_role: input.requestedRole, access_request_submitted: true } },
    })
    if (error && !isExistingAccountError(error)) {
      return { ok: false, error: 'Unable to submit your request. Check your details and try again.' }
    }
    return { ok: true, email }
  } catch {
    return { ok: false, error: 'Unable to connect. Please try again.' }
  }
}

export async function verifyRegistrationCode(auth: SignupOtpAuth, emailInput: string, codeInput: string): Promise<AuthResult> {
  const email = normalizeEmail(emailInput)
  const token = codeInput.trim()
  if (!emailPattern.test(email)) return { ok: false, error: 'Enter the email address you used to request access.' }
  if (!/^(?:\d{6}|\d{8})$/u.test(token)) return { ok: false, error: 'Enter the 6- or 8-digit code from your email.' }
  try {
    const { data, error } = await auth.verifyOtp({ email, token, type: 'signup' })
    if (error || !data.session) {
      return { ok: false, error: 'That code is invalid or expired. Request a new code and try again.' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Unable to connect. Please try again.' }
  }
}

export async function resendRegistrationCode(auth: SignupResendAuth, emailInput: string): Promise<AuthResult> {
  const email = normalizeEmail(emailInput)
  if (!emailPattern.test(email)) return { ok: false, error: 'Enter the email address you used to request access.' }
  try {
    const { error } = await auth.resend({ type: 'signup', email })
    if (error) return { ok: false, error: 'We could not resend the code yet. Please wait a moment and try again.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Unable to connect. Please try again.' }
  }
}

export function rememberRegistrationEmail(storage: RegistrationStorage, emailInput: string): void {
  try {
    storage.setItem(registrationEmailKey, normalizeEmail(emailInput))
  } catch {
    // Browsers can disable session storage; the verification form still accepts the email manually.
  }
}

export function readRegistrationEmail(storage: RegistrationStorage): string | null {
  try {
    const email = storage.getItem(registrationEmailKey)
    return email ? normalizeEmail(email) : null
  } catch {
    return null
  }
}

export function registrationResendSeconds(availableAt: number, now: number): number {
  return Math.max(0, Math.ceil((availableAt - now) / 1_000))
}
