import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { requireActiveSemesterAdmin } from '@/src/program/canonical-access'
import { setUserRoleRecords } from '@/src/program/server/canonical-admin'

type CreateUserPayload = { email: string; fullName: string; role: 'mentor' | 'startup' | 'admin' }

export async function POST(request: Request) {
  try {
    const { user, userClient, adminClient } = await requireAuthenticatedUser(request)
    const semesterId = await requireActiveSemesterAdmin(userClient, user.id)
    const payload = (await request.json()) as CreateUserPayload
    const email = (payload.email ?? '').trim().toLowerCase()
    const fullName = (payload.fullName ?? '').trim()
    const role = payload.role
    if (!email || !fullName || !['mentor', 'startup', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'email, fullName, and a valid role are required.' }, { status: 400 })
    }
    const redirectTo = `${new URL(request.url).origin}/auth/callback`
    const link = await adminClient.auth.admin.generateLink({
      type: 'magiclink', email, options: { redirectTo, data: { full_name: fullName } },
    })
    if (link.error || !link.data.user?.id) {
      return NextResponse.json({ error: link.error?.message ?? 'Could not generate magic link.' }, { status: 400 })
    }
    const profile = await adminClient.from('profiles').upsert({
      email, full_name: fullName, id: link.data.user.id, is_active: true, status: 'approved',
    } as never, { onConflict: 'id' })
    if (profile.error) return NextResponse.json({ error: profile.error.message }, { status: 400 })
    await setUserRoleRecords(adminClient, { profileId: link.data.user.id, role, semesterId })
    return NextResponse.json({ ok: true, email, role })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const status = error instanceof Error && error.message === 'Semester administrator access required.' ? 403 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status })
  }
}
