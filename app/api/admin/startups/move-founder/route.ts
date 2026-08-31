import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { moveFounderMembership } from '@/src/program/server/canonical-admin'

export async function POST(request: Request) {
  try {
    const { email, fromStartupId, toStartupId } = (await request.json()) as {
      email: string
      fromStartupId: string
      toStartupId: string
    }
    if (!email || !fromStartupId || !toStartupId) {
      return NextResponse.json({ error: 'email, fromStartupId, and toStartupId are required.' }, { status: 400 })
    }
    if (fromStartupId === toStartupId) return NextResponse.json({ error: 'Startups must differ.' }, { status: 400 })

    const context = await requireAuthenticatedUser(request)
    const termResults = await Promise.all([
      context.userClient.from('startup_semesters').select('semester_id').eq('id', fromStartupId).single(),
      context.userClient.from('startup_semesters').select('semester_id').eq('id', toStartupId).single(),
    ])
    if (termResults.some((result) => result.error || !result.data)) {
      return NextResponse.json({ error: 'Source or destination startup not found.' }, { status: 404 })
    }
    for (const result of termResults) {
      const manageResult = await context.userClient.rpc('can_manage_semester', {
        candidate_id: context.user.id,
        target_semester_id: result.data!.semester_id,
      })
      if (manageResult.error || manageResult.data !== true) throw new AuthorizationError('Semester administrator access required.', 403)
    }
    const profileResult = await context.adminClient.from('profiles').select('id').ilike('email', email.trim()).maybeSingle()
    if (profileResult.error || !profileResult.data) return NextResponse.json({ error: 'Founder not found.' }, { status: 404 })

    await moveFounderMembership(context.userClient, {
      fromStartupSemesterId: fromStartupId,
      profileId: profileResult.data.id,
      toStartupSemesterId: toStartupId,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, { status: 500 })
  }
}
