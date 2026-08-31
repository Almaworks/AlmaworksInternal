'use client'

import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import TagInput from '@/components/TagInput'
import StartupModal from '@/components/StartupModal'
import { CohortScreenControls, useCohortScreen } from '@/components/CohortScreenControls'
import MentorAssignmentPicker, {
  type AssignmentCommitResult,
  type AssignmentPickerTarget,
} from '@/components/assignments/MentorAssignmentPicker'
import type { CohortRecordReference } from '@/src/lifecycle/cohort-screen'
import {
  assignmentRefreshFeedback,
  buildHistoricalScheduleStartupColumns,
  buildScheduleStartupColumns,
  type HistoricalScheduleStartupColumn,
  type ScheduleStartupColumn,
} from '@/src/assignments/picker'

type PendingUser = {
  id: string
  email: string
  full_name: string | null
  created_at: string
}

type Member = {
  id: string
  email: string
  full_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

type Mentor = {
  id: string
  full_name: string
  company: string | null
  role_title: string | null
  linkedin_url: string | null
  bio: string | null
  expertise_tags: string[]
  is_active: boolean
  slug: string | null
  email: string | null
  general_availability: string | null
  preferred_format: string | null
  per_week_availability: Record<string, { slot: string; format: string }> | null
  opening_talk: string | null
  semester_id: string | null
  semester_name: string | null
}

type Founder = {
  name: string
  email?: string
  phone?: string
}

type Startup = {
  id: string
  user_id: string | null
  is_active: boolean
  name: string
  industry: string | null
  stage: string | null
  founder_name: string | null
  founders: Founder[]
  slug: string | null
  description: string | null
  preferred_tags: string[]
  mentorship_needs: string[]
  semester_id: string | null
  semester_name: string | null
}

type ScheduleColumn = ScheduleStartupColumn | HistoricalScheduleStartupColumn

type Session = {
  id: string
  mentor_id: string
  startup_id: string | null
  status: string
  topic: string | null
  time_slot: string | null
  format: string | null
  startup_absent: boolean
  substitute_name: string | null
  is_confirmed: boolean
  session_dates: { date: string; label: string | null; semester_id?: string | null; semester_name?: string | null; semesters?: { name: string } | { name: string }[] | null } | null
  mentors: { full_name: string; slug: string | null } | null
  startups: { name: string; slug: string | null } | null
}

type SessionDate = {
  id: string
  date: string
  label: string | null
}

type SortDir = 'asc' | 'desc'
type MemberSortKey = 'full_name' | 'email' | 'role' | 'is_active'

type Tab = 'users' | 'members' | 'schedule' | 'startups'


export default function AdminDashboard() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('users')

  // Pending users
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [roleSelections, setRoleSelections] = useState<Record<string, string>>({})
  const [approving, setApproving] = useState<string | null>(null)

  // Members
  const [members, setMembers] = useState<Member[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSortKey, setMemberSortKey] = useState<MemberSortKey>('full_name')
  const [memberSortDir, setMemberSortDir] = useState<SortDir>('asc')
  const [memberShowAll, setMemberShowAll] = useState(false)
  const [togglingActive, setTogglingActive] = useState<string | null>(null)

  // Add user form
  const [showAddUser, setShowAddUser] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<'mentor' | 'startup' | 'admin' | ''>('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState<string | null>(null)

  // Edit user form
  const [editingMember, setEditingMember] = useState<Member | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState<'mentor' | 'startup' | 'admin' | ''>('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [selectedStartupId, setSelectedStartupId] = useState<string | null>(null)

  // Assign / remove / move founders
  const [founderTargetStartup, setFounderTargetStartup] = useState<Record<string, string>>({})
  const [assigningFounder, setAssigningFounder] = useState<string | null>(null)
  const [assignFounderError, setAssignFounderError] = useState<string | null>(null)
  const [founderActionKey, setFounderActionKey] = useState<string | null>(null) // "startupId:email"

  // Create startup form
  const [showCreateStartup, setShowCreateStartup] = useState(false)
  const [csName, setCsName] = useState('')
  const [csSlug, setCsSlug] = useState('')
  const [csIndustry, setCsIndustry] = useState('')
  const [csStage, setCsStage] = useState('')
  const [csDescription, setCsDescription] = useState('')
  const [csTagsArr, setCsTagsArr] = useState<string[]>([])
  const [csLoading, setCsLoading] = useState(false)
  const [csError, setCsError] = useState<string | null>(null)
  const [csSuccess, setCsSuccess] = useState<string | null>(null)

  // Edit startup lightbox
  const [editingStartup, setEditingStartup] = useState<Startup | null>(null)
  const [esName, setEsName] = useState('')
  const [esSlug, setEsSlug] = useState('')
  const [esIndustry, setEsIndustry] = useState('')
  const [esStage, setEsStage] = useState('')
  const [esDescription, setEsDescription] = useState('')
  const [esTagsArr, setEsTagsArr] = useState<string[]>([])
  const [esMentorshipNeeds, setEsMentorshipNeeds] = useState<string[]>([])
  const [esSaving, setEsSaving] = useState(false)
  const [esError, setEsError] = useState<string | null>(null)

  function openEditStartup(s: Startup) {
    setEditingStartup(s)
    setEsName(s.name)
    setEsSlug(s.slug ?? '')
    setEsIndustry(s.industry ?? '')
    setEsStage(s.stage ?? '')
    setEsDescription(s.description ?? '')
    setEsTagsArr(s.preferred_tags ?? [])
    setEsMentorshipNeeds(s.mentorship_needs ?? [])
    setEsError(null)
  }

  async function saveEditStartup(e: React.FormEvent) {
    e.preventDefault()
    if (!editingStartup) return
    setEsSaving(true)
    setEsError(null)
    const { error } = await supabase
      .from('startups')
      .update({
        name: esName.trim(),
        slug: esSlug.trim() || null,
        industry: esIndustry.trim() || null,
        stage: esStage || null,
        description: esDescription.trim() || null,
        preferred_tags: esTagsArr,
        mentorship_needs: esMentorshipNeeds,
      })
      .eq('id', editingStartup.id)
    setEsSaving(false)
    if (error) { setEsError(error.message); return }
    setEditingStartup(null)
    await loadAll()
  }

  // Schedule add session popup
  const [showAddSession, setShowAddSession] = useState(false)

  // Schedule / other tabs
  const [mentors, setMentors] = useState<Mentor[]>([])
  const [startups, setStartups] = useState<Startup[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionDates, setSessionDates] = useState<SessionDate[]>([])
  const [scheduleStartupColumns, setScheduleStartupColumns] = useState<ScheduleColumn[]>([])
  const [activeSemesterId, setActiveSemesterId] = useState<string | null>(null)
  const [activeSemesterName, setActiveSemesterName] = useState<string | null>(null)
  const [selectedSessionDateId, setSelectedSessionDateId] = useState<string | null>(null)
  const [assignMentorId, setAssignMentorId] = useState<string>('')
  const [assignTopic, setAssignTopic] = useState<string>('')
  const [assignTimeSlot, setAssignTimeSlot] = useState<string>('3:30-4:15')
  const [assignFormat, setAssignFormat] = useState<string>('online')
  const [assignSubstituteName, setAssignSubstituteName] = useState<string>('')
  const [assigning, setAssigning] = useState<boolean>(false)
  const [assignmentPickerTarget, setAssignmentPickerTarget] = useState<AssignmentPickerTarget | null>(null)
  const [assignmentFeedback, setAssignmentFeedback] = useState<string | null>(null)
  const [assignmentRefreshRetryRequired, setAssignmentRefreshRetryRequired] = useState(false)
  const [assignmentRefreshRetrying, setAssignmentRefreshRetrying] = useState(false)

  // Session date wizard
  const [showDateWizard, setShowDateWizard] = useState(false)
  const [wizardStartDate, setWizardStartDate] = useState('')
  const [wizardWeeks, setWizardWeeks] = useState(10)
  const [wizardSaving, setWizardSaving] = useState(false)
  const [wizardDone, setWizardDone] = useState(false)

  function wizardPreviewDates(): { date: string; label: string }[] {
    if (!wizardStartDate) return []
    const out: { date: string; label: string }[] = []
    const base = new Date(wizardStartDate + 'T00:00:00')
    for (let i = 0; i < wizardWeeks; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i * 7)
      const iso = d.toISOString().slice(0, 10)
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      out.push({ date: iso, label })
    }
    return out
  }

  async function createWizardDates() {
    if (!activeSemesterId || !wizardStartDate) return
    setWizardSaving(true)
    const rows = wizardPreviewDates().map(({ date, label }) => ({
      semester_id: activeSemesterId,
      date,
      label,
    }))
    await supabase.from('session_dates').upsert(rows, { onConflict: 'semester_id,date', ignoreDuplicates: true })
    setWizardSaving(false)
    setWizardDone(true)
    setTimeout(() => { setWizardDone(false); setShowDateWizard(false) }, 1500)
    await loadAll()
  }

  // Edit session
  const [editingSession, setEditingSession] = useState<Session | null>(null)
  const [editMentorId, setEditMentorId] = useState<string>('')
  const [editStartupId, setEditStartupId] = useState<string>('')
  const [editTimeSlot, setEditTimeSlot] = useState<string>('3:30-4:15')
  const [editFormat, setEditFormat] = useState<string>('online')
  const [editTopic, setEditTopic] = useState<string>('')
  const [editIsConfirmed, setEditIsConfirmed] = useState<boolean>(true)
  const [editStartupAbsent, setEditStartupAbsent] = useState<boolean>(false)
  const [editSubstituteName, setEditSubstituteName] = useState<string>('')
  const [editSaving, setEditSaving] = useState<boolean>(false)

  async function loadAll(): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const [usersRes, membersRes, mentorsRes, startupsRes, sessionsRes, semesterRes] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, created_at').eq('status', 'pending').order('created_at'),
        supabase.from('profiles').select('id, email, full_name, role, is_active, created_at').eq('status', 'approved').order('full_name'),
        supabase.from('mentors').select('id, full_name, company, role_title, linkedin_url, bio, expertise_tags, is_active, slug, email, general_availability, preferred_format, per_week_availability, opening_talk, semester_id, semesters(name)').order('full_name'),
        supabase.from('startups').select('id, user_id, is_active, name, industry, stage, founder_name, founders, slug, description, preferred_tags, mentorship_needs, semester_id, semesters(name)').order('name'),
        supabase.from('sessions').select('id, mentor_id, startup_id, status, topic, time_slot, format, startup_absent, substitute_name, is_confirmed, session_dates(date, label, semester_id, semesters(name)), mentors(full_name, slug), startups(name, slug)').order('time_slot'),
        supabase.from('semesters').select('id, name').eq('is_active', true).maybeSingle(),
      ])
      const initialError = [usersRes, membersRes, mentorsRes, startupsRes, sessionsRes, semesterRes].find(result => result.error !== null)?.error
      if (initialError) return { ok: false, error: initialError.message }

      type MentorRow = Omit<Mentor, 'semester_name'> & { semesters: { name: string } | { name: string }[] | null }
      const loadedMentors = ((mentorsRes.data ?? []) as unknown as MentorRow[]).map(mentor => ({
        ...mentor,
        semester_name: Array.isArray(mentor.semesters) ? (mentor.semesters[0]?.name ?? null) : (mentor.semesters?.name ?? null),
      }))
      type StartupRow = Omit<Startup, 'semester_name'> & { semesters: { name: string } | { name: string }[] | null }
      const loadedStartups = ((startupsRes.data ?? []) as unknown as StartupRow[]).map(startup => ({
        ...startup,
        semester_name: Array.isArray(startup.semesters) ? (startup.semesters[0]?.name ?? null) : (startup.semesters?.name ?? null),
      }))
      const loadedSessions = (sessionsRes.data as unknown as Session[]) ?? []
      const semData = semesterRes.data as { id: string; name: string } | null
      const semId = semData?.id ?? null
      let dates: SessionDate[] = []
      let columns: ScheduleColumn[] = []

      if (semId) {
        const [dateRowsResult, startupSemesterRowsResult, organizationRowsResult, teamRowsResult, membershipRowsResult] = await Promise.all([
          supabase.from('session_dates').select('id, date, label').eq('semester_id', semId).order('date'),
          supabase.from('startup_semesters').select('id, startup_organization_id').eq('semester_id', semId),
          supabase.from('startup_organizations').select('id, name').order('name'),
          supabase.from('startup_team_memberships').select('startup_semester_id, semester_membership_id, is_primary_contact').eq('semester_id', semId),
          supabase.from('semester_memberships').select('id, profile_id').eq('semester_id', semId).eq('role', 'startup').eq('status', 'active'),
        ])
        const scheduleError = [dateRowsResult, startupSemesterRowsResult, organizationRowsResult, teamRowsResult, membershipRowsResult]
          .find(result => result.error !== null)?.error
        if (scheduleError) return { ok: false, error: scheduleError.message }

        dates = (dateRowsResult.data as SessionDate[]) ?? []
        const profileByMembership = new Map((membershipRowsResult.data ?? []).map(row => [row.id, row.profile_id]))
        const activeScheduleStartupsByProfile = new Map<string, Startup[]>()
        for (const startup of loadedStartups
          .filter(item => item.semester_id === semId && item.is_active && item.user_id !== null)
          .sort((left, right) => left.id.localeCompare(right.id))) {
          const profileId = startup.user_id
          if (profileId === null) continue
          const scheduleStartups = activeScheduleStartupsByProfile.get(profileId) ?? []
          scheduleStartups.push(startup)
          activeScheduleStartupsByProfile.set(profileId, scheduleStartups)
        }
        const bridges = (teamRowsResult.data ?? []).flatMap(team => {
          const profileId = profileByMembership.get(team.semester_membership_id)
          const startupId = profileId ? activeScheduleStartupsByProfile.get(profileId)?.[0]?.id : undefined
          return startupId ? [{
            startupSemesterId: team.startup_semester_id,
            startupId,
            isPrimaryContact: team.is_primary_contact,
          }] : []
        })
        const canonicalColumns = buildScheduleStartupColumns({
          startupSemesters: (startupSemesterRowsResult.data ?? []).map(row => ({
            id: row.id,
            startupOrganizationId: row.startup_organization_id,
          })),
          organizations: (organizationRowsResult.data ?? []).map(row => ({ id: row.id, name: row.name })),
          bridges,
        })
        const historicalColumns = buildHistoricalScheduleStartupColumns({
          semesterId: semId,
          canonicalStartupIds: canonicalColumns.flatMap(column => column.startupId ? [column.startupId] : []),
          sessions: loadedSessions
            .filter(session => !session.startup_absent)
            .map(session => ({
              semesterId: session.session_dates?.semester_id ?? null,
              startupId: session.startup_id,
              startupName: session.startups?.name ?? null,
            })),
        })
        columns = [...canonicalColumns, ...historicalColumns]
      }

      setPendingUsers((usersRes.data as PendingUser[]) ?? [])
      setMembers((membersRes.data as Member[]) ?? [])
      setMentors(loadedMentors)
      setStartups(loadedStartups)
      setSessions(loadedSessions)
      setActiveSemesterId(semId)
      setActiveSemesterName(semData?.name ?? null)
      setSessionDates(dates)
      setScheduleStartupColumns(columns)
      setSelectedSessionDateId(previous => (
        previous && dates.some(date => date.id === previous) ? previous : (dates[0]?.id ?? null)
      ))
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to refresh schedule data.' }
    }
  }

  useEffect(() => {
    loadAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pending users ──────────────────────────────────────────────────────────

  async function approveUser(userId: string) {
    const role = roleSelections[userId]
    if (!role) return alert('Select a role first.')
    setApproving(userId)
    const pendingUser = pendingUsers.find(u => u.id === userId)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (token) {
      await fetch('/api/admin/users/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId,
          role,
          fullName: pendingUser?.full_name ?? '',
          email: pendingUser?.email ?? '',
        }),
      })
    } else {
      // Fallback: direct client update (no mentor row sync)
      await supabase.from('profiles').update({ status: 'approved', role }).eq('id', userId)
    }
    setPendingUsers(prev => prev.filter(u => u.id !== userId))
    setApproving(null)
  }

  async function rejectUser(userId: string) {
    if (!confirm('Reject this user?')) return
    await supabase.from('profiles').update({ status: 'rejected' }).eq('id', userId)
    setPendingUsers(prev => prev.filter(u => u.id !== userId))
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async function toggleMemberActive(memberId: string, current: boolean) {
    setTogglingActive(memberId)
    await supabase.from('profiles').update({ is_active: !current }).eq('id', memberId)
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, is_active: !current } : m))
    setTogglingActive(null)
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    if (!addRole) return
    setAddLoading(true)
    setAddError(null)
    setAddSuccess(null)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setAddError('Not authenticated.')
      setAddLoading(false)
      return
    }

    const res = await fetch('/api/admin/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: addEmail, fullName: addName, role: addRole }),
    })
    const json = await res.json()

    if (!res.ok) {
      setAddError(json.error ?? 'Something went wrong.')
    } else {
      setAddSuccess(`Invite sent to ${addEmail}. They can sign in once they click the link.`)
      setAddName('')
      setAddEmail('')
      setAddRole('')
      // Refresh members list
      const { data } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, is_active, created_at')
        .eq('status', 'approved')
        .order('full_name')
      setMembers((data as Member[]) ?? [])
    }
    setAddLoading(false)
  }

  function openEdit(m: Member) {
    setEditingMember(m)
    setEditName(m.full_name ?? '')
    setEditEmail(m.email)
    setEditRole(m.role as 'mentor' | 'startup' | 'admin')
    setEditError(null)
    setShowAddUser(false)
    setAddSuccess(null)
  }

  function cancelEdit() {
    setEditingMember(null)
    setEditError(null)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingMember || !editRole) return
    setEditLoading(true)
    setEditError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setEditError('Not authenticated.')
      setEditLoading(false)
      return
    }

    const res = await fetch('/api/admin/users/update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId: editingMember.id,
        fullName: editName,
        email: editEmail,
        role: editRole,
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setEditError(json.error ?? 'Something went wrong.')
    } else {
      setMembers(prev =>
        prev.map(m =>
          m.id === editingMember.id
            ? { ...m, full_name: editName, email: editEmail, role: editRole }
            : m,
        ),
      )
      setEditingMember(null)
    }
    setEditLoading(false)
  }

  async function createStartup(e: React.FormEvent) {
    e.preventDefault()
    setCsLoading(true)
    setCsError(null)
    setCsSuccess(null)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setCsError('Not authenticated.'); setCsLoading(false); return }

    const slug = csName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const tags = csTagsArr

    const res = await fetch('/api/admin/startups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: csName.trim(),
        slug: csSlug.trim() || slug,
        industry: csIndustry.trim(),
        stage: csStage,
        description: csDescription.trim(),
        tags,
        semesterId: activeSemesterId,
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setCsError(json.error ?? 'Something went wrong.')
    } else {
      setCsSuccess(`Startup "${csName.trim()}" created.`)
      setCsName(''); setCsSlug(''); setCsIndustry(''); setCsStage(''); setCsDescription(''); setCsTagsArr([])
      await refreshStartups()
    }
    setCsLoading(false)
  }

  async function assignFounder(userId: string) {
    const startupId = founderTargetStartup[userId]
    if (!startupId) return
    setAssigningFounder(userId)
    setAssignFounderError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setAssignFounderError('Not authenticated.'); setAssigningFounder(null); return }

    const res = await fetch('/api/admin/startups/assign-founder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ userId, startupId }),
    })
    const json = await res.json()

    if (!res.ok) {
      setAssignFounderError(json.error ?? 'Something went wrong.')
    } else {
      await refreshStartups()
      setFounderTargetStartup(prev => { const next = { ...prev }; delete next[userId]; return next })
    }
    setAssigningFounder(null)
  }

  async function refreshStartups() {
    await loadAll()
  }

  async function removeFounder(email: string, startupId: string) {
    const key = `${startupId}:${email}`
    setFounderActionKey(key)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setFounderActionKey(null); return }

    await fetch('/api/admin/startups/remove-founder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ startupId, email }),
    })
    await refreshStartups()
    setFounderActionKey(null)
  }

  async function moveFounder(email: string, fromStartupId: string, toStartupId: string) {
    if (!toStartupId) return
    const key = `${fromStartupId}:${email}`
    setFounderActionKey(key)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setFounderActionKey(null); return }

    await fetch('/api/admin/startups/move-founder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, fromStartupId, toStartupId }),
    })
    await refreshStartups()
    setFounderActionKey(null)
  }

  // ── Startups filter state ────────────────────────────────────────────────────
  const [startupSearch, setStartupSearch] = useState('')
  const [startupSemesterFilter, setStartupSemesterFilter] = useState('')

  // ── Startup-role members not yet linked to any startup (email not in any founders array)
  const allTags = [...new Set(startups.flatMap(s => s.preferred_tags ?? []))].sort()
  const allStartupSemesters = [...new Set(startups.map(s => s.semester_name).filter((n): n is string => Boolean(n)))].sort()

  const linkedFounderEmails = new Set(
    startups.flatMap(s => (s.founders ?? []).map(f => f.email).filter((e): e is string => Boolean(e)))
  )
  const pendingStartupUsers = members.filter(
    m => m.role === 'startup' && !linkedFounderEmails.has(m.email)
  )

  function handleMemberSort(key: MemberSortKey) {
    if (memberSortKey === key) {
      setMemberSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setMemberSortKey(key)
      setMemberSortDir('asc')
    }
  }

  const memberReferences = useMemo<CohortRecordReference[]>(() => members.map(member => ({
    recordId: member.id, profileId: member.id, email: member.email,
  })), [members])
  const cohort = useCohortScreen(memberReferences, 'all')
  const scopedMemberIds = new Set(cohort.scopedRecords.map(record => record.recordId))
  const activeMembershipProfiles = new Set(cohort.members.filter(member => member.status === 'active').map(member => member.profileId))

  const filteredMembers = members
    .filter(m => scopedMemberIds.has(m.id))
    .filter(m => memberShowAll || activeMembershipProfiles.has(m.id))
    .filter(m => {
      if (!memberSearch.trim()) return true
      const q = memberSearch.toLowerCase()
      return (
        (m.full_name ?? '').toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      const aVal = String(a[memberSortKey] ?? '').toLowerCase()
      const bVal = String(b[memberSortKey] ?? '').toLowerCase()
      return memberSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })

  function sessionSemesterLabel(session: Session): string {
    const dates = session.session_dates
    const relatedSemester = dates?.semesters
    const relatedName = Array.isArray(relatedSemester) ? relatedSemester[0]?.name : relatedSemester?.name
    return dates?.semester_name ?? relatedName ?? 'Spring 2026'
  }

  // ── Schedule ───────────────────────────────────────────────────────────────

  function openAssignmentPicker(startup: ScheduleColumn, date: SessionDate, timeSlot: '3:30-4:15' | '4:15-5:00') {
    if (!activeSemesterId || startup.startupSemesterId === null || !startup.linked) {
      setAssignmentFeedback(`${startup.name} has no active legacy schedule bridge for this semester. Link an active startup team member before assigning a mentor.`)
      setAssignmentRefreshRetryRequired(false)
      return
    }
    setAssignmentFeedback(null)
    setAssignmentRefreshRetryRequired(false)
    setAssignmentPickerTarget({
      semesterId: activeSemesterId,
      startupSemesterId: startup.startupSemesterId,
      startupName: startup.name,
      sessionDateId: date.id,
      date: date.date,
      timeSlot,
      initialFormat: 'in_person',
    })
  }

  async function handleAssignmentCommitted(result: AssignmentCommitResult, target: AssignmentPickerTarget) {
    const refresh = await loadAll()
    const feedback = assignmentRefreshFeedback({
      startupName: target.startupName,
      date: target.date,
      timeSlot: target.timeSlot,
      replayed: result.replayed,
      refreshSucceeded: refresh.ok,
    })
    setAssignmentFeedback(feedback.message)
    setAssignmentRefreshRetryRequired(feedback.retryRequired)
  }

  async function retryAssignmentRefresh() {
    setAssignmentRefreshRetrying(true)
    const refresh = await loadAll()
    setAssignmentRefreshRetrying(false)
    if (refresh.ok) {
      setAssignmentFeedback('Schedule data refreshed successfully.')
      setAssignmentRefreshRetryRequired(false)
    } else {
      setAssignmentFeedback('The assignment remains saved, but the schedule refresh failed again. Please retry.')
      setAssignmentRefreshRetryRequired(true)
    }
  }

  async function assignForWeek() {
    if (!activeSemesterId || !selectedSessionDateId) {
      alert('No active semester or session date configured.')
      return
    }
    if (!assignMentorId) {
      alert('Pick a mentor.')
      return
    }
    setAssigning(true)
    try {
      const { error } = await supabase.from('sessions').insert({
        mentor_id: assignMentorId,
        startup_id: null,
        session_date_id: selectedSessionDateId,
        semester_id: activeSemesterId,
        time_slot: assignTimeSlot,
        format: assignFormat,
        startup_absent: true,
        substitute_name: assignSubstituteName.trim() ? assignSubstituteName.trim() : null,
        topic: assignTopic.trim() ? assignTopic.trim() : null,
        status: 'confirmed',
        is_confirmed: true,
      } as never)
      if (error) throw error

      const { data: sessionRows } = await supabase
        .from('sessions')
        .select('id, mentor_id, startup_id, status, topic, time_slot, format, startup_absent, substitute_name, is_confirmed, session_dates(date, label, semester_id, semesters(name)), mentors(full_name, slug), startups(name, slug)')
        .order('time_slot')
      setSessions((sessionRows as unknown as Session[]) ?? [])
      setAssignTopic('')
      setAssignSubstituteName('')
      setAssignMentorId('')
      setShowAddSession(false)
    } catch (e) {
      console.error(e)
      alert(`Assignment failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setAssigning(false)
    }
  }

  function openEditSession(s: Session) {
    setEditingSession(s)
    setEditMentorId(s.mentor_id)
    setEditStartupId(s.startup_id ?? '')
    setEditTimeSlot(s.time_slot ?? '3:30-4:15')
    setEditFormat(s.format ?? 'online')
    setEditTopic(s.topic ?? '')
    setEditIsConfirmed(s.is_confirmed)
    setEditStartupAbsent(s.startup_absent)
    setEditSubstituteName(s.substitute_name ?? '')
  }

  async function updateSession() {
    if (!editingSession) return
    setEditSaving(true)
    try {
      const { error } = await supabase.from('sessions').update({
        mentor_id: editMentorId,
        startup_id: editStartupAbsent ? null : (editStartupId || null),
        time_slot: editTimeSlot,
        format: editFormat,
        topic: editTopic.trim() || null,
        is_confirmed: editIsConfirmed,
        startup_absent: editStartupAbsent,
        substitute_name: editStartupAbsent && editSubstituteName.trim() ? editSubstituteName.trim() : null,
      } as never).eq('id', editingSession.id)
      if (error) throw error
      const { data: sessionRows } = await supabase
        .from('sessions')
        .select('id, mentor_id, startup_id, status, topic, time_slot, format, startup_absent, substitute_name, is_confirmed, session_dates(date, label, semester_id, semesters(name)), mentors(full_name, slug), startups(name, slug)')
        .order('time_slot')
      setSessions((sessionRows as unknown as Session[]) ?? [])
      setEditingSession(null)
    } catch (e) {
      alert(`Update failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEditSaving(false)
    }
  }

  async function deleteSession() {
    if (!editingSession) return
    if (!confirm('Delete this session?')) return
    setEditSaving(true)
    try {
      const { error } = await supabase.from('sessions').delete().eq('id', editingSession.id)
      if (error) throw error
      setSessions(prev => prev.filter(s => s.id !== editingSession.id))
      setEditingSession(null)
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setEditSaving(false)
    }
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'users', label: 'Pending Users', badge: pendingUsers.length },
    { id: 'members', label: 'Members' },
    { id: 'schedule', label: 'Schedule' },
    { id: 'startups', label: 'Startups' },
  ]

  function SortIcon({ field }: { field: MemberSortKey }) {
    if (memberSortKey !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-[#002147] ml-1">{memberSortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-50 text-purple-700',
    mentor: 'bg-blue-50 text-blue-700',
    startup: 'bg-green-50 text-green-700',
  }

  return (
    <div className="max-w-5xl">
      <div className="rounded-2xl bg-[#002147] text-white p-6 md:p-7 mb-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#9ac7e2] font-semibold">Program operations</p>
            <div className="flex items-center gap-3 mt-2">
              <h1 className="text-2xl md:text-3xl font-semibold">{activeSemesterName ?? 'Almaworks program'}</h1>
              <span className="rounded-full border border-white/20 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/70">Active semester</span>
            </div>
            <p className="text-sm text-white/65 mt-2">One operating view for roster health, scheduling, and follow-up.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab('schedule')} className="rounded-lg border border-white/25 px-3 py-2 text-xs font-medium text-white/85 hover:bg-white/10">Review schedule</button>
            <button onClick={() => setTab('users')} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#002147] hover:bg-[#e7f2f9]">Review requests{pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ''}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
          {[
            { label: 'People', value: filteredMembers.length, note: `${cohort.scope === 'all' ? 'All cohorts' : cohort.cohorts.all.find(item => item.id === cohort.semesterId)?.name ?? 'Selected cohort'}` },
            { label: 'Ready', value: filteredMembers.length ? `${Math.round((filteredMembers.filter(member => activeMembershipProfiles.has(member.id)).length / filteredMembers.length) * 100)}%` : '—', note: 'Active memberships' },
            { label: 'Sessions', value: sessions.length, note: `${sessions.filter(session => session.is_confirmed).length} confirmed` },
            { label: 'Needs attention', value: pendingUsers.length, note: 'Pending approvals' },
          ].map(metric => (
            <div key={metric.label} className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-white/55">{metric.label}</p>
              <strong className="block text-2xl mt-1">{metric.value}</strong>
              <span className="text-[11px] text-white/55">{metric.note}</span>
            </div>
          ))}
        </div>
      </div>

      <CohortScreenControls controller={cohort} visibleRecords={filteredMembers.map(member => ({ recordId: member.id, profileId: member.id, email: member.email }))} />

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4 mb-6">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div><p className="text-[10px] uppercase tracking-[0.18em] text-[#75AADB] font-semibold">Launch sequence</p><h2 className="text-base font-semibold text-[#002147] mt-1">Keep the semester moving</h2></div>
            <span className="text-xs text-gray-400">{[activeSemesterName, members.length > 0, sessionDates.length > 0, pendingUsers.length === 0].filter(Boolean).length}/4 complete</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-4"><span className="block h-full bg-[#75AADB]" style={{ width: `${([activeSemesterName, members.length > 0, sessionDates.length > 0, pendingUsers.length === 0].filter(Boolean).length / 4) * 100}%` }} /></div>
          <div className="space-y-2 text-sm">
            {[{ label: 'Active semester configured', done: Boolean(activeSemesterName), tab: 'schedule' as Tab }, { label: 'Roster reviewed', done: members.length > 0, tab: 'members' as Tab }, { label: 'Session dates generated', done: sessionDates.length > 0, tab: 'schedule' as Tab }, { label: 'Pending access requests resolved', done: pendingUsers.length === 0, tab: 'users' as Tab }].map(item => (
              <button key={item.label} onClick={() => setTab(item.tab)} className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>{item.done ? '✓' : '·'}</span>
                <span className={item.done ? 'text-gray-500' : 'font-medium text-[#002147]'}>{item.label}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#75AADB] font-semibold">Quick actions</p>
          <h2 className="text-base font-semibold text-[#002147] mt-1 mb-4">What needs your attention</h2>
          <div className="space-y-2">
            <button onClick={() => setTab('users')} className="w-full flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 text-left hover:border-[#75AADB]/50"><span><strong className="block text-sm text-[#002147]">Approve registrations</strong><small className="text-xs text-gray-400">{pendingUsers.length} waiting for a role</small></span><span className="text-[#75AADB]">→</span></button>
            <button onClick={() => setTab('schedule')} className="w-full flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 text-left hover:border-[#75AADB]/50"><span><strong className="block text-sm text-[#002147]">Check session coverage</strong><small className="text-xs text-gray-400">{sessions.length} sessions in the active semester</small></span><span className="text-[#75AADB]">→</span></button>
            <Link href="/dashboard/admin/outreach" className="w-full flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 text-left hover:border-[#75AADB]/50"><span><strong className="block text-sm text-[#002147]">Open outreach queue</strong><small className="text-xs text-gray-400">Follow up with prospective members</small></span><span className="text-[#75AADB]">→</span></Link>
          </div>
        </section>
      </div>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[#002147]">Admin workspace</h2>
        <p className="text-sm text-gray-500 mt-1">Open a focused workflow without leaving the operating view.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white text-[#002147] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Pending Users ── */}
      {tab === 'users' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">
            Approve new registrations and assign their role before they can access the platform.
          </p>
          {pendingUsers.length === 0 ? (
            <p className="text-sm text-gray-400">No pending registrations.</p>
          ) : (
            <div className="space-y-3">
              {pendingUsers.map(u => (
                <div key={u.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#002147]">{u.full_name ?? '—'}</p>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Registered {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={roleSelections[u.id] ?? ''}
                      onChange={e => setRoleSelections(prev => ({ ...prev, [u.id]: e.target.value }))}
                      className="text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                    >
                      <option value="">Select role…</option>
                      <option value="mentor">Mentor</option>
                      <option value="startup">Startup</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => approveUser(u.id)}
                      disabled={approving === u.id || !roleSelections[u.id]}
                      className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-50 transition-colors"
                    >
                      {approving === u.id ? '…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => rejectUser(u.id)}
                      className="px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Members ── */}
      {tab === 'members' && (
        <div>
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              Approved platform members. Deactivate to block login.
            </p>
            <button
              onClick={() => { setShowAddUser(v => !v); setAddError(null); setAddSuccess(null) }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-xl hover:bg-[#002147]/90 transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add user
            </button>
          </div>

          {/* Add user form */}
          {showAddUser && (
            <form
              onSubmit={addUser}
              className="bg-white border border-gray-200 rounded-xl p-5 mb-4 space-y-4"
            >
              <p className="text-sm font-semibold text-[#002147]">Add new user</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full name</label>
                  <input
                    type="text"
                    required
                    placeholder="Jane Smith"
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    placeholder="jane@example.com"
                    value={addEmail}
                    onChange={e => setAddEmail(e.target.value)}
                    className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                  <select
                    required
                    value={addRole}
                    onChange={e => setAddRole(e.target.value as typeof addRole)}
                    className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                  >
                    <option value="">Select role…</option>
                    <option value="mentor">Mentor</option>
                    <option value="startup">Startup</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {addError && <p className="text-xs text-red-500">{addError}</p>}
              {addSuccess && <p className="text-xs text-green-600">{addSuccess}</p>}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-60 transition-colors"
                >
                  {addLoading ? 'Sending invite…' : 'Send invite'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddUser(false); setAddError(null); setAddSuccess(null) }}
                  className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name or email…"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-gray-500">{filteredMembers.length} user{filteredMembers.length !== 1 ? 's' : ''}</span>
              <button
                onClick={() => setMemberShowAll(v => !v)}
                className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  memberShowAll
                    ? 'bg-[#002147] text-white border-[#002147]'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {memberShowAll ? 'Showing all' : 'Active only'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {filteredMembers.length === 0 ? (
              <p className="text-sm text-gray-400 p-6">No users found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th
                        className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-[#002147] whitespace-nowrap"
                        onClick={() => handleMemberSort('full_name')}
                      >
                        Name <SortIcon field="full_name" />
                      </th>
                      <th
                        className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-[#002147] whitespace-nowrap"
                        onClick={() => handleMemberSort('email')}
                      >
                        Email <SortIcon field="email" />
                      </th>
                      <th
                        className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-[#002147] whitespace-nowrap"
                        onClick={() => handleMemberSort('role')}
                      >
                        Role <SortIcon field="role" />
                      </th>
                      <th
                        className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-[#002147] whitespace-nowrap"
                        onClick={() => handleMemberSort('is_active')}
                      >
                        Status <SortIcon field="is_active" />
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        Sessions
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const mentorByEmail = new Map(mentors.filter(m => m.email).map(m => [m.email!.toLowerCase(), m]))
                      const startupByFounderEmail = new Map<string, typeof startups[0]>()
                      for (const s of startups) for (const f of s.founders ?? []) if (f.email) startupByFounderEmail.set(f.email.toLowerCase(), s)

                      function getMemberSessions(member: Member) {
                        if (member.role === 'mentor') {
                          const mentor = mentorByEmail.get(member.email.toLowerCase())
                          return mentor ? sessions.filter(s => s.mentor_id === mentor.id) : []
                        }
                        if (member.role === 'startup') {
                          const startup = startupByFounderEmail.get(member.email.toLowerCase())
                          return startup ? sessions.filter(s => s.startup_id === startup.id) : []
                        }
                        return []
                      }

                      return filteredMembers.flatMap(m => {
                        const memberSessions = getMemberSessions(m)
                        const isEditing = editingMember?.id === m.id
                        const rows = [
                          <tr key={m.id} className={`transition-colors ${isEditing ? 'bg-[#002147]/3' : 'hover:bg-gray-50/60 border-b border-gray-50'}`}>
                            <td className="px-5 py-3.5 font-medium text-[#002147] whitespace-nowrap">
                              {m.full_name ?? <span className="text-gray-400 font-normal">—</span>}
                            </td>
                            <td className="px-5 py-3.5 text-gray-500 whitespace-nowrap">{m.email}</td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${roleColors[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                                {m.role}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                                m.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${m.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                                {m.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              {memberSessions.length > 0 ? (
                                <div className="flex flex-col gap-0.5">
                                  {memberSessions.slice(0, 2).map(s => (
                                    <button key={s.id} onClick={() => openEditSession(s)}
                                      className="text-left text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#002147]/8 text-[#002147] hover:bg-[#002147]/15 transition-colors whitespace-nowrap w-fit">
                                      {sessionSemesterLabel(s)}
                                    </button>
                                  ))}
                                  {memberSessions.length > 2 && (
                                    <span className="text-[10px] text-gray-400 px-2">+{memberSessions.length - 2} more</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => isEditing ? cancelEdit() : openEdit(m)}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                    isEditing
                                      ? 'bg-[#002147] text-white border-[#002147]'
                                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  {isEditing ? 'Cancel' : 'Edit'}
                                </button>
                                <button
                                  onClick={() => toggleMemberActive(m.id, m.is_active)}
                                  disabled={togglingActive === m.id || cohort.scope === 'all'}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                                    m.is_active
                                      ? 'border-red-200 text-red-600 hover:bg-red-50'
                                      : 'border-green-200 text-green-700 hover:bg-green-50'
                                  }`}
                                >
                                  {togglingActive === m.id ? '…' : m.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                              </div>
                            </td>
                          </tr>,
                        ]
                        if (isEditing) {
                          rows.push(
                            <tr key={`${m.id}-edit`} className="bg-gray-50/80 border-b border-gray-100">
                              <td colSpan={6} className="px-5 py-4">
                                <div className="space-y-4">
                                  <form onSubmit={saveEdit} className="grid sm:grid-cols-3 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">Full name</label>
                                      <input type="text" required value={editName} onChange={e => setEditName(e.target.value)}
                                        className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                                      <input type="email" required value={editEmail} onChange={e => setEditEmail(e.target.value)}
                                        className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                                      <select required value={editRole} onChange={e => setEditRole(e.target.value as typeof editRole)}
                                        className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                                        <option value="mentor">Mentor</option>
                                        <option value="startup">Startup</option>
                                        <option value="admin">Admin</option>
                                      </select>
                                    </div>
                                    {editError && <p className="text-xs text-red-500 sm:col-span-3">{editError}</p>}
                                    <div className="sm:col-span-3 flex items-center gap-2 pt-1">
                                      <button type="submit" disabled={editLoading}
                                        className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-60 transition-colors">
                                        {editLoading ? 'Saving…' : 'Save changes'}
                                      </button>
                                      <button type="button" onClick={cancelEdit}
                                        className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                  {memberSessions.length > 0 && (
                                    <div className="border-t border-gray-100 pt-3">
                                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sessions</p>
                                      <div className="space-y-1.5">
                                        {memberSessions.map(s => (
                                          <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-white rounded-lg border border-gray-100">
                                            <div>
                                              <p className="text-xs font-medium text-[#002147]">{sessionSemesterLabel(s)}</p>
                                            </div>
                                            <button onClick={() => openEditSession(s)}
                                              className="px-2.5 py-1 text-[10px] font-medium border border-gray-200 text-gray-500 hover:text-[#002147] hover:border-[#002147]/30 rounded-lg transition-colors shrink-0">
                                              Edit session
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        }
                        return rows
                      })
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Schedule ── */}
      {tab === 'schedule' && (() => {
        // Build matrix: rows = (date + time_slot), cols = startups
        // Unique row keys sorted by date then time slot
        const fixedSlots = ['3:30-4:15', '4:15-5:00'] as const
        const rowKeys = sessionDates.flatMap(date => fixedSlots.map(slot => ({
          dateId: `${date.id}__${slot}`,
          date: date.date,
          label: date.label,
          slot,
        })))

        const colStartups = scheduleStartupColumns

        // Build lookup: `date__slot__legacyStartupId` -> session.
        const cellMap = new Map<string, Session>()
        for (const s of sessions) {
          if (!s.session_dates || s.startup_absent || !s.startup_id) continue
          const slot = s.time_slot ?? 'TBD'
          const key = `${s.session_dates.date}__${slot}__${s.startup_id}`
          cellMap.set(key, s)
        }

        return (
          <div className="space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm text-gray-500">Choose an empty slot for ranked assignment. Existing sessions use the legacy editor.</p>
                <div className="flex items-center gap-2 text-[10px] font-medium">
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">Online</span>
                  <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">In-person</span>
                  <span className="px-2 py-0.5 rounded-full border border-gray-200 text-gray-500"
                    style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.06) 4px, rgba(0,0,0,0.06) 8px)' }}>
                    Unconfirmed
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setShowDateWizard(v => !v); setWizardDone(false) }}
                  className="flex items-center gap-1.5 px-4 py-2 border border-[#002147] text-[#002147] text-sm font-medium rounded-xl hover:bg-[#002147]/5 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Setup dates
                </button>
                <button
                  onClick={() => {
                    setAssignMentorId('')
                    setAssignSubstituteName('')
                    setShowAddSession(v => !v)
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-xl hover:bg-[#002147]/90 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add substitute session
                </button>
              </div>
            </div>

            {assignmentFeedback && (
              <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <p>{assignmentFeedback}</p>
                {assignmentRefreshRetryRequired && (
                  <button
                    type="button"
                    onClick={retryAssignmentRefresh}
                    disabled={assignmentRefreshRetrying}
                    className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
                  >
                    {assignmentRefreshRetrying ? 'Refreshing…' : 'Retry refresh'}
                  </button>
                )}
              </div>
            )}

            {/* Session dates wizard */}
            {showDateWizard && (
              <div className="bg-white border border-[#002147]/20 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#002147]">Session Date Wizard</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Generate weekly session dates for <span className="font-medium">{activeSemesterId ? 'the active semester' : 'no active semester'}</span>.
                    </p>
                  </div>
                  <button onClick={() => setShowDateWizard(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
                    <input
                      type="date"
                      value={wizardStartDate}
                      onChange={e => setWizardStartDate(e.target.value)}
                      className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Number of weekly sessions: <span className="text-[#002147] font-semibold">{wizardWeeks}</span>
                    </label>
                    <input
                      type="range"
                      min={1} max={20}
                      value={wizardWeeks}
                      onChange={e => setWizardWeeks(Number(e.target.value))}
                      className="w-full accent-[#002147]"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>1</span><span>20</span>
                    </div>
                  </div>
                </div>

                {wizardStartDate && (() => {
                  const preview = wizardPreviewDates()
                  return (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Preview — {preview.length} dates
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 max-h-48 overflow-y-auto pr-1">
                        {preview.map(({ date, label }) => {
                          const existing = sessionDates.some(d => d.date === date)
                          return (
                            <div
                              key={date}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${
                                existing
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-gray-50 text-gray-700 border border-gray-200'
                              }`}
                            >
                              <span className="font-semibold">{label}</span>
                              {existing && <span className="text-[9px] text-amber-500">exists</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {!activeSemesterId && (
                  <p className="text-xs text-red-500">No active semester found. Set one before creating dates.</p>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={createWizardDates}
                    disabled={wizardSaving || !wizardStartDate || !activeSemesterId}
                    className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-60 transition-colors"
                  >
                    {wizardSaving ? 'Creating…' : `Create ${wizardWeeks} session date${wizardWeeks !== 1 ? 's' : ''}`}
                  </button>
                  {wizardDone && <p className="text-sm text-green-600">Done! Dates created.</p>}
                </div>
              </div>
            )}

            {/* Matrix grid */}
            {rowKeys.length === 0 ? (
              <p className="text-sm text-gray-400">No sessions scheduled yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="text-xs border-collapse min-w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b border-r border-gray-200 min-w-[160px]">
                        Date / Time
                      </th>
                      {colStartups.map(st => (
                        <th key={st.startupSemesterId ?? `historical-${st.startupId}`} className="px-3 py-3 text-center font-semibold text-[#002147] whitespace-nowrap border-b border-r border-gray-200 min-w-[120px]">
                          {st.name}
                          {!st.linked && (
                            <span className="block text-[10px] font-semibold text-amber-700 mt-0.5">
                              {'historicalOnly' in st ? 'Historical only' : 'Unlinked'}
                            </span>
                          )}
                        </th>
                      ))}
                      {/* Absent/sub column */}
                      <th className="px-3 py-3 text-center font-semibold text-gray-400 whitespace-nowrap border-b border-gray-200 min-w-[110px]">
                        Absent / Sub
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowKeys.map((row, ri) => {
                      const absentSessions = sessions.filter(s =>
                        s.session_dates?.date === row.date && (s.time_slot ?? 'TBD') === row.slot && s.startup_absent
                      )
                      return (
                        <tr key={row.dateId} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                          <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5 font-semibold text-[#002147] whitespace-nowrap border-r border-gray-200">
                            <span className="block">{row.label ?? new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            <span className="block text-[10px] font-normal text-gray-400">{row.slot}</span>
                          </td>
                          {colStartups.map(st => {
                            const cellKey = st.startupId ? `${row.date}__${row.slot}__${st.startupId}` : null
                            const cell = cellKey ? cellMap.get(cellKey) : undefined
                            const formatBg =
                              (cell?.format === 'in-person' || cell?.format === 'in_person') ? 'bg-green-50 text-green-800 border border-green-200 hover:bg-green-100' :
                              cell?.format === 'online' ? 'bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100' :
                              'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                            return (
                              <td key={st.startupSemesterId ?? `historical-${st.startupId}`} className="px-2 py-2 text-center border-r border-gray-100 align-top">
                                {cell ? (
                                  <button
                                    onClick={() => openEditSession(cell)}
                                    aria-label={`Edit existing session for ${st.name} using the legacy session editor`}
                                    className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-medium text-left transition-colors ${formatBg}`}
                                    style={!cell.is_confirmed ? {
                                      backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.05) 5px, rgba(0,0,0,0.05) 10px)',
                                    } : undefined}
                                  >
                                    {cell.mentors?.full_name ?? '—'}
                                    {cell.format && (
                                      <span className="block text-[9px] font-normal opacity-60 capitalize">{cell.format.replace('_', ' ')}</span>
                                    )}
                                    {!cell.is_confirmed && (
                                      <span className="block text-[9px] font-normal opacity-70">unconfirmed</span>
                                    )}
                                  </button>
                                ) : st.linked ? (
                                  <button
                                    onClick={() => {
                                      const dateObj = sessionDates.find(d => d.date === row.date)
                                      if (dateObj) openAssignmentPicker(st, dateObj, row.slot)
                                    }}
                                    className="w-full min-h-10 rounded-lg border border-dashed border-gray-200 text-gray-400 hover:border-[#75AADB] hover:text-[#00689d] hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 transition-colors text-[10px] font-semibold"
                                    aria-label={`Assign a mentor to ${st.name} on ${row.label ?? row.date}, ${row.slot}`}
                                  >
                                    + Assign
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled
                                    className="w-full min-h-10 rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-1 text-[10px] font-semibold text-amber-700 disabled:cursor-not-allowed"
                                    aria-label={
                                      'historicalOnly' in st
                                        ? `${st.name} is a historical-only schedule column and cannot receive new assignments`
                                        : `${st.name} is unlinked and cannot receive assignments until an active legacy schedule bridge exists`
                                    }
                                    title={
                                      'historicalOnly' in st
                                        ? 'Historical-only startup record'
                                        : 'No active legacy schedule bridge. Link an active startup team member.'
                                    }
                                  >
                                    {'historicalOnly' in st ? 'Historical' : 'Unlinked'}
                                  </button>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-3 py-2.5 text-center align-top">
                            {absentSessions.length > 0 ? (
                              <div className="space-y-1">
                                {absentSessions.map(s => (
                                  <span key={s.id} className="inline-block bg-red-50 text-red-600 px-2 py-1 rounded-lg text-[11px] font-medium">
                                    {s.mentors?.full_name ?? '—'}
                                    {s.substitute_name && <span className="block text-[9px] font-normal opacity-70">Sub: {s.substitute_name}</span>}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-200">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {sessions.length === 0 && sessionDates.length === 0 && (
              <p className="text-sm text-gray-400">No session dates found for the active semester.</p>
            )}
          </div>
        )
      })()}

      {/* ── Startups ── */}
      {tab === 'startups' && (
        <div className="space-y-6">

          {/* Pending startup users */}
          {pendingStartupUsers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-[#002147]">Unassigned Startup Members</h2>
                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {pendingStartupUsers.length}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">These users have the startup role but are not yet linked to any startup.</p>
              {assignFounderError && (
                <p className="text-xs text-red-500 mb-2">{assignFounderError}</p>
              )}
              <div className="bg-white rounded-xl border border-amber-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-amber-50/60">
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Assign to startup</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pendingStartupUsers.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50/60">
                        <td className="px-5 py-3 font-medium text-[#002147] whitespace-nowrap">
                          {u.full_name ?? <span className="text-gray-400 font-normal">—</span>}
                        </td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{u.email}</td>
                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              value={founderTargetStartup[u.id] ?? ''}
                              onChange={e => setFounderTargetStartup(prev => ({ ...prev, [u.id]: e.target.value }))}
                              className="text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                            >
                              <option value="">Select startup…</option>
                              {startups.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => assignFounder(u.id)}
                              disabled={!founderTargetStartup[u.id] || assigningFounder === u.id}
                              className="px-3 py-1.5 bg-[#002147] text-white text-xs font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-50 transition-colors"
                            >
                              {assigningFounder === u.id ? '…' : 'Assign'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Startups list header + create button */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[#002147]">Startups</h2>
                <p className="text-xs text-gray-500 mt-0.5">{startups.length} startup{startups.length !== 1 ? 's' : ''} registered.</p>
              </div>
              <button
                onClick={() => { setShowCreateStartup(v => !v); setCsError(null); setCsSuccess(null) }}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-xl hover:bg-[#002147]/90 transition-colors shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create startup
              </button>
            </div>

            {/* Create startup form */}
            {showCreateStartup && (
              <form onSubmit={createStartup} className="bg-white border border-gray-200 rounded-xl p-5 mb-4 space-y-4">
                <p className="text-sm font-semibold text-[#002147]">New startup</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-400">*</span></label>
                    <input
                      type="text" required placeholder="Acme Inc." value={csName}
                      onChange={e => { setCsName(e.target.value); if (!csSlug) setCsSlug(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')) }}
                      className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Slug <span className="text-red-400">*</span></label>
                    <input
                      type="text" required placeholder="acme-inc" value={csSlug}
                      onChange={e => setCsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                      className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
                    <input
                      type="text" placeholder="FinTech" value={csIndustry}
                      onChange={e => setCsIndustry(e.target.value)}
                      className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Stage</label>
                    <select value={csStage} onChange={e => setCsStage(e.target.value)}
                      className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                    >
                      <option value="">Select stage…</option>
                      <option value="idea">Idea</option>
                      <option value="mvp">MVP</option>
                      <option value="seed">Seed</option>
                      <option value="series_a">Series A</option>
                      <option value="growth">Growth</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tags</label>
                    <TagInput
                      value={csTagsArr}
                      onChange={setCsTagsArr}
                      suggestions={allTags}
                      placeholder="Search or create tags…"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <textarea
                      rows={3} placeholder="What does this startup do?" value={csDescription}
                      onChange={e => setCsDescription(e.target.value)}
                      className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 resize-none"
                    />
                  </div>
                </div>
                {csError && <p className="text-xs text-red-500">{csError}</p>}
                {csSuccess && <p className="text-xs text-green-600">{csSuccess}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <button type="submit" disabled={csLoading}
                    className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-60 transition-colors"
                  >
                    {csLoading ? 'Creating…' : 'Create startup'}
                  </button>
                  <button type="button" onClick={() => { setShowCreateStartup(false); setCsError(null); setCsSuccess(null) }}
                    className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Search + semester filter */}
            {startups.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <input
                  type="search"
                  placeholder="Search startups…"
                  value={startupSearch}
                  onChange={e => setStartupSearch(e.target.value)}
                  className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                />
                {allStartupSemesters.length > 0 && (
                  <select
                    value={startupSemesterFilter}
                    onChange={e => setStartupSemesterFilter(e.target.value)}
                    className="text-xs text-gray-600 border border-gray-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 shrink-0"
                  >
                    <option value="">All semesters</option>
                    {allStartupSemesters.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            )}

            {(() => {
              const q = startupSearch.trim().toLowerCase()
              const filteredStartups = startups.filter(s => {
                if (startupSemesterFilter && s.semester_name !== startupSemesterFilter) return false
                if (!q) return true
                return [s.name, s.industry ?? '', s.stage ?? '', s.description ?? ''].join(' ').toLowerCase().includes(q)
              })
              return filteredStartups.length === 0 ? (
              <p className="text-sm text-gray-400">{startups.length === 0 ? 'No startups yet.' : 'No startups match the current filters.'}</p>
            ) : (
              <div className="space-y-3">
                {filteredStartups.map(s => (
                  <div key={s.id} className="px-5 py-4 bg-white rounded-xl border border-gray-100">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => setSelectedStartupId(s.id)}
                            className="text-sm font-semibold text-[#002147] hover:underline text-left"
                          >
                            {s.name}
                          </button>
                          <button
                            onClick={() => openEditStartup(s)}
                            className="text-[10px] font-medium text-gray-400 hover:text-[#002147] border border-gray-200 hover:border-[#002147]/30 px-2 py-0.5 rounded-full transition-colors"
                          >
                            Edit
                          </button>
                          {s.semester_name && (
                            <span className="text-[10px] font-semibold bg-[#75AADB]/20 text-[#002147] px-1.5 py-0.5 rounded-full">{s.semester_name}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{[s.industry, s.stage].filter(Boolean).join(' · ')}</p>
                        {s.preferred_tags && s.preferred_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {s.preferred_tags.map(t => (
                              <span key={t} className="text-[10px] bg-[#002147]/8 text-[#002147] px-2 py-0.5 rounded-full font-medium">{t}</span>
                            ))}
                          </div>
                        )}
                        {s.mentorship_needs && s.mentorship_needs.length > 0 && (
                          <div className="mt-1.5">
                            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mr-1">Mentorship Needs:</span>
                            <span className="inline-flex flex-wrap gap-1">
                              {s.mentorship_needs.map(t => (
                                <span key={t} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">{t}</span>
                              ))}
                            </span>
                          </div>
                        )}
                        {s.description && (
                          <p className="text-xs text-gray-500 mt-2 leading-relaxed line-clamp-2">{s.description}</p>
                        )}
                      </div>
                    </div>
                    {s.founders && s.founders.length > 0 && (
                      <div className="space-y-0.5 mt-2 pt-2 border-t border-gray-50">
                        {s.founders.map((f, i) => {
                          const actionKey = `${s.id}:${f.email}`
                          const busy = founderActionKey === actionKey
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs text-gray-500 group/row rounded px-1 -mx-1 hover:bg-gray-50">
                              <span className="font-medium text-[#002147] shrink-0">{f.name}</span>
                              {f.email && <span className="truncate">{f.email}</span>}
                              {/* Controls — only visible on row hover */}
                              {f.email && (
                                <div className="ml-auto flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
                                  <select
                                    defaultValue=""
                                    disabled={busy}
                                    onChange={e => { if (e.target.value) moveFounder(f.email!, s.id, e.target.value) }}
                                    className="text-[10px] text-gray-500 border border-gray-200 rounded px-1 py-0.5 bg-white cursor-pointer disabled:opacity-40"
                                  >
                                    <option value="" disabled>Move to…</option>
                                    {startups.filter(os => os.id !== s.id).map(os => (
                                      <option key={os.id} value={os.id}>{os.name}</option>
                                    ))}
                                  </select>
                                  <button
                                    disabled={busy}
                                    onClick={() => removeFounder(f.email!, s.id)}
                                    className="w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                                    title="Remove from startup"
                                  >
                                    {busy ? (
                                      <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin block" />
                                    ) : (
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
            })()}
          </div>
        </div>
      )}

      <StartupModal startupId={selectedStartupId} onClose={() => setSelectedStartupId(null)} />

      <MentorAssignmentPicker
        open={assignmentPickerTarget !== null}
        target={assignmentPickerTarget}
        onClose={() => setAssignmentPickerTarget(null)}
        onCommitted={handleAssignmentCommitted}
      />

      {/* ── Add Session Lightbox ── */}
      {showAddSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAddSession(false)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#002147]">Add substitute session</h3>
                <p className="mt-1 text-xs text-gray-500">Compatibility workflow for a startup-absent or internal team substitute.</p>
              </div>
              <button onClick={() => setShowAddSession(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Session date</label>
                <select value={selectedSessionDateId ?? ''} onChange={e => setSelectedSessionDateId(e.target.value)}
                  className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                  <option value="">Select date…</option>
                  {sessionDates.map(d => (
                    <option key={d.id} value={d.id}>{d.label ?? d.date} · {d.date}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Time slot</label>
                <select value={assignTimeSlot} onChange={e => setAssignTimeSlot(e.target.value)}
                  className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                  <option value="3:30-4:15">3:30 – 4:15 PM</option>
                  <option value="4:15-5:00">4:15 – 5:00 PM</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Format</label>
                <select value={assignFormat} onChange={e => setAssignFormat(e.target.value)}
                  className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                  <option value="online">Online</option>
                  <option value="in-person">In-person</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mentor <span className="text-red-400">*</span></label>
                <select value={assignMentorId} onChange={e => setAssignMentorId(e.target.value)}
                  className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                  <option value="">Select mentor…</option>
                  {mentors.filter(m => m.is_active).map(m => (
                    <option key={m.id} value={m.id}>{m.full_name}{m.company ? ` · ${m.company}` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Topic</label>
                <input value={assignTopic} onChange={e => setAssignTopic(e.target.value)} placeholder="Optional"
                  className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Substitute name</label>
                <input value={assignSubstituteName} onChange={e => setAssignSubstituteName(e.target.value)}
                  placeholder="Internal team or substitute name…"
                  className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={assignForWeek} disabled={assigning || !assignMentorId}
                className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-50 transition-colors">
                {assigning ? 'Adding…' : 'Add substitute session'}
              </button>
              <button onClick={() => setShowAddSession(false)}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Startup Lightbox ── */}
      {editingStartup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingStartup(null)} />
          <div className="relative bg-gray-50 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="h-2 bg-[#002147] rounded-t-2xl" />
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#002147]">Edit Startup</h3>
                <button onClick={() => setEditingStartup(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/80 text-gray-400 hover:text-gray-700 hover:bg-white shadow-sm transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={saveEditStartup} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-400">*</span></label>
                    <input required value={esName} onChange={e => setEsName(e.target.value)} placeholder="Acme Inc."
                      className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Slug</label>
                    <input value={esSlug} onChange={e => setEsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="acme-inc"
                      className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
                    <input value={esIndustry} onChange={e => setEsIndustry(e.target.value)} placeholder="FinTech"
                      className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Stage</label>
                    <select value={esStage} onChange={e => setEsStage(e.target.value)}
                      className="w-full text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                      <option value="">Select stage…</option>
                      <option value="idea">Idea</option>
                      <option value="mvp">MVP</option>
                      <option value="seed">Seed</option>
                      <option value="series_a">Series A</option>
                      <option value="growth">Growth</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Expertise tags</label>
                    <TagInput value={esTagsArr} onChange={setEsTagsArr} suggestions={allTags} placeholder="Search or create tags…" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mentorship needs</label>
                    <TagInput value={esMentorshipNeeds} onChange={setEsMentorshipNeeds}
                      suggestions={['Fundraising & Investor Relations','Product Development','Marketing & Branding','Operations','GTM Strategy','Legal & IP','Finance','Talent & Hiring','Customer Acquisition']}
                      placeholder="Add mentorship need…" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <textarea rows={3} value={esDescription} onChange={e => setEsDescription(e.target.value)} placeholder="What does this startup do?"
                      className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 resize-none" />
                  </div>
                </div>
                {esError && <p className="text-xs text-red-500">{esError}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <button type="submit" disabled={esSaving}
                    className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-60 transition-colors">
                    {esSaving ? 'Saving…' : 'Save changes'}
                  </button>
                  <button type="button" onClick={() => setEditingStartup(null)}
                    className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Session Modal ── */}
      {editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditingSession(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#002147]">Edit existing session</h3>
                <p className="mt-1 text-xs text-amber-700">Legacy compatibility editor for assignments created before the ranked workflow.</p>
              </div>
              <button onClick={() => setEditingSession(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mentor</label>
                <select value={editMentorId} onChange={e => setEditMentorId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                  <option value="">Select mentor…</option>
                  {mentors.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Startup</label>
                <select value={editStartupId} onChange={e => setEditStartupId(e.target.value)}
                  disabled={editStartupAbsent}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 disabled:opacity-40">
                  <option value="">None</option>
                  {startups.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Time slot</label>
                <select value={editTimeSlot} onChange={e => setEditTimeSlot(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                  <option value="3:30-4:15">3:30 – 4:15 PM</option>
                  <option value="4:15-5:00">4:15 – 5:00 PM</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Format</label>
                <select value={editFormat} onChange={e => setEditFormat(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40">
                  <option value="online">Online</option>
                  <option value="in-person">In-person</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Topic</label>
                <input value={editTopic} onChange={e => setEditTopic(e.target.value)} placeholder="Optional"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
              </div>
              <div className="flex flex-col gap-2 sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={editIsConfirmed} onChange={e => setEditIsConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#002147]" />
                  <span className="text-sm text-gray-700">Confirmed</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={editStartupAbsent} onChange={e => setEditStartupAbsent(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#002147]" />
                  <span className="text-sm text-gray-700">Startup absent / may cancel</span>
                </label>
                {editStartupAbsent && (
                  <input value={editSubstituteName} onChange={e => setEditSubstituteName(e.target.value)}
                    placeholder="Substitute name…"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" />
                )}
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <button onClick={deleteSession} disabled={editSaving}
                className="px-3 py-2 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                Delete
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditingSession(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={updateSession} disabled={editSaving || !editMentorId}
                  className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-50 transition-colors">
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
