'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { createClient } from '@/utils/supabase/client'

type FounderProfile = { email: string; full_name: string | null }
type FounderSession = {
  id: string
  meeting: { meeting_date: string; label: string | null } | null
  mentor: { membership: { profile: { full_name: string | null } | null } | null } | null
  slot: number
  status: string
}

export default function FounderProfilePage() {
  const { founderId } = useParams<{ founderId: string }>()
  const [founder, setFounder] = useState<FounderProfile | null>(null)
  const [startupName, setStartupName] = useState<string | null>(null)
  const [sessions, setSessions] = useState<FounderSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const client = createClient()
    void (async () => {
      const profileResult = await client.from('profiles').select('email,full_name').eq('id', founderId).maybeSingle()
      setFounder(profileResult.data)
      const membershipResult = await client.from('semester_memberships').select('id').eq('profile_id', founderId).eq('role', 'startup')
      const membershipIds = (membershipResult.data ?? []).map((membership) => membership.id)
      if (membershipIds.length > 0) {
        const teamResult = await client.from('startup_team_memberships').select('startup_semester_id,startup:startup_semesters(organization:startup_organizations(name))').in('semester_membership_id', membershipIds)
        const team = teamResult.data?.[0]
        const startup = team?.startup as unknown as { organization: { name: string } | null } | null
        setStartupName(startup?.organization?.name ?? null)
        if (team) {
          const sessionResult = await client.from('sessions').select('id,slot,status,meeting:meetings(meeting_date,label),mentor:mentor_semesters(membership:semester_memberships(profile:profiles(full_name)))').eq('startup_semester_id', team.startup_semester_id).order('slot')
          setSessions((sessionResult.data as unknown as FounderSession[]) ?? [])
        }
      }
      setLoading(false)
    })()
  }, [founderId])

  if (loading) return <p className="text-gray-600">Loading founder profile...</p>
  if (!founder) return <p className="text-gray-600">Founder not found</p>
  return <div className="space-y-6">
    <Link href="/dashboard/founders" className="text-blue-600 hover:underline">← Back to Founders</Link>
    <section className="rounded-lg border border-gray-200 bg-white p-6"><h1 className="text-3xl font-bold text-gray-900">{founder.full_name ?? founder.email}</h1><p className="mt-2 text-gray-600">{founder.email}</p>{startupName && <p className="text-gray-600">{startupName}</p>}</section>
    <section className="rounded-lg border border-gray-200 bg-white p-6"><h2 className="mb-4 text-xl font-semibold">Mentor Sessions</h2>{sessions.length === 0 ? <p className="text-gray-500">No sessions scheduled yet</p> : <div className="space-y-3">{sessions.map((session) => <div key={session.id} className="flex justify-between border-b pb-3"><span>{session.meeting?.label ?? session.meeting?.meeting_date ?? 'Date TBD'} · Slot {session.slot}</span><span>{session.mentor?.membership?.profile?.full_name ?? 'Mentor TBD'} · {session.status}</span></div>)}</div>}</section>
  </div>
}
