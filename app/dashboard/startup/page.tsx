'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useState } from 'react'
import SessionCalendar, { type CalSession } from '@/components/SessionCalendar'
import MentorNeedsForm from '@/components/mentor-needs/MentorNeedsForm'

type Mentor = {
  id: string
  full_name: string
  company: string | null
  role_title: string | null
  bio: string | null
  linkedin_url: string | null
  expertise_tags: string[]
}

type OutreachProspect = {
  id: string
  prospect_name: string
  company: string | null
  linkedin_url: string | null
  expertise_tags: string[]
  notes: string | null
  status: 'prospect' | 'contacted' | 'responded' | 'onboarded'
}

type DirectoryEntry =
  | { kind: 'mentor'; id: string; full_name: string; company: string | null; role_title: string | null; bio: string | null; linkedin_url: string | null; expertise_tags: string[] }
  | { kind: 'prospect'; id: string; full_name: string; company: string | null; role_title: null; bio: string | null; linkedin_url: string | null; expertise_tags: string[]; status: OutreachProspect['status'] }

type Session = {
  id: string
  status: string
  topic: string | null
  time_slot: string | null
  format: string | null
  session_dates: { date: string; label: string | null } | null
  mentors: { full_name: string; company: string | null } | null
}

type StartupProfile = {
  id: string
  name: string
  mentor_preferences: string | null
  preferred_tags: string[]
  semester_goals: string[]
}

type Semester = {
  id: string
  name: string
  is_active: boolean
}

