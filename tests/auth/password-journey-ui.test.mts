import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const signInPage = await readFile(new URL('../../app/page.tsx', import.meta.url), 'utf8')
const profileDashboard = await readFile(new URL('../../app/dashboard/participant/ParticipantDashboard.tsx', import.meta.url), 'utf8')
const passwordPage = await readFile(new URL('../../app/account/password/page.tsx', import.meta.url), 'utf8')
const forgotPasswordPage = await readFile(new URL('../../app/forgot-password/page.tsx', import.meta.url), 'utf8')

test('signed-out users can request a password reset directly from sign-in', () => {
  assert.match(signInPage, /Forgot your password\?/u)
  assert.match(signInPage, /href="\/forgot-password"/u)
  assert.match(forgotPasswordPage, /requestPasswordReset/u)
  assert.match(forgotPasswordPage, /Email me a reset link/u)
})

test('Profile account security links signed-in users to change their password', () => {
  const accountCard = profileDashboard.indexOf('<h2>Sign-in & security</h2>')
  const passwordAction = profileDashboard.indexOf('Change password')
  const protectedAccountNote = profileDashboard.indexOf('Protected account change')

  assert.ok(accountCard >= 0)
  assert.ok(passwordAction > accountCard)
  assert.ok(passwordAction < protectedAccountNote)
  assert.match(profileDashboard, /router\.push\("\/account\/password"\)/u)
})

test('the password screen distinguishes recovery from an ordinary password change', () => {
  assert.match(passwordPage, /Create a new password/u)
  assert.match(passwordPage, /Change password/u)
})
