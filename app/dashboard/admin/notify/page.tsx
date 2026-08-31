'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useMemo, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionRow = {
  id: string
  session_date: string
  time_slot: string | null
  format: string | null
  is_confirmed: boolean
  mentor: { id: string; full_name: string; email: string | null } | null
  startup: { id: string; name: string; founders: Record<string, string>[] | null } | null
}

type CanonicalSessionRow = {
  id: string
  slot: number
  format: string | null
  status: string
  meeting: { meeting_date: string } | { meeting_date: string }[] | null
  mentor: {
    membership: {
      profile: { id: string; full_name: string | null; email: string | null } | { id: string; full_name: string | null; email: string | null }[] | null
    } | { profile: { id: string; full_name: string | null; email: string | null } | { id: string; full_name: string | null; email: string | null }[] | null }[] | null
  } | null
  startup: {
    organization: { id: string; name: string } | { id: string; name: string }[] | null
    team: { membership: { profile: { email: string | null } | { email: string | null }[] | null } | { profile: { email: string | null } | { email: string | null }[] | null }[] | null }[] | null
  } | null
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function mapCanonicalSession(row: CanonicalSessionRow): SessionRow {
  const meeting = first(row.meeting)
  const mentorMembership = first(row.mentor?.membership ?? null)
  const mentorProfile = first(mentorMembership?.profile ?? null)
  const organization = first(row.startup?.organization ?? null)
  const founders = (row.startup?.team ?? []).flatMap(member => {
    const membership = first(member.membership)
    const profile = first(membership?.profile ?? null)
    return profile?.email ? [{ email: profile.email }] : []
  })
  return {
    id: row.id,
    session_date: meeting?.meeting_date ?? '',
    time_slot: row.slot === 1 ? '3:30-4:15' : '4:15-5:00',
    format: row.format,
    is_confirmed: row.status === 'confirmed',
    mentor: mentorProfile ? {
      id: mentorProfile.id,
      full_name: mentorProfile.full_name ?? mentorProfile.email ?? 'Unnamed mentor',
      email: mentorProfile.email,
    } : null,
    startup: organization ? { id: organization.id, name: organization.name, founders } : null,
  }
}

type SendResult = {
  dry_run: boolean
  sent: number
  preview?: { to: string; subject: string; body_preview: string; message: string }[]
  results?: { email: string; ok: boolean; error?: string }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nextFriday(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 5 ? 7 : (5 - day + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

const SLOT_LABELS: Record<string, string> = {
  'both': 'Both slots (3:30 – 5:00 PM)',
  '3:30-4:15': '3:30 – 4:15 PM',
  '4:15-5:00': '4:15 – 5:00 PM',
}

const FORMAT_LABELS: Record<string, string> = {
  online: 'Online',
  'in-person': 'In-person',
  in_person: 'In-person',
  'no-preference': 'No preference',
  no_preference: 'No preference',
}

function founderEmail(founders: Record<string, string>[] | null): string | null {
  if (!founders || founders.length === 0) return null
  const f = founders[0]
  return f['email'] ?? f['founder_email'] ?? null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminNotifyPage() {
  const supabase = useMemo(() => createClient(), [])

  const [sessionDate, setSessionDate] = useState(nextFriday)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [loadingsessions, setLoadingSessions] = useState(false)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)

  useEffect(() => {
    void loadSessions()
  }, [sessionDate]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSessions() {
    setLoadingSessions(true)
    setResult(null)
    setSelected(new Set())
    const { data } = await supabase
      .from('sessions')
      .select(`
        id,
        slot,
        format,
        status,
        meeting:meetings!inner(meeting_date),
        mentor:mentor_semesters!inner(
          membership:semester_memberships!inner(
            profile:profiles!inner(id,full_name,email)
          )
        ),
        startup:startup_semesters!inner(
          organization:startup_organizations!inner(id,name),
          team:startup_team_memberships(
            membership:semester_memberships!inner(
              profile:profiles!inner(email)
            )
          )
        )
      `)
      .eq('meetings.meeting_date', sessionDate)
      .order('slot')
    setSessions(((data as unknown as CanonicalSessionRow[]) ?? []).map(mapCanonicalSession))
    setLoadingSessions(false)
  }

  function toggleAll() {
    if (selected.size === sessions.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(sessions.map(s => s.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function sendNotifications() {
    const toSend = sessions.filter(s => selected.has(s.id))
    if (toSend.length === 0) return

    const recipients: {
      name: string
      email: string
      counterpartName: string
      sessionDate: string
      timeSlot: string
      format: string
      role: 'mentor' | 'startup'
    }[] = []

    for (const s of toSend) {
      const dateLabel = formatDate(s.session_date)
      const slotLabel = s.time_slot ? (SLOT_LABELS[s.time_slot] ?? s.time_slot) : 'TBD'
      const fmtLabel = s.format ? (FORMAT_LABELS[s.format] ?? s.format) : 'TBD'

      if (s.mentor?.email) {
        recipients.push({
          name: s.mentor.full_name,
          email: s.mentor.email,
          counterpartName: s.startup?.name ?? 'your startup',
          sessionDate: dateLabel,
          timeSlot: slotLabel,
          format: fmtLabel,
          role: 'mentor',
        })
      }

      const sEmail = founderEmail(s.startup?.founders ?? null)
      if (sEmail && s.startup) {
        recipients.push({
          name: s.startup.name,
          email: sEmail,
          counterpartName: s.mentor?.full_name ?? 'your mentor',
          sessionDate: dateLabel,
          timeSlot: slotLabel,
          format: fmtLabel,
          role: 'startup',
        })
      }
    }

    if (recipients.length === 0) {
      setResult({ dry_run: false, sent: 0, results: [], preview: [] })
      return
    }

    setSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ recipients }),
      })
      const json = await res.json() as SendResult
      setResult(json)
    } catch (e) {
      setResult({ dry_run: false, sent: 0, results: [{ email: '—', ok: false, error: String(e) }] })
    } finally {
      setSending(false)
    }
  }

  const selectedSessions = sessions.filter(s => selected.has(s.id))
  const recipientCount = selectedSessions.reduce((n, s) => {
    return n + (s.mentor?.email ? 1 : 0) + (founderEmail(s.startup?.founders ?? null) ? 1 : 0)
  }, 0)

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#002147]">Session Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">
          Send email notifications to mentors and startups for their upcoming Friday sessions.
          <span className="ml-1 text-amber-600 font-medium">
            Emails will be sent live if <code className="text-[11px] bg-amber-50 px-1 rounded">RESEND_API_KEY</code> is configured, otherwise a dry-run preview is shown.
          </span>
        </p>
      </div>

      <div className="space-y-4">

        {/* Date selector */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <p className="text-sm font-semibold text-[#002147] mb-3">Session date</p>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              className="text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
            />
            <span className="text-sm text-gray-500">{formatDate(sessionDate)}</span>
          </div>
        </div>

        {/* Session list */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <p className="text-sm font-semibold text-[#002147]">
              Sessions {loadingsessions ? '' : `(${sessions.length})`}
            </p>
            {sessions.length > 0 && (
              <button onClick={toggleAll}
                className="text-xs font-medium text-gray-500 hover:text-[#002147] transition-colors">
                {selected.size === sessions.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {loadingsessions ? (
            <div className="flex items-center justify-center h-20">
              <div className="w-5 h-5 border-2 border-[#002147] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-400">No sessions found for this date.</p>
          ) : (
            <div className="space-y-2">
              {sessions.map(s => {
                const sEmail = founderEmail(s.startup?.founders ?? null)
                const mentorHasEmail = !!s.mentor?.email
                const startupHasEmail = !!sEmail
                const emailCount = (mentorHasEmail ? 1 : 0) + (startupHasEmail ? 1 : 0)

                return (
                  <label key={s.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selected.has(s.id) ? 'bg-[#002147]/4 border-[#002147]/20' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}>
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={() => toggleOne(s.id)}
                      className="mt-0.5 accent-[#002147]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-medium text-[#002147]">
                            {s.mentor?.full_name ?? '(no mentor)'} → {s.startup?.name ?? '(no startup)'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {s.time_slot ? (SLOT_LABELS[s.time_slot] ?? s.time_slot) : 'TBD'} ·{' '}
                            {s.format ? (FORMAT_LABELS[s.format] ?? s.format) : 'Format TBD'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {s.is_confirmed && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">Confirmed</span>
                          )}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${emailCount > 0 ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                            {emailCount} email{emailCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      {(!mentorHasEmail || !startupHasEmail) && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          {!mentorHasEmail && !startupHasEmail
                            ? 'No emails on file for mentor or startup'
                            : !mentorHasEmail
                            ? 'No email on file for mentor'
                            : 'No email on file for startup'}
                        </p>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* Send panel */}
        <div className={`bg-white rounded-xl border border-gray-100 p-5 transition-opacity ${selected.size === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
          <p className="text-sm font-semibold text-[#002147] mb-1">Send notifications</p>
          <p className="text-xs text-gray-500 mb-4">
            {selected.size} session{selected.size !== 1 ? 's' : ''} selected · {recipientCount} email{recipientCount !== 1 ? 's' : ''} will be sent
          </p>
          <button
            onClick={() => { void sendNotifications() }}
            disabled={sending || selected.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#002147] text-white text-sm font-semibold rounded-xl hover:bg-[#002147]/90 disabled:opacity-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {sending ? 'Sending…' : 'Send emails'}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className={`rounded-xl border p-5 ${result.dry_run ? 'bg-amber-50 border-amber-100' : result.sent > 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
            <div className="flex items-start gap-2 mb-3">
              {result.dry_run ? (
                <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-green-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              <div>
                {result.dry_run ? (
                  <p className="text-sm font-semibold text-amber-800">Dry run — RESEND_API_KEY not configured</p>
                ) : (
                  <p className="text-sm font-semibold text-green-800">{result.sent} email{result.sent !== 1 ? 's' : ''} sent successfully</p>
                )}
              </div>
            </div>

            {result.dry_run && result.preview && result.preview.length > 0 && (
              <div className="space-y-2">
                {result.preview.map((p, i) => (
                  <div key={i} className="bg-white rounded-lg border border-amber-100 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-800">To: {p.to}</p>
                    <p className="text-xs text-amber-700 mt-0.5">Subject: {p.subject}</p>
                    <p className="text-[11px] text-amber-600 mt-2 italic">{p.message}</p>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-amber-700 font-medium">Preview email body</summary>
                      <pre className="mt-2 text-[11px] whitespace-pre-wrap text-amber-800 bg-amber-50 border border-amber-100 rounded p-2 max-h-40 overflow-auto">{p.body_preview}</pre>
                    </details>
                  </div>
                ))}
              </div>
            )}

            {!result.dry_run && result.results && result.results.filter(r => !r.ok).length > 0 && (
              <div className="mt-2 space-y-1">
                {result.results.filter(r => !r.ok).map((r, i) => (
                  <p key={i} className="text-xs text-red-700">{r.email}: {r.error}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
