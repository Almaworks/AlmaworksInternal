import assert from 'node:assert/strict'
import test from 'node:test'
import {
  passwordResetCallbackPath,
  passwordSignIn,
  requestPasswordReset,
  resolvePasswordResetDestination,
  setAccountPassword,
} from '../../src/auth/password-auth.ts'

test('password login forwards exact password and normalizes email', async () => {
  const result = await passwordSignIn({ signInWithPassword: async (credentials) => {
    assert.deepEqual(credentials, { email: 'qa@example.test', password: '  exact password  ' })
    return { data: { session: {} }, error: null }
  } }, ' qa@example.test ', '  exact password  ')
  assert.deepEqual(result, { ok: true })
})

test('invalid credentials and missing sessions never report successful login', async () => {
  for (const response of [
    { data: { session: null }, error: { message: 'Invalid login credentials' } },
    { data: { session: null }, error: null },
  ]) {
    assert.equal((await passwordSignIn({ signInWithPassword: async () => response }, 'qa@example.test', 'bad')).ok, false)
  }
})

test('network errors become a recoverable result', async () => {
  assert.equal((await passwordSignIn({ signInWithPassword: async () => { throw new Error('network') } }, 'qa@example.test', 'password')).ok, false)
})

test('an unconfirmed password account is directed to email verification', async () => {
  const result = await passwordSignIn({ signInWithPassword: async () => ({
    data: { session: null },
    error: { message: 'Email not confirmed', code: 'email_not_confirmed' },
  }) }, ' Member@Example.Test ', 'password')
  assert.deepEqual(result, {
    ok: false,
    error: 'Verify your email before signing in.',
    reason: 'email_unconfirmed',
    email: 'member@example.test',
  })
})

test('password setup rejects mismatch and short passwords before calling auth', async () => {
  const auth = { updateUser: async () => { assert.fail('must not mutate') } }
  assert.equal((await setAccountPassword(auth, 'long-password', 'different')).ok, false)
  assert.equal((await setAccountPassword(auth, 'short', 'short')).ok, false)
})

test('password setup updates only password and handles provider rejection', async () => {
  const result = await setAccountPassword({ updateUser: async (attributes) => {
    assert.deepEqual(attributes, { password: 'new-long-password' })
    return { error: null }
  } }, 'new-long-password', 'new-long-password')
  assert.equal(result.ok, true)
  assert.equal((await setAccountPassword({ updateUser: async () => ({ error: { message: 'Reauthentication required' } }) }, 'new-long-password', 'new-long-password')).ok, false)
})

test('password reset requests a recovery email using the approved local callback', async () => {
  const result = await requestPasswordReset({ resetPasswordForEmail: async (email, options) => {
    assert.equal(email, 'member@example.test')
    assert.deepEqual(options, { redirectTo: 'https://almaworks.test/auth/callback?next=%2Faccount%2Fpassword%3Freset%3D1' })
    return { error: null }
  } }, ' member@example.test ', 'https://almaworks.test')

  assert.deepEqual(result, { ok: true })
  assert.equal(passwordResetCallbackPath(), '/auth/callback?next=%2Faccount%2Fpassword%3Freset%3D1')
})

test('password reset hides account existence and reports connection failures', async () => {
  const providerError = await requestPasswordReset({ resetPasswordForEmail: async () => ({ error: { message: 'User not found' } }) }, 'member@example.test', 'https://almaworks.test')
  assert.deepEqual(providerError, { ok: true })

  const connectionError = await requestPasswordReset({ resetPasswordForEmail: async () => { throw new Error('network') } }, 'member@example.test', 'https://almaworks.test')
  assert.deepEqual(connectionError, { ok: false, error: 'Unable to connect. Please try again.' })
})

test('only the password-reset callback can bypass the normal post-login destination', () => {
  assert.equal(resolvePasswordResetDestination('/account/password?reset=1', '/dashboard'), '/account/password?reset=1')
  assert.equal(resolvePasswordResetDestination('/dashboard', '/dashboard'), '/dashboard')
  assert.equal(resolvePasswordResetDestination('https://attacker.example', '/dashboard'), '/dashboard')
})

test('password reset does not claim delivery when the provider is unavailable or rate limited', async () => {
  for (const status of [429, 503]) {
    const result = await requestPasswordReset({ resetPasswordForEmail: async () => ({ error: { message: 'provider failure', status } }) }, 'member@example.test', 'https://almaworks.test')
    assert.equal(result.ok, false)
  }
})
