import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { resolveAdminRouteAccess } from '@/src/auth/admin-route'
import type { Database } from '@/src/db/types'

type AdminProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'role' | 'status'
>
type AdminMembershipRow = Pick<
  Database['public']['Tables']['semester_memberships']['Row'],
  'id'
>

const NO_ADMIN_AUTHORITY = {
  isSuperAdmin: false,
  hasActiveSemesterAdminMembership: false,
  lookupFailed: false,
}

export default async function AdminRouteLayout({ children }: { children: React.ReactNode }) {
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
    redirect(resolveAdminRouteAccess({
      authenticated: false,
      profile: null,
      authority: NO_ADMIN_AUTHORITY,
    }) ?? '/')
  }

  const profileResult = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .limit(1)
  // The generated database schema predates the installed client's table generic.
  // Keep the compatibility cast at the selected response boundary, never at the client.
  const profileRows = profileResult.data as AdminProfileRow[] | null
  const profile = profileRows?.[0] ?? null

  if (profileResult.error || !profile) {
    redirect(resolveAdminRouteAccess({
      authenticated: true,
      profile: null,
      authority: NO_ADMIN_AUTHORITY,
    }) ?? '/pending')
  }

  if (profile.status !== 'approved') {
    redirect(resolveAdminRouteAccess({
      authenticated: true,
      profile,
      authority: NO_ADMIN_AUTHORITY,
    }) ?? '/pending')
  }

  // is_super_admin defaults candidate_id to auth.uid(), the verified user above.
  const superAdminResult = await supabase.rpc('is_super_admin')
  let authority = {
    ...NO_ADMIN_AUTHORITY,
    isSuperAdmin: superAdminResult.data === true,
    lookupFailed: superAdminResult.error !== null,
  }

  if (!authority.lookupFailed && !authority.isSuperAdmin) {
    const membershipResult = await supabase
      .from('semester_memberships')
      .select('id')
      .eq('profile_id', user.id)
      .eq('role', 'admin')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    const membership = membershipResult.data as AdminMembershipRow | null
    authority = {
      ...authority,
      hasActiveSemesterAdminMembership: membership !== null,
      lookupFailed: membershipResult.error !== null,
    }
  }

  const destination = resolveAdminRouteAccess({
    authenticated: true,
    profile,
    authority,
  })
  if (destination) redirect(destination)

  return children
}
