'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { requestPasswordReset } from '@/src/auth/password-auth'

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    setSent(false)
    const result = await requestPasswordReset(supabase.auth, email, window.location.origin)
    if (result.ok) setSent(true)
    else setError(result.error)
    setLoading(false)
  }

  return <main className="min-h-screen bg-[#002147] flex items-center justify-center px-4 py-12">
    <section className="w-full max-w-sm rounded-2xl bg-white p-8 text-gray-800 shadow-xl">
      <h1 className="text-2xl font-semibold text-[#002147]">Forgot your password?</h1>
      <p className="my-4 text-sm text-gray-600">Enter your Almaworks email and we’ll send a secure link to reset your password.</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">Email
          <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading}
            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {sent && <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">If an Almaworks account matches this email, check your inbox for a secure reset link.</p>}
        <button disabled={loading} className="w-full rounded-xl bg-[#002147] py-3 text-white disabled:opacity-60">
          {loading ? 'Sending…' : 'Email me a reset link'}
        </button>
      </form>
      <Link href="/" className="mt-6 block text-sm underline">Back to sign in</Link>
    </section>
  </main>
}
