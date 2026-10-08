'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlmaworksBrand } from '@/components/AlmaworksBrand'
import { requestAccountSetupCode, verifyAccountSetupCode } from '@/src/auth/password-auth'
import { registrationResendSeconds } from '@/src/auth/password-registration'
import { createClient } from '@/utils/supabase/client'

const emailStorageKey = 'almaworks.setup.email'

export default function ActivatePage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#002147]" />}><ActivateForm /></Suspense>
}

function ActivateForm() {
  const router = useRouter()
  const auth = useMemo(() => createClient().auth, [])
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeType, setCodeType] = useState<'invite' | 'email'>(() => searchParams.get('invite') === '1' ? 'invite' : 'email')
  const [awaitingCode, setAwaitingCode] = useState(() => searchParams.get('invite') === '1' || searchParams.get('sent') === '1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [availableAt, setAvailableAt] = useState(() => searchParams.get('sent') === '1' ? Date.now() + 60_000 : 0)
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setEmail(window.sessionStorage.getItem(emailStorageKey) ?? '') } catch { /* Manual entry remains available. */ }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const update = () => setSeconds(registrationResendSeconds(availableAt, Date.now()))
    update()
    if (availableAt <= Date.now()) return
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [availableAt])

  async function sendCode() {
    if (loading || seconds > 0) return
    setLoading(true); setError(null); setMessage(null); setCode('')
    const result = await requestAccountSetupCode(auth, email)
    if (result.ok) {
      try { window.sessionStorage.setItem(emailStorageKey, email.trim().toLowerCase()) } catch { /* No code or credential is stored. */ }
      setCodeType('email'); setAwaitingCode(true); setAvailableAt(Date.now() + 60_000)
      window.history.replaceState(null, '', '/activate?sent=1')
      setMessage('If you have an Almaworks account, a code is on its way. Check your inbox and spam folder.')
    } else setError(result.error)
    setLoading(false)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!awaitingCode) { await sendCode(); return }
    if (loading) return
    setLoading(true); setError(null); setMessage(null)
    const result = await verifyAccountSetupCode(auth, email, code, codeType)
    setCode('')
    if (result.ok) {
      try { window.sessionStorage.removeItem(emailStorageKey) } catch { /* Storage is optional. */ }
      router.push('/account/password?reset=1')
      return
    }
    setError(result.error); setLoading(false)
  }

  return <main className="min-h-screen bg-[#002147] px-4 py-8 sm:py-12">
    <div className="mx-auto mb-6 flex w-full max-w-md items-center justify-between gap-4">
      <AlmaworksBrand tone="white" iconSize={32} priority />
      <Link href="/" className="text-sm font-medium text-[#75AADB]">Sign in</Link>
    </div>
    <section className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-8" aria-labelledby="setup-title">
      <h1 id="setup-title" className="text-2xl font-semibold text-[#002147]">{awaitingCode ? 'Enter your verification code' : 'Set up your account'}</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">{awaitingCode
        ? 'Use the code from your email to verify your address, then create your password and continue to your profile.'
        : 'Already invited to Almaworks? Enter your invited email address and we’ll send a code to help you get started.'}</p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <label htmlFor="setup-email" className="block text-sm font-medium text-gray-700">Invited email
          <input id="setup-email" type="email" autoComplete="email" required value={email} disabled={loading}
            onChange={event => { setEmail(event.target.value); setCode(''); setError(null) }}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/50 disabled:opacity-60" />
        </label>
        {awaitingCode && <label htmlFor="setup-code" className="block text-sm font-medium text-gray-700">Verification code
          <input id="setup-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}|[0-9]{8}" maxLength={8} required value={code} disabled={loading}
            onChange={event => setCode(event.target.value.replace(/\D/gu, '').slice(0, 8))}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-xl tracking-[0.25em] text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/50 disabled:opacity-60" />
        </label>}
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>}
        <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#002147] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {loading ? 'Please wait…' : awaitingCode ? 'Verify and create password' : 'Email me a code'}
        </button>
      </form>
      {awaitingCode && <button type="button" onClick={() => void sendCode()} disabled={loading || seconds > 0}
        className="mt-4 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-[#002147] disabled:text-gray-400">
        {seconds > 0 ? `Request a new code in ${seconds}s` : 'Request a new code'}
      </button>}
      <p className="mt-6 text-center text-sm leading-6 text-gray-600">Already have a password? <Link href="/" className="text-[#002147] underline">Sign in</Link>.
        {' '}Need an invitation? <Link href="/request-access" className="text-[#002147] underline">Request access</Link>.</p>
    </section>
  </main>
}
