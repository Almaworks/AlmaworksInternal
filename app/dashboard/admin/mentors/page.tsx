'use client'

import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { Fragment, useEffect, useMemo, useState } from 'react'
import TagInput from '@/components/TagInput'
import MentorModal from '@/components/MentorModal'
import { CohortScreenControls, useCohortScreen } from '@/components/CohortScreenControls'
import type { CohortRecordReference } from '@/src/lifecycle/cohort-screen'
import { loadMentorDirectory } from '@/src/program/canonical-repository'
import { adminMemberHref } from '@/src/assignments/schedule-navigation'
import { membershipPresentation, type MembershipReadinessStatus } from '@/src/lifecycle/membership-presentation'
import type { MembershipStatus } from '@/src/lifecycle/types'
import { mentorAccessPresentation, type MentorAccessScope } from '@/src/mentors/access'

type SortDir = 'asc' | 'desc'

type MentorRow = {
  id: string
  full_name: string
  company: string | null
  role_title: string | null
  linkedin_url: string | null
  expertise_tags: string[]
  bio: string | null
  is_active: boolean
  profile_active: boolean
  membership_id: string
  membership_status: MembershipStatus
  readiness_status: MembershipReadinessStatus
  slug: string | null
  email: string | null
  general_availability: string | null
  preferred_format: string | null
  opening_talk: string | null
  semester_id: string | null
  semester_name: string | null
}

