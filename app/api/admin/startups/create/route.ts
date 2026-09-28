import { NextResponse } from 'next/server'
import { AuthorizationError, requireSemesterAdmin } from '@/src/auth/server'
import { createStartupRecords } from '@/src/program/server/canonical-admin'
import { isStartupStage, normalizeStartupStage } from '@/src/program/startup-stage'

type CreateStartupPayload = {
  name: string
  industry: string
  stage: unknown
  description: string
  slug: string
  semesterId: string | null
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as CreateStartupPayload
    const name = (payload.name ?? '').trim()
    const slug = (payload.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const industry = (payload.industry ?? '').trim()
    const stage = typeof payload.stage === 'string' ? normalizeStartupStage(payload.stage) : null
    const description = (payload.description ?? '').trim()
    const semesterId = payload.semesterId ?? null

    if (!name || !slug) {
      return NextResponse.json({ error: 'name and slug are required.' }, { status: 400 })
    }
    if (!semesterId) {
      return NextResponse.json({ error: 'No active semester. Create a semester first.' }, { status: 400 })
    }
    if ((payload.stage != null && typeof payload.stage !== 'string') || (stage && !isStartupStage(stage))) {
      return NextResponse.json({ error: 'Startup stage is invalid.' }, { status: 422 })
    }

    const { adminClient } = await requireSemesterAdmin(req, semesterId)
    const created = await createStartupRecords(adminClient, {
      description: description || null,
      industry: industry || null,
      name,
      semesterId,
      slug,
      stage: stage || null,
    })

    return NextResponse.json({ ok: true, slug, startupId: created.startupSemesterId })
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
