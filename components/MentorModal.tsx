'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { loadMentorProfile } from '@/src/program/canonical-repository'

type WeekAvailability = { slot: string; format: string }

type Mentor = {
  id: string
  full_name: string
  email: string | null
  company: string | null
  role_title: string | null
  linkedin_url: string | null
  bio: string | null
  expertise_tags: string[]
  is_active: boolean
  general_availability: string | null
  preferred_format: string | null
  per_week_availability: Record<string, WeekAvailability> | null
  opening_talk: string | null
}

const SLOT_LABELS: Record<string, string> = {
  both: 'Both slots',
  '3:30-4:15': '3:30 – 4:15 PM',
  '4:15-5:00': '4:15 – 5:00 PM',
  not_available: 'Not available',
}

const FORMAT_LABELS: Record<string, string> = {
  online: 'Online',
  'in-person': 'In-person',
  in_person: 'In-person',
  'no-preference': 'No preference',
  no_preference: 'No preference',
}

const SESSION_DATES: { date: string; label: string }[] = [
  { date: '2026-02-13', label: 'Feb 13' },
  { date: '2026-02-20', label: 'Feb 20' },
  { date: '2026-02-27', label: 'Feb 27' },
  { date: '2026-03-06', label: 'Mar 6' },
  { date: '2026-03-13', label: 'Mar 13' },
  { date: '2026-03-20', label: 'Mar 20' },
  { date: '2026-03-27', label: 'Mar 27' },
  { date: '2026-04-03', label: 'Apr 3' },
  { date: '2026-04-10', label: 'Apr 10' },
  { date: '2026-04-17', label: 'Apr 17' },
]

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

type Props = {
  mentorId: string | null
  onClose: () => void
}

export default function MentorModal({ mentorId, onClose }: Props) {
  const supabase = createClient()
  const [mentor, setMentor] = useState<Mentor | null>(null)
  const loading = mentorId !== null && mentor?.id !== mentorId

  useEffect(() => {
    if (!mentorId) return
    void loadMentorProfile(supabase, mentorId).then((data) => {
      setMentor(data as unknown as Mentor | null)
    })
  }, [mentorId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!mentorId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mentorId, onClose])

  useEffect(() => {
    document.body.style.overflow = mentorId ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mentorId])

  if (!mentorId) return null

  const weekEntries = mentor
    ? SESSION_DATES
        .map(({ date, label }) => ({ date, label, avail: mentor.per_week_availability?.[date] ?? null }))
        .filter(e => e.avail && e.avail.slot !== 'not_available')
    : []

  const formatLabel = mentor?.preferred_format ? (FORMAT_LABELS[mentor.preferred_format] ?? mentor.preferred_format) : null
  const formatColor =
    mentor?.preferred_format === 'in-person' || mentor?.preferred_format === 'in_person'
      ? 'bg-blue-50 text-blue-600'
      : mentor?.preferred_format === 'online'
      ? 'bg-gray-100 text-gray-500'
      : 'bg-purple-50 text-purple-600'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-gray-50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 text-gray-400 hover:text-gray-700 hover:bg-white shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {loading || !mentor ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-[#002147] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 p-5">
            {/* Hero card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="h-2 bg-[#002147]" />
              <div className="px-6 py-6 flex items-start gap-5">
                <div className="w-16 h-16 rounded-2xl bg-[#002147] flex items-center justify-center shrink-0">
                  <span className="text-white text-xl font-bold">{initials(mentor.full_name)}</span>
                </div>
                <div className="flex-1 min-w-0 pr-8">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-xl font-bold text-[#002147] leading-tight">{mentor.full_name}</h2>
                      {(mentor.role_title || mentor.company) && (
                        <p className="text-sm text-gray-500 mt-0.5">
                          {[mentor.role_title, mentor.company].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${mentor.is_active ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                      {mentor.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
                    {mentor.email && (
                      <a href={`mailto:${mentor.email}`} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#002147] transition-colors">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {mentor.email}
                      </a>
                    )}
                    {mentor.linkedin_url && (
                      <a href={mentor.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-[#75AADB] hover:underline transition-colors">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        LinkedIn
                      </a>
                    )}
                  </div>
                </div>
              </div>
              {mentor.expertise_tags && mentor.expertise_tags.length > 0 && (
                <div className="px-6 pb-5 flex flex-wrap gap-2">
                  {mentor.expertise_tags.map(tag => (
                    <span key={tag} className="text-xs font-semibold px-3 py-1 rounded-full bg-[#002147]/8 text-[#002147] border border-[#002147]/10">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bio */}
            {mentor.bio && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Areas of Expertise</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{mentor.bio}</p>
              </div>
            )}

            {/* Availability */}
            {(mentor.general_availability || mentor.preferred_format || weekEntries.length > 0) && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 space-y-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Availability</p>
                <div className="flex flex-wrap gap-2">
                  {mentor.general_availability && (
                    <div className="flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-1.5">
                      <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs text-gray-600">{mentor.general_availability}</span>
                    </div>
                  )}
                  {formatLabel && (
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl ${formatColor}`}>
                      {formatLabel}
                    </span>
                  )}
                </div>
                {weekEntries.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Spring 2026 schedule</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {weekEntries.map(({ date, label, avail }) => (
                        <div key={date} className="bg-gray-50 rounded-xl px-3 py-3 space-y-1">
                          <p className="text-xs font-bold text-[#002147]">{label}</p>
                          <p className="text-xs text-gray-600">{SLOT_LABELS[avail!.slot] ?? avail!.slot}</p>
                          {avail!.format && avail!.format.toLowerCase() !== 'n/a' && (
                            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              avail!.format === 'in-person' || avail!.format === 'in_person'
                                ? 'bg-blue-50 text-blue-600'
                                : avail!.format === 'online'
                                ? 'bg-gray-100 text-gray-500'
                                : 'bg-purple-50 text-purple-500'
                            }`}>
                              {FORMAT_LABELS[avail!.format] ?? avail!.format}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Opening talk */}
            {mentor.opening_talk && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Opening Talk Proposal</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{mentor.opening_talk}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
