import { NextResponse } from 'next/server'
import { AuthorizationError, requireSemesterAdmin } from '@/src/auth/server'
import { createMentorRecords } from '@/src/program/server/canonical-admin'

type CreateMentorPayload = {
  semesterId: string
  email: string
  fullName: string
  company: string | null
  roleTitle: string | null
  linkedinUrl: string | null
  expertiseTags: string[]
  bio: string | null
  isActive: boolean
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as CreateMentorPayload
    const email = (payload.email ?? '').trim().toLowerCase()
    const fullName = (payload.fullName ?? '').trim()
    if (!payload.semesterId || !email || !fullName) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const { adminClient } = await requireSemesterAdmin(req, payload.semesterId)
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
    const profileRes = await adminClient.from('profiles').upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        status: 'approved',
        is_active: true,
      } as never,
      { onConflict: 'id' },
    )
    if (profileRes.error) {
      return NextResponse.json({ error: profileRes.error.message }, { status: 400 })
    }

    const mentorId = await createMentorRecords(adminClient, {
      biography: payload.bio,
      company: payload.company,
      expertiseTags: payload.expertiseTags ?? [],
      isActive: payload.isActive,
      linkedinUrl: payload.linkedinUrl,
      preferredFormat: null,
      profileId: userId,
      semesterId: payload.semesterId,
      title: payload.roleTitle,
    })

    return NextResponse.json({ ok: true, mentorId, magicLink: linkData.properties.action_link })
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}

