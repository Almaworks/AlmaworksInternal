import { NextResponse } from 'next/server'

import { AuthorizationError, requireAuthenticatedUser } from '@/src/auth/server'
import { updateStartupRecords } from '@/src/program/server/canonical-admin'

export async function PATCH(request: Request) {
  try {
    const input = (await request.json()) as {
      description: string | null
      industry: string | null
      mentorshipNeeds: string[]
      name: string
      preferredTags: string[]
      slug: string
      stage: string | null
      startupSemesterId: string
    }
    if (!input.startupSemesterId || !input.name?.trim() || !input.slug?.trim()) {
      return NextResponse.json({ error: 'startupSemesterId, name, and slug are required.' }, { status: 400 })
    }
    const context = await requireAuthenticatedUser(request)
    const term = await context.adminClient.from('startup_semesters').select('semester_id').eq('id', input.startupSemesterId).maybeSingle()
    if (term.error || !term.data) return NextResponse.json({ error: 'Startup not found.' }, { status: 404 })
    const manage = await context.userClient.rpc('can_manage_semester', {
      candidate_id: context.user.id,
      target_semester_id: term.data.semester_id,
    })
    if (manage.error || manage.data !== true) throw new AuthorizationError('Semester administrator access required.', 403)
    await updateStartupRecords(context.userClient, {
      ...input,
      description: input.description?.trim() || null,
      industry: input.industry?.trim() || null,
      name: input.name.trim(),
      slug: input.slug.trim(),
      stage: input.stage?.trim() || null,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update startup.' }, { status: 500 })
  }
}
