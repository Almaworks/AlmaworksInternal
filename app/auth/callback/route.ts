import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { resolvePostLoginDestination } from '@/src/auth/profile-access'
import { resolvePasswordResetDestination } from '@/src/auth/password-auth'
import { callbackErrorDestination } from '@/src/auth/auth-errors'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const error = searchParams.get('error')
  const errorCode = searchParams.get('error_code')
  const code = searchParams.get('code')
  const requestedType = searchParams.get('type')
  const tokenType = requestedType === 'email' || requestedType === 'signup' || requestedType === 'invite' || requestedType === 'recovery'
    ? requestedType : null
  const tokenHash = tokenType ? searchParams.get('token_hash') : null

  if (error) {
    const dest = callbackErrorDestination({ code: errorCode ?? undefined })
    return NextResponse.redirect(new URL(dest, origin))
  }

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL('/?error=no_session', origin))
  }

  const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(c => pendingCookies.push(c))
        },
      },
    }
  )

  const { data: { session }, error: exchangeError } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tokenType! })
    : await supabase.auth.exchangeCodeForSession(code!)

  if (exchangeError || !session) {
    return NextResponse.redirect(new URL(callbackErrorDestination(exchangeError), origin))
  }

  const resetDestination = resolvePasswordResetDestination(tokenType === 'recovery' ? '/account/password?reset=1' : searchParams.get('next'), null)
  if (resetDestination) {
    const response = NextResponse.redirect(new URL(resetDestination, origin))
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
    })
    return response
  }

  // Query the profile directly via REST using the session's access_token.
  // This is more reliable than re-using the @supabase/ssr server client after
  // exchangeCodeForSession, which may not propagate the new session to its
  // internal auth headers in all library versions.
  let profile: { id: string; status: string; is_active: boolean } | null = null
  let role: 'admin' | 'mentor' | 'startup' | null = null
  let lookupFailed = false
  try {
    const headers = {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${session.access_token}`,
      Accept: 'application/json',
    }
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?auth_user_id=eq.${session.user.id}&select=id,status,is_active&limit=1`, { headers })
    if (!res.ok) throw new Error(`Profile lookup failed with status ${res.status}`)
    const rows = await res.json()
    profile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
    if (profile?.status === 'approved') {
      const [platformResponse, membershipResponse] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/platform_roles?profile_id=eq.${profile.id}&role=eq.super_admin&select=role&limit=1`, { headers }),
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/semester_memberships?profile_id=eq.${profile.id}&status=in.(invited,onboarding,active)&select=role,semester:semesters!inner(is_active)&semester.is_active=eq.true&limit=1`, { headers }),
      ])
      if (!platformResponse.ok || !membershipResponse.ok) throw new Error('Role lookup failed')
      const platformRows = await platformResponse.json() as { role: string }[]
      const membershipRows = await membershipResponse.json() as { role: 'admin' | 'mentor' | 'startup' }[]
      role = platformRows.some(row => row.role === 'super_admin') ? 'admin' : membershipRows[0]?.role ?? null
    }
  } catch {
    lookupFailed = true
  }

  let dest: string

  if (lookupFailed) dest = '/?error=identity_lookup_failed'
  else dest = resolvePostLoginDestination(profile ? { ...profile, role } : null)

  const response = NextResponse.redirect(new URL(dest, origin))

  // Attach every session cookie directly to this response so the browser
  // receives the auth tokens in the same round-trip as the redirect.
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
  })

  return response
}
