import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { loadAdminRouteAuthority } from '@/src/auth/admin-capability'
import { resolveSuperAdminRouteAccess } from '@/src/auth/admin-route'
import type { Database } from '@/src/db/types'

type AdminProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'role' | 'status'
>

const NO_ADMIN_AUTHORITY = {
  isSuperAdmin: false,
  hasActiveSemesterAdminMembership: false,
  lookupFailed: false,
}

export default async function SemesterRouteLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Server Components cannot always write refreshed cookies; the proxy owns that refresh path.
          }
        },
      },
    },
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect(resolveSuperAdminRouteAccess({
      authenticated: false,
      profile: null,
      authority: NO_ADMIN_AUTHORITY,
    }) ?? '/')
  }

  const profileResult = await supabase
    .from('profiles')
    .select('id, role, status')
    .eq('auth_user_id', user.id)
    .limit(1)
  // The generated database schema predates the installed client's table generic.
  // Keep the compatibility cast at the selected response boundary, never at the client.
  const profileRows = profileResult.data as AdminProfileRow[] | null
  const profile = profileRows?.[0] ?? null

  if (profileResult.error || !profile) {
    redirect(resolveSuperAdminRouteAccess({
      authenticated: true,
      profile: null,
      authority: NO_ADMIN_AUTHORITY,
    }) ?? '/pending')
  }

  if (profile.status !== 'approved') {
    redirect(resolveSuperAdminRouteAccess({
      authenticated: true,
      profile,
      authority: NO_ADMIN_AUTHORITY,
    }) ?? '/pending')
  }

  const authority = await loadAdminRouteAuthority(supabase, profile.id)

  const destination = resolveSuperAdminRouteAccess({
    authenticated: true,
    profile,
    authority,
  })
  if (destination) redirect(destination)

  return children
}
