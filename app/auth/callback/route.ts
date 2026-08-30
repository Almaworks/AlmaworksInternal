import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const error = searchParams.get('error')
  const errorCode = searchParams.get('error_code')
  const code = searchParams.get('code')

  if (error) {
    const dest = errorCode === 'otp_expired' ? '/?error=link_expired' : '/?error=no_session'
    return NextResponse.redirect(new URL(dest, origin))
  }

  if (!code) {
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

  const { data: { session }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !session) {
    return NextResponse.redirect(new URL('/?error=link_expired', origin))
  }

  // Query the profile directly via REST using the session's access_token.
  // This is more reliable than re-using the @supabase/ssr server client after
  // exchangeCodeForSession, which may not propagate the new session to its
  // internal auth headers in all library versions.
  let profile: { role: string; status: string; is_active: boolean } | null = null
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}&select=role,status,is_active&limit=1`,
      {
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${session.access_token}`,
          Accept: 'application/json',
        },
      }
    )
    const rows = await res.json()
    profile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
  } catch {
    // Network error — fall through to /dashboard for client-side retry
  }

  let dest: string

  if (profile?.is_active === false) {
    dest = '/?error=account_inactive'
  } else if (profile?.status === 'approved' && profile.role) {
    dest =
      profile.role === 'admin' ? '/dashboard/admin' :
      profile.role === 'mentor' ? '/dashboard/mentor' :
      '/dashboard/startup'
  } else if (profile === null) {
    // Profile fetch failed — redirect to /dashboard so the client-side
    // router can retry once the session cookies are in the browser.
    dest = '/dashboard'
  } else {
    dest = '/pending'
  }

  const response = NextResponse.redirect(new URL(dest, origin))

  // Attach every session cookie directly to this response so the browser
  // receives the auth tokens in the same round-trip as the redirect.
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
  })

  return response
}
