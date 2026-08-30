import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/src/db/types'

type UpdatePayload = {
  outreachId: string
  semesterId: string
  fields: Record<string, unknown>
}

const MUTABLE_FIELDS = new Set([
  'prospect_name',
  'prospect_email',
  'company',
  'linkedin_url',
  'expertise_tags',
  'outreach_type',
  'notes',
  'status',
  'last_contacted_at',
  'who_reached_out',
  'source_channel',
  'referred_by',
])

export async function PATCH(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anonKey || !serviceRoleKey) {
      return NextResponse.json({ error: 'Missing Supabase environment variables.' }, { status: 500 })
    }

    const authHeader = req.headers.get('authorization') ?? ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 })
    }

    const userClient = createClient<Database>(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: 'Invalid auth token.' }, { status: 401 })
    }

    const { data: profile, error: profileErr } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profileErr || profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 })
    }

    const adminClient = createClient<Database>(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const payload = (await req.json()) as UpdatePayload
    if (!payload.outreachId || !payload.semesterId) {
      return NextResponse.json({ error: 'Missing outreachId or semesterId.' }, { status: 400 })
    }

    // Filter fields through allowlist to prevent mass-assignment
    const safeFields: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload.fields)) {
      if (MUTABLE_FIELDS.has(key)) {
        safeFields[key] = value
      }
    }
    if (Object.keys(safeFields).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 })
    }

    // Read current row to detect changes
    const { data: current, error: fetchErr } = await adminClient
      .from('outreach')
      .select('*')
      .eq('id', payload.outreachId)
      .single()
    if (fetchErr || !current) {
      return NextResponse.json({ error: fetchErr?.message ?? 'Outreach row not found.' }, { status: 404 })
    }

    // Update the outreach row
    // TODO: remove `as never` after regenerating types.ts (outreach_type/who_reached_out missing from generated types)
    const { error: updateErr } = await adminClient
      .from('outreach')
      .update(safeFields as never)
      .eq('id', payload.outreachId)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 })
    }

    // Insert activity log entries for changed fields
    const activityEntries: {
      outreach_id: string
      semester_id: string
      admin_id: string
      action_type: string
      detail: Json
    }[] = []

    const currentRow = current as Record<string, unknown>
    for (const [field, newValue] of Object.entries(safeFields)) {
      const oldValue = currentRow[field]
      // Compare stringified values to handle arrays/objects
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue

      if (field === 'status') {
        activityEntries.push({
          outreach_id: payload.outreachId,
          semester_id: payload.semesterId,
          admin_id: user.id,
          action_type: 'status_changed',
          detail: { from: oldValue as string, to: newValue as string },
        })
      } else {
        activityEntries.push({
          outreach_id: payload.outreachId,
          semester_id: payload.semesterId,
          admin_id: user.id,
          action_type: 'field_updated',
          detail: {
            field,
            from: oldValue != null ? String(oldValue) : null,
            to: newValue != null ? String(newValue) : null,
          },
        })
      }
    }

    if (activityEntries.length > 0) {
      const { error: activityErr } = await adminClient.from('outreach_activity_log').insert(activityEntries)
      if (activityErr) {
        console.error('Failed to insert activity log entries:', activityErr.message)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}
