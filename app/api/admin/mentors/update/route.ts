import { NextResponse } from 'next/server'
import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { authorizeSemesterMemberIdentityUpdate, updateMentorRecords } from '@/src/program/server/canonical-admin'
import { ReconciliationRequiredError, synchronizeAuthEmailAndDatabaseMutation } from '@/src/program/server/user-access'

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
    const termResult = await context.userClient.from('mentor_semesters').select('semester_id,semester_membership_id').eq('id', payload.mentorId).single()
    if (termResult.error || !termResult.data) return NextResponse.json({ error: 'Mentor not found.' }, { status: 404 })
    const membershipResult = await context.userClient
      .from('semester_memberships')
      .select('profile_id')
      .eq('id', termResult.data.semester_membership_id)
      .eq('semester_id', termResult.data.semester_id)
      .single()
    if (membershipResult.error || !membershipResult.data) return NextResponse.json({ error: 'Mentor not found.' }, { status: 404 })
    const manageResult = await context.userClient.rpc('can_manage_semester', {
      candidate_id: context.user.id,
      target_semester_id: termResult.data.semester_id,
    })
    if (manageResult.error || manageResult.data !== true) throw new AuthorizationError('Semester administrator access required.', 403)

    await authorizeSemesterMemberIdentityUpdate(context.userClient, {
      profileId: membershipResult.data.profile_id,
      semesterId: termResult.data.semester_id,
    })
    const email = payload.email === undefined ? undefined : payload.email?.trim().toLowerCase()
    if (email === '') return NextResponse.json({ error: 'email cannot be empty.' }, { status: 400 })
    const updateDatabase = () => updateMentorRecords(context.adminClient, {
      actorProfileId: context.profileId,
      biography: payload.bio,
      company: payload.company,
      email,
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
    if (email) {
      await synchronizeAuthEmailAndDatabaseMutation({
        authAdmin: context.adminClient.auth.admin,
        email,
        mutateDatabase: updateDatabase,
        profileId: membershipResult.data.profile_id,
      })
    } else {
      await updateDatabase()
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    if (err instanceof ReconciliationRequiredError) {
      return NextResponse.json({ error: err.message, reconciliationRequired: true }, { status: 500 })
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}
