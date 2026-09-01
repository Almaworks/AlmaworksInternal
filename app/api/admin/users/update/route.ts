import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { requireSemesterAdmin } from '@/src/program/canonical-access'
import { authorizeSemesterMemberIdentityUpdate, setSemesterMemberAccess } from '@/src/program/server/canonical-admin'
import { ReconciliationRequiredError, updateExistingSemesterMemberIdentity } from '@/src/program/server/user-access'

type UpdateUserPayload = { userId: string; fullName: string; email: string; role: 'mentor' | 'startup' | 'admin'; semesterId: string }

export async function PATCH(request: Request) {
  try {
    const { user, profileId, userClient, adminClient } = await requireAuthenticatedUser(request)
    const payload = (await request.json()) as UpdateUserPayload
    const email = (payload.email ?? '').trim().toLowerCase()
    const fullName = (payload.fullName ?? '').trim()
    if (!payload.userId || !payload.semesterId || !email || !fullName || !['mentor', 'startup', 'admin'].includes(payload.role)) {
      return NextResponse.json({ error: 'userId, semesterId, email, fullName, and a valid role are required.' }, { status: 400 })
    }
    const semesterId = await requireSemesterAdmin(userClient, user.id, payload.semesterId)
    await updateExistingSemesterMemberIdentity({
      authorizeTarget: (target) => authorizeSemesterMemberIdentityUpdate(userClient, target),
      authAdmin: adminClient.auth.admin,
      input: { actorProfileId: profileId, approve: false, email, fullName, profileId: payload.userId, role: payload.role, semesterId },
      setAccess: (accessInput) => setSemesterMemberAccess(adminClient, accessInput),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof ReconciliationRequiredError) {
      return NextResponse.json({ error: error.message, reconciliationRequired: true }, { status: 500 })
    }
    const status = error instanceof Error && error.message.includes('Semester administrator access required') ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status })
  }
}
