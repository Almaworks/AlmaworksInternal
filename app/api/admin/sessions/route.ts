import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { legacyAssignmentRetiredResponse } from '@/src/assignments/retired'

import { SessionFormatError, sessionFormatSource, validateSessionMeetingFormat } from '@/src/sessions/meeting-format'

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
  const session = await context.userClient.from('sessions').select('semester_id, meeting_id, mentor_semester_id, slot, format').eq('id', sessionId).maybeSingle()
  if (session.error || !session.data) throw new Error('Session not found.')
  const manage = await context.userClient.rpc('can_manage_semester', {
    candidate_id: context.user.id,
    target_semester_id: session.data.semester_id,
  })
  if (manage.error || manage.data !== true) throw new AuthorizationError('Semester administrator access required.', 403)
  return { ...context, session: session.data }
}

export async function POST() {
  return legacyAssignmentRetiredResponse()
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as SessionWrite & { sessionId: string }
    if (!body.sessionId) return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 })
    const { userClient, session } = await authorizeExisting(request, body.sessionId)
    const changesAssignment = body.format !== undefined || body.mentorSemesterId !== undefined || body.slot !== undefined
    const format = changesAssignment ? await validateSessionMeetingFormat({
      semesterId: session.semester_id,
      meetingId: session.meeting_id,
      mentorSemesterId: body.mentorSemesterId ?? session.mentor_semester_id,
      slot: body.slot ?? session.slot as 1 | 2,
      format: body.format === undefined ? session.format : body.format,
    }, sessionFormatSource(userClient)) : undefined
    const result = await userClient.from('sessions').update({
      format,
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
    if (error instanceof SessionFormatError) return NextResponse.json({ error: error.message }, { status: 400 })
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
