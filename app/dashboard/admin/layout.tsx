import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { resolveAdminRouteAccess } from '@/src/auth/admin-route'
import type { Database } from '@/src/db/types'

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
    redirect(resolveAdminRouteAccess({ authenticated: false, profile: null }) ?? '/')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .maybeSingle()

  const destination = resolveAdminRouteAccess({
    authenticated: true,
    profile: profileError ? null : profile,
  })
  if (destination) redirect(destination)

  return children
}
