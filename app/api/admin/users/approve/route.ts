import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { requireActiveSemesterAdmin } from '@/src/program/canonical-access'
import { setSemesterMemberAccess } from '@/src/program/server/canonical-admin'

type ApprovePayload = { userId: string; role: 'mentor' | 'startup' | 'admin' }

export async function POST(request: Request) {
  try {
    const { user, profileId, userClient, adminClient } = await requireAuthenticatedUser(request)
    const semesterId = await requireActiveSemesterAdmin(userClient, user.id)
    const { userId, role } = (await request.json()) as ApprovePayload
    if (!userId || !['mentor', 'startup', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'userId and a valid role are required.' }, { status: 400 })
    }
    const profileResult = await adminClient.from('profiles').select('email,full_name').eq('id', userId).single()
    if (profileResult.error || !profileResult.data) {
      return NextResponse.json({ error: 'Pending profile not found.' }, { status: 404 })
    }
    await setSemesterMemberAccess(adminClient, {
      actorProfileId: profileId,
      approve: true,
      email: profileResult.data.email,
      fullName: profileResult.data.full_name,
      profileId: userId,
      role,
      semesterId,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const status = error instanceof Error && error.message.includes('Semester administrator access required') ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status })
  }
}
