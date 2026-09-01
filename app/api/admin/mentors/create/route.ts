import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type CreateMentorPayload = {
  semesterId: string
  email: string
  fullName: string
  company: string | null
  roleTitle: string | null
  linkedinUrl: string | null
  expertiseTags: string[]
  bio: string | null
  generalAvailability: string | null
  preferredFormat: string | null
  openingTalk: string | null
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'Missing Supabase environment variables.' }, { status: 500 })
    }

    const authHeader = req.headers.get('authorization') ?? ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 })
    }

    const payload = (await req.json()) as CreateMentorPayload
    const email = (payload.email ?? '').trim().toLowerCase()
    const fullName = (payload.fullName ?? '').trim()
    if (!payload.semesterId || !email || !fullName) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: authData, error: authErr } = await userClient.auth.getUser()
    if (authErr || !authData.user) {
      return NextResponse.json({ error: 'Invalid auth token.' }, { status: 401 })
    }
    const adminCheck = await userClient.rpc('can_manage_semester', {
      target_semester_id: payload.semesterId,
      candidate_id: authData.user.id,
    })
    if (adminCheck.error || adminCheck.data !== true) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const redirectTo = `${new URL(req.url).origin}/auth/callback`
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo,
        data: { full_name: fullName },
      },
    })
    if (linkErr || !linkData.user?.id || !linkData.properties?.action_link) {
      return NextResponse.json({ error: linkErr?.message ?? 'Could not generate magic link.' }, { status: 400 })
    }

    const userId = linkData.user.id
    const provisionResult = await adminClient.rpc('create_mentor_records', {
      p_actor_profile_id: authData.user.id,
      p_profile_id: userId,
      p_semester_id: payload.semesterId,
      p_email: email,
      p_biography: payload.bio,
      p_company: payload.company,
      p_expertise_tags: payload.expertiseTags ?? [],
      p_is_active: false,
      p_linkedin_url: payload.linkedinUrl,
      p_title: payload.roleTitle,
      p_general_availability: payload.generalAvailability,
      p_opening_talk: payload.openingTalk,
      p_preferred_format: payload.preferredFormat,
    })
    if (provisionResult.error || typeof provisionResult.data !== 'string') {
      return NextResponse.json(
        { error: provisionResult.error?.message ?? 'Could not provision mentor.' },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      mentorId: provisionResult.data,
      magicLink: linkData.properties.action_link,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}

