import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readRegistrationEmail,
  registrationResendSeconds,
  rememberRegistrationEmail,
  requestPasswordRegistration,
  resendRegistrationCode,
  verifyRegistrationCode,
} from '../../src/auth/password-registration.ts'

test('registration normalizes identity fields and sends only approved metadata', async () => {
  const result = await requestPasswordRegistration({ signUp: async (credentials) => {
    assert.deepEqual(credentials, {
      email: 'founder@example.test',
      password: '  exact long password  ',
      options: {
        data: {
          full_name: 'Ada Founder',
          requested_role: 'startup',
          access_request_submitted: true,
        },
      },
    })
    return { data: { user: { id: 'user-1' }, session: null }, error: null }
  } }, {
    fullName: '  Ada Founder  ',
    email: ' Founder@Example.Test ',
    password: '  exact long password  ',
    requestedRole: 'startup',
  })

  assert.deepEqual(result, { ok: true, email: 'founder@example.test' })
})

test('registration rejects invalid input before contacting Supabase', async () => {
  const auth = { signUp: async () => { assert.fail('must not contact auth') } }
  assert.deepEqual(await requestPasswordRegistration(auth, {
    fullName: '', email: 'member@example.test', password: 'long-enough-password', requestedRole: 'mentor',
  }), { ok: false, error: 'Enter your full name.' })
  assert.deepEqual(await requestPasswordRegistration(auth, {
    fullName: 'Member', email: 'not-an-email', password: 'long-enough-password', requestedRole: 'mentor',
  }), { ok: false, error: 'Enter a valid email address.' })
  assert.deepEqual(await requestPasswordRegistration(auth, {
    fullName: 'Member', email: 'member@example.test', password: 'short', requestedRole: 'mentor',
  }), { ok: false, error: 'Use at least 12 characters.' })
})

test('registration does not reveal whether an account already exists', async () => {
  const result = await requestPasswordRegistration({ signUp: async () => ({
    data: { user: null, session: null },
    error: { message: 'User already registered', code: 'user_already_exists' },
  }) }, {
    fullName: 'Existing Member', email: 'existing@example.test', password: 'long-enough-password', requestedRole: 'mentor',
  })

  assert.deepEqual(result, { ok: true, email: 'existing@example.test' })
})

test('registration code verification uses the signup OTP type and requires a session', async () => {
  const success = await verifyRegistrationCode({ verifyOtp: async (params) => {
    assert.deepEqual(params, { email: 'member@example.test', token: '123456', type: 'signup' })
    return { data: { session: { access_token: 'token' } }, error: null }
  } }, ' Member@Example.Test ', ' 123456 ')
  assert.deepEqual(success, { ok: true })

  const missingSession = await verifyRegistrationCode({ verifyOtp: async () => ({ data: { session: null }, error: null }) }, 'member@example.test', '123456')
  assert.deepEqual(missingSession, { ok: false, error: 'That code is invalid or expired. Request a new code and try again.' })
})

test('registration code validation and provider errors use neutral messages', async () => {
  const auth = { verifyOtp: async () => { assert.fail('must not contact auth') } }
  assert.deepEqual(await verifyRegistrationCode(auth, 'member@example.test', '12ab'), {
    ok: false,
    error: 'Enter the 6- or 8-digit code from your email.',
  })

  const rejected = await verifyRegistrationCode({ verifyOtp: async () => ({
    data: { session: null }, error: { message: 'Token has expired' },
  }) }, 'member@example.test', '123456')
  assert.deepEqual(rejected, { ok: false, error: 'That code is invalid or expired. Request a new code and try again.' })
})

test('registration accepts eight-digit provider codes without losing leading zeros', async () => {
  const result = await verifyRegistrationCode({ verifyOtp: async (params) => {
    assert.equal(params.token, '00123456')
    assert.equal(params.type, 'signup')
    return { data: { session: { access_token: 'test' } }, error: null }
  } }, 'member@example.test', ' 00123456 ')
  assert.deepEqual(result, { ok: true })
})

test('resend requests a signup code without exposing provider details', async () => {
  const success = await resendRegistrationCode({ resend: async (params) => {
    assert.deepEqual(params, { type: 'signup', email: 'member@example.test' })
    return { error: null }
  } }, ' Member@Example.Test ')
  assert.deepEqual(success, { ok: true })

  const rejected = await resendRegistrationCode({ resend: async () => ({ error: { message: 'rate limit exceeded' } }) }, 'member@example.test')
  assert.deepEqual(rejected, { ok: false, error: 'We could not resend the code yet. Please wait a moment and try again.' })
})

test('registration recovery storage retains only the normalized email and tolerates unavailable storage', () => {
  const writes: Array<[string, string]> = []
  const storage = {
    getItem: (key: string) => key === 'almaworks.registration.email' ? ' Founder@Example.Test ' : null,
    setItem: (key: string, value: string) => { writes.push([key, value]) },
    removeItem: () => undefined,
  }
  rememberRegistrationEmail(storage, ' Founder@Example.Test ')
  assert.deepEqual(writes, [['almaworks.registration.email', 'founder@example.test']])
  assert.equal(readRegistrationEmail(storage), 'founder@example.test')
  assert.equal(readRegistrationEmail({ ...storage, getItem: () => { throw new Error('blocked') } }), null)
})

test('resend countdown rounds up and reaches zero at the deadline', () => {
  assert.equal(registrationResendSeconds(61_000, 1_001), 60)
  assert.equal(registrationResendSeconds(61_000, 61_000), 0)
})
