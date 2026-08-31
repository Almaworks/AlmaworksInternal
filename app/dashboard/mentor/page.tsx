'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import SessionCalendar, { type CalSession } from '@/components/SessionCalendar'
import { loadMentorAvailability } from '@/src/program/canonical-repository'

type SessionDate = {
  id: string
  date: string
  label: string | null
}

type Availability = {
  meeting_id: string
  is_available: boolean
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
  const supabase = createClient()

  const [sessionDates, setSessionDates] = useState<SessionDate[]>([])
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const [sessions, setSessions] = useState<Session[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [membershipId, setMembershipId] = useState<string | null>(null)
  const [mentorTerms, setMentorTerms] = useState<Record<string, string>>({})

  const [semesters, setSemesters] = useState<Semester[]>([])
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null)
  const [loadedSessionsFor, setLoadedSessionsFor] = useState<string | null>(null)
  const mentorId = selectedSemesterId ? mentorTerms[selectedSemesterId] ?? null : null
  const sessionQueryKey = mentorId && selectedSemesterId
    ? `${mentorId}:${selectedSemesterId}`
    : null
  const loadingSessions = sessionQueryKey !== null && loadedSessionsFor !== sessionQueryKey

  // Load initial data (user identity, semesters, availability dates)
  useEffect(() => {
    async function loadInit() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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

      // Active semester's session dates (for availability checkboxes)
      if (activeSem) {
        const { data: dates } = await supabase
          .from('meetings')
          .select('id, meeting_date, label')
          .eq('semester_id', activeSem.id)
          .order('meeting_date')
        setSessionDates((dates ?? []).map((row) => ({ id: row.id, date: row.meeting_date, label: row.label })))
      }

      const avail = activeSem ? await loadMentorAvailability(supabase, user.id, activeSem.id) : []
      const map: Record<string, boolean> = {}
      for (const row of (avail as Availability[]) ?? []) {
        map[row.meeting_id] = (map[row.meeting_id] ?? false) || row.is_available
      }
      setAvailability(map)

      const { data: mentorRows } = await supabase
        .from('mentor_semesters')
        .select('id, semester_id, membership:semester_memberships!inner(profile_id)')
        .eq('semester_memberships.profile_id', user.id)
      const terms = Object.fromEntries((mentorRows ?? []).map((row) => [row.semester_id, row.id]))
      setMentorTerms(terms)
      const activeMembership = (membershipRows ?? []).find((row) => row.semester_id === activeSem?.id)
      setMembershipId(activeMembership?.id ?? null)
    }
    loadInit()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch sessions whenever mentor or selected semester changes
  useEffect(() => {
    if (!mentorId || !selectedSemesterId) return
    const queryKey = `${mentorId}:${selectedSemesterId}`
    supabase
      .from('sessions')
      .select('id, status, topic, slot, format, meeting:meetings!inner(meeting_date, label, semester_id), startup:startup_semesters!inner(organization:startup_organizations!inner(name))')
      .eq('mentor_semester_id', mentorId)
      .eq('meetings.semester_id', selectedSemesterId)
      .order('meeting_date', { referencedTable: 'meetings' })
      .then(({ data }) => {
        setSessions((data as unknown as Session[]) ?? [])
        setLoadedSessionsFor(queryKey)
      })
  }, [mentorId, selectedSemesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDate(dateId: string) {
    setAvailability(prev => ({ ...prev, [dateId]: !prev[dateId] }))
  }

  async function saveAvailability() {
    if (!membershipId || !selectedSemesterId) return
    setSaving(true)
    const rows = sessionDates.flatMap(d => ([1, 2] as const).map((slot) => ({
      semester_id: selectedSemesterId,
      semester_membership_id: membershipId,
      meeting_id: d.id,
      slot,
      is_available: availability[d.id] ?? false,
      source: 'user',
    })))
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
          Select the Fridays you&apos;re available for mentoring sessions this semester.
        </p>

        {sessionDates.length === 0 ? (
          <p className="text-sm text-gray-400">No session dates have been set for this semester yet.</p>
        ) : (
          <div className="space-y-2">
            {sessionDates.map(d => (
              <label
                key={d.id}
                className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-100 cursor-pointer hover:border-[#75AADB]/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={availability[d.id] ?? false}
                  onChange={() => toggleDate(d.id)}
                  className="w-4 h-4 accent-[#002147] rounded"
                />
                <div>
                  <p className="text-sm font-medium text-[#002147]">{d.label ?? d.date}</p>
                  <p className="text-xs text-gray-400">{d.date}</p>
                </div>
              </label>
            ))}

            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={saveAvailability}
                disabled={saving}
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
