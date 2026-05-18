'use client'

import { createClient } from '@/utils/supabase/client'
import { useEffect, useMemo, useState } from 'react'
import TagInput from '@/components/TagInput'
import ActivityTimeline from '@/components/ActivityTimeline'

type OutreachRow = {
  id: string
  prospect_name: string
  prospect_email: string | null
  company: string | null
  linkedin_url: string | null
  expertise_tags: string[]
  outreach_type: string[]
  notes: string | null
  status: 'prospect' | 'contacted' | 'responded' | 'onboarded'
  last_contacted_at: string | null
  who_reached_out: string | null
  converted_mentor_id: string | null
  created_at: string
  source_channel: string | null
  referred_by: string | null
}

const STATUS_COLORS: Record<string, string> = {
  prospect: 'bg-gray-100 text-gray-500',
  contacted: 'bg-blue-50 text-blue-600',
  responded: 'bg-amber-50 text-amber-600',
  onboarded: 'bg-green-50 text-green-600',
}

const OUTREACH_TYPE_SUGGESTIONS = ['Sponsorship', 'Partnership', 'Mentor', 'Investor', 'Speaker', 'Advisor']
const SOURCE_CHANNEL_OPTIONS = ['Referral', 'LinkedIn Cold', 'Event', 'Alumni Network', 'Inbound', 'Other']