export default function StartupDashboard() {
  const supabase = createClient()
  const [directory, setDirectory] = useState<DirectoryEntry[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [startup, setStartup] = useState<StartupProfile | null>(null)
  const [search, setSearch] = useState('')

  const [semesters, setSemesters] = useState<Semester[]>([])
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null)
  const [loadedSessionsFor, setLoadedSessionsFor] = useState<string | null>(null)
  const sessionQueryKey = startup && selectedSemesterId
    ? `${startup.id}:${selectedSemesterId}`
    : null
  const loadingSessions = sessionQueryKey !== null && loadedSessionsFor !== sessionQueryKey

  // Preference form state
  const [prefNotes, setPrefNotes] = useState('')
  const [prefTags, setPrefTags] = useState('')
  const [goals, setGoals] = useState('')
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [savedPrefs, setSavedPrefs] = useState(false)

  // Initial load: directory, profile, semesters
  useEffect(() => {
    async function loadInit() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // All semesters via session_dates join (avoids direct semesters RLS)
      const { data: sdRows } = await supabase
        .from('session_dates')
        .select('semester_id, semesters(id, name, is_active)')
      const semMap = new Map<string, Semester>()
      for (const row of (sdRows ?? []) as unknown as { semester_id: string; semesters: Semester | null }[]) {
        if (row.semester_id && row.semesters && !semMap.has(row.semester_id)) {
          semMap.set(row.semester_id, row.semesters)
        }
      }
      const allSems = [...semMap.values()].sort((a, b) => b.name.localeCompare(a.name))
      setSemesters(allSems)
      const activeSem = allSems.find(s => s.is_active)
      setSelectedSemesterId(activeSem?.id ?? allSems[0]?.id ?? null)

      // Mentors directory
      const { data: mentorRows } = await supabase
        .from('mentors')
        .select('id, full_name, company, role_title, bio, linkedin_url, expertise_tags')
        .eq('is_active', true)
        .order('full_name')

      // Outreach “possible mentors”
      const { data: outreachRows } = await supabase
        .from('outreach')
        .select('id, prospect_name, company, linkedin_url, expertise_tags, notes, status')
        .in('status', ['responded', 'onboarded'])
        .order('prospect_name')

      const mentorEntries: DirectoryEntry[] = ((mentorRows as Mentor[]) ?? []).map(m => ({
        kind: 'mentor',
        id: m.id,
        full_name: m.full_name,
        company: m.company,
        role_title: m.role_title,
        bio: m.bio,
        linkedin_url: m.linkedin_url,
        expertise_tags: m.expertise_tags ?? [],
      }))

      const prospectEntries: DirectoryEntry[] = ((outreachRows as OutreachProspect[]) ?? []).map(o => ({
        kind: 'prospect',
        id: o.id,
        full_name: o.prospect_name,
        company: o.company,
        role_title: null,
        bio: o.notes,
        linkedin_url: o.linkedin_url,
        expertise_tags: o.expertise_tags ?? [],
        status: o.status,
      }))

      setDirectory([...mentorEntries, ...prospectEntries])

      // This startup's profile
      const { data: startupRow } = await supabase
        .from('startups')
        .select('id, name, mentor_preferences, preferred_tags, semester_goals')
        .eq('user_id', user.id)
        .single()

      if (startupRow) {
        setStartup(startupRow as StartupProfile)
        setPrefNotes(startupRow.mentor_preferences ?? '')
        setPrefTags((startupRow.preferred_tags ?? []).join(', '))
        setGoals((startupRow.semester_goals ?? []).join(', '))
      }
    }
    loadInit()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch sessions when startup profile or selected semester changes
  useEffect(() => {
    if (!startup || !selectedSemesterId) return
    const queryKey = `${startup.id}:${selectedSemesterId}`
    supabase
      .from('sessions')
      .select('id, status, topic, time_slot, format, session_dates!inner(date, label, semester_id), mentors(full_name, company)')
      .eq('startup_id', startup.id)
      .eq('session_dates.semester_id', selectedSemesterId)
      .order('date', { referencedTable: 'session_dates' })
      .then(({ data }) => {
        setSessions((data as unknown as Session[]) ?? [])
        setLoadedSessionsFor(queryKey)
      })
  }, [startup?.id, selectedSemesterId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function savePreferences() {
    if (!startup) return
    setSavingPrefs(true)
    await supabase
      .from('startups')
      .update({
        mentor_preferences: prefNotes,
        preferred_tags: prefTags.split(',').map(t => t.trim()).filter(Boolean),
        semester_goals: goals.split(',').map(g => g.trim()).filter(Boolean),
      })
      .eq('id', startup.id)
    setSavingPrefs(false)
    setSavedPrefs(true)
    setTimeout(() => setSavedPrefs(false), 2500)
  }

  const filteredDirectory = directory.filter(m => {
    const q = search.toLowerCase()
    return (
      m.full_name.toLowerCase().includes(q) ||
      (m.company ?? '').toLowerCase().includes(q) ||
      (m.role_title ?? '').toLowerCase().includes(q) ||
      m.expertise_tags.some(t => t.toLowerCase().includes(q))
    )
  })

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-[#002147]">
          {startup?.name ?? 'My Dashboard'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">View your sessions and explore the mentor network.</p>
      </div>

      {/* Sessions */}
      {(() => {
        const activeSemesterName = semesters.find(s => s.id === selectedSemesterId)?.name ?? null
        return (
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
              <p className="text-sm text-gray-400">No sessions scheduled yet.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-gray-100">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-[#002147]">
                            {s.mentors?.full_name ?? '—'}
                            {s.mentors?.company ? <span className="text-gray-400 font-normal"> · {s.mentors.company}</span> : ''}
                          </p>
                          {activeSemesterName && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#002147]/8 text-[#002147]">
                              {activeSemesterName}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {s.session_dates?.label ?? ''}{s.session_dates?.date ? ` · ${s.session_dates.date}` : ''}
                          {s.time_slot ? ` · ${s.time_slot}` : ''}
                          {s.topic ? ` · ${s.topic}` : ''}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                        s.status === 'confirmed'
                          ? 'text-green-600 bg-green-50'
                          : s.status === 'declined'
                          ? 'text-red-500 bg-red-50'
                          : 'text-yellow-600 bg-yellow-50'
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
                    date: s.session_dates?.date ?? '',
                    partnerName: s.mentors?.full_name ?? null,
                    timeSlot: s.time_slot,
                    format: s.format,
                    status: s.status,
                    topic: s.topic,
                  }))} />
                </div>
              </>
            )}
          </section>
        )
      })()}

      <MentorNeedsForm
        semesterId={selectedSemesterId}
        semesterName={semesters.find(s => s.id === selectedSemesterId)?.name ?? null}
      />

      {/* Mentor preferences */}
      <section>
        <h2 className="text-base font-semibold text-[#002147] mb-1">Mentorship Preferences</h2>
        <p className="text-sm text-gray-500 mb-4">
          Let us know what you&apos;re looking for so we can match you with the right mentors.
        </p>
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              What do you need help with?
            </label>
            <textarea
              value={prefNotes}
              onChange={e => setPrefNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Go-to-market strategy, fundraising, product-market fit…"
              className="w-full text-sm text-gray-800 placeholder:text-gray-500 border border-gray-300 rounded-lg px-3 py-2.5 resize-none bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Preferred expertise tags <span className="font-normal normal-case">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={prefTags}
              onChange={e => setPrefTags(e.target.value)}
              placeholder="e.g. growth, product, legal, finance"
              className="w-full text-sm text-gray-800 placeholder:text-gray-500 border border-gray-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Semester goals <span className="font-normal normal-case">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={goals}
              onChange={e => setGoals(e.target.value)}
              placeholder="e.g. close seed round, launch v2, hire first engineer"
              className="w-full text-sm text-gray-800 placeholder:text-gray-500 border border-gray-300 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={savePreferences}
              disabled={savingPrefs || !startup}
              className="px-5 py-2.5 bg-[#002147] text-white text-sm font-medium rounded-full hover:bg-[#002147]/90 disabled:opacity-60 transition-colors"
            >
              {savingPrefs ? 'Saving…' : 'Save preferences'}
            </button>
            {savedPrefs && <p className="text-sm text-green-600">Saved!</p>}
            {!startup && <p className="text-xs text-gray-400">Your startup profile hasn&apos;t been set up yet. Contact an admin.</p>}
          </div>
        </div>
      </section>

      {/* Mentor directory */}
      <section>
        <h2 className="text-base font-semibold text-[#002147] mb-1">Mentor Directory</h2>
        <p className="text-sm text-gray-500 mb-3">
          Includes active mentors plus onboarded/responded outreach prospects.
        </p>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, company, or expertise…"
          className="w-full text-sm text-gray-800 placeholder:text-gray-500 border border-gray-300 rounded-xl px-4 py-2.5 mb-4 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
        />
        {filteredDirectory.length === 0 ? (
          <p className="text-sm text-gray-400">{search ? 'No mentors match your search.' : 'No mentors listed yet.'}</p>
        ) : (
          <div className="space-y-3">
            {filteredDirectory.map(m => (
              <div key={m.id} className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div>
                    <p className="font-semibold text-[#002147] text-sm">{m.full_name}</p>
                    <p className="text-xs text-gray-500">
                      {[m.role_title, m.company].filter(Boolean).join(' · ')}
                    </p>
                    {m.kind === 'prospect' && (
                      <div className="mt-1">
                        <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          m.status === 'onboarded'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}>
                          Possible mentor · {m.status}
                        </span>
                      </div>
                    )}
                  </div>
                  {m.linkedin_url && (
                    <a
                      href={m.linkedin_url.startsWith('http') ? m.linkedin_url : `https://${m.linkedin_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-[#75AADB] hover:underline font-medium"
                    >
                      LinkedIn →
                    </a>
                  )}
                </div>
                {m.bio && <p className="text-xs text-gray-500 leading-relaxed mb-3">{m.bio}</p>}
                {m.expertise_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.expertise_tags.map(tag => (
                      <span key={tag} className="text-[10px] font-semibold bg-[#002147]/8 text-[#002147] px-2.5 py-1 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
