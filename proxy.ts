import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { shouldDeferAdminAuthorization } from '@/src/auth/admin-route'
import { resolvePostLoginDestination, shouldRenderAuthError } from '@/src/auth/profile-access'
import { needsParticipantOnboarding } from '@/src/auth/participant-onboarding-gate'
import { loadCanonicalAccess } from '@/src/program/canonical-access'

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

  if (shouldRenderAuthError(pathname, req.nextUrl.searchParams.get('error'))) return res

  // Public routes — no auth required
  if (
    pathname === '/learn-more' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return res
  }

  async function getAccess() {
    if (!userId) return null
    return loadCanonicalAccess(supabase, userId)
  }

  async function getOnboardingState(profile: { profileId: string; role: string | null }) {
    if (profile.role !== 'mentor' && profile.role !== 'startup') return null
    const { data: membership, error: membershipError } = await supabase
      .from('semester_memberships')
      .select('id, semester_id, status')
      .eq('profile_id', profile.profileId)
      .in('status', ['invited', 'onboarding'])
      .order('created_at', { ascending: false })
      .maybeSingle()
    if (membershipError) {
      console.error('Unable to load participant onboarding membership', membershipError)
      return { needsOnboarding: true, membershipStatus: null }
    }
    if (!membership) return null

    let readinessStatus: string | null = null
    if (profile.role === 'mentor') {
      const { data, error } = await supabase
        .from('mentor_semesters')
        .select('readiness_status')
        .eq('semester_id', membership.semester_id)
        .eq('semester_membership_id', membership.id)
        .maybeSingle()
      if (error) {
        console.error('Unable to load mentor onboarding readiness', error)
        return { needsOnboarding: true, membershipStatus: membership.status }
      }
      readinessStatus = data?.readiness_status ?? null
    } else {
      const { data: team, error: teamError } = await supabase
        .from('startup_team_memberships')
        .select('startup_semester_id')
        .eq('semester_id', membership.semester_id)
        .eq('semester_membership_id', membership.id)
        .maybeSingle()
      if (teamError) {
        console.error('Unable to load startup onboarding membership', teamError)
        return { needsOnboarding: true, membershipStatus: membership.status }
      }
      if (team) {
        const { data, error } = await supabase
          .from('startup_semesters')
          .select('readiness_status')
          .eq('semester_id', membership.semester_id)
          .eq('id', team.startup_semester_id)
          .maybeSingle()
        if (error) {
          console.error('Unable to load startup onboarding readiness', error)
          return { needsOnboarding: true, membershipStatus: membership.status }
        }
        readinessStatus = data?.readiness_status ?? null
      }
    }

    return {
      needsOnboarding: needsParticipantOnboarding(membership.status, readinessStatus),
      membershipStatus: membership.status,
    }
  }

  // Root — redirect signed-in approved users to their dashboard
  if (pathname === '/') {
    if (userId) {
      try {
        const access = await getAccess()
        return NextResponse.redirect(new URL(resolvePostLoginDestination(access), req.url))
      } catch (error) {
        console.error('Unable to resolve authenticated profile access', error)
        return NextResponse.redirect(new URL('/?error=identity_lookup_failed', req.url))
      }
    }
    return res
  }

  // Pending page — must be signed in; redirect away if already approved
  if (pathname === '/pending') {
    if (!userId) return NextResponse.redirect(new URL('/', req.url))

    try {
      const access = await getAccess()
      const destination = resolvePostLoginDestination(access)
      if (destination !== '/pending') return NextResponse.redirect(new URL(destination, req.url))
    } catch (error) {
      console.error('Unable to resolve authenticated profile access', error)
      return NextResponse.redirect(new URL('/?error=identity_lookup_failed', req.url))
    }

    return res
  }

  // All dashboard routes — must be signed in and approved
  if (pathname.startsWith('/dashboard')) {
    if (!userId) return NextResponse.redirect(new URL('/', req.url))

    let profile: Awaited<ReturnType<typeof getAccess>>
    try {
      profile = await getAccess()
    } catch (error) {
      console.error('Unable to resolve authenticated profile access', error)
      return NextResponse.redirect(new URL('/?error=identity_lookup_failed', req.url))
    }

    const accessDestination = resolvePostLoginDestination(profile)
    if (!profile || accessDestination.startsWith('/?error=') || profile.status !== 'approved') {
      return NextResponse.redirect(new URL(accessDestination, req.url))
    }

    // The server layout owns authoritative platform/semester admin checks.
    if (shouldDeferAdminAuthorization(pathname, profile)) return res

    if (!profile.role) return NextResponse.redirect(new URL('/pending', req.url))

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
