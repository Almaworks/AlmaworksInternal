'use client'

import { createClient } from '@/utils/supabase/client'
import { AlmaworksBrand } from '@/components/AlmaworksBrand'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { passwordSignIn, verifyAccountSetupCode } from '@/src/auth/password-auth'
import { rememberRegistrationEmail } from '@/src/auth/password-registration'
import { loadCanonicalAccess } from '@/src/program/canonical-access'
import { resolvePostLoginDestination } from '@/src/auth/profile-access'

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#002147]" />}>
      <SignInContent />
    </Suspense>
  )
}

function SignInContent() {
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()

  const errorParam = searchParams.get('error')
  const initialError =
    errorParam === 'link_expired'
      ? 'Your verification or recovery link expired. Please request a new one.'
      : errorParam === 'no_session'
      ? 'Sign-in failed. Please try again.'
      : errorParam === 'account_inactive'
      ? 'Your account has been deactivated. Contact an Almaworks admin to restore access.'
      : errorParam === 'identity_link_missing'
      ? 'Your sign-in succeeded, but your Almaworks profile is not linked. Contact an Almaworks admin.'
      : errorParam === 'identity_lookup_failed'
      ? 'We could not verify your Almaworks profile. Please try signing in again.'
      : errorParam === 'auth_unavailable'
      ? 'We cannot reach the sign-in service right now. Please try again shortly.'
      : errorParam === 'signin_failed'
      ? 'Sign-in failed. Please try again.'
      : null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'email' | 'password' | 'code'>('email')
  const [code, setCode] = useState('')
  const [resendAt, setResendAt] = useState(0)

  async function beginSignIn() {
    const response = await fetch('/api/auth/sign-in/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    })
    const body = await response.json() as { mode?: 'password' | 'code'; error?: string }
    if (!response.ok || !body.mode) throw new Error(body.error ?? 'Unable to start sign-in.')
    setStep(body.mode)
    setCode('')
    if (body.mode === 'code') setResendAt(Date.now() + 60_000)
  }

  async function resendCode() {
    if (loading) return
    if (Date.now() < resendAt) { setError('Please wait a minute before requesting another code.'); return }
    setLoading(true); setError(null)
    try { await beginSignIn() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to send code.') }
    finally { setLoading(false) }
  }

  async function signInWithGoogle() {
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) { setError(error.message); setLoading(false) }
    } catch {
      setError('Unable to connect. Please try again.')
      setLoading(false)
    }
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setError(null)
    setLoading(true)
    if (step === 'email') {
      try { await beginSignIn() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to start sign-in.') }
      finally { setLoading(false) }
      return
    }
    if (step === 'code') {
      const verified = await verifyAccountSetupCode(supabase.auth, email, code, 'email')
      if (verified.ok) {
        try {
          const { data, error: identityError } = await supabase.auth.getUser()
          if (identityError || !data.user) throw new Error('Your verification session could not be confirmed.')
          const access = await loadCanonicalAccess(supabase, data.user.id)
          window.location.assign(access?.status === 'approved' && access.role ? '/account/password?setup=1' : resolvePostLoginDestination(access))
          return
        } catch { setError('Your email is verified, but your account could not be loaded. Please try signing in again.'); setLoading(false); return }
      }
      setError(verified.error); setLoading(false); return
    }
    const result = await passwordSignIn(supabase.auth, email, password)
    setPassword('')
    if (result.ok) {
      window.location.assign('/dashboard')
    } else if (result.reason === 'email_unconfirmed' && result.email) {
      rememberRegistrationEmail(window.sessionStorage, result.email)
      window.location.assign('/verify-email')
    } else {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#002147] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-6">
        <AlmaworksBrand tone="white" iconSize={34} priority />
        <Link
          href="/learn-more"
          className="text-[#75AADB] text-sm font-medium hover:text-white transition-colors"
        >
          Learn more →
        </Link>
      </div>

      {/* Center card */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
          {/* Logo mark */}
          <div className="mb-6">
            <AlmaworksBrand compact iconSize={48} />
          </div>

          <h1 className="text-2xl font-semibold text-[#002147] mb-1">Welcome</h1>
          <p className="text-sm text-gray-500 mb-8">
            Sign in to the Almaworks internal platform
          </p>

          {/* Google */}
          <button
            onClick={signInWithGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>

          <form onSubmit={signIn} className="space-y-3">
            <label htmlFor="sign-in-email" className="block text-sm text-gray-700">Email</label>
            <input
              id="sign-in-email"
              autoComplete="username"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => { setEmail(e.target.value); setStep('email'); setPassword(''); setCode(''); setError(null) }}
              disabled={loading}
              required
              className="w-full text-sm text-gray-800 placeholder:text-gray-500 border border-gray-300 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
            />

            {step === 'password' && <><label htmlFor="sign-in-password" className="block text-sm text-gray-700">Password</label>
            <input id="sign-in-password" type="password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full text-sm text-gray-800 border border-gray-300 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" /></>}
            {step === 'code' && <>
              <p role="status" className="text-sm text-gray-600">Enter the fresh code from your email to begin account setup.</p>
              <label htmlFor="sign-in-code" className="block text-sm text-gray-700">Verification code</label>
              <input id="sign-in-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}|[0-9]{8}" maxLength={8} required value={code} disabled={loading}
                onChange={event => setCode(event.target.value.replace(/\D/gu, '').slice(0, 8))}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-xl tracking-widest text-gray-900" />
            </>}

            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#002147] text-white text-sm font-medium rounded-xl hover:bg-[#002147]/90 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Please wait…' : step === 'email' ? 'Continue' : step === 'code' ? 'Verify and continue' : 'Sign in'}
            </button>
          </form>
          {step === 'code' && <button type="button" onClick={() => void resendCode()} disabled={loading} className="mt-3 w-full text-sm text-[#002147] underline">Request a new code</button>}
          <p className="mt-3 text-center text-xs text-gray-500 leading-relaxed">
            <Link href="/forgot-password" className="text-[#002147] underline">Forgot your password?</Link>
          </p>
          <p className="mt-3 text-center text-sm text-gray-600 leading-relaxed">
            Invited but haven’t set a password?{' '}
            Enter your email and choose Continue to begin setup.
          </p>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              New to Almaworks?{' '}
              <Link href="/request-access" className="font-medium text-[#002147] underline">Request access</Link>.
              {' '}An administrator reviews every request.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-6 text-center">
        <nav aria-label="Legal" className="mb-3 flex justify-center gap-5 text-sm text-[#b7d8f3]">
          <Link href="/privacy" className="underline underline-offset-4 hover:text-white">Privacy policy</Link>
          <Link href="/terms" className="underline underline-offset-4 hover:text-white">Terms of service</Link>
        </nav>
        <p className="text-[#75AADB]/60 text-xs">
          © 2026 Almaworks · Columbia University
        </p>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}
