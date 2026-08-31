import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createMentorRecords } from '@/src/program/server/canonical-admin'

type UpdateUserPayload = {
  userId: string
  fullName: string
  email: string
  role: 'mentor' | 'startup' | 'admin'
}

export async function PATCH(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'Missing Supabase environment variables.' }, { status: 500 })
    }

    // Verify caller is an authenticated admin
    const authHeader = req.headers.get('authorization') ?? ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 })
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: authData, error: authErr } = await userClient.auth.getUser()
    if (authErr || !authData.user) {
      return NextResponse.json({ error: 'Invalid auth token.' }, { status: 401 })
    }
    const adminCheck = await userClient.from('profiles').select('role').eq('id', authData.user.id).single()
    if (adminCheck.error || adminCheck.data?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    // Validate payload
    const payload = (await req.json()) as UpdateUserPayload
    const { userId } = payload
    const email = (payload.email ?? '').trim().toLowerCase()
    const fullName = (payload.fullName ?? '').trim()
    const role = payload.role
    if (!userId || !email || !fullName || !['mentor', 'startup', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'userId, email, fullName, and a valid role are required.' }, { status: 400 })
    }

    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Update email in auth.users if it changed
    const { data: existing } = await adminClient.from('profiles').select('email').eq('id', userId).single()
    if (existing && existing.email !== email) {
      const { error: emailErr } = await adminClient.auth.admin.updateUserById(userId, { email })
      if (emailErr) {
        return NextResponse.json({ error: emailErr.message }, { status: 400 })
      }
    }

    // Update profile
    const { error: profileErr } = await adminClient
      .from('profiles')
      .update({ full_name: fullName, email })
      .eq('id', userId)
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 400 })
    }

    const { data: activeSem } = await adminClient.from('semesters').select('id').eq('is_active', true).maybeSingle()
    if (activeSem?.id) {
      if (role === 'mentor') {
        await createMentorRecords(adminClient, {
          biography: null,
          company: null,
          expertiseTags: [],
          isActive: true,
          linkedinUrl: null,
          preferredFormat: null,
          profileId: userId,
          semesterId: activeSem.id,
          title: null,
        })
      } else {
        const membership = await adminClient.from('semester_memberships').upsert({
          profile_id: userId,
          role,
          semester_id: activeSem.id,
          status: 'active',
        }, { onConflict: 'semester_id,profile_id' })
        if (membership.error) return NextResponse.json({ error: membership.error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}
