import { NextResponse } from 'next/server'
import { AuthorizationError, requireSemesterAdmin } from '@/src/auth/server'
import { createMentorRecords } from '@/src/program/server/canonical-admin'
import { provisionAuthBackedDatabaseMutation, ReconciliationRequiredError } from '@/src/program/server/user-access'

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

    const { adminClient, profileId } = await requireSemesterAdmin(req, payload.semesterId)
    const existingProfile = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle()
    if (existingProfile.error) {
      return NextResponse.json({ error: existingProfile.error.message }, { status: 400 })
    }
    if (existingProfile.data) {
      return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 })
    }
    const redirectTo = `${new URL(req.url).origin}/auth/callback`
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: 'invite',
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
    const mentorId = await provisionAuthBackedDatabaseMutation({
      authAdmin: adminClient.auth.admin,
      mutateDatabase: () => createMentorRecords(adminClient, {
        actorProfileId: profileId,
        biography: payload.bio,
        company: payload.company,
        email,
        expertiseTags: payload.expertiseTags ?? [],
        isActive: payload.isActive,
        linkedinUrl: payload.linkedinUrl,
        preferredFormat: null,
        profileId: userId,
        semesterId: payload.semesterId,
        title: payload.roleTitle,
      }),
      profileId: userId,
    })

    return NextResponse.json({ ok: true, mentorId, magicLink: linkData.properties.action_link })
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof ReconciliationRequiredError) {
      return NextResponse.json({ error: err.message, reconciliationRequired: true }, { status: 500 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}

