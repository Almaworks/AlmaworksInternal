import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { assignFounderMembership } from '@/src/program/server/canonical-admin'

type AssignFounderPayload = { userId: string; startupId: string }

export async function POST(request: Request) {
  try {
    const { userId, startupId } = (await request.json()) as AssignFounderPayload
    if (!userId || !startupId) {
      return NextResponse.json({ error: 'userId and startupId are required.' }, { status: 400 })
    }

    const context = await requireAuthenticatedUser(request)
    const termResult = await context.userClient.from('startup_semesters').select('semester_id').eq('id', startupId).single()
    if (termResult.error || !termResult.data) return NextResponse.json({ error: 'Startup not found.' }, { status: 404 })
    const manageResult = await context.userClient.rpc('can_manage_semester', {
      candidate_id: context.user.id,
      target_semester_id: termResult.data.semester_id,
    })
    if (manageResult.error || manageResult.data !== true) throw new AuthorizationError('Semester administrator access required.', 403)

    await assignFounderMembership(context.adminClient, { profileId: userId, startupSemesterId: startupId })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status: 500 })
  }
}
