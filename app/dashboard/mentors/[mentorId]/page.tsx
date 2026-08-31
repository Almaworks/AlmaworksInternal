'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { loadMentorProfile, type MentorView } from '@/src/program/canonical-repository'
import { createClient } from '@/utils/supabase/client'

type MentorSession = {
  id: string
  meeting: { meeting_date: string; label: string | null } | null
  slot: number
  startup: { organization: { name: string } | null } | null
  status: string
}

export default function MentorProfilePage() {
  const { mentorId } = useParams<{ mentorId: string }>()
  const [mentor, setMentor] = useState<MentorView | null>(null)
  const [sessions, setSessions] = useState<MentorSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const client = createClient()
    void Promise.all([
      loadMentorProfile(client, mentorId),
      client.from('sessions').select('id,slot,status,meeting:meetings(meeting_date,label),startup:startup_semesters(organization:startup_organizations(name))').eq('mentor_semester_id', mentorId).order('slot'),
    ]).then(([profile, sessionResult]) => {
      setMentor(profile)
      setSessions((sessionResult.data as unknown as MentorSession[]) ?? [])
      setLoading(false)
    })
  }, [mentorId])

  if (loading) return <p className="text-gray-600">Loading mentor profile...</p>
  if (!mentor) return <p className="text-gray-600">Mentor not found</p>
  return <div className="space-y-6">
    <Link href="/dashboard/mentors" className="text-blue-600 hover:underline">← Back to Mentors</Link>
    <section className="rounded-lg border border-gray-200 bg-white p-6"><h1 className="text-3xl font-bold text-gray-900">{mentor.full_name}</h1><p className="mt-2 text-gray-600">{[mentor.role_title, mentor.company].filter(Boolean).join(' · ')}</p>{mentor.bio && <p className="mt-4 whitespace-pre-wrap text-gray-700">{mentor.bio}</p>}<div className="mt-4 flex flex-wrap gap-2">{mentor.expertise_tags.map((tag) => <span key={tag} className="rounded bg-gray-100 px-2 py-1 text-sm">{tag}</span>)}</div></section>
    <section className="rounded-lg border border-gray-200 bg-white p-6"><h2 className="mb-4 text-xl font-semibold">Sessions</h2>{sessions.length === 0 ? <p className="text-gray-500">No sessions scheduled yet</p> : <div className="space-y-3">{sessions.map((session) => <div key={session.id} className="flex justify-between border-b pb-3"><span>{session.meeting?.label ?? session.meeting?.meeting_date ?? 'Date TBD'} · Slot {session.slot}</span><span>{session.startup?.organization?.name ?? 'Startup TBD'} · {session.status}</span></div>)}</div>}</section>
  </div>
}
