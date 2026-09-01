import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { requireActiveSemesterAdmin } from '@/src/program/canonical-access'
import { setSemesterMemberAccess } from '@/src/program/server/canonical-admin'
import { provisionSemesterMemberAccess, ReconciliationRequiredError } from '@/src/program/server/user-access'

type CreateUserPayload = { email: string; fullName: string; role: 'mentor' | 'startup' | 'admin' }

export async function POST(request: Request) {
  try {
    const { user, profileId, userClient, adminClient } = await requireAuthenticatedUser(request)
    const semesterId = await requireActiveSemesterAdmin(userClient, user.id)
    const payload = (await request.json()) as CreateUserPayload
    const email = (payload.email ?? '').trim().toLowerCase()
    const fullName = (payload.fullName ?? '').trim()
    const role = payload.role
    if (!email || !fullName || !['mentor', 'startup', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'email, fullName, and a valid role are required.' }, { status: 400 })
    }
    const existingProfile = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle()
    if (existingProfile.error) return NextResponse.json({ error: existingProfile.error.message }, { status: 400 })
    if (existingProfile.data) return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 })
    const redirectTo = `${new URL(request.url).origin}/auth/callback`
    const link = await adminClient.auth.admin.generateLink({
      type: 'invite', email, options: { redirectTo, data: { full_name: fullName } },
    })
    if (link.error || !link.data.user?.id) {
      return NextResponse.json({ error: link.error?.message ?? 'Could not generate magic link.' }, { status: 400 })
    }
    await provisionSemesterMemberAccess({
      authAdmin: adminClient.auth.admin,
      input: { actorProfileId: profileId, approve: true, email, fullName, profileId: link.data.user.id, role, semesterId },
      setAccess: (accessInput) => setSemesterMemberAccess(adminClient, accessInput),
    })
    return NextResponse.json({ ok: true, email, role })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof ReconciliationRequiredError) {
      return NextResponse.json({ error: error.message, reconciliationRequired: true }, { status: 500 })
    }
    const status = error instanceof Error && error.message.includes('Semester administrator access required') ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status })
  }
}
