'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { loadFounderHistory } from '@/src/program/canonical-repository'
import { createClient } from '@/utils/supabase/client'

type FounderProfile = { email: string; full_name: string | null }
type Participation = { isActive: boolean; semesterName: string; startupName: string; startupSemesterId: string }
type FounderSession = {
  id: string
  startup_semester_id: string
  meeting: { meeting_date: string; label: string | null } | null
  mentor: { membership: { profile: { full_name: string | null } | null } | null } | null
  slot: number
  status: string
}

export default function FounderProfilePage() {
  const { founderId } = useParams<{ founderId: string }>()
  const [founder, setFounder] = useState<FounderProfile | null>(null)
  const [participations, setParticipations] = useState<Participation[]>([])
  const [selectedStartupSemesterId, setSelectedStartupSemesterId] = useState('')
  const [sessions, setSessions] = useState<FounderSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const client = createClient()
    void loadFounderHistory(client, founderId).then((history) => {
      setFounder(history?.profile ?? null)
      setParticipations(history?.participations ?? [])
      setSelectedStartupSemesterId(history?.participations[0]?.startupSemesterId ?? '')
      setSessions((history?.sessions as unknown as FounderSession[]) ?? [])
      setLoading(false)
    })
  }, [founderId])

  if (loading) return <p className="text-gray-600">Loading founder profile...</p>
  if (!founder) return <p className="text-gray-600">Founder not found</p>
  const selected = participations.find((item) => item.startupSemesterId === selectedStartupSemesterId)
  const visibleSessions = sessions.filter((session) => session.startup_semester_id === selectedStartupSemesterId)

  return <div className="space-y-6">
    <Link href="/dashboard/founders" className="text-blue-600 hover:underline">â† Back to Founders</Link>
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h1 className="text-3xl font-bold text-gray-900">{founder.full_name ?? founder.email}</h1>
      <p className="mt-2 text-gray-600">{founder.email}</p>
      {participations.length > 0 && <label className="mt-4 block max-w-sm text-sm font-medium text-gray-700">Startup and semester
        <select value={selectedStartupSemesterId} onChange={(event) => setSelectedStartupSemesterId(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2">
          {participations.map((item) => <option key={item.startupSemesterId} value={item.startupSemesterId}>{item.startupName} · {item.semesterName}{item.isActive ? ' (active)' : ''}</option>)}
        </select>
      </label>}
    </section>
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-xl font-semibold">Mentor Sessions</h2>
      {selected && <p className="mb-4 text-sm text-gray-500">{selected.startupName} · {selected.semesterName}</p>}
      {visibleSessions.length === 0 ? <p className="text-gray-500">No sessions scheduled yet</p> : <div className="space-y-3">{visibleSessions.map((session) => <div key={session.id} className="flex justify-between border-b pb-3"><span>{session.meeting?.label ?? session.meeting?.meeting_date ?? 'Date TBD'} · Slot {session.slot}</span><span>{session.mentor?.membership?.profile?.full_name ?? 'Mentor TBD'} · {session.status}</span></div>)}</div>}
    </section>
  </div>
}