export default function AdminMentorsPage() {
  const supabase = useMemo(() => createClient(), [])

  const [rows, setRows] = useState<MentorRow[]>([])
  const [activeSemesterId, setActiveSemesterId] = useState<string | null>(null)
  const [activeSemesterName, setActiveSemesterName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [amName, setAmName] = useState('')
  const [amEmail, setAmEmail] = useState('')
  const [amCompany, setAmCompany] = useState('')
  const [amRoleTitle, setAmRoleTitle] = useState('')
  const [amLinkedin, setAmLinkedin] = useState('')
  const [amBio, setAmBio] = useState('')
  const [amTagsArr, setAmTagsArr] = useState<string[]>([])
  const [amGeneralAvail, setAmGeneralAvail] = useState('')
  const [amFormat, setAmFormat] = useState('')
  const [amOpeningTalk, setAmOpeningTalk] = useState('')
  const [amLoading, setAmLoading] = useState(false)
  const [amError, setAmError] = useState<string | null>(null)
  const [magicLinks, setMagicLinks] = useState<{ label: string; link: string }[]>([])

  // Search / filter / sort
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'other_statuses'>('all')
  const [sortKey, setSortKey] = useState<'full_name' | 'company' | 'membership_status' | 'semester_name'>('full_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<MentorRow>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Access management
  const [managingAccessId, setManagingAccessId] = useState<string | null>(null)
  const [accessWorkingId, setAccessWorkingId] = useState<string | null>(null)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false)

  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null)

  // Clipboard copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)
  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  async function load() {
    setLoading(true)
    const { data: sem } = await supabase.from('semesters').select('id, name').eq('is_active', true).maybeSingle()
    setActiveSemesterId((sem as { id: string; name: string } | null)?.id ?? null)
    setActiveSemesterName((sem as { id: string; name: string } | null)?.name ?? null)
    const [{ data: authData }, mentorRows] = await Promise.all([
      supabase.auth.getUser(),
      loadMentorDirectory(supabase),
    ])
    setRows(mentorRows)
    const authUserId = authData.user?.id
    if (!authUserId) {
      setIsGlobalAdmin(false)
    } else {
      const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', authUserId).maybeSingle()
      const { data: platformRole } = profile
        ? await supabase.from('platform_roles').select('role').eq('profile_id', profile.id).eq('role', 'super_admin').maybeSingle()
        : { data: null }
      setIsGlobalAdmin(Boolean(platformRole))
    }
    setLoading(false)
  }

  useEffect(() => { void (async () => { await load() })() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const allTagSuggestions = useMemo(() =>
    [...new Set(rows.flatMap(r => r.expertise_tags ?? []))].sort()
  , [rows])

  const mentorReferences = useMemo<CohortRecordReference[]>(() => rows.map(row => ({
    recordId: row.id, email: row.email, semesterId: row.semester_id,
  })), [rows])
  const cohort = useCohortScreen(mentorReferences, 'mentor')
  const scopedMentorIds = useMemo(() => new Set(cohort.scopedRecords.map(record => record.recordId)), [cohort.scopedRecords])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter(r => scopedMentorIds.has(r.id))
      .filter(r => activeFilter === 'all' ? true : activeFilter === 'active' ? r.membership_status === 'active' : r.membership_status !== 'active')
      .filter(r => {
        if (!q) return true
        return [r.full_name, r.company ?? '', r.email ?? '', ...(r.expertise_tags ?? [])].join(' ').toLowerCase().includes(q)
      })
      .sort((a, b) => {
        const av = String(a[sortKey] ?? '').toLowerCase()
        const bv = String(b[sortKey] ?? '').toLowerCase()
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      })
  }, [rows, search, activeFilter, scopedMentorIds, sortKey, sortDir])

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  async function addMentor(e: React.FormEvent) {
    e.preventDefault()
    if (!activeSemesterId) return
    setAmLoading(true); setAmError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setAmError('Not authenticated.'); setAmLoading(false); return }
    const res = await fetch('/api/admin/mentors/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        semesterId: activeSemesterId,
        email: amEmail.trim().toLowerCase(),
        fullName: amName.trim(),
        company: amCompany.trim() || null,
        roleTitle: amRoleTitle.trim() || null,
        linkedinUrl: amLinkedin.trim() || null,
        expertiseTags: amTagsArr,
        bio: amBio.trim() || null,
        isActive: true,
        generalAvailability: amGeneralAvail.trim() || null,
        preferredFormat: amFormat || null,
        openingTalk: amOpeningTalk.trim() || null,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setAmError(json.error ?? 'Something went wrong.')
    } else {
      if (json.magicLink) setMagicLinks(prev => [{ label: amName.trim(), link: json.magicLink }, ...prev].slice(0, 5))
      setAmName(''); setAmEmail(''); setAmCompany(''); setAmRoleTitle(''); setAmLinkedin('')
      setAmBio(''); setAmTagsArr([]); setAmGeneralAvail(''); setAmFormat(''); setAmOpeningTalk('')
      setShowAdd(false)
      await load()
    }
    setAmLoading(false)
  }

  function openEdit(m: MentorRow) {
    setEditingId(m.id)
    setSaveError(null)
    setDraft({ full_name: m.full_name, company: m.company, role_title: m.role_title, linkedin_url: m.linkedin_url, bio: m.bio, expertise_tags: m.expertise_tags, email: m.email, general_availability: m.general_availability, preferred_format: m.preferred_format, opening_talk: m.opening_talk })
  }

  async function callUpdateApi(mentorId: string, fields: Record<string, unknown>): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return 'Not authenticated.'
    const res = await fetch('/api/admin/mentors/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mentorId, ...fields }),
    })
    const json = await res.json()
    return res.ok ? null : (json.error ?? 'Something went wrong.')
  }

  async function saveMentor(id: string) {
    setSavingId(id)
    setSaveError(null)
    const err = await callUpdateApi(id, {
      full_name: draft.full_name?.trim(),
      company: draft.company?.trim() || null,
      role_title: draft.role_title?.trim() || null,
      linkedin_url: draft.linkedin_url?.trim() || null,
      bio: draft.bio?.trim() || null,
      expertise_tags: draft.expertise_tags ?? [],
      email: draft.email?.trim() || null,
      general_availability: draft.general_availability?.trim() || null,
      preferred_format: draft.preferred_format || null,
      opening_talk: draft.opening_talk?.trim() || null,
    })
    if (err) {
      setSaveError(err)
    } else {
      await load()
      setEditingId(null)
    }
    setSavingId(null)
  }

  async function changeMentorAccess(mentor: MentorRow, scope: MentorAccessScope, enabled: boolean) {
    if (!mentor.semester_id || !mentor.membership_id) {
      setAccessError('This mentor is missing the semester membership needed to change access.')
      return
    }

    const semesterLabel = mentor.semester_name ?? 'this semester'
    const confirmation = scope === 'semester'
      ? enabled
        ? `Restore ${mentor.full_name} to ${semesterLabel}? Their semester access will become active again.`
        : `Remove ${mentor.full_name} from ${semesterLabel}? Their profile, login account, and history will stay intact, but they will no longer have access to this semester.`
      : enabled
        ? `Reinstate ${mentor.full_name}'s Almaworks account? This restores sign-in, but does not enroll them in a semester.`
        : `Disable ${mentor.full_name}'s Almaworks account globally? This blocks sign-in across all semesters and suspends current access. Their profile and history will be preserved.`
    if (!window.confirm(confirmation)) return

    setAccessWorkingId(mentor.id)
    setAccessError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated.')
      const response = await fetch(`/api/admin/mentors/${mentor.id}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          enabled,
          membershipId: mentor.membership_id,
          scope,
          semesterId: mentor.semester_id,
        }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'The mentor access change failed.')
      await Promise.all([load(), cohort.reload()])
      setManagingAccessId(null)
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'The mentor access change failed.')
    } finally {
      setAccessWorkingId(null)
    }
  }

  const lifecycleToneClasses = {
    neutral: 'bg-gray-100 text-gray-700',
    progress: 'bg-blue-50 text-blue-700',
    attention: 'bg-amber-50 text-amber-800',
    success: 'bg-green-50 text-green-700',
    historical: 'bg-slate-100 text-slate-600',
    danger: 'bg-red-50 text-red-700',
    muted: 'bg-slate-100 text-slate-600',
  } as const

  const canMutateAccess = cohort.semesterId !== null && cohort.semesterId === cohort.cohorts.current?.id

  return (
    <div className="max-w-5xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#002147]">Mentors</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage mentors for{' '}
            <span className="font-medium text-gray-700">{activeSemesterName ?? '—'}</span>
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(v => !v); setAmError(null) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-xl hover:bg-[#002147]/90 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add mentor
        </button>
      </div>

      {/* Magic links */}
      {magicLinks.length > 0 && (
        <div className="mb-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
          <div>
            <p className="text-sm font-semibold text-amber-950">Action required: send the sign-in link</p>
            <p className="mt-1 text-xs leading-5 text-amber-900">
              The mentor account was created, but Almaworks did not email the invitation. Copy the private link below and send it to the new mentor so they can activate their account and sign in.
            </p>
          </div>
          {magicLinks.map((m, i) => (
            <div key={`${m.link}-${i}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="w-28 shrink-0 truncate text-xs font-medium text-amber-950">{m.label}</span>
              <input readOnly value={m.link} aria-label={`Sign-in link for ${m.label}`} className="min-w-0 flex-1 rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-[11px] text-gray-700" />
              <button type="button" onClick={() => copyToClipboard(m.link, `invite-${i}`)}
                className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-950 transition-colors hover:bg-amber-100">
                {copiedId === `invite-${i}` ? 'Copied!' : 'Copy sign-in link'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={addMentor} className="bg-white border border-gray-200 rounded-xl p-5 mb-5 space-y-4">
          <p className="text-sm font-semibold text-[#002147]">New mentor</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full name <span className="text-red-400">*</span></label>
              <input required value={amName} onChange={e => setAmName(e.target.value)} placeholder="Jane Smith"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email <span className="text-red-400">*</span></label>
              <input required type="email" value={amEmail} onChange={e => setAmEmail(e.target.value)} placeholder="jane@example.com"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
              <input value={amCompany} onChange={e => setAmCompany(e.target.value)} placeholder="Acme Inc."
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role title</label>
              <input value={amRoleTitle} onChange={e => setAmRoleTitle(e.target.value)} placeholder="Partner, VP…"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">LinkedIn URL</label>
              <input value={amLinkedin} onChange={e => setAmLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Preferred format</label>
              <select value={amFormat} onChange={e => setAmFormat(e.target.value)}
                className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                <option value="">—</option>
                <option value="online">Online</option>
                <option value="in-person">In-person</option>
                <option value="no-preference">No preference</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">General availability</label>
              <input value={amGeneralAvail} onChange={e => setAmGeneralAvail(e.target.value)} placeholder="Generally available / Occasionally…"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Expertise tags</label>
              <TagInput value={amTagsArr} onChange={setAmTagsArr} suggestions={allTagSuggestions} placeholder="Search or create tags…" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Bio / areas of expertise</label>
              <textarea rows={3} value={amBio} onChange={e => setAmBio(e.target.value)} placeholder="Background, domain expertise…"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 resize-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Opening talk proposal</label>
              <textarea rows={2} value={amOpeningTalk} onChange={e => setAmOpeningTalk(e.target.value)} placeholder="Proposed topic, date availability…"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 resize-none" />
            </div>
          </div>
          {amError && <p className="text-xs text-red-500">{amError}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={amLoading}
              className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-60 transition-colors">
              {amLoading ? 'Adding…' : 'Add mentor + magic link'}
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setAmError(null) }}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      <CohortScreenControls controller={cohort} visibleRecords={filtered.map(row => ({ recordId: row.id, email: row.email, semesterId: row.semester_id }))} />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input type="search" placeholder="Search name, email, company, tags…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0">
          {(['all', 'active', 'other_statuses'] as const).map(f => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${activeFilter === f ? 'bg-white text-[#002147] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {f === 'other_statuses' ? 'other statuses' : f}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 shrink-0">{filtered.length} of {rows.length}</p>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-[#002147] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 px-1">No mentors match the current filters.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm table-fixed border-collapse">
            <colgroup>
              <col style={{ width: '19%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                {([['full_name', 'Name'], ['company', 'Company'], ['membership_status', 'Status'], ['semester_name', 'Semester']] as const).map(([k, label]) => (
                  <th key={k} className="px-4 py-3 text-left font-normal">
                    <button onClick={() => handleSort(k)}
                      className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-[#002147] transition-colors">
                      {label}
                      <span className={sortKey === k ? 'text-[#002147]' : 'text-gray-300'}>
                        {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">LinkedIn</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(m => {
                const lifecyclePresentation = membershipPresentation({ status: m.membership_status, readinessStatus: m.readiness_status })
                const accessPresentation = mentorAccessPresentation({ membershipStatus: m.membership_status, profileActive: m.profile_active })
                const presentation = m.profile_active
                  ? lifecyclePresentation
                  : { label: accessPresentation.label, tone: accessPresentation.tone }
                return (
                <Fragment key={m.id}>
                  <tr className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedMentorId(m.id)}
                        className="text-sm font-medium text-[#002147] hover:underline block truncate text-left w-full"
                      >
                        {m.full_name}
                      </button>
                      {m.role_title && <p className="text-xs text-gray-400 truncate">{m.role_title}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700 truncate">{m.company ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${lifecycleToneClasses[presentation.tone]}`}>
                          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                          {presentation.label}
                        </span>
                        {m.email && <Link href={adminMemberHref(m.email, m.semester_id)} className="text-[11px] font-medium text-[#002147] underline-offset-2 hover:underline">Manage lifecycle</Link>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {m.semester_name
                        ? <span className="text-[11px] font-semibold bg-[#75AADB]/20 text-[#002147] px-2 py-0.5 rounded-full whitespace-nowrap">{m.semester_name}</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      {m.linkedin_url ? (
                        <button
                          onClick={() => copyToClipboard(m.linkedin_url!, `li-${m.id}`)}
                          title={m.linkedin_url}
                          className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                        >
                          <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 0h-14c-2.76 0-5 2.24-5 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5v-14c0-2.76-2.24-5-5-5zm-11 19h-3v-10h3v10zm-1.5-11.27c-.97 0-1.75-.79-1.75-1.76s.78-1.76 1.75-1.76 1.75.79 1.75 1.76-.78 1.76-1.75 1.76zm13.5 11.27h-3v-5.6c0-1.34-.03-3.07-1.87-3.07-1.87 0-2.16 1.46-2.16 2.97v5.7h-3v-10h2.88v1.36h.04c.4-.76 1.38-1.56 2.84-1.56 3.04 0 3.6 2 3.6 4.59v5.61z" />
                          </svg>
                          {copiedId === `li-${m.id}` ? <span className="text-green-600">Copied!</span> : 'LinkedIn'}
                        </button>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 overflow-hidden">
                      {m.email ? (
                        <button
                          onClick={() => copyToClipboard(m.email!, `em-${m.id}`)}
                          title={m.email}
                          className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-[#002147] font-medium w-full overflow-hidden"
                        >
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {copiedId === `em-${m.id}` ? <span className="text-green-600 shrink-0">Copied!</span> : <span className="truncate">{m.email}</span>}
                        </button>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(m.expertise_tags ?? []).slice(0, 3).map(t => (
                          <span key={t} className="text-[10px] bg-[#002147]/8 text-[#002147] px-2 py-0.5 rounded-full font-medium">{t}</span>
                        ))}
                        {(m.expertise_tags ?? []).length > 3 && (
                          <span className="text-[10px] text-gray-400">+{m.expertise_tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setManagingAccessId(null)
                            if (editingId === m.id) setEditingId(null)
                            else openEdit(m)
                          }}
                          title={editingId === m.id ? 'Cancel' : 'Edit'}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-[#002147] hover:bg-gray-100 transition-colors"
                        >
                        {editingId === m.id ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z" />
                          </svg>
                        )}
                        </button>
                        <button
                        onClick={() => {
                          setEditingId(null)
                          setAccessError(null)
                          setManagingAccessId(current => current === m.id ? null : m.id)
                        }}
                        title={managingAccessId === m.id ? 'Close access controls' : 'Manage access'}
                        aria-label={`Manage access for ${m.full_name}`}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${managingAccessId === m.id ? 'bg-[#002147]/10 text-[#002147]' : 'text-gray-400 hover:bg-gray-100 hover:text-[#002147]'}`}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c1.657 0 3-1.343 3-3V5a3 3 0 10-6 0v3c0 1.657 1.343 3 3 3zm0 0v4m-4 0h8a2 2 0 012 2v2H6v-2a2 2 0 012-2z" />
                        </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                  {managingAccessId === m.id && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <div className="border-t border-gray-100 bg-slate-50 px-5 py-5">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="max-w-xl">
                              <p className="text-sm font-semibold text-[#002147]">Access for {m.full_name}</p>
                              <p className="mt-1 text-xs leading-5 text-gray-600">
                                Semester removal is reversible and keeps the mentor&apos;s profile, login account, scheduled session records, and history intact.
                              </p>
                              {!canMutateAccess && (
                                <p className="mt-2 text-xs font-medium text-amber-700">Access changes are available only while viewing the active semester.</p>
                              )}
                            </div>
                            <div className="flex min-w-0 flex-col gap-3 sm:flex-row lg:justify-end">
                              <div className="rounded-xl border border-gray-200 bg-white p-3 sm:w-56">
                                <p className="text-xs font-semibold text-gray-800">Semester access</p>
                                <p className="mt-1 min-h-10 text-[11px] leading-4 text-gray-500">
                                  Controls participation in {m.semester_name ?? 'this semester'} only.
                                </p>
                                {accessPresentation.semesterAction ? (
                                  <button
                                    type="button"
                                    disabled={!canMutateAccess || accessWorkingId === m.id}
                                    onClick={() => void changeMentorAccess(m, 'semester', accessPresentation.semesterAction === 'restore')}
                                    className={`mt-3 w-full rounded-lg border px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${accessPresentation.semesterAction === 'remove' ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-[#75AADB] text-[#002147] hover:bg-[#75AADB]/10'}`}
                                  >
                                    {accessWorkingId === m.id ? 'Updating…' : accessPresentation.semesterAction === 'remove' ? `Remove from ${m.semester_name ?? 'semester'}` : `Restore to ${m.semester_name ?? 'semester'}`}
                                  </button>
                                ) : (
                                  <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-center text-xs font-medium text-gray-500">No semester action available</p>
                                )}
                              </div>
                              {isGlobalAdmin && (
                                <div className="rounded-xl border border-red-100 bg-white p-3 sm:w-56">
                                  <p className="text-xs font-semibold text-gray-800">Almaworks account</p>
                                  <p className="mt-1 min-h-10 text-[11px] leading-4 text-gray-500">
                                    {m.profile_active ? 'Blocks sign-in and suspends access across all semesters.' : 'Restores sign-in without adding semester access.'}
                                  </p>
                                  <button
                                    type="button"
                                    disabled={!canMutateAccess || accessWorkingId === m.id}
                                    onClick={() => void changeMentorAccess(m, 'global', !m.profile_active)}
                                    className={`mt-3 w-full rounded-lg px-3 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${m.profile_active ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-[#002147] text-white hover:bg-[#002147]/90'}`}
                                  >
                                    {accessWorkingId === m.id ? 'Updating…' : m.profile_active ? 'Disable account globally' : 'Reinstate account'}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          {accessError && <p role="alert" className="mt-3 text-xs font-medium text-red-600">{accessError}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                  {editingId === m.id && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <div className="bg-gray-50/80 border-t border-gray-100 px-5 py-4 space-y-3">
                          <div className="grid sm:grid-cols-2 gap-3">
                            {([
                              ['Full name', 'full_name', 'text', 'Jane Smith'],
                              ['Email', 'email', 'email', 'jane@example.com'],
                              ['Company', 'company', 'text', 'Acme Inc.'],
                              ['Role title', 'role_title', 'text', 'Partner, VP…'],
                              ['LinkedIn URL', 'linkedin_url', 'url', 'https://linkedin.com/in/…'],
                              ['General availability', 'general_availability', 'text', 'Generally available…'],
                            ] as const).map(([label, key, type, ph]) => (
                              <div key={key}>
                                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                                <input type={type} value={(draft[key] as string) ?? ''} placeholder={ph}
                                  onChange={e => setDraft(p => ({ ...p, [key]: e.target.value }))}
                                  className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                              </div>
                            ))}
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Preferred format</label>
                              <select value={draft.preferred_format ?? ''} onChange={e => setDraft(p => ({ ...p, preferred_format: e.target.value }))}
                                className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                                <option value="">—</option>
                                <option value="online">Online</option>
                                <option value="in-person">In-person</option>
                                <option value="no-preference">No preference</option>
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">Expertise tags</label>
                              <TagInput value={draft.expertise_tags ?? []} onChange={tags => setDraft(p => ({ ...p, expertise_tags: tags }))}
                                suggestions={allTagSuggestions} placeholder="Search or create tags…" />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">Bio</label>
                              <textarea rows={3} value={draft.bio ?? ''} onChange={e => setDraft(p => ({ ...p, bio: e.target.value }))}
                                className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 resize-none" />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">Opening talk proposal</label>
                              <textarea rows={2} value={draft.opening_talk ?? ''} onChange={e => setDraft(p => ({ ...p, opening_talk: e.target.value }))}
                                className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 resize-none" />
                            </div>
                          </div>
                          {saveError && editingId === m.id && (
                            <p className="text-xs text-red-500">{saveError}</p>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            <button onClick={() => saveMentor(m.id)} disabled={savingId === m.id}
                              className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-50 transition-colors">
                              {savingId === m.id ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => { setEditingId(null); setSaveError(null) }}
                              className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )})}
            </tbody>
          </table>
        </div>
      )}

      <MentorModal mentorId={selectedMentorId} onClose={() => setSelectedMentorId(null)} />
    </div>
  )
}
