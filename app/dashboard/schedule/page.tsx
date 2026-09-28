'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/utils/supabase/client'
import { FridayProgramPanel } from '@/components/friday-program/FridayProgramPanel'

type Meeting = { id: string; label: string | null; meeting_date: string; semester_id: string }
type ScheduledSession = {
  id: string
  meeting_id: string
  slot: number
  status: string
  mentor: { membership: { profile: { full_name: string | null } | null } | null } | null
  startup: { organization: { name: string } | null } | null
}

export default function SchedulePage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [sessions, setSessions] = useState<ScheduledSession[]>([])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const client = createClient()
      void Promise.all([
        client.from('meetings').select('id,label,meeting_date,semester_id').order('meeting_date'),
        client.from('sessions').select('id,meeting_id,slot,status,mentor:mentor_semesters(membership:semester_memberships(profile:profiles(full_name))),startup:startup_semesters(organization:startup_organizations(name))').order('slot'),
      ]).then(([meetingResult, sessionResult]) => {
        setMeetings((meetingResult.data as Meeting[]) ?? [])
        setSessions((sessionResult.data as unknown as ScheduledSession[]) ?? [])
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-gray-900">Schedule</h1><p className="mt-1 text-sm text-gray-500">Program sessions are managed by semester administrators.</p></div>
    {[...new Set(meetings.map((meeting) => meeting.semester_id))].map((semesterId) => <FridayProgramPanel key={semesterId} semesterId={semesterId} />)}
    {meetings.map((meeting) => <section key={meeting.id} className="rounded-lg border bg-white p-5">
      <h2 className="font-semibold">{meeting.label ?? meeting.meeting_date}</h2>
      <div className="mt-3 space-y-2">
        {sessions.filter((session) => session.meeting_id === meeting.id).map((session) => <div key={session.id} className="border-t pt-2">
          <span>Slot {session.slot}: {session.startup?.organization?.name ?? 'Startup'} with {session.mentor?.membership?.profile?.full_name ?? 'Mentor'} ({session.status})</span>
        </div>)}
        {!sessions.some((session) => session.meeting_id === meeting.id) && <p className="text-sm text-gray-500">No sessions scheduled.</p>}
      </div>
    </section>)}
  </div>
}
