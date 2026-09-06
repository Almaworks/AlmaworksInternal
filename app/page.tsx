'use client'

import { createClient } from '@/utils/supabase/client'
import { AlmaworksBrand } from '@/components/AlmaworksBrand'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#002147]" />}>
      <SignInContent />
    </Suspense>
  )
}

function SignInContent() {
  const supabase = createClient()
  const searchParams = useSearchParams()

  const errorParam = searchParams.get('error')
  const initialError =
    errorParam === 'link_expired'
      ? 'Your sign-in link expired or was opened on a different device. Please request a new one.'
      : errorParam === 'no_session'
      ? 'Sign-in failed. Please request a new magic link.'
      : errorParam === 'account_inactive'
      ? 'Your account has been deactivated. Contact an Almaworks admin to restore access.'
      : errorParam === 'identity_link_missing'
      ? 'Your sign-in succeeded, but your Almaworks profile is not linked. Contact an Almaworks admin.'
      : errorParam === 'identity_lookup_failed'
      ? 'We could not verify your Almaworks profile. Please try signing in again.'
      : null

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email for a magic sign-in link.')
    }

    setLoading(false)
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

          {/* Email magic link */}
          <form onSubmit={sendMagicLink} className="space-y-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full text-sm text-gray-800 placeholder:text-gray-500 border border-gray-300 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
            />

            {error && <p className="text-xs text-red-500">{error}</p>}
            {message && <p className="text-xs text-green-600">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#002147] text-white text-sm font-medium rounded-xl hover:bg-[#002147]/90 disabled:opacity-60 transition-colors"
            >
              {loading ? '…' : 'Send magic link'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              New users will need admin approval before accessing the platform.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-8 py-6 text-center">
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
