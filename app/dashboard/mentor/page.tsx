'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useMemo, useState } from 'react'
import SessionCalendar, { type CalSession } from '@/components/SessionCalendar'
import { loadMentorAvailability, loadMentorSessions } from '@/src/program/canonical-repository'
import {
  availabilityRowsForMeetings,
  availabilityStateFromRows,
  availabilityWindowKey,
  type AvailabilitySlot,
} from '@/src/program/availability-windows'

type SessionDate = {
  id: string
  date: string
  label: string | null
}

type Availability = {
  meeting_id: string
  is_available: boolean
  slot: AvailabilitySlot
}

type Session = {
  id: string
  status: string
  topic: string | null
  slot: number
  format: string | null
  meeting: { meeting_date: string; label: string | null } | null
  startup: { organization: { name: string } | null } | null
}

type Semester = {
  id: string
  name: string
  is_active: boolean
}

export default function MentorDashboard() {
  const supabase = useMemo(() => createClient(), [])

  const [sessionDates, setSessionDates] = useState<SessionDate[]>([])
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const [sessions, setSessions] = useState<Session[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [membershipTerms, setMembershipTerms] = useState<Record<string, string>>({})
  const [mentorTerms, setMentorTerms] = useState<Record<string, string>>({})

  const [semesters, setSemesters] = useState<Semester[]>([])
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null)
  const [loadedSessionsFor, setLoadedSessionsFor] = useState<string | null>(null)
  const mentorId = selectedSemesterId ? mentorTerms[selectedSemesterId] ?? null : null
  const membershipId = selectedSemesterId ? membershipTerms[selectedSemesterId] ?? null : null
  const sessionQueryKey = mentorId && selectedSemesterId
    ? `${mentorId}:${selectedSemesterId}`
    : null
  const loadingSessions = sessionQueryKey !== null && loadedSessionsFor !== sessionQueryKey

  // Load initial data (user identity, semesters, availability dates)
  useEffect(() => {
    async function loadInit() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setProfileId(user.id)

      const { data: membershipRows } = await supabase
        .from('semester_memberships')
        .select('id, semester_id, semester:semesters!inner(id, name, is_active)')
        .eq('profile_id', user.id)
        .eq('role', 'mentor')
      const semMap = new Map<string, Semester>()
      for (const row of (membershipRows ?? []) as unknown as { id: string; semester_id: string; semester: Semester | null }[]) {
        if (row.semester_id && row.semester && !semMap.has(row.semester_id)) {
          semMap.set(row.semester_id, row.semester)
        }
      }
      const allSems = [...semMap.values()].sort((a, b) => b.name.localeCompare(a.name))
      setSemesters(allSems)
      const activeSem = allSems.find(s => s.is_active)
      const defaultId = activeSem?.id ?? allSems[0]?.id ?? null
      setSelectedSemesterId(defaultId)
      setMembershipTerms(Object.fromEntries((membershipRows ?? []).map((row) => [row.semester_id, row.id])))

      const { data: mentorRows } = await supabase
        .from('mentor_semesters')
        .select('id, semester_id, membership:semester_memberships!inner(profile_id)')
        .eq('membership.profile_id', user.id)
      const terms = Object.fromEntries((mentorRows ?? []).map((row) => [row.semester_id, row.id]))
      setMentorTerms(terms)
    }
    loadInit()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profileId || !selectedSemesterId) {
      return
    }
    let cancelled = false
    void Promise.all([
      supabase.from('meetings').select('id, meeting_date, label').eq('semester_id', selectedSemesterId).order('meeting_date'),
      loadMentorAvailability(supabase, profileId, selectedSemesterId),
    ]).then(([dateResult, availabilityRows]) => {
      if (cancelled) return
      setSessionDates((dateResult.data ?? []).map((row) => ({ id: row.id, date: row.meeting_date, label: row.label })))
      setAvailability(availabilityStateFromRows(availabilityRows as Availability[]))
    })
    return () => { cancelled = true }
  }, [profileId, selectedSemesterId, supabase])

  // Re-fetch sessions whenever mentor or selected semester changes
  useEffect(() => {
    if (!mentorId || !selectedSemesterId) return
    const queryKey = `${mentorId}:${selectedSemesterId}`
    void loadMentorSessions(supabase, mentorId, selectedSemesterId)
      .then((data) => {
        setSessions((data as unknown as Session[]) ?? [])
        setLoadedSessionsFor(queryKey)
      })
  }, [mentorId, selectedSemesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleWindow(meetingId: string, slot: AvailabilitySlot) {
    const key = availabilityWindowKey(meetingId, slot)
    setAvailability(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function saveAvailability() {
    if (!membershipId || !selectedSemesterId) return
    setSaving(true)
    const rows = availabilityRowsForMeetings({
      meetingIds: sessionDates.map((meeting) => meeting.id),
      membershipId,
      semesterId: selectedSemesterId,
      state: availability,
    })
    await supabase.from('meeting_availability').upsert(rows, { onConflict: 'meeting_id,semester_membership_id,slot' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const activeSemesterName = semesters.find(s => s.id === selectedSemesterId)?.name ?? null

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[#002147]">My Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your availability and view scheduled sessions.</p>
      </div>

      {/* Sessions */}
      <section>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-[#002147]">My Sessions</h2>
            {activeSemesterName && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#002147]/8 text-[#002147]">
                {activeSemesterName}
              </span>
            )}
          </div>
          {semesters.length > 1 && (
            <select
              value={selectedSemesterId ?? ''}
              onChange={e => setSelectedSemesterId(e.target.value)}
              className="text-xs text-gray-700 border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
            >
              {semesters.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.is_active ? ' (active)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {loadingSessions ? (
          <div className="flex items-center gap-2 py-4">
            <div className="w-4 h-4 border-2 border-[#002147] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-400">Loading…</span>
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400">No sessions for this semester yet.</p>
        ) : (
          <>
            <div className="space-y-2">
              {sessions.map(s => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-100">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-[#002147]">{s.startup?.organization?.name ?? '—'}</p>
                      {activeSemesterName && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#002147]/8 text-[#002147]">
                          {activeSemesterName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {s.meeting?.label ?? ''}{s.meeting?.meeting_date ? ` · ${s.meeting.meeting_date}` : ''}
                      {` · Slot ${s.slot}`}
                      {s.topic ? ` · ${s.topic}` : ''}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                    s.status === 'confirmed' ? 'text-green-600 bg-green-50' :
                    s.status === 'declined' ? 'text-red-500 bg-red-50' :
                    'text-yellow-600 bg-yellow-50'
                  }`}>
                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Calendar view</p>
              <SessionCalendar sessions={sessions.map((s): CalSession => ({
                id: s.id,
                date: s.meeting?.meeting_date ?? '',
                partnerName: s.startup?.organization?.name ?? null,
                timeSlot: s.slot === 1 ? '3:30-4:15' : '4:15-5:00',
                format: s.format,
                status: s.status,
                topic: s.topic,
              }))} />
            </div>
          </>
        )}
      </section>

      {/* Availability */}
      <section>
        <h2 className="text-base font-semibold text-[#002147] mb-1">Friday Availability</h2>
        <p className="text-sm text-gray-500 mb-4">
          Select each Friday session window when you&apos;re available this semester.
        </p>

        {sessionDates.length === 0 ? (
          <p className="text-sm text-gray-400">No session dates have been set for this semester yet.</p>
        ) : (
          <div className="space-y-2">
            {sessionDates.map(d => (
              <div
                key={d.id}
                className="px-4 py-3 bg-white rounded-xl border border-gray-100"
              >
                <div className="mb-2">
                  <p className="text-sm font-medium text-[#002147]">{d.label ?? d.date}</p>
                  <p className="text-xs text-gray-400">{d.date}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([1, 2] as const).map((slot) => {
                    const key = availabilityWindowKey(d.id, slot)
                    return (
                      <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-700 hover:border-[#75AADB]/50">
                        <input
                          type="checkbox"
                          checked={availability[key] ?? false}
                          onChange={() => toggleWindow(d.id, slot)}
                          className="w-4 h-4 accent-[#002147] rounded"
                        />
                        <span>{slot === 1 ? '3:30–4:15 PM' : '4:15–5:00 PM'}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={saveAvailability}
                disabled={saving || !membershipId}
                className="px-5 py-2.5 bg-[#002147] text-white text-sm font-medium rounded-full hover:bg-[#002147]/90 disabled:opacity-60 transition-colors"
              >
                {saving ? 'Saving…' : 'Save availability'}
              </button>
              {saved && <p className="text-sm text-green-600">Saved!</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
