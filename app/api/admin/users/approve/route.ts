import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { requireActiveSemesterAdmin } from '@/src/program/canonical-access'
import { setUserRoleRecords } from '@/src/program/server/canonical-admin'

type ApprovePayload = { userId: string; role: 'mentor' | 'startup' | 'admin' }

export async function POST(request: Request) {
  try {
    const { user, userClient, adminClient } = await requireAuthenticatedUser(request)
    const semesterId = await requireActiveSemesterAdmin(userClient, user.id)
    const { userId, role } = (await request.json()) as ApprovePayload
    if (!userId || !['mentor', 'startup', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'userId and a valid role are required.' }, { status: 400 })
    }
    const profile = await adminClient.from('profiles').update({ status: 'approved' }).eq('id', userId)
    if (profile.error) return NextResponse.json({ error: profile.error.message }, { status: 400 })
    await setUserRoleRecords(adminClient, { profileId: userId, role, semesterId })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const status = error instanceof Error && error.message === 'Semester administrator access required.' ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status })
  }
}
