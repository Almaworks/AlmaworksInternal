'use client'

import { createClient } from '@/utils/supabase/client'
import { AlmaworksBrand } from '@/components/AlmaworksBrand'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { resolvePostLoginDestination } from '@/src/auth/profile-access'
import { loadCanonicalAccess } from '@/src/program/canonical-access'

export default function PendingPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    async function checkStatus() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? null)
      try {
        const access = await loadCanonicalAccess(supabase, user.id)
        const destination = resolvePostLoginDestination(access)
        if (destination !== '/pending') router.replace(destination)
      } catch {
        router.replace('/?error=identity_lookup_failed')
      }
    }
    checkStatus()
  }, [supabase, router])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-[#002147] flex flex-col">
      <div className="flex items-center justify-between px-8 py-6">
        <AlmaworksBrand tone="white" iconSize={32} priority />
      </div>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
          {/* Pending icon */}
          <div className="w-14 h-14 rounded-full bg-yellow-50 border-2 border-yellow-200 flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          <h1 className="text-xl font-semibold text-[#002147] mb-2">
            Account pending approval
          </h1>
          <p className="text-sm text-gray-500 mb-1">
            Thanks for signing up{email ? `, ${email}` : ''}.
          </p>
          <p className="text-sm text-gray-500 mb-8">
            An Almaworks admin will review your request and assign your role.
            You&apos;ll be able to sign in once approved.
          </p>

          <p className="text-xs text-gray-400 mb-6">
            Questions? Email us at{' '}
            <a href="mailto:almaworkscu@gmail.com" className="text-[#002147] underline">
              almaworkscu@gmail.com
            </a>
          </p>

          <button
            onClick={signOut}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="px-8 py-6 text-center">
        <p className="text-[#75AADB]/60 text-xs">© 2026 Almaworks · Columbia University</p>
      </div>
    </div>
  )
}
