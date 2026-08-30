import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          )
          res = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession() reads from cookies without a network call — correct for proxy-level routing.
  // Sensitive server actions use getUser() independently to verify the JWT.
  const { data: { session } } = await supabase.auth.getSession()
  const userId = session?.user?.id ?? null
  const { pathname } = req.nextUrl

  // Public routes — no auth required
  if (
    pathname === '/learn-more' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return res
  }

  // Helper: fetch profile for the authenticated user
  async function getProfile() {
    if (!userId) return null
    const { data } = await supabase
      .from('profiles')
      .select('status, role')
      .eq('id', userId)
      .single()
    return data
  }

  async function getOnboardingState(profile: { role: string | null }) {
    if (!userId || (profile.role !== 'mentor' && profile.role !== 'startup')) return null
    const { data: membership } = await supabase
      .from('semester_memberships')
      .select('id, semester_id, status')
      .eq('profile_id', userId)
      .in('status', ['invited', 'onboarding'])
      .order('created_at', { ascending: false })
      .maybeSingle()
    if (!membership) return null

    const { data: progress } = await supabase
      .from('onboarding_progress')
      .select('item_key, completed_at')
      .eq('semester_membership_id', membership.id)
    const requiredKeys = profile.role === 'mentor'
      ? ['identity', 'mentor_profile', 'expertise', 'availability']
      : ['identity', 'company_snapshot', 'team_contacts', 'availability']
    const completed = new Set((progress ?? []).filter((item) => item.completed_at).map((item) => item.item_key))
    return {
      needsOnboarding: !requiredKeys.every((key) => completed.has(key)),
      membershipStatus: membership.status,
    }
  }

  // Root — redirect signed-in approved users to their dashboard
  if (pathname === '/') {
    if (userId) {
      const profile = await getProfile()
      if (profile?.status === 'approved' && profile.role) {
        const dest =
          profile.role === 'admin' ? '/dashboard/admin' :
          profile.role === 'mentor' ? '/dashboard/mentor' :
          '/dashboard/startup'
        return NextResponse.redirect(new URL(dest, req.url))
      }
      if (profile) {
        return NextResponse.redirect(new URL('/pending', req.url))
      }
    }
    return res
  }

  // Pending page — must be signed in; redirect away if already approved
  if (pathname === '/pending') {
    if (!userId) return NextResponse.redirect(new URL('/', req.url))

    const profile = await getProfile()
    if (profile?.status === 'approved' && profile.role) {
      const dest =
        profile.role === 'admin' ? '/dashboard/admin' :
        profile.role === 'mentor' ? '/dashboard/mentor' :
        '/dashboard/startup'
      return NextResponse.redirect(new URL(dest, req.url))
    }

    return res
  }

  // All dashboard routes — must be signed in and approved
  if (pathname.startsWith('/dashboard')) {
    if (!userId) return NextResponse.redirect(new URL('/', req.url))

    const profile = await getProfile()

    if (!profile || profile.status !== 'approved' || !profile.role) {
      return NextResponse.redirect(new URL('/pending', req.url))
    }

    const onboardingState = await getOnboardingState(profile)
    if (pathname === '/dashboard/onboarding') {
      if (!onboardingState?.needsOnboarding) {
        const dest = profile.role === 'mentor' ? '/dashboard/mentor' : '/dashboard/startup'
        return NextResponse.redirect(new URL(dest, req.url))
      }
      return res
    }
    if (onboardingState?.needsOnboarding) {
      return NextResponse.redirect(new URL('/dashboard/onboarding', req.url))
    }

    // Role-route guard
    if (pathname.startsWith('/dashboard/admin') && profile.role !== 'admin') {
      const dest = profile.role === 'mentor' ? '/dashboard/mentor' : '/dashboard/startup'
      return NextResponse.redirect(new URL(dest, req.url))
    }
    if (pathname.startsWith('/dashboard/mentor') && profile.role !== 'mentor' && profile.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard/startup', req.url))
    }
    if (pathname.startsWith('/dashboard/startup') && profile.role !== 'startup' && profile.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard/mentor', req.url))
    }

    return res
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