function isValidLinkedinUrl(url: string): boolean {
  if (!url.trim()) return true // empty is fine
  const u = url.trim().toLowerCase().replace(/^https?:\/\//i, '').replace(/^www\./i, '')
  return u.includes('linkedin.com/in/')
}

export default function AdminOutreachPage() {
  const supabase = useMemo(() => createClient(), [])

  const [rows, setRows] = useState<OutreachRow[]>([])
  const [activeSemesterId, setActiveSemesterId] = useState<string | null>(null)
  const [activeSemesterName, setActiveSemesterName] = useState<string | null>(null)
  const [adminId, setAdminId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Insights panel
  const [showInsights, setShowInsights] = useState(false)
  const [startupNeeds, setStartupNeeds] = useState<{ name: string; mentorship_needs: string[] }[]>([])
  const [mentorExpertise, setMentorExpertise] = useState<string[][]>([])
  const [recentMagicLinks, setRecentMagicLinks] = useState<{ label: string; link: string }[]>([])
  const [magicLinkByRow, setMagicLinkByRow] = useState<Record<string, string>>({})

  // Clipboard copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)
  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [aoName, setAoName] = useState('')
  const [aoEmail, setAoEmail] = useState('')
  const [aoCompany, setAoCompany] = useState('')
  const [aoLinkedin, setAoLinkedin] = useState('')
  const [aoTagsArr, setAoTagsArr] = useState<string[]>([])
  const [aoOutreachType, setAoOutreachType] = useState<string[]>([])
  const [aoNotes, setAoNotes] = useState('')
  const [aoStatus, setAoStatus] = useState<OutreachRow['status']>('prospect')
  const [aoWhoReachedOut, setAoWhoReachedOut] = useState('')
  const [aoSourceChannel, setAoSourceChannel] = useState('')
  const [aoReferredBy, setAoReferredBy] = useState('')
  const [aoLoading, setAoLoading] = useState(false)
  const [aoError, setAoError] = useState<string | null>(null)

  // Filters — clear selection when filters change so bulk actions don't affect invisible rows
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | OutreachRow['status']>('all')
  const [conversionFilter, setConversionFilter] = useState<'all' | 'converted' | 'not_converted'>('not_converted')

  function setSearchAndClearSelection(v: string) { setSearch(v); setSelected(new Set()) }
  function setStatusFilterAndClearSelection(v: 'all' | OutreachRow['status']) { setStatusFilter(v); setSelected(new Set()) }
  function setConversionFilterAndClearSelection(v: typeof conversionFilter) { setConversionFilter(v); setSelected(new Set()) }

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<OutreachRow & { expertise_tags_arr: string[]; outreach_type_arr: string[] }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  // Convert to mentor
  const [convertEmail, setConvertEmail] = useState<Record<string, string>>({})
  const [convertingId, setConvertingId] = useState<string | null>(null)

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<OutreachRow['status']>('contacted')
  const [bulkUpdating, setBulkUpdating] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: userData }, { data: sem }, { data: outreach }, { data: startupsData }, { data: mentorsData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('semesters').select('id, name').eq('is_active', true).maybeSingle(),
      supabase.from('outreach')
        .select('id, prospect_name, prospect_email, company, linkedin_url, expertise_tags, outreach_type, notes, status, last_contacted_at, who_reached_out, converted_mentor_id, created_at, source_channel, referred_by')
        .order('created_at', { ascending: false }),
      supabase.from('startups').select('name, mentorship_needs'),
      supabase.from('mentors').select('expertise_tags').eq('is_active', true),
    ])
    setAdminId(userData.user?.id ?? null)
    setActiveSemesterId((sem as { id: string; name: string } | null)?.id ?? null)
    setActiveSemesterName((sem as { id: string; name: string } | null)?.name ?? null)
    const all = (outreach as unknown as OutreachRow[]) ?? []
    setRows(all)
    setStartupNeeds((startupsData as { name: string; mentorship_needs: string[] }[] | null) ?? [])
    setMentorExpertise(((mentorsData as { expertise_tags: string[] }[] | null) ?? []).map(m => m.expertise_tags ?? []))
    setConvertEmail(prev => {
      const next = { ...prev }
      for (const r of all) if (!(r.id in next)) next[r.id] = r.prospect_email ?? ''
      return next
    })
    setLoading(false)
  }

  useEffect(() => { void (async () => { await load() })() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const allTagSuggestions = useMemo(() =>
    [...new Set(rows.flatMap(r => r.expertise_tags ?? []))].sort()
  , [rows])

  // Keywords for fuzzy-matching mentorship needs → mentor expertise
  const NEED_KEYWORDS: Record<string, string[]> = {
    'Fundraising & Investor Relations': ['fundrais', 'investor', 'capital rais', 'vc', 'venture'],
    'Product Development': ['product'],
    'Marketing & Branding': ['marketing', 'brand'],
    'Operations': ['operations', 'ops'],
    'GTM Strategy': ['gtm', 'go-to-market', 'go to market', 'sales'],
    'Legal & IP': ['legal', 'intellectual property', ' ip'],
    'Finance': ['financ', 'accounting', 'cfo'],
    'Talent & Hiring': ['talent', 'hiring', 'recruit', 'hr'],
    'Customer Acquisition': ['customer acquisition', 'growth', 'acquisition'],
  }

  const needStats = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of startupNeeds)
      for (const n of s.mentorship_needs ?? [])
        counts[n] = (counts[n] ?? 0) + 1

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([need, startupCount]) => {
        const keywords = NEED_KEYWORDS[need] ?? [need.toLowerCase()]
        const mentorCount = mentorExpertise.filter(tags =>
          tags.some(tag => keywords.some(kw => tag.toLowerCase().includes(kw)))
        ).length
        return { need, startupCount, mentorCount }
      })
  }, [startupNeeds, mentorExpertise]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false
      if (conversionFilter === 'converted' && !r.converted_mentor_id) return false
      if (conversionFilter === 'not_converted' && r.converted_mentor_id) return false
      if (!q) return true
      return [
        r.prospect_name, r.prospect_email ?? '', r.company ?? '',
        r.notes ?? '', r.who_reached_out ?? '',
        r.source_channel ?? '', r.referred_by ?? '',
        ...(r.expertise_tags ?? []), ...(r.outreach_type ?? []),
      ].join(' ').toLowerCase().includes(q)
    })
  }, [rows, search, statusFilter, conversionFilter])

  async function addOutreach(e: React.FormEvent) {
    e.preventDefault()
    if (!activeSemesterId || !adminId) { setAoError('No active semester or not authenticated.'); return }
    if (aoLinkedin.trim() && !isValidLinkedinUrl(aoLinkedin)) { setAoError('Invalid LinkedIn URL. Must contain linkedin.com/in/'); return }
    setAoLoading(true); setAoError(null)
    const { data, error } = await supabase.from('outreach').insert({
      admin_id: adminId,
      semester_id: activeSemesterId,
      prospect_name: aoName.trim(),
      prospect_email: aoEmail.trim() || null,
      company: aoCompany.trim() || null,
      linkedin_url: aoLinkedin.trim() || null,
      expertise_tags: aoTagsArr,
      outreach_type: aoOutreachType,
      status: aoStatus,
      notes: aoNotes.trim() || null,
      who_reached_out: aoWhoReachedOut.trim() || null,
      source_channel: aoSourceChannel || null,
      referred_by: aoReferredBy.trim() || null,
    } as never).select('id, prospect_name, prospect_email, company, linkedin_url, expertise_tags, outreach_type, notes, status, last_contacted_at, who_reached_out, converted_mentor_id, created_at, source_channel, referred_by').single()
    if (error) {
      setAoError(error.message)
    } else {
      setAoName(''); setAoEmail(''); setAoCompany(''); setAoLinkedin('')
      setAoTagsArr([]); setAoOutreachType([]); setAoNotes(''); setAoStatus('prospect'); setAoWhoReachedOut('')
      setAoSourceChannel(''); setAoReferredBy('')
      setRows(prev => [data as unknown as OutreachRow, ...prev])
      setShowAdd(false)
    }
    setAoLoading(false)
  }

  function openEdit(r: OutreachRow) {
    setEditingId(r.id)
    setSaveError(null)
    setEditDraft({
      prospect_name: r.prospect_name,
      prospect_email: r.prospect_email,
      company: r.company,
      linkedin_url: r.linkedin_url,
      notes: r.notes,
      status: r.status,
      last_contacted_at: r.last_contacted_at,
      who_reached_out: r.who_reached_out,
      expertise_tags_arr: r.expertise_tags ?? [],
      outreach_type_arr: r.outreach_type ?? [],
      source_channel: r.source_channel,
      referred_by: r.referred_by,
    })
  }

  const [saveError, setSaveError] = useState<string | null>(null)

  async function saveRow(id: string) {
    if (!activeSemesterId) return
    if (editDraft.linkedin_url && !isValidLinkedinUrl(editDraft.linkedin_url)) {
      setSaveError('Invalid LinkedIn URL. Must contain linkedin.com/in/')
      return
    }
    setSavingId(id)
    setSaveError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setSavingId(null); return }

    const res = await fetch('/api/admin/outreach/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        outreachId: id,
        semesterId: activeSemesterId,
        fields: {
          prospect_name: editDraft.prospect_name?.trim(),
          prospect_email: editDraft.prospect_email?.trim() || null,
          company: editDraft.company?.trim() || null,
          linkedin_url: editDraft.linkedin_url?.trim() || null,
          expertise_tags: editDraft.expertise_tags_arr ?? [],
          outreach_type: editDraft.outreach_type_arr ?? [],
          notes: editDraft.notes?.trim() || null,
          status: editDraft.status,
          last_contacted_at: editDraft.last_contacted_at || null,
          who_reached_out: editDraft.who_reached_out?.trim() || null,
          source_channel: editDraft.source_channel || null,
          referred_by: editDraft.referred_by?.trim() || null,
        },
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setSaveError(json.error ?? 'Failed to save.')
    } else {
      await load()
      setEditingId(null)
    }
    setSavingId(null)
  }

  async function convertToMentor(row: OutreachRow) {
    if (!activeSemesterId) return
    const email = (convertEmail[row.id] ?? '').trim().toLowerCase()
    if (!email) return
    setConvertingId(row.id)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setConvertingId(null); return }
    const res = await fetch('/api/admin/outreach/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        outreachId: row.id,
        semesterId: activeSemesterId,
        email,
        fullName: row.prospect_name.trim(),
        company: row.company,
        linkedinUrl: row.linkedin_url,
        expertiseTags: row.expertise_tags,
        notes: row.notes,
      }),
    })
    const json = await res.json()
    if (res.ok) {
      if (json.magicLink) {
        setMagicLinkByRow(prev => ({ ...prev, [row.id]: json.magicLink }))
        setRecentMagicLinks(prev => [{ label: row.prospect_name, link: json.magicLink }, ...prev].slice(0, 5))
      }
      await load()
    }
    setConvertingId(null)
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(r => r.id)))
    }
  }

  async function bulkUpdateStatus() {
    if (!activeSemesterId || selected.size === 0) return
    setBulkUpdating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setBulkUpdating(false); return }

    // Optimistic update
    const prevRows = [...rows]
    setRows(prev => prev.map(r => selected.has(r.id) ? { ...r, status: bulkStatus } : r))

    const res = await fetch('/api/admin/outreach/bulk-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ids: [...selected],
        status: bulkStatus,
        semesterId: activeSemesterId,
      }),
    })
    if (res.ok) {
      setSelected(new Set())
      await load()
    } else {
      setRows(prevRows) // revert on error
    }
    setBulkUpdating(false)
  }

  return (
    <div className="max-w-5xl">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#002147]">Outreach</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track prospects and convert them to mentors for{' '}
            <span className="font-medium text-gray-700">{activeSemesterName ?? '—'}</span>
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(v => !v); setAoError(null) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-xl hover:bg-[#002147]/90 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add prospect
        </button>
      </div>

      {/* Insights panel */}
      {needStats.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl mb-5 overflow-hidden">
          <button
            onClick={() => setShowInsights(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
          >
            <span className="text-sm font-semibold text-[#002147]">Mentorship Needs Insights</span>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${showInsights ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showInsights && (() => {
            const COLORS = ['#002147','#75AADB','#1a4a7a','#a8c8e8','#003d7a','#c8dff0','#0a2d5a','#5090c8','#e8f2fb','#2060a0']
            const total = needStats.reduce((s, n) => s + n.startupCount, 0)
            const cx = 80, cy = 80, r = 60, innerR = 38
            let angle = -Math.PI / 2

            function polarToCartesian(a: number, radius: number) {
              return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) }
            }

            const slices = needStats.map((n, i) => {
              const sweep = (n.startupCount / total) * 2 * Math.PI
              const startAngle = angle
              const endAngle = angle + sweep
              angle = endAngle
              const p1 = polarToCartesian(startAngle, r)
              const p2 = polarToCartesian(endAngle, r)
              const i1 = polarToCartesian(startAngle, innerR)
              const i2 = polarToCartesian(endAngle, innerR)
              const large = sweep > Math.PI ? 1 : 0
              return {
                d: `M ${i1.x} ${i1.y} L ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y} L ${i2.x} ${i2.y} A ${innerR} ${innerR} 0 ${large} 0 ${i1.x} ${i1.y} Z`,
                color: COLORS[i % COLORS.length],
                ...n,
              }
            })

            return (
              <div className="px-5 pb-5 border-t border-gray-100">
                <div className="flex flex-col sm:flex-row gap-6 pt-4">
                  {/* Donut chart */}
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <svg width="160" height="160" viewBox="0 0 160 160">
                      {slices.map((s, i) => (
                        <path key={i} d={s.d} fill={s.color} />
                      ))}
                      <text x={cx} y={cy - 6} textAnchor="middle" className="text-[10px]" fill="#002147" fontSize="11" fontWeight="700">{total}</text>
                      <text x={cx} y={cy + 10} textAnchor="middle" fill="#6b7280" fontSize="9">responses</text>
                    </svg>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-[160px]">
                      {slices.map((s, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                          <span className="text-[10px] text-gray-600 truncate max-w-[100px]">{s.need.split(' ')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Stats table */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Startups vs Mentors</p>
                    <div className="space-y-2">
                      {slices.map((s, i) => {
                        const ratio = s.mentorCount > 0 ? (s.mentorCount / s.startupCount).toFixed(2) : '0'
                        const pct = Math.round((s.startupCount / total) * 100)
                        const barW = Math.min(100, Math.round((s.mentorCount / s.startupCount) * 100))
                        return (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs text-gray-700 font-medium truncate flex-1 mr-2">{s.need}</span>
                              <span className="text-xs font-semibold text-[#002147] shrink-0">
                                {s.startupCount} startup{s.startupCount !== 1 ? 's' : ''} / {s.mentorCount} mentor{s.mentorCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${barW}%`, background: s.color }} />
                              </div>
                              <span className="text-[10px] text-gray-400 w-16 text-right shrink-0">{pct}% · {ratio} m/s</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Recent magic links */}
      {recentMagicLinks.length > 0 && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 mb-4 space-y-2">
          <p className="text-xs font-semibold text-green-800 uppercase tracking-wide">Recent magic links</p>
          {recentMagicLinks.map((m, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-xs text-green-800 w-28 shrink-0 truncate">{m.label}</span>
              <input readOnly value={m.link} className="flex-1 text-[11px] text-gray-700 border border-green-200 rounded-lg px-2.5 py-1.5 bg-white" />
              <button onClick={() => navigator.clipboard.writeText(m.link)}
                className="px-2.5 py-1.5 text-xs font-medium border border-green-200 rounded-lg bg-white hover:bg-green-100 transition-colors shrink-0">
                Copy
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={addOutreach} className="bg-white border border-gray-200 rounded-xl p-5 mb-5 space-y-4">
          <p className="text-sm font-semibold text-[#002147]">New prospect</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-400">*</span></label>
              <input required value={aoName} onChange={e => setAoName(e.target.value)} placeholder="Jane Smith"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={aoEmail} onChange={e => setAoEmail(e.target.value)} placeholder="jane@example.com"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
              <input value={aoCompany} onChange={e => setAoCompany(e.target.value)} placeholder="Acme Inc."
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">LinkedIn URL</label>
              <input value={aoLinkedin} onChange={e => setAoLinkedin(e.target.value)} placeholder="https://linkedin.com/in/…"
                className={`w-full text-sm text-gray-800 placeholder:text-gray-400 border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 ${aoLinkedin.trim() && !isValidLinkedinUrl(aoLinkedin) ? 'border-red-300' : 'border-gray-300'}`} />
              {aoLinkedin.trim() && (
                isValidLinkedinUrl(aoLinkedin)
                  ? <p className="text-[10px] text-green-600 mt-0.5 flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>Valid LinkedIn profile</p>
                  : <p className="text-[10px] text-red-500 mt-0.5">URL should contain linkedin.com/in/</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select value={aoStatus} onChange={e => setAoStatus(e.target.value as OutreachRow['status'])}
                className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                <option value="prospect">Prospect</option>
                <option value="contacted">Contacted</option>
                <option value="responded">Responded</option>
                <option value="onboarded">Onboarded</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Who reached out</label>
              <input value={aoWhoReachedOut} onChange={e => setAoWhoReachedOut(e.target.value)} placeholder="Your name"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Source channel</label>
              <select value={aoSourceChannel} onChange={e => setAoSourceChannel(e.target.value)}
                className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                <option value="">— Select —</option>
                {SOURCE_CHANNEL_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {aoSourceChannel === 'Referral' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Referred by</label>
                <input value={aoReferredBy} onChange={e => setAoReferredBy(e.target.value)} placeholder="Referrer name"
                  className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Outreach type tags</label>
              <TagInput value={aoOutreachType} onChange={setAoOutreachType}
                suggestions={OUTREACH_TYPE_SUGGESTIONS} placeholder="Add types…" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Expertise tags</label>
              <TagInput value={aoTagsArr} onChange={setAoTagsArr} suggestions={allTagSuggestions} placeholder="Search or create tags…" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description / Notes</label>
              <textarea rows={2} value={aoNotes} onChange={e => setAoNotes(e.target.value)} placeholder="Any notes…"
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 resize-none" />
            </div>
          </div>
          {aoError && <p className="text-xs text-red-500">{aoError}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={aoLoading}
              className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-60 transition-colors">
              {aoLoading ? 'Adding…' : 'Add prospect'}
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setAoError(null) }}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
          <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length}
            onChange={toggleAll}
            className="w-4 h-4 rounded border-gray-300 text-[#002147] focus:ring-[#75AADB]/40" />
          <span className="text-xs text-gray-500">All</span>
        </label>
        <input type="search" placeholder="Search name, email, company, notes, type…"
          value={search} onChange={e => setSearchAndClearSelection(e.target.value)}
          className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shrink-0 flex-wrap">
          {(['all', 'prospect', 'contacted', 'responded', 'onboarded'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilterAndClearSelection(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${statusFilter === s ? 'bg-white text-[#002147] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {s}
            </button>
          ))}
        </div>
        <select value={conversionFilter} onChange={e => setConversionFilterAndClearSelection(e.target.value as typeof conversionFilter)}
          className="text-xs text-gray-600 border border-gray-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 shrink-0">
          <option value="all">All</option>
          <option value="not_converted">Not converted</option>
          <option value="converted">Converted</option>
        </select>
        <p className="text-xs text-gray-400 shrink-0">{filtered.length} of {rows.length}</p>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-[#002147] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 px-1">No outreach records match the current filters.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
          {filtered.map(r => (
            <div key={r.id}>
              {/* Row */}
              <div className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)}
                  className="w-4 h-4 mt-0.5 rounded border-gray-300 text-[#002147] focus:ring-[#75AADB]/40 shrink-0" />
                <div className="flex-1 min-w-0 grid sm:grid-cols-4 gap-x-4 gap-y-1.5">
                  {/* Col 1: Name / contact info */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#002147] truncate">{r.prospect_name}</p>
                    {r.company && <p className="text-xs text-gray-400 truncate">{r.company}</p>}
                    {r.prospect_email && (
                      <button
                        onClick={() => copyToClipboard(r.prospect_email!, `em-${r.id}`)}
                        title={r.prospect_email}
                        className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-[#002147] mt-0.5 max-w-full"
                      >
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                        </svg>
                        {copiedId === `em-${r.id}` ? <span className="text-green-600 font-medium">Copied!</span> : <span className="truncate">{r.prospect_email}</span>}
                      </button>
                    )}
                    {r.linkedin_url && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <button
                          onClick={() => copyToClipboard(r.linkedin_url!, `li-${r.id}`)}
                          title={r.linkedin_url}
                          className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800"
                        >
                          <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M19 0h-14c-2.76 0-5 2.24-5 5v14c0 2.76 2.24 5 5 5h14c2.76 0 5-2.24 5-5v-14c0-2.76-2.24-5-5-5zm-11 19h-3v-10h3v10zm-1.5-11.27c-.97 0-1.75-.79-1.75-1.76s.78-1.76 1.75-1.76 1.75.79 1.75 1.76-.78 1.76-1.75 1.76zm13.5 11.27h-3v-5.6c0-1.34-.03-3.07-1.87-3.07-1.87 0-2.16 1.46-2.16 2.97v5.7h-3v-10h2.88v1.36h.04c.4-.76 1.38-1.56 2.84-1.56 3.04 0 3.6 2 3.6 4.59v5.61z"/>
                          </svg>
                          {copiedId === `li-${r.id}` ? <span className="text-green-600 font-medium">Copied!</span> : 'LinkedIn'}
                        </button>
                        <button
                          onClick={() => {
                            const href = r.linkedin_url!.startsWith('http') ? r.linkedin_url! : `https://${r.linkedin_url!}`
                            window.open(href, '_blank')
                          }}
                          title="Open in new tab"
                          className="text-[11px] text-blue-600 hover:text-blue-800"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  {/* Col 2: Tags */}
                  <div className="flex flex-wrap gap-1 content-start">
                    {(r.outreach_type ?? []).map(t => (
                      <span key={t} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{t}</span>
                    ))}
                    {(r.expertise_tags ?? []).map(t => (
                      <span key={t} className="text-[10px] bg-[#002147]/8 text-[#002147] px-2 py-0.5 rounded-full font-medium">{t}</span>
                    ))}
                  </div>
                  {/* Col 3: Status / contact history */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {r.status}
                      </span>
                      {r.converted_mentor_id && (
                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-700">Converted</span>
                      )}
                    </div>
                    {r.last_contacted_at && (
                      <p className="text-xs text-gray-400 mt-1">Last: {new Date(r.last_contacted_at).toLocaleDateString()}</p>
                    )}
                    {r.who_reached_out && (
                      <p className="text-xs text-gray-400 mt-0.5">By: {r.who_reached_out}</p>
                    )}
                    {r.source_channel && (
                      <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 mt-1">{r.source_channel}</span>
                    )}
                    {r.referred_by && (
                      <p className="text-[10px] text-gray-400 mt-0.5">Ref: {r.referred_by}</p>
                    )}
                  </div>
                  {/* Col 4: Notes */}
                  <div>
                    {r.notes && <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">{r.notes}</p>}
                  </div>
                </div>
                <button onClick={() => editingId === r.id ? setEditingId(null) : openEdit(r)}
                  className="text-xs font-medium text-gray-500 hover:text-[#002147] px-2 py-1 rounded hover:bg-gray-100 transition-colors shrink-0">
                  {editingId === r.id ? 'Cancel' : 'Edit'}
                </button>
              </div>

              {/* Inline edit */}
              {editingId === r.id && (
                <div className="bg-gray-50/80 border-t border-gray-100 px-5 py-4 space-y-4">
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                      <input value={editDraft.prospect_name ?? ''} placeholder="Jane Smith"
                        onChange={e => setEditDraft(p => ({ ...p, prospect_name: e.target.value }))}
                        className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                      <input type="email" value={editDraft.prospect_email ?? ''} placeholder="jane@example.com"
                        onChange={e => setEditDraft(p => ({ ...p, prospect_email: e.target.value || null }))}
                        className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                      <input value={editDraft.company ?? ''} placeholder="Acme Inc."
                        onChange={e => setEditDraft(p => ({ ...p, company: e.target.value || null }))}
                        className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">LinkedIn URL</label>
                      <input value={editDraft.linkedin_url ?? ''} placeholder="https://linkedin.com/in/…"
                        onChange={e => setEditDraft(p => ({ ...p, linkedin_url: e.target.value || null }))}
                        className={`w-full text-sm text-gray-800 placeholder:text-gray-400 border rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 ${editDraft.linkedin_url && !isValidLinkedinUrl(editDraft.linkedin_url) ? 'border-red-300' : 'border-gray-300'}`} />
                      {editDraft.linkedin_url && (
                        isValidLinkedinUrl(editDraft.linkedin_url)
                          ? <p className="text-[10px] text-green-600 mt-0.5 flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>Valid LinkedIn profile</p>
                          : <p className="text-[10px] text-red-500 mt-0.5">URL should contain linkedin.com/in/</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                      <select value={editDraft.status ?? r.status} onChange={e => setEditDraft(p => ({ ...p, status: e.target.value as OutreachRow['status'] }))}
                        className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                        <option value="prospect">Prospect</option>
                        <option value="contacted">Contacted</option>
                        <option value="responded">Responded</option>
                        <option value="onboarded">Onboarded</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Last contacted</label>
                      <input type="date" value={editDraft.last_contacted_at?.slice(0, 10) ?? ''}
                        onChange={e => setEditDraft(p => ({ ...p, last_contacted_at: e.target.value || null }))}
                        className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Who reached out</label>
                      <input value={editDraft.who_reached_out ?? ''} placeholder="Name of person"
                        onChange={e => setEditDraft(p => ({ ...p, who_reached_out: e.target.value || null }))}
                        className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Source channel</label>
                      <select value={editDraft.source_channel ?? ''}
                        onChange={e => setEditDraft(p => ({ ...p, source_channel: e.target.value || null }))}
                        className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                        <option value="">— Select —</option>
                        {SOURCE_CHANNEL_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    {editDraft.source_channel === 'Referral' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Referred by</label>
                        <input value={editDraft.referred_by ?? ''} placeholder="Referrer name"
                          onChange={e => setEditDraft(p => ({ ...p, referred_by: e.target.value || null }))}
                          className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Outreach type tags</label>
                      <TagInput
                        value={editDraft.outreach_type_arr ?? []}
                        onChange={tags => setEditDraft(p => ({ ...p, outreach_type_arr: tags }))}
                        suggestions={OUTREACH_TYPE_SUGGESTIONS}
                        placeholder="Add types…"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Expertise tags</label>
                      <TagInput
                        value={editDraft.expertise_tags_arr ?? []}
                        onChange={tags => setEditDraft(p => ({ ...p, expertise_tags_arr: tags }))}
                        suggestions={allTagSuggestions}
                        placeholder="Search or create tags…"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description / Notes</label>
                      <textarea rows={2} value={editDraft.notes ?? ''}
                        onChange={e => setEditDraft(p => ({ ...p, notes: e.target.value }))}
                        className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 resize-none" />
                    </div>
                  </div>
                  {saveError && editingId === r.id && (
                    <p className="text-xs text-red-500 mb-2">{saveError}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveRow(r.id)} disabled={savingId === r.id}
                      className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-50 transition-colors">
                      {savingId === r.id ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setEditingId(null); setSaveError(null) }}
                      className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                      Cancel
                    </button>
                  </div>

                  {/* Convert to mentor */}
                  {!r.converted_mentor_id && (
                    <div className="pt-2 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-600 mb-2">Convert to mentor</p>
                      <div className="flex gap-2 max-w-sm">
                        <input type="email" placeholder="Existing platform user email…"
                          value={convertEmail[r.id] ?? ''}
                          onChange={e => setConvertEmail(prev => ({ ...prev, [r.id]: e.target.value }))}
                          className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                        <button onClick={() => convertToMentor(r)} disabled={convertingId === r.id || !convertEmail[r.id]?.trim()}
                          className="px-3 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-50 transition-colors whitespace-nowrap">
                          {convertingId === r.id ? 'Converting…' : 'Convert'}
                        </button>
                      </div>
                      {magicLinkByRow[r.id] && (
                        <div className="mt-2 flex gap-2 items-center max-w-sm">
                          <input readOnly value={magicLinkByRow[r.id]}
                            className="flex-1 text-[11px] text-gray-700 border border-gray-300 rounded-lg px-2.5 py-1.5 bg-gray-50" />
                          <button onClick={() => navigator.clipboard.writeText(magicLinkByRow[r.id])}
                            className="px-2.5 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors">
                            Copy
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Activity timeline */}
                  {activeSemesterId && (
                    <ActivityTimeline outreachId={r.id} semesterId={activeSemesterId} />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg px-6 py-3 z-50">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            <span className="text-sm font-medium text-[#002147]">{selected.size} selected</span>
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value as OutreachRow['status'])}
              className="text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
              <option value="prospect">Prospect</option>
              <option value="contacted">Contacted</option>
              <option value="responded">Responded</option>
              <option value="onboarded">Onboarded</option>
            </select>
            <button onClick={() => void bulkUpdateStatus()} disabled={bulkUpdating}
              className="px-4 py-1.5 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-50 transition-colors">
              {bulkUpdating ? 'Updating...' : 'Update status'}
            </button>
            <button onClick={() => setSelected(new Set())}
              className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
              Clear selection
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
