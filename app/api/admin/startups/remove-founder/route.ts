import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { removeFounderMembership } from '@/src/program/server/canonical-admin'

export async function POST(request: Request) {
  try {
    const { startupId, email } = (await request.json()) as { startupId: string; email: string }
    if (!startupId || !email) return NextResponse.json({ error: 'startupId and email are required.' }, { status: 400 })

    const context = await requireAuthenticatedUser(request)
    const termResult = await context.userClient.from('startup_semesters').select('semester_id').eq('id', startupId).single()
    if (termResult.error || !termResult.data) return NextResponse.json({ error: 'Startup not found.' }, { status: 404 })
    const manageResult = await context.userClient.rpc('can_manage_semester', {
      candidate_id: context.user.id,
      target_semester_id: termResult.data.semester_id,
    })
    if (manageResult.error || manageResult.data !== true) throw new AuthorizationError('Semester administrator access required.', 403)
    const profileResult = await context.adminClient.from('profiles').select('id').ilike('email', email.trim()).maybeSingle()
    if (profileResult.error || !profileResult.data) return NextResponse.json({ error: 'Founder not found.' }, { status: 404 })

    await removeFounderMembership(context.adminClient, { profileId: profileResult.data.id, startupSemesterId: startupId })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status: 500 })
  }
}
