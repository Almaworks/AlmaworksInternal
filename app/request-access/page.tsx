'use client'

import { AlmaworksBrand } from '@/components/AlmaworksBrand'
import {
  rememberRegistrationEmail,
  requestPasswordRegistration,
  type RegistrationPreference,
} from '@/src/auth/password-registration'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { useMemo, useState } from 'react'

export default function RequestAccessPage() {
  const supabase = useMemo(() => createClient(), [])
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [requestedRole, setRequestedRole] = useState<RegistrationPreference>('startup')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function continueWithGoogle() {
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (oauthError) {
        setError('Unable to continue with Google. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Unable to connect. Please try again.')
      setLoading(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    const result = await requestPasswordRegistration(supabase.auth, { fullName, email, password, requestedRole })
    setPassword('')
    if (result.ok) {
      rememberRegistrationEmail(window.sessionStorage, result.email)
      window.location.assign('/verify-email?sent=1')
      return
    }
    setError(result.error)
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-[#002147] px-4 py-8 sm:py-12">
      <div className="mx-auto mb-6 flex w-full max-w-lg items-center justify-between">
        <AlmaworksBrand tone="white" iconSize={32} priority />
        <Link href="/" className="text-sm font-medium text-[#75AADB] hover:text-white">Sign in</Link>
      </div>

      <section className="mx-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-8" aria-labelledby="request-access-title">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#477f9f]">Join the program</p>
        <h1 id="request-access-title" className="mt-2 text-2xl font-semibold text-[#002147]">Request Almaworks access</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Create your sign-in, verify your email, and an Almaworks administrator will review your request.
        </p>

        <button type="button" onClick={() => void continueWithGoogle()} disabled={loading}
          className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
          <GoogleIcon />
          Continue with Google
        </button>
        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-gray-100" />
          <span className="text-xs text-gray-400">or use email</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>

        <form onSubmit={submit} className="space-y-5">
          <label className="block text-sm font-medium text-gray-700" htmlFor="request-full-name">
            Full name
            <input id="request-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)}
              autoComplete="name" required disabled={loading}
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/50 disabled:opacity-60" />
          </label>

          <label className="block text-sm font-medium text-gray-700" htmlFor="request-email">
            Email
            <input id="request-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)}
              autoComplete="email" required disabled={loading}
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/50 disabled:opacity-60" />
          </label>

          <label className="block text-sm font-medium text-gray-700" htmlFor="request-password">
            Password
            <input id="request-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password" minLength={12} required disabled={loading}
              aria-describedby="request-password-help"
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/50 disabled:opacity-60" />
            <span id="request-password-help" className="mt-1.5 block text-xs font-normal text-gray-500">Use at least 12 characters.</span>
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-gray-700">How do you expect to participate?</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {(['startup', 'mentor'] as const).map((role) => (
                <label key={role} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${requestedRole === role ? 'border-[#002147] bg-[#002147]/5 text-[#002147]' : 'border-gray-200 text-gray-700'}`}>
                  <input type="radio" name="requested-role" value={role} checked={requestedRole === role}
                    onChange={() => setRequestedRole(role)} disabled={loading} />
                  {role === 'startup' ? 'Startup participant' : 'Mentor'}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-500">This is a preference for review. It does not grant a role or program access.</p>
          </fieldset>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-[#002147] px-4 py-3 text-sm font-semibold text-white hover:bg-[#002147]/90 disabled:opacity-60">
            {loading ? 'Submitting…' : 'Continue to email verification'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs leading-5 text-gray-600">
          Read our <Link href="/terms" className="underline">Terms of service</Link> and <Link href="/privacy" className="underline">Privacy policy</Link> before requesting access.
        </p>
        <div className="mt-6 border-t border-gray-100 pt-5 text-center text-sm text-gray-600">
          Already have an account? <Link href="/" className="font-medium text-[#002147] underline">Sign in</Link>
          {' '}or <Link href="/forgot-password" className="font-medium text-[#002147] underline">reset your password</Link>.
        </div>
      </section>
    </main>
  )
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  )
}
