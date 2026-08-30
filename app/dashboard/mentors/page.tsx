'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useMemo, useState } from 'react'

type MentorCard = {
  id: string
  full_name: string
  company: string | null
  role_title: string | null
  linkedin_url: string | null
  bio: string | null
  expertise_tags: string[]
  is_active: boolean
  photo_url: string | null
}

type SessionDate = { id: string; date: string; label: string | null }

export default function MentorDirectoryPage() {
  const supabase = useMemo(() => createClient(), [])
  const [mentors, setMentors] = useState<MentorCard[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')

  // For request-a-mentor flow
  const [userRole, setUserRole] = useState<string | null>(null)
  const [startupId, setStartupId] = useState<string | null>(null)
  const [activeSemesterId, setActiveSemesterId] = useState<string | null>(null)
  const [sessionDates, setSessionDates] = useState<SessionDate[]>([])

  // Request modal state
  const [requestMentor, setRequestMentor] = useState<MentorCard | null>(null)
  const [requestDateId, setRequestDateId] = useState('')
  const [requestTopic, setRequestTopic] = useState('')
  const [requestFormat, setRequestFormat] = useState('online')
  const [requesting, setRequesting] = useState(false)
  const [requestSuccess, setRequestSuccess] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single()
      setUserRole(profile?.role ?? null)

      // Fetch mentors
      const { data: mentorData } = await supabase
        .from('mentors')
        .select('id, full_name, company, role_title, linkedin_url, bio, expertise_tags, is_active, photo_url')
        .eq('is_active', true)
        .order('full_name')
      setMentors((mentorData as MentorCard[]) ?? [])
      setLoading(false)

      // If startup user, find their startup and load session dates
      if (profile?.role === 'startup' && profile.email) {
        const { data: semData } = await supabase
          .from('semesters')
          .select('id')
          .eq('is_active', true)
          .maybeSingle()
        if (semData) {
          setActiveSemesterId(semData.id)
          const { data: dateRows } = await supabase
            .from('session_dates')
            .select('id, date, label')
            .eq('semester_id', semData.id)
            .order('date')
          setSessionDates((dateRows as SessionDate[]) ?? [])
        }

        // Find startup by founder email — use ilike on jsonb cast as text
        const { data: startups } = await supabase
          .from('startups')
          .select('id')
        // Filter client-side since jsonb contains queries vary by Supabase version
        if (startups) {
          const { data: fullStartups } = await supabase
            .from('startups')
            .select('id, founders')
          const match = (fullStartups ?? []).find((s: { id: string; founders: { email?: string }[] }) =>
            (s.founders ?? []).some((f: { email?: string }) => f.email?.toLowerCase() === profile.email?.toLowerCase())
          )
          if (match) setStartupId(match.id)
        }
      }
    }
    void init()
  }, [supabase]) // eslint-disable-line react-hooks/exhaustive-deps

  const allTags = useMemo(() =>
    [...new Set(mentors.flatMap(m => m.expertise_tags ?? []))].sort()
  , [mentors])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return mentors.filter(m => {
      if (tagFilter && !(m.expertise_tags ?? []).includes(tagFilter)) return false
      if (!q) return true
      return [m.full_name, m.company ?? '', m.role_title ?? '', ...(m.expertise_tags ?? [])].join(' ').toLowerCase().includes(q)
    })
  }, [mentors, search, tagFilter])

  async function submitRequest() {
    if (!requestMentor || !startupId || !activeSemesterId || !requestDateId) return
    setRequesting(true)
    setRequestError(null)
    const { error } = await supabase.from('sessions').insert({
      mentor_id: requestMentor.id,
      startup_id: startupId,
      session_date_id: requestDateId,
      semester_id: activeSemesterId,
      status: 'pending',
      topic: requestTopic.trim() || null,
      format: requestFormat,
      is_confirmed: false,
    } as never)
    setRequesting(false)
    if (error) {
      setRequestError(error.message)
    } else {
      setRequestSuccess(true)
      setTimeout(() => {
        setRequestMentor(null)
        setRequestSuccess(false)
        setRequestDateId('')
        setRequestTopic('')
        setRequestFormat('online')
        setRequestError(null)
      }, 1800)
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#002147]">Mentor Directory</h1>
        <p className="text-sm text-gray-500 mt-1">Browse mentors and their areas of expertise.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="search"
          placeholder="Search mentors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
        />
        <select
          value={tagFilter}
          onChange={e => setTagFilter(e.target.value)}
          className="text-sm text-gray-700 border border-gray-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
        >
          <option value="">All expertise</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <p className="text-xs text-gray-400 self-center shrink-0">{filtered.length} mentor{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8">
          <div className="w-4 h-4 border-2 border-[#002147] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading…</span>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400">No mentors found.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map(m => (
            <div key={m.id} className="bg-white rounded-2xl border border-gray-100 p-5 flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#002147]/8 flex items-center justify-center shrink-0 overflow-hidden">
                {m.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photo_url} alt={m.full_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[#002147] text-lg font-bold">{m.full_name.charAt(0)}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#002147] truncate">{m.full_name}</p>
                {(m.role_title || m.company) && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {[m.role_title, m.company].filter(Boolean).join(' · ')}
                  </p>
                )}
                {m.bio && (
                  <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">{m.bio}</p>
                )}
                {(m.expertise_tags ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {m.expertise_tags.slice(0, 4).map(t => (
                      <span key={t} className="text-[10px] bg-[#002147]/8 text-[#002147] px-2 py-0.5 rounded-full font-medium">{t}</span>
                    ))}
                    {m.expertise_tags.length > 4 && (
                      <span className="text-[10px] text-gray-400">+{m.expertise_tags.length - 4}</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                  {m.linkedin_url && (
                    <a
                      href={m.linkedin_url.startsWith('http') ? m.linkedin_url : `https://${m.linkedin_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 0h-14c-2.76 0-5 2.24-5 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5v-14c0-2.76-2.24-5-5-5zm-11 19h-3v-10h3v10zm-1.5-11.27c-.97 0-1.75-.79-1.75-1.76s.78-1.76 1.75-1.76 1.75.79 1.75 1.76-.78 1.76-1.75 1.76zm13.5 11.27h-3v-5.6c0-1.34-.03-3.07-1.87-3.07-1.87 0-2.16 1.46-2.16 2.97v5.7h-3v-10h2.88v1.36h.04c.4-.76 1.38-1.56 2.84-1.56 3.04 0 3.6 2 3.6 4.59v5.61z" />
                      </svg>
                      LinkedIn
                    </a>
                  )}
                  {userRole === 'startup' && startupId && sessionDates.length > 0 && (
                    <button
                      onClick={() => { setRequestMentor(m); setRequestError(null); setRequestSuccess(false) }}
                      className="text-[11px] font-medium px-2.5 py-1 bg-[#002147] text-white rounded-lg hover:bg-[#002147]/90 transition-colors"
                    >
                      Request session
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Request-a-mentor modal */}
      {requestMentor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRequestMentor(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#002147]">Request a session</h3>
                <p className="text-xs text-gray-500 mt-0.5">with {requestMentor.full_name}</p>
              </div>
              <button
                onClick={() => setRequestMentor(null)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {requestSuccess ? (
              <div className="py-6 text-center">
                <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700">Request sent!</p>
                <p className="text-xs text-gray-400 mt-1">The mentor will confirm shortly.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Session date <span className="text-red-400">*</span></label>
                    <select
                      value={requestDateId}
                      onChange={e => setRequestDateId(e.target.value)}
                      className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                    >
                      <option value="">Select a date…</option>
                      {sessionDates.map(d => (
                        <option key={d.id} value={d.id}>
                          {d.label ?? d.date} · {d.date}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Format</label>
                    <select
                      value={requestFormat}
                      onChange={e => setRequestFormat(e.target.value)}
                      className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                    >
                      <option value="online">Online</option>
                      <option value="in-person">In-person</option>
                      <option value="no-preference">No preference</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Topic / what you&apos;d like to discuss</label>
                    <textarea
                      rows={3}
                      value={requestTopic}
                      onChange={e => setRequestTopic(e.target.value)}
                      placeholder="e.g. Fundraising strategy, GTM planning…"
                      className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 resize-none"
                    />
                  </div>
                </div>
                {requestError && <p className="text-xs text-red-500">{requestError}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => void submitRequest()}
                    disabled={requesting || !requestDateId}
                    className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-50 transition-colors"
                  >
                    {requesting ? 'Sending…' : 'Send request'}
                  </button>
                  <button
                    onClick={() => setRequestMentor(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
