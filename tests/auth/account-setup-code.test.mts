import assert from 'node:assert/strict'
import test from 'node:test'
import { requestAccountSetupCode as request, verifyAccountSetupCode as verify } from '../../src/auth/password-auth.ts'

test('setup code request uses an existing identity without creating users or changing metadata', async () => {
  assert.equal(typeof request, 'function', 'setup code request is implemented')
  const result = await request({ signInWithOtp: async (input: unknown) => {
    assert.deepEqual(input, { email: 'mentor@example.test', options: { shouldCreateUser: false } })
    return { error: null }
  } }, ' Mentor@Example.Test ')
  assert.deepEqual(result, { ok: true })
})

test('setup requests conceal unknown-account errors but surface service failures without details', async () => {
  assert.equal(typeof request, 'function')
  assert.deepEqual(await request({ signInWithOtp: async () => ({ error: { code: 'signup_disabled', status: 400 } }) }, 'absent@example.test'), { ok: true })
  for (const status of [429, 500]) {
    const result = await request({ signInWithOtp: async () => ({ error: { status, message: 'secret database details' } }) }, 'mentor@example.test')
    assert.equal(result.ok, false)
    if (result.ok) assert.fail('service error accepted')
    assert.doesNotMatch(result.error, /secret|database/u)
  }
})

test('both invitation and fresh email codes require the exact email/code and a returned session', async () => {
  assert.equal(typeof verify, 'function')
  for (const type of ['invite', 'email']) {
    const result = await verify({ verifyOtp: async (input: unknown) => {
      assert.deepEqual(input, { email: 'mentor@example.test', token: '123456', type })
      return { data: { session: {} }, error: null }
    } }, ' Mentor@Example.Test ', ' 123456 ', type)
    assert.deepEqual(result, { ok: true })
  }
  for (const response of [
    { data: { session: null }, error: null },
    { data: { session: null }, error: { code: 'otp_expired' } },
    { data: { session: {} }, error: { message: 'wrong email or code' } },
  ]) {
    const result = await verify({ verifyOtp: async () => response }, 'mentor@example.test', '123456', 'email')
    assert.equal(result.ok, false)
    if (result.ok) assert.fail('invalid code accepted')
    assert.match(result.error, /invalid or expired/u)
  }
})

test('invalid code, email and token type are rejected before Auth calls', async () => {
  assert.equal(typeof request, 'function')
  assert.equal(typeof verify, 'function')
  const auth = { signInWithOtp: async () => { assert.fail('invalid input reached Auth') }, verifyOtp: async () => { assert.fail('invalid input reached Auth') } }
  assert.equal((await request(auth, 'invalid')).ok, false)
  assert.equal((await verify(auth, 'mentor@example.test', '12345', 'email')).ok, false)
  assert.equal((await verify(auth, 'invalid', '123456', 'email')).ok, false)
  assert.equal((await verify(auth, 'mentor@example.test', '123456', 'recovery')).ok, false)
})
