'use client'

import { useEffect, useState } from 'react'

import { loadMentorDirectory, loadStartupDirectory } from '@/src/program/canonical-repository'
import { createClient } from '@/utils/supabase/client'

type Meeting = { id: string; label: string | null; meeting_date: string; semester_id: string }
type ScheduledSession = { id: string; meeting_id: string; slot: number; status: string; mentor: { membership: { profile: { full_name: string | null } | null } | null } | null; startup: { organization: { name: string } | null } | null }

export default function SchedulePage() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [sessions, setSessions] = useState<ScheduledSession[]>([])
  const [mentors, setMentors] = useState<{ id: string; name: string }[]>([])
  const [startups, setStartups] = useState<{ id: string; name: string }[]>([])
  const [meetingId, setMeetingId] = useState('')
  const [mentorId, setMentorId] = useState('')
  const [startupId, setStartupId] = useState('')
  const [slot, setSlot] = useState<1 | 2>(1)

  async function load() {
    const client = createClient()
    const [meetingResult, sessionResult, mentorRows, startupRows] = await Promise.all([
      client.from('meetings').select('id,label,meeting_date,semester_id').order('meeting_date'),
      client.from('sessions').select('id,meeting_id,slot,status,mentor:mentor_semesters(membership:semester_memberships(profile:profiles(full_name))),startup:startup_semesters(organization:startup_organizations(name))').order('slot'),
      loadMentorDirectory(client),
      loadStartupDirectory(client),
    ])
    setMeetings((meetingResult.data as Meeting[]) ?? [])
    setSessions((sessionResult.data as unknown as ScheduledSession[]) ?? [])
    setMentors(mentorRows.filter((mentor) => mentor.is_active).map((mentor) => ({ id: mentor.id, name: mentor.full_name })))
    setStartups(startupRows.filter((startup) => startup.is_active).map((startup) => ({ id: startup.id, name: startup.name })))
    setMeetingId((current) => current || meetingResult.data?.[0]?.id || '')
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function addSession() {
    const meeting = meetings.find((candidate) => candidate.id === meetingId)
    if (!meeting || !mentorId || !startupId) return
    const client = createClient()
    const result = await client.from('sessions').insert({ meeting_id: meeting.id, mentor_semester_id: mentorId, semester_id: meeting.semester_id, slot, startup_semester_id: startupId, status: 'confirmed' })
    if (result.error) return alert(result.error.message)
    await load()
  }

  async function removeSession(id: string) {
    if (!confirm('Delete this session?')) return
    const result = await createClient().from('sessions').delete().eq('id', id)
    if (result.error) return alert(result.error.message)
    setSessions((current) => current.filter((session) => session.id !== id))
  }

  return <div className="space-y-6"><h1 className="text-3xl font-bold text-gray-900">Schedule</h1><section className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-5"><select value={meetingId} onChange={(event) => setMeetingId(event.target.value)}>{meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.label ?? meeting.meeting_date}</option>)}</select><select value={startupId} onChange={(event) => setStartupId(event.target.value)}><option value="">Select startup</option>{startups.map((startup) => <option key={startup.id} value={startup.id}>{startup.name}</option>)}</select><select value={mentorId} onChange={(event) => setMentorId(event.target.value)}><option value="">Select mentor</option>{mentors.map((mentor) => <option key={mentor.id} value={mentor.id}>{mentor.name}</option>)}</select><select value={slot} onChange={(event) => setSlot(event.target.value === '2' ? 2 : 1)}><option value={1}>Slot 1</option><option value={2}>Slot 2</option></select><button onClick={() => void addSession()} className="rounded bg-blue-600 px-3 py-2 text-white">Add session</button></section>{meetings.map((meeting) => <section key={meeting.id} className="rounded-lg border bg-white p-5"><h2 className="font-semibold">{meeting.label ?? meeting.meeting_date}</h2><div className="mt-3 space-y-2">{sessions.filter((session) => session.meeting_id === meeting.id).map((session) => <div key={session.id} className="flex items-center justify-between border-t pt-2"><span>Slot {session.slot}: {session.startup?.organization?.name ?? 'Startup'} with {session.mentor?.membership?.profile?.full_name ?? 'Mentor'} ({session.status})</span><button onClick={() => void removeSession(session.id)} className="text-sm text-red-600">Delete</button></div>)}</div></section>)}</div>
}
