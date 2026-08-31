import { NextResponse } from 'next/server'
import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { updateMentorRecords } from '@/src/program/server/canonical-admin'

type UpdateMentorPayload = {
  mentorId: string
  full_name?: string
  company?: string | null
  role_title?: string | null
  linkedin_url?: string | null
  bio?: string | null
  expertise_tags?: string[]
  email?: string | null
  general_availability?: string | null
  preferred_format?: string | null
  opening_talk?: string | null
  is_active?: boolean
}

export async function PATCH(req: Request) {
  try {
    const payload = (await req.json()) as UpdateMentorPayload
    if (!payload.mentorId) {
      return NextResponse.json({ error: 'mentorId is required.' }, { status: 400 })
    }

    const context = await requireAuthenticatedUser(req)
    const termResult = await context.userClient.from('mentor_semesters').select('semester_id').eq('id', payload.mentorId).single()
    if (termResult.error || !termResult.data) return NextResponse.json({ error: 'Mentor not found.' }, { status: 404 })
    const manageResult = await context.userClient.rpc('can_manage_semester', {
      candidate_id: context.user.id,
      target_semester_id: termResult.data.semester_id,
    })
    if (manageResult.error || manageResult.data !== true) throw new AuthorizationError('Semester administrator access required.', 403)

    await updateMentorRecords(context.adminClient, {
      biography: payload.bio,
      company: payload.company,
      email: payload.email,
      expertiseTags: payload.expertise_tags,
      fullName: payload.full_name,
      generalAvailability: payload.general_availability,
      isActive: payload.is_active,
      linkedinUrl: payload.linkedin_url,
      mentorSemesterId: payload.mentorId,
      openingTalk: payload.opening_talk,
      preferredFormat: payload.preferred_format,
      title: payload.role_title,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}
