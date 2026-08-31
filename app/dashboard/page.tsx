'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { loadCanonicalAccess } from '@/src/program/canonical-access'

export default function DashboardRoot() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      const access = await loadCanonicalAccess(supabase, user.id)
      if (!access || access.status !== 'approved' || !access.role) { router.push('/pending'); return }
      if (access.role === 'admin') router.push('/dashboard/admin')
      else if (access.role === 'mentor') router.push('/dashboard/mentor')
      else router.push('/dashboard/startup')
    })
  }, [supabase, router])

  return (
    <div className="flex items-center justify-center h-40">
      <div className="w-5 h-5 border-2 border-[#002147] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
