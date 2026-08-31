import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { requireActiveSemesterAdmin } from '@/src/program/canonical-access'
import { setUserRoleRecords } from '@/src/program/server/canonical-admin'

type UpdateUserPayload = { userId: string; fullName: string; email: string; role: 'mentor' | 'startup' | 'admin' }

export async function PATCH(request: Request) {
  try {
    const { user, userClient, adminClient } = await requireAuthenticatedUser(request)
    const semesterId = await requireActiveSemesterAdmin(userClient, user.id)
    const payload = (await request.json()) as UpdateUserPayload
    const email = (payload.email ?? '').trim().toLowerCase()
    const fullName = (payload.fullName ?? '').trim()
    if (!payload.userId || !email || !fullName || !['mentor', 'startup', 'admin'].includes(payload.role)) {
      return NextResponse.json({ error: 'userId, email, fullName, and a valid role are required.' }, { status: 400 })
    }
    const existing = await adminClient.from('profiles').select('email').eq('id', payload.userId).single()
    if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 400 })
    if (existing.data.email !== email) {
      const authUpdate = await adminClient.auth.admin.updateUserById(payload.userId, { email })
      if (authUpdate.error) return NextResponse.json({ error: authUpdate.error.message }, { status: 400 })
    }
    const profile = await adminClient.from('profiles').update({ email, full_name: fullName }).eq('id', payload.userId)
    if (profile.error) return NextResponse.json({ error: profile.error.message }, { status: 400 })
    await setUserRoleRecords(adminClient, { profileId: payload.userId, role: payload.role, semesterId })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const status = error instanceof Error && error.message === 'Semester administrator access required.' ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status })
  }
}
