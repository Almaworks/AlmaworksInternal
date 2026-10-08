'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { setAccountPassword } from '@/src/auth/password-auth'

export default function AccountPasswordPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#002147]" />}><AccountPasswordContent /></Suspense>
}

function AccountPasswordContent() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const searchParams = useSearchParams()
  const isReset = searchParams.get('reset') === '1'
  const [authenticated, setAuthenticated] = useState(false)
  const [checked, setChecked] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data, error }) => {
      if (active) { setAuthenticated(!error && !!data.user); setChecked(true) }
    }).catch(() => { if (active) setChecked(true) })
    return () => { active = false }
  }, [supabase])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (loading || !authenticated) return
    setLoading(true)
    setError(null)
    setSaved(false)
    const result = await setAccountPassword(supabase.auth, password, confirmation)
    if (result.ok) {
      setPassword(''); setConfirmation(''); setSaved(true)
      if (isReset) { router.push('/dashboard'); return }
    }
    else setError(result.error)
    setLoading(false)
  }

  return <main className="min-h-screen bg-[#002147] flex items-center justify-center px-4 py-12">
    <section className="w-full max-w-sm rounded-2xl bg-white p-8 text-gray-800 shadow-xl">
      <h1 className="text-2xl font-semibold text-[#002147]">{isReset ? 'Create a new password' : 'Change password'}</h1>
      {!checked ? <p role="status" className="mt-4">Checking your session…</p> : !authenticated ? <p className="mt-4">
        Your setup or reset session is no longer active. <Link href="/activate" className="underline">Request a new setup code</Link> or <Link href="/forgot-password" className="underline">reset your password</Link>.
      </p> : <>
        <p className="my-4 text-sm text-gray-600">{isReset ? 'Choose a new password for your Almaworks account.' : 'Update the password you use to sign in to Almaworks.'} Use at least 12 characters.</p>
        <form onSubmit={save} className="space-y-4">
          <label className="block text-sm">New password
            <input type="password" autoComplete="new-password" minLength={12} required value={password}
              onChange={e => setPassword(e.target.value)} disabled={loading}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3" />
          </label>
          <label className="block text-sm">Confirm password
            <input type="password" autoComplete="new-password" minLength={12} required value={confirmation}
              onChange={e => setConfirmation(e.target.value)} disabled={loading}
              className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-3" />
          </label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {saved && <p role="status" className="text-sm text-green-700">Password updated. You can now sign in with your email and password.</p>}
          <button disabled={loading} className="w-full rounded-xl bg-[#002147] py-3 text-white disabled:opacity-60">
            {loading ? 'Saving…' : 'Save password'}
          </button>
        </form>
        <Link href="/dashboard" className="mt-6 block text-sm underline">Return to dashboard</Link>
      </>}
    </section>
  </main>
}
