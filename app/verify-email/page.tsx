'use client'

import { AlmaworksBrand } from '@/components/AlmaworksBrand'
import {
  readRegistrationEmail,
  registrationResendSeconds,
  rememberRegistrationEmail,
  resendRegistrationCode,
  verifyRegistrationCode,
} from '@/src/auth/password-registration'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'

const resendDelayMs = 60_000

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#002147]" />}>
      <VerifyEmailContent />
    </Suspense>
  )
}

function VerifyEmailContent() {
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendAvailableAt, setResendAvailableAt] = useState(() => searchParams.get('sent') === '1' ? Date.now() + resendDelayMs : 0)
  const [resendSeconds, setResendSeconds] = useState(() => registrationResendSeconds(resendAvailableAt, Date.now()))

  useEffect(() => {
    const restoreEmail = window.setTimeout(() => setEmail(readRegistrationEmail(window.sessionStorage) ?? ''), 0)
    return () => window.clearTimeout(restoreEmail)
  }, [])

  useEffect(() => {
    const update = () => setResendSeconds(registrationResendSeconds(resendAvailableAt, Date.now()))
    update()
    if (resendAvailableAt <= Date.now()) return
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [resendAvailableAt])

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setError(null)
    setMessage(null)
    setLoading(true)
    rememberRegistrationEmail(window.sessionStorage, email)
    const result = await verifyRegistrationCode(supabase.auth, email, code)
    setCode('')
    if (result.ok) {
      window.location.assign('/pending')
      return
    }
    setError(result.error)
    setLoading(false)
  }

  async function resend() {
    if (loading || resendSeconds > 0) return
    setError(null)
    setMessage(null)
    setLoading(true)
    rememberRegistrationEmail(window.sessionStorage, email)
    const result = await resendRegistrationCode(supabase.auth, email)
    if (result.ok) {
      setMessage('A new verification code is on its way. Check your inbox and spam folder.')
      setResendAvailableAt(Date.now() + resendDelayMs)
    } else {
      setError(result.error)
    }
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-[#002147] px-4 py-8 sm:py-12">
      <div className="mx-auto mb-6 flex w-full max-w-md items-center justify-between">
        <AlmaworksBrand tone="white" iconSize={32} priority />
        <Link href="/" className="text-sm font-medium text-[#75AADB] hover:text-white">Sign in</Link>
      </div>

      <section className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8" aria-labelledby="verify-email-title">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#477f9f]">Email verification</p>
        <h1 id="verify-email-title" className="mt-2 text-2xl font-semibold text-[#002147]">Enter the code from your email</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Verification confirms your email. Your account will still wait for Almaworks administrator approval.
        </p>

        <form onSubmit={verify} className="mt-7 space-y-5">
          <label className="block text-sm font-medium text-gray-700" htmlFor="verification-email">
            Email
            <input id="verification-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)}
              autoComplete="email" required disabled={loading}
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/50 disabled:opacity-60" />
          </label>

          <label className="block text-sm font-medium text-gray-700" htmlFor="verification-code">
            Verification code
            <input id="verification-code" value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 8))}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}|[0-9]{8}" maxLength={8} required disabled={loading}
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-xl tracking-[0.35em] text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/50 disabled:opacity-60" />
          </label>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>}

          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-[#002147] px-4 py-3 text-sm font-semibold text-white hover:bg-[#002147]/90 disabled:opacity-60">
            {loading ? 'Checking…' : 'Verify email'}
          </button>
        </form>

        <button type="button" onClick={() => void resend()} disabled={loading || resendSeconds > 0}
          className="mt-4 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-[#002147] hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400">
          {resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : 'Resend verification code'}
        </button>

        <p className="mt-6 text-center text-xs leading-5 text-gray-500">
          Already verified or already have an account? <Link href="/" className="text-[#002147] underline">Sign in</Link>
          {' '}or <Link href="/forgot-password" className="text-[#002147] underline">reset your password</Link>.
        </p>
      </section>
    </main>
  )
}
