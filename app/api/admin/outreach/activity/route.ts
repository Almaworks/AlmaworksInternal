import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/src/db/types'

type ActivityRow = {
  id: string
  outreach_id: string
  semester_id: string
  admin_id: string
  action_type: string
  detail: Json
  created_at: string
}

async function getAdminClient(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceRoleKey) {
    return { error: NextResponse.json({ error: 'Missing Supabase environment variables.' }, { status: 500 }) }
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!accessToken) {
    return { error: NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 }) }
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
    return { error: NextResponse.json({ error: 'Invalid auth token.' }, { status: 401 }) }
  }

  const { data: profile, error: profileErr } = await userClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profileErr || profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }) }
  }

  const adminClient = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return { adminClient, userId: user.id }
}

export async function GET(req: Request) {
  try {
    const result = await getAdminClient(req)
    if ('error' in result && !('adminClient' in result)) return result.error

    const { adminClient } = result as { adminClient: ReturnType<typeof createClient<Database>>; userId: string }
    const { searchParams } = new URL(req.url)
    const outreachId = searchParams.get('outreachId')
    if (!outreachId) {
      return NextResponse.json({ error: 'Missing outreachId parameter.' }, { status: 400 })
    }

    const { data, error } = await adminClient
      .from('outreach_activity_log')
      .select('id, outreach_id, semester_id, admin_id, action_type, detail, created_at')
      .eq('outreach_id', outreachId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, activities: (data ?? []) as ActivityRow[] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const result = await getAdminClient(req)
    if ('error' in result && !('adminClient' in result)) return result.error

    const { adminClient, userId } = result as { adminClient: ReturnType<typeof createClient<Database>>; userId: string }
    const body = await req.json()
    const { outreachId, semesterId, actionType, detail } = body as {
      outreachId: string
      semesterId: string
      actionType: string
      detail: Json
    }

    if (!outreachId || !semesterId || !actionType) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const { data, error } = await adminClient
      .from('outreach_activity_log')
      .insert({
        outreach_id: outreachId,
        semester_id: semesterId,
        admin_id: userId,
        action_type: actionType,
        detail: detail ?? {},
      })
      .select('id, outreach_id, semester_id, admin_id, action_type, detail, created_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, activity: data as ActivityRow })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error.' },
      { status: 500 },
    )
  }
}
