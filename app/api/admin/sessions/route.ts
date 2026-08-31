import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser, requireSemesterAdmin } from '@/src/auth/server'

type SessionWrite = {
  format?: string | null
  meetingId?: string
  mentorSemesterId?: string
  slot?: 1 | 2
  startupAbsent?: boolean
  startupSemesterId?: string
  status?: 'requested' | 'confirmed' | 'declined' | 'cancelled'
  substituteName?: string | null
  topic?: string | null
}

async function authorizeExisting(request: Request, sessionId: string) {
  const context = await requireAuthenticatedUser(request)
  const session = await context.adminClient.from('sessions').select('semester_id').eq('id', sessionId).maybeSingle()
  if (session.error || !session.data) throw new Error('Session not found.')
  const manage = await context.userClient.rpc('can_manage_semester', {
    candidate_id: context.user.id,
    target_semester_id: session.data.semester_id,
  })
  if (manage.error || manage.data !== true) throw new AuthorizationError('Semester administrator access required.', 403)
  return context
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SessionWrite & { semesterId: string }
    if (!body.semesterId || !body.meetingId || !body.mentorSemesterId || !body.startupSemesterId || !body.slot) {
      return NextResponse.json({ error: 'semesterId, meetingId, mentorSemesterId, startupSemesterId, and slot are required.' }, { status: 400 })
    }
    const { adminClient } = await requireSemesterAdmin(request, body.semesterId)
    const result = await adminClient.from('sessions').insert({
      format: body.format ?? null,
      meeting_id: body.meetingId,
      mentor_semester_id: body.mentorSemesterId,
      semester_id: body.semesterId,
      slot: body.slot,
      startup_absent: body.startupAbsent ?? false,
      startup_semester_id: body.startupSemesterId,
      status: 'confirmed',
      substitute_name: body.substituteName ?? null,
      topic: body.topic ?? null,
    })
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create session.' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as SessionWrite & { sessionId: string }
    if (!body.sessionId) return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 })
    const { adminClient } = await authorizeExisting(request, body.sessionId)
    const result = await adminClient.from('sessions').update({
      format: body.format,
      mentor_semester_id: body.mentorSemesterId,
      slot: body.slot,
      startup_absent: body.startupAbsent,
      startup_semester_id: body.startupSemesterId,
      status: body.status,
      substitute_name: body.substituteName,
      topic: body.topic,
    }).eq('id', body.sessionId)
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const status = error instanceof Error && error.message === 'Session not found.' ? 404 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update session.' }, { status })
  }
}

export async function DELETE(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get('sessionId')
    if (!sessionId) return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 })
    const { adminClient } = await authorizeExisting(request, sessionId)
    const result = await adminClient.from('sessions').delete().eq('id', sessionId)
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const status = error instanceof Error && error.message === 'Session not found.' ? 404 : 500
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete session.' }, { status })
  }
}
