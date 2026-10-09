'use client'

import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { MemberLoginAccountControl } from '@/components/MemberLoginAccountControl'
import { MemberDeletionControl } from '@/components/MemberDeletionControl'
import { DataLoading } from '@/components/DataLoading'
import TagInput from '@/components/TagInput'
import StartupModal from '@/components/StartupModal'
import { CohortScreenControls, useCohortScreen, invalidateCohortReads } from '@/components/CohortScreenControls'
import { MembershipVisibilitySwitch } from '@/components/MembershipVisibilitySwitch'
import { adminDashboardHref, adminMemberHref, resolveAdminDashboardTab, type AdminDashboardTab } from '@/src/assignments/schedule-navigation'
import { memberLoginPresentation } from '@/src/auth/member-login-account'
import { filterSemesterRecords, type CohortRecordReference } from '@/src/lifecycle/cohort-screen'
import { activationWorkspaceState, memberDeepLinkState } from '@/src/lifecycle/admin-membership-ui-state'
import {
  filterMembershipsByVisibility,
  membershipPresentation,
  type MembershipReadinessStatus,
  type MembershipVisibility,
} from '@/src/lifecycle/membership-presentation'
import type { MembershipStatus } from '@/src/lifecycle/types'
import { persistAndRefreshMembership, refreshMembershipReadModels } from '@/src/lifecycle/membership-mutation'
import { loadStartupDirectory } from '@/src/program/canonical-repository'
import { formatEnumLabel } from '@/src/presentation/display-labels'
import { StartupStagePicker } from '@/components/StartupStagePicker'
import { memberDirectorySelect } from '@/src/dashboard/admin-members-query'
import { loadAdminOverview, type AdminOverview } from '@/src/dashboard/admin-overview'
import { adminModuleLoads, type AdminModuleLoad } from '@/src/dashboard/admin-module-loads'
import { FridayProgramPanel } from '@/components/friday-program/FridayProgramPanel'

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
  auth_user_id: string | null
  profile_is_active: boolean
  is_super_admin: boolean
  membership_is_active: boolean
  latest_removal_audit_action: 'member.login_removal_prepared' | 'member.login_restored' | null
  membership_id: string | null
  semester_id: string | null
  created_at: string
}

type Founder = {
  name: string
  email?: string
  phone?: string
}

type Startup = {
  id: string
  organization_id: string
  name: string
  industry: string | null
  stage: string | null
  founder_name: string | null
  founders: Founder[]
  slug: string | null
  description: string | null
  mentorship_needs: string[]
  semester_id: string | null
  semester_name: string | null
  membership_email: string | null
  membership_status: MembershipStatus
  readiness_status: MembershipReadinessStatus
}

type SortDir = 'asc' | 'desc'
type MemberSortKey = 'full_name' | 'email' | 'role' | 'membership_is_active'

type Tab = AdminDashboardTab

const MEMBER_LOGIN_AUDIT_ACTIONS = ['member.login_removal_prepared', 'member.login_restored']

async function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  if ((init?.method ?? 'GET') === 'GET') return fetch(url, init)
  invalidateCohortReads()
  try { return await fetch(url, init) } finally { invalidateCohortReads() }
}

async function loadAdminCapabilities(accessToken: string | null): Promise<{ canRemoveMemberLogin: boolean; isSuperAdmin: boolean }> {
  if (!accessToken) return { canRemoveMemberLogin: false, isSuperAdmin: false }
  try {
    const response = await fetch('/api/auth/capabilities', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return { canRemoveMemberLogin: false, isSuperAdmin: false }
    const payload = await response.json() as { data?: { canRemoveMemberLogin?: boolean; isSuperAdmin?: boolean } }
    return {
      canRemoveMemberLogin: payload.data?.canRemoveMemberLogin === true,
      isSuperAdmin: payload.data?.isSuperAdmin === true,
    }
  } catch {
    return { canRemoveMemberLogin: false, isSuperAdmin: false }
  }
}

function AdminDashboardContent() {
  const supabase = createClient()
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = resolveAdminDashboardTab(pathname, searchParams.get('tab'))
  const [modulePending, startModuleTransition] = useTransition()
  const setTab = (nextTab: Tab) => startModuleTransition(() => router.push(adminDashboardHref(nextTab)))

  // Pending users
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [roleSelections, setRoleSelections] = useState<Record<string, string>>({})
  const [approving, setApproving] = useState<string | null>(null)

  // Members
  const [members, setMembers] = useState<Member[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSortKey, setMemberSortKey] = useState<MemberSortKey>('full_name')
  const [memberSortDir, setMemberSortDir] = useState<SortDir>('asc')
  const [memberVisibility, setMemberVisibility] = useState<MembershipVisibility>('all')
  const [togglingActive, setTogglingActive] = useState<string | null>(null)
  const [activationError, setActivationError] = useState<string | null>(null)
  const [membershipRefreshFeedback, setMembershipRefreshFeedback] = useState<string | null>(null)
  const [membershipRefreshRetryRequired, setMembershipRefreshRetryRequired] = useState(false)
  const [membershipRefreshRetrying, setMembershipRefreshRetrying] = useState(false)
  const [canRemoveMemberLogin, setCanRemoveMemberLogin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [deletionLockedIds, setDeletionLockedIds] = useState<Set<string>>(() => new Set())
  const [completedDeletionId, setCompletedDeletionId] = useState<string | null>(null)
  const deletionNotice = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (completedDeletionId && !members.some(member => member.id === completedDeletionId)) deletionNotice.current?.focus()
  }, [completedDeletionId, members])
  const [currentAuthUserId, setCurrentAuthUserId] = useState<string | null>(null)
  const [platformAccessUpdatingProfileId, setPlatformAccessUpdatingProfileId] = useState<string | null>(null)

  // Add user form
  const [showAddUser, setShowAddUser] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState<'mentor' | 'startup' | 'admin' | ''>('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [restoreRequired, setRestoreRequired] = useState(false)
  const [restoreAccess, setRestoreAccess] = useState(false)
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
  const [csLoading, setCsLoading] = useState(false)
  const [csError, setCsError] = useState<string | null>(null)
  const [csSuccess, setCsSuccess] = useState<string | null>(null)
  const [deletingStartupId, setDeletingStartupId] = useState<string | null>(null)

  // Edit startup lightbox
  const [editingStartup, setEditingStartup] = useState<Startup | null>(null)
  const [esName, setEsName] = useState('')
  const [esSlug, setEsSlug] = useState('')
  const [esIndustry, setEsIndustry] = useState('')
  const [esStage, setEsStage] = useState('')
  const [esDescription, setEsDescription] = useState('')
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
    setEsMentorshipNeeds(s.mentorship_needs ?? [])
    setEsError(null)
  }

  async function saveEditStartup(e: React.FormEvent) {
    e.preventDefault()
    if (!editingStartup) return
    setEsSaving(true)
    setEsError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const response = await adminFetch('/api/admin/startups/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({
        description: esDescription.trim() || null,
        industry: esIndustry.trim() || null,
        mentorshipNeeds: esMentorshipNeeds,
        name: esName.trim(),
        slug: esSlug.trim(),
        stage: esStage || null,
        startupSemesterId: editingStartup.id,
      }),
    })
    const result = await response.json() as { error?: string }
    setEsSaving(false)
    if (!response.ok) { setEsError(result.error ?? 'Unable to update startup.'); return }
    setEditingStartup(null)
    await loadAll()
  }

  // Schedule / other tabs
  const [startups, setStartups] = useState<Startup[]>([])
  const [activeSemesterId, setActiveSemesterId] = useState<string | null>(null)
  const [activeSemesterName, setActiveSemesterName] = useState<string | null>(null)

  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [errorTab, setErrorTab] = useState<Tab | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadedTab, setLoadedTab] = useState<Tab | null>(null)
  const loadSequence = useRef(0)

  async function loadAll() {
    const sequence = ++loadSequence.current
    try {
      setLoadError(null)
      setOverview(null)
      const { data: { session: authSession } } = await supabase.auth.getSession()
      const loads: readonly AdminModuleLoad[] = adminModuleLoads[tab]
      const needs = (name: (typeof loads)[number]) => loads.includes(name)
      const semesterRead = Promise.resolve(supabase.from('semesters').select('id, name').eq('is_active', true).maybeSingle())
      const [usersRes, membersRes, startupsRes, semesterRes, adminCapabilities, summary] = await Promise.all([
        needs('pending-users') ? supabase.from('profiles').select('id, email, full_name, created_at').eq('status', 'pending').order('created_at') : Promise.resolve({ data: [], error: null }),
        needs('members') ? supabase.from('profiles').select(memberDirectorySelect).eq('status', 'approved').order('full_name') : Promise.resolve({ data: [], error: null }),
        needs('startups') ? loadStartupDirectory(supabase) : Promise.resolve([]),
        semesterRead,
        needs('capabilities') ? loadAdminCapabilities(authSession?.access_token ?? null) : Promise.resolve({ canRemoveMemberLogin: false, isSuperAdmin: false }),
        tab === 'overview' ? semesterRead.then(result => {
          if (result.error) throw new Error(result.error.message)
          return loadAdminOverview(supabase, result.data?.id ?? null)
        }) : Promise.resolve(null),
      ])
      const loadError = usersRes.error ?? membersRes.error ?? semesterRes.error
      if (loadError) throw new Error(loadError.message)
      if (sequence !== loadSequence.current) return
      setOverview(summary)
      setPendingUsers((usersRes.data as PendingUser[]) ?? [])
      setCanRemoveMemberLogin(adminCapabilities.canRemoveMemberLogin)
      setIsSuperAdmin(adminCapabilities.isSuperAdmin)
      setCurrentAuthUserId(authSession?.user.id ?? null)
      type MemberRow = {
        id: string
        email: string
        full_name: string | null
        auth_user_id: string | null
        is_active: boolean
        created_at: string
        memberships: { id: string; role: string; status: string; semester_id: string; semester: { is_active: boolean } | null }[] | null
        platform_roles: { role: string }[] | null
      }
      type MemberLoginAuditRow = { subject_id: string | null; action: string; created_at: string }
      const memberRows = (membersRes.data ?? []) as unknown as MemberRow[]
      const memberProfileIds = memberRows.map(member => member.id)
      let accountAuditRows: MemberLoginAuditRow[] = []
      if (needs('member-audit') && memberProfileIds.length > 0) {
        const auditRes = await supabase
          .from('program_audit_events')
          .select('subject_id, action, created_at')
          .eq('subject_type', 'profile')
          .in('subject_id', memberProfileIds)
          .in('action', [...MEMBER_LOGIN_AUDIT_ACTIONS, 'member.personal_deletion_prepared', 'member.personal_deletion_completed'])
          .order('created_at', { ascending: false })
        if (auditRes.error) throw new Error(auditRes.error.message)
        accountAuditRows = (auditRes.data ?? []) as MemberLoginAuditRow[]
      }
      const latestAccountActionByProfile = new Map<string, Member['latest_removal_audit_action']>()
      for (const audit of accountAuditRows) {
        if (!audit.subject_id || latestAccountActionByProfile.has(audit.subject_id)) continue
        if (audit.action === 'member.login_removal_prepared' || audit.action === 'member.login_restored') {
          latestAccountActionByProfile.set(audit.subject_id, audit.action)
        }
      }
      if (sequence !== loadSequence.current) return
      setDeletionLockedIds(current => new Set([...current, ...accountAuditRows.filter(audit => audit.action === 'member.personal_deletion_prepared' || audit.action === 'member.personal_deletion_completed').flatMap(audit => audit.subject_id ? [audit.subject_id] : [])]))
      setMembers(memberRows.map((member) => {
        const membership = member.memberships?.find((item) => item.semester?.is_active) ?? member.memberships?.[0] ?? null
        return {
          id: member.id,
          email: member.email,
          full_name: member.full_name,
          auth_user_id: member.auth_user_id,
          profile_is_active: member.is_active,
          is_super_admin: member.platform_roles?.some((role) => role.role === 'super_admin') === true,
          membership_is_active: membership?.status === 'active',
          latest_removal_audit_action: latestAccountActionByProfile.get(member.id) ?? null,
          membership_id: membership?.id ?? null,
          role: membership?.role ?? 'startup',
          semester_id: membership?.semester_id ?? null,
          created_at: member.created_at,
        }
      }))
      setStartups((startupsRes as unknown as Startup[]).map((startup) => ({
        ...startup,
        founder_name: startup.founders[0]?.name ?? null,
      })))
      const semData = semesterRes.data as { id: string; name: string } | null
      const semId = semData?.id ?? null
      setActiveSemesterId(semId)
      setActiveSemesterName(semData?.name ?? null)
      setLoadedTab(tab)
      setLoading(false)
    } catch (cause) {
      if (sequence !== loadSequence.current) return
      throw cause
    }
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    void loadAll().catch((cause: unknown) => {
      if (!active) return
      setErrorTab(tab)
      setLoadError(cause instanceof Error ? cause.message : 'Unable to load admin workspace.')
      setLoading(false)
    })
    return () => { active = false; loadSequence.current += 1 }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pending users ──────────────────────────────────────────────────────────

  async function approveUser(userId: string) {
    const role = roleSelections[userId]
    if (!role) return alert('Select a role first.')
    setApproving(userId)
    const pendingUser = pendingUsers.find(u => u.id === userId)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (token) {
      await adminFetch('/api/admin/users/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId,
          role,
          fullName: pendingUser?.full_name ?? '',
          email: pendingUser?.email ?? '',
        }),
      })
    } else alert('Your session expired. Sign in again to approve this user.')
    setPendingUsers(prev => prev.filter(u => u.id !== userId))
    setApproving(null)
  }

  async function rejectUser(userId: string) {
    if (!confirm('Reject this user?')) return
    const { data: { session } } = await supabase.auth.getSession()
    const response = await adminFetch('/api/admin/users/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ userId }),
    })
    if (!response.ok) {
      const payload = await response.json() as { error?: string }
      alert(payload.error ?? 'Unable to reject user.')
      return
    }
    setPendingUsers(prev => prev.filter(u => u.id !== userId))
  }

  // ── Members ───────────────────────────────────────────────────────────────

  async function persistMemberActivity(
    membershipId: string | null,
    semesterId: string | null,
    current: boolean,
  ): Promise<void> {
    if (!membershipId || !semesterId) {
      throw new Error('This person has no semester membership to update.')
    }
    const { data: { session } } = await supabase.auth.getSession()
    const response = await adminFetch('/api/admin/lifecycle/memberships/activity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ semesterId, membershipIds: [membershipId], activity: current ? 'inactive' : 'active' }),
    })
    if (!response.ok) {
      const payload = await response.json() as { error?: string }
      throw new Error(payload.error ?? 'Unable to update semester membership.')
    }
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

    const res = await adminFetch('/api/admin/users/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: addEmail, fullName: addName, role: addRole, restoreAccess }),
    })
    const json = await res.json()

    if (!res.ok) {
      setAddError(json.error ?? 'Something went wrong.')
      setRestoreRequired(json.restoreRequired === true)
    } else {
      setAddSuccess(json.alreadyAdded ? `${addEmail} already has access in this cohort.` : `Access added for ${addEmail}. They can begin setup from the sign-in page.${json.notification === 'accepted' ? ' Welcome email submitted.' : ' Welcome email was not confirmed; their access is saved.'}`)
      setRestoreRequired(false); setRestoreAccess(false)
      setAddName('')
      setAddEmail('')
      setAddRole('')
      await loadAll()
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
    if (!cohort.semesterId) {
      setEditError('Choose a specific semester before editing a member role.')
      return
    }
    setEditLoading(true)
    setEditError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setEditError('Not authenticated.')
      setEditLoading(false)
      return
    }

    const res = await adminFetch('/api/admin/users/update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId: editingMember.id,
        semesterId: cohort.semesterId,
        fullName: editName,
        email: editEmail,
        role: editRole,
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setEditError(json.error ?? 'Something went wrong.')
    } else {
      setMembers(prev => prev.map(m => m.id === editingMember.id
        ? { ...m, full_name: editName, email: editEmail, role: cohort.semesterId === activeSemesterId ? editRole : m.role }
        : m))
      await cohort.reload()
      setEditingMember(null)
    }
    setEditLoading(false)
  }

  async function createStartup(e: React.FormEvent) {
    e.preventDefault()
    if (!cohort.semesterId || !lifecycleMutationEnabled) {
      setCsError('Choose the current cohort before creating a startup.')
      return
    }
    setCsLoading(true)
    setCsError(null)
    setCsSuccess(null)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setCsError('Not authenticated.'); setCsLoading(false); return }

    const slug = csName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    const res = await adminFetch('/api/admin/startups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: csName.trim(),
        slug: csSlug.trim() || slug,
        industry: csIndustry.trim(),
        stage: csStage,
        description: csDescription.trim(),
        semesterId: cohort.semesterId,
      }),
    })
    const json = await res.json()

    if (!res.ok) {
      setCsError(json.error ?? 'Something went wrong.')
    } else {
      setCsSuccess(`Startup "${csName.trim()}" created.`)
      setCsName(''); setCsSlug(''); setCsIndustry(''); setCsStage(''); setCsDescription('')
      await refreshStartups()
    }
    setCsLoading(false)
  }

  async function deleteStartup(startup: Startup) {
    const confirmationName = window.prompt(`This permanently deletes ${startup.name} from every cohort, including its sessions. Type the startup name to confirm.`)
    if (confirmationName === null) return
    setDeletingStartupId(startup.id)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setDeletingStartupId(null); return }
    const response = await adminFetch(`/api/admin/startups/${encodeURIComponent(startup.organization_id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ startupOrganizationId: startup.organization_id, confirmationName }),
    })
    if (!response.ok) {
      const payload = await response.json() as { error?: string }
      alert(payload.error ?? 'Unable to delete startup.')
    } else {
      await refreshStartups()
    }
    setDeletingStartupId(null)
  }

  async function assignFounder(userId: string) {
    const startupId = founderTargetStartup[userId]
    if (!startupId) return
    setAssigningFounder(userId)
    setAssignFounderError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setAssignFounderError('Not authenticated.'); setAssigningFounder(null); return }

    const res = await adminFetch('/api/admin/startups/assign-founder', {
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
    const data = await loadStartupDirectory(supabase)
    setStartups((data as unknown as Startup[]).map((startup) => ({
      ...startup,
      founder_name: startup.founders[0]?.name ?? null,
    })))
  }

  async function removeFounder(email: string, startupId: string) {
    const key = `${startupId}:${email}`
    setFounderActionKey(key)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setFounderActionKey(null); return }

    await adminFetch('/api/admin/startups/remove-founder', {
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

    await adminFetch('/api/admin/startups/move-founder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, fromStartupId, toStartupId }),
    })
    await refreshStartups()
    setFounderActionKey(null)
  }

  // ── Startups filter state ────────────────────────────────────────────────────
  const [startupSearch, setStartupSearch] = useState('')

  // ── Startup-role members not yet linked to any startup (email not in any founders array)

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
  const cohort = useCohortScreen(memberReferences, 'all', searchParams.get('semester') ?? undefined, tab !== 'overview' && tab !== 'friday-program')
  const setCohortSelected = cohort.setSelected
  const memberParam = searchParams.get('member')

  useEffect(() => {
    const deepLinkState = memberDeepLinkState(memberParam)
    if (deepLinkState === null) return
    setMemberSearch(deepLinkState.search)
    setMemberVisibility(deepLinkState.visibility)
    setCohortSelected(deepLinkState.selectedMembershipIds)
  }, [memberParam, setCohortSelected])

  const selectedCohortMembers = cohort.semesterId === null
    ? []
    : cohort.members.filter(member => member.semesterId === cohort.semesterId)
  const scopedCohortMembers = cohort.semesterId === null ? cohort.members : selectedCohortMembers
  const cohortStartups = filterSemesterRecords(startups, cohort.semesterId)
  const linkedFounderEmails = new Set(
    cohortStartups.flatMap(startup => (startup.founders ?? []).map(founder => founder.email).filter((email): email is string => Boolean(email))),
  )
  const startupProfileIds = new Set(
    scopedCohortMembers.filter(member => member.role === 'startup').map(member => member.profileId),
  )
  const pendingStartupUsers = members.filter(
    member => startupProfileIds.has(member.id) && !linkedFounderEmails.has(member.email),
  )
  const lifecycleMutationEnabled = cohort.semesterId !== null && cohort.semesterId === cohort.cohorts.current?.id
  const activationMutationEnabled = cohort.cohorts.current !== null
  const activationWorkspace = activationWorkspaceState(cohort.currentMembers, cohort.cohorts.current?.id ?? null, pendingUsers.length)
  const readyMembers = activationWorkspace.readyMembers

  const membershipRefreshes = () => [loadAll, cohort.reload, cohort.reloadCurrent] as const

  async function refreshMemberLoginReadModels() {
    const refreshed = await refreshMembershipReadModels(membershipRefreshes())
    if (!refreshed) throw new Error('Member account updated, but related workspace data could not refresh.')
  }

  async function applyMembershipActivity(
    memberId: string,
    membershipId: string | null,
    semesterId: string | null,
    current: boolean,
    onFailure?: (message: string) => void,
  ): Promise<boolean> {
    setTogglingActive(memberId)
    const outcome = await persistAndRefreshMembership({
      persist: () => persistMemberActivity(membershipId, semesterId, current),
      refreshes: membershipRefreshes(),
    })
    setTogglingActive(null)

    if (outcome.status === 'mutation_failed') {
      if (onFailure) onFailure(outcome.message)
      else alert(outcome.message)
      return false
    }
    setActivationError(null)
    if (outcome.status === 'updated_refresh_failed') {
      setMembershipRefreshFeedback('Membership updated; refresh failed.')
      setMembershipRefreshRetryRequired(true)
    } else {
      setMembershipRefreshFeedback(null)
      setMembershipRefreshRetryRequired(false)
    }
    return true
  }

  async function retryMembershipRefresh() {
    setMembershipRefreshRetrying(true)
    const refreshed = await refreshMembershipReadModels(membershipRefreshes())
    setMembershipRefreshFeedback(refreshed ? 'Membership data refreshed.' : 'Membership updated; refresh failed.')
    setMembershipRefreshRetryRequired(!refreshed)
    setMembershipRefreshRetrying(false)
  }

  async function activateReadyMember(member: (typeof readyMembers)[number]) {
    if (!activationMutationEnabled || member.semesterId !== cohort.cohorts.current?.id) return
    setActivationError(null)
    await applyMembershipActivity(
      member.profileId,
      member.membershipId,
      member.semesterId,
      false,
      setActivationError,
    )
  }

  const filteredMembers = filterMembershipsByVisibility(scopedCohortMembers, memberVisibility)
    .flatMap(membership => {
      const member = members.find(profile => profile.id === membership.profileId)
      return member ? [{
        ...member,
        role: membership.role,
        membership_is_active: membership.status === 'active',
        membership_id: membership.membershipId,
        semester_id: membership.semesterId,
        membership,
        presentation: membershipPresentation(membership),
        accountPresentation: memberLoginPresentation({
          authUserId: member.auth_user_id,
          latestRemovalAuditAction: member.latest_removal_audit_action,
          profileActive: member.profile_is_active,
        }),
      }] : []
    })
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

  const lifecycleToneClasses = {
    neutral: 'bg-gray-100 text-gray-700',
    progress: 'bg-blue-50 text-blue-700',
    attention: 'bg-amber-50 text-amber-800',
    success: 'bg-green-50 text-green-700',
    historical: 'bg-slate-100 text-slate-700',
    danger: 'bg-red-50 text-red-700',
  } as const

  async function applyMemberLifecycleAction(member: (typeof filteredMembers)[number]) {
    if (!lifecycleMutationEnabled || member.presentation.action === null) return
    const memberName = member.full_name ?? member.email
    if (member.presentation.action === 'suspend' && !window.confirm('Suspend ' + memberName + '? They will no longer have active program access.')) return

    await applyMembershipActivity(
      member.id,
      member.membership.membershipId,
      member.membership.semesterId,
      member.presentation.action === 'suspend',
    )
  }

  async function updatePlatformAccess(member: (typeof filteredMembers)[number], enabled: boolean) {
    if (!isSuperAdmin || platformAccessUpdatingProfileId !== null) return
    const name = member.full_name ?? member.email
    const action = enabled ? 'grant Super Admin access to' : 'revoke Super Admin access from'
    if (!window.confirm(`Are you sure you want to ${action} ${name}?`)) return

    setPlatformAccessUpdatingProfileId(member.id)
    setEditError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await adminFetch('/api/admin/platform-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ profileId: member.id, enabled }),
      })
      const payload = await response.json() as { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Unable to change platform access.')
      await loadAll()
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Unable to change platform access.')
    } finally {
      setPlatformAccessUpdatingProfileId(null)
    }
  }

  // ── Schedule ───────────────────────────────────────────────────────────────

  function SortIcon({ field }: { field: MemberSortKey }) {
    if (memberSortKey !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-[#002147] ml-1">{memberSortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-50 text-purple-700',
    mentor: 'bg-blue-50 text-blue-700',
    startup: 'bg-green-50 text-green-700',
  }

  if (modulePending) return <DataLoading label="Loading admin workspace..." />
  if (loadError && errorTab === tab) return <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{loadError} <button type="button" className="underline" onClick={() => { setLoading(true); void loadAll().catch((cause: unknown) => { setLoadError(cause instanceof Error ? cause.message : 'Unable to load admin workspace.'); setLoading(false) }) }}>Try again</button></div>
  if (loading || loadedTab !== tab) return <DataLoading label="Loading admin workspace…" />
  if (tab !== 'overview' && tab !== 'friday-program') {
    if (cohort.loadError) return <div className="max-w-5xl"><CohortScreenControls controller={cohort} visibleRecords={[]} /></div>
    if (!cohort.ready || cohort.loading) return <DataLoading label="Loading cohort data…" />
  }

  return (
    <div className="max-w-5xl">
      {tab === 'overview' && !loading && !loadError && !activeSemesterId && <p role="status">No active semester is configured.</p>}
      {tab === 'overview' && overview && !loading && !loadError && activeSemesterId && <>
      <div className="rounded-2xl bg-[#002147] text-white p-6 md:p-7 mb-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#9ac7e2] font-semibold">Program operations</p>
            <div className="flex items-center gap-3 mt-2">
              <h1 className="text-2xl md:text-3xl font-semibold">{activeSemesterName ?? 'Almaworks program'}</h1>
              <span className="rounded-full border border-white/20 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white/70">Active semester</span>
            </div>
            <p className="text-sm text-white/65 mt-2">The operational signals that need attention right now.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab('friday-program')} className="rounded-lg border border-white/25 px-3 py-2 text-xs font-medium text-white/85 hover:bg-white/10">Manage Friday program</button>
            {isSuperAdmin && <button onClick={() => setTab('access')} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#002147] hover:bg-[#e7f2f9]">Review access{pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ''}</button>}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-6">
          {[
            { label: 'Startups', value: overview?.startups ?? 0, note: 'Signed up for mentorship' },
            { label: 'Mentors', value: (overview?.mentors ?? 0), note: 'Available this semester' },
            { label: 'Open needs', value: (overview?.openNeeds ?? 0), note: 'Startups requesting guidance' },
            { label: 'Friday sessions', value: (overview?.confirmedSessions ?? 0), note: `${(overview?.unconfirmedSessions ?? 0)} awaiting confirmation` },
            { label: 'Mentorship bookings', value: (overview?.acceptedMentorshipBookings ?? 0), note: `${(overview?.pendingMentorshipBookings ?? 0)} pending` },
          ].map(metric => (
            <div key={metric.label} className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-3">
              <p className="text-[11px] uppercase tracking-wider text-white/55">{metric.label}</p>
              <strong className="block text-2xl mt-1">{metric.value}</strong>
              <span className="text-[11px] text-white/55">{metric.note}</span>
            </div>
          ))}
        </div>
      </div>
      </>}

      {tab !== 'overview' && tab !== 'friday-program' && <CohortScreenControls controller={cohort} visibleRecords={filteredMembers.map(member => ({ recordId: member.id, profileId: member.id, email: member.email }))} />}
      {completedDeletionId && <div ref={deletionNotice} tabIndex={-1} role="status" className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">Account and personal data deleted. Historical activity has been anonymized.</div>}
      {membershipRefreshFeedback && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>{membershipRefreshFeedback}</span>
          {membershipRefreshRetryRequired && (
            <button
              type="button"
              disabled={membershipRefreshRetrying}
              onClick={() => void retryMembershipRefresh()}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >{membershipRefreshRetrying ? 'Refreshing...' : 'Retry refresh'}</button>
          )}
        </div>
      )}

      {tab === 'overview' && overview && !loading && !loadError && activeSemesterId && <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4 mb-6" aria-label="Operational signals">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div><p className="text-[10px] uppercase tracking-[0.18em] text-[#75AADB] font-semibold">Mentorship health</p><h2 className="text-base font-semibold text-[#002147] mt-1">Where support is needed</h2></div>
            <Link href="/dashboard/admin/mentor-needs" className="text-xs font-semibold text-[#0066a1] hover:underline">Review needs</Link>
          </div>
          <div className="space-y-2 text-sm">
            {[{ label: 'Startups with identified needs', value: (overview?.openNeeds ?? 0), tab: 'startups' as Tab }, { label: 'Available mentors', value: (overview?.mentors ?? 0), tab: 'members' as Tab }, { label: 'Friday sessions awaiting confirmation', value: (overview?.unconfirmedSessions ?? 0), tab: 'friday-program' as Tab }].map(item => (
              <button key={item.label} onClick={() => setTab(item.tab)} className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50">
                <span className="flex-1 font-medium text-[#002147]">{item.label}</span><span className="rounded-full bg-[#e7f2f9] px-2 py-0.5 text-xs font-semibold text-[#0066a1]">{item.value}</span>
              </button>
            ))}
            <Link href="/dashboard/bookings" className="w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50">
              <span className="flex-1 font-medium text-[#002147]">Mentorship bookings pending</span><span className="rounded-full bg-[#e7f2f9] px-2 py-0.5 text-xs font-semibold text-[#0066a1]">{overview?.pendingMentorshipBookings ?? 0}</span>
            </Link>
          </div>
        </section>
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#75AADB] font-semibold">Quick actions</p>
          <h2 className="text-base font-semibold text-[#002147] mt-1 mb-4">What needs your attention</h2>
          <div className="space-y-2">
            {isSuperAdmin && <button onClick={() => setTab('access')} className="w-full flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 text-left hover:border-[#75AADB]/50"><span><strong className="block text-sm text-[#002147]">Review access queue</strong><small className="text-xs text-gray-400">Review registrations and activation</small></span><span className="text-[#75AADB]">→</span></button>}
            <button onClick={() => setTab('friday-program')} className="w-full flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 text-left hover:border-[#75AADB]/50"><span><strong className="block text-sm text-[#002147]">Manage Friday Program</strong><small className="text-xs text-gray-400">Plan speaker and startup-group rotations</small></span><span className="text-[#75AADB]">→</span></button>
            <Link href="/dashboard/admin/outreach" className="w-full flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5 text-left hover:border-[#75AADB]/50"><span><strong className="block text-sm text-[#002147]">Open outreach queue</strong><small className="text-xs text-gray-400">Follow up with prospective members</small></span><span className="text-[#75AADB]">→</span></Link>
          </div>
        </section>
      </div>}

      {/* ── Pending Users ── */}
      {tab === 'access' && (
        <div className="space-y-8">
          <section>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-[#002147]">Ready for activation</h3>
              <p className="mt-1 text-sm text-gray-500">People who completed onboarding in the selected cohort can now access the program.</p>
            </div>
            {activationError && <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{activationError}</p>}
            {readyMembers.length > 0 && (
              <div className="space-y-3">
                {readyMembers.map(member => (
                  <div key={member.membershipId} className="flex flex-col gap-4 rounded-xl border border-amber-200 bg-amber-50/40 px-5 py-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#002147]">{member.name}</p>
                      <p className="truncate text-xs text-gray-500">{member.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2.5 py-1 font-semibold capitalize ${roleColors[member.role] ?? 'bg-gray-100 text-gray-600'}`}>{member.role}</span>
                      <span className="rounded-full bg-white px-2.5 py-1 font-medium text-gray-600 ring-1 ring-gray-200">{member.semesterName}</span>
                    </div>
                    <button
                      onClick={() => void activateReadyMember(member)}
                      disabled={togglingActive === member.profileId || !activationMutationEnabled || member.semesterId !== cohort.cohorts.current?.id}
                      className="shrink-0 rounded-lg bg-[#002147] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#002147]/90 disabled:opacity-50"
                    >
                      {togglingActive === member.profileId ? 'Activating…' : 'Activate'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-[#002147]">Registration requests</h3>
              <p className="mt-1 text-sm text-gray-500">Approve new registrations and assign their role before they can access the platform.</p>
            </div>
          <p className="text-sm text-gray-500 mb-4">
            Pending profiles are kept here until you approve or reject them.
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
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      value={roleSelections[u.id] ?? ''}
                      onChange={e => setRoleSelections(prev => ({ ...prev, [u.id]: e.target.value }))}
                      disabled={cohort.scope === 'all' || deletionLockedIds.has(u.id)}
                      className="text-sm text-gray-800 border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select role…</option>
                      <option value="mentor">Mentor</option>
                      <option value="startup">Startup</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      onClick={() => approveUser(u.id)}
                      disabled={approving === u.id || !roleSelections[u.id] || cohort.scope === 'all' || deletionLockedIds.has(u.id)}
                      className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    >
                      {approving === u.id ? '…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => rejectUser(u.id)}
                      disabled={cohort.scope === 'all' || deletionLockedIds.has(u.id)}
                      className="px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reject
                    </button>
                    {isSuperAdmin && u.id !== currentAuthUserId && <MemberDeletionControl
                      profileId={u.id}
                      onLocked={() => { setCompletedDeletionId(null); setDeletionLockedIds(current => new Set(current).add(u.id)) }}
                      onReady={() => setDeletionLockedIds(current => { const next = new Set(current); next.delete(u.id); return next })}
                      onCompleted={() => { setCompletedDeletionId(u.id); setPendingUsers(current => current.filter(profile => profile.id !== u.id)) }}
                      onChanged={refreshMemberLoginReadModels}
                    />}
                  </div>
                </div>
              ))}
            </div>
          )}
          </section>
          {readyMembers.length === 0 && pendingUsers.length === 0 && (
            <p className="text-sm text-gray-400">Everyone is up to date.</p>
          )}
        </div>
      )}

      {/* ── Members ── */}
      {tab === 'members' && (
        <div>
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              Manage membership access for the selected cohort.
            </p>
            <button
              onClick={() => { setShowAddUser(v => !v); setAddError(null); setAddSuccess(null); setRestoreRequired(false); setRestoreAccess(false) }}
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
                    onChange={e => { setAddEmail(e.target.value); setRestoreRequired(false); setRestoreAccess(false); setAddError('') }}
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
              {restoreRequired && <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={restoreAccess} onChange={event => setRestoreAccess(event.target.checked)} />Restore this account’s access and add the selected role</label>}
              {addSuccess && <p className="text-xs text-green-600">{addSuccess}</p>}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-2 bg-[#002147] text-white text-sm font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-60 transition-colors"
                >
                  {addLoading ? 'Adding member…' : restoreRequired ? 'Restore and add member' : 'Add member'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddUser(false); setAddError(null); setAddSuccess(null); setRestoreRequired(false); setRestoreAccess(false) }}
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
              <MembershipVisibilitySwitch value={memberVisibility} onChange={setMemberVisibility} />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            {filteredMembers.length === 0 ? (
              <p className="text-sm text-gray-400 p-6">No users found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[10rem]" />
                    <col className="w-[15rem]" />
                    <col className="w-[10.5rem]" />
                    <col className="w-[8.5rem]" />
                    <col className="w-[8.5rem]" />
                    <col className="w-[14rem]" />
                    <col className="w-[11rem]" />
                  </colgroup>
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
                        onClick={() => handleMemberSort('membership_is_active')}
                      >
                        Status <SortIcon field="membership_is_active" />
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        Semesters
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        Account
                      </th>
                      <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      function getMemberSemesters(member: Member) {
                        return [...new Set(
                          cohort.members
                            .filter(membership => membership.profileId === member.id)
                            .map(membership => membership.semesterName),
                        )].sort().reverse()
                      }

                      return filteredMembers.flatMap(m => {
                        const memberSemesters = getMemberSemesters(m)
                        const deletionLocked = deletionLockedIds.has(m.id)
                        const isEditing = editingMember?.id === m.id && !deletionLocked
                        const rows = [
                          <tr key={m.membership.membershipId} className={`transition-colors ${isEditing ? 'bg-[#002147]/3' : 'hover:bg-gray-50/60 border-b border-gray-50'}`}>
                            <td className="px-5 py-3.5 font-medium text-[#002147] truncate" title={m.full_name ?? undefined}>
                              {m.full_name ?? <span className="text-gray-400 font-normal">—</span>}
                            </td>
                            <td className="px-5 py-3.5 text-gray-500 truncate" title={m.email}>{m.email}</td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${m.is_super_admin ? 'bg-[#002147] text-white ring-1 ring-[#002147]/15' : `capitalize ${roleColors[m.role] ?? 'bg-gray-100 text-gray-600'}`}`} title={m.is_super_admin ? 'Platform-wide Super Admin access' : undefined}>
                                {m.is_super_admin && <ShieldCheck size={13} aria-hidden="true" />}
                                {m.is_super_admin ? 'Super Admin' : m.role}
                              </span>
                            </td>
                           <td className="px-5 py-3.5 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${lifecycleToneClasses[m.presentation.tone]}`}>
                                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                                {m.presentation.label}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              {memberSemesters.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {memberSemesters.map(semesterName => (
                                    <span key={semesterName}
                                      className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#002147]/8 text-[#002147] whitespace-nowrap">
                                      {semesterName}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 whitespace-nowrap">
                              {!deletionLocked && <MemberLoginAccountControl
                                profileId={m.id}
                                name={m.full_name ?? m.email}
                                email={m.email}
                                authUserId={m.auth_user_id}
                                profileActive={m.profile_is_active}
                                canRemoveMemberLogin={canRemoveMemberLogin}
                                accountPresentation={m.accountPresentation}
                                onChanged={refreshMemberLoginReadModels}
                              />}
                              {deletionLocked && <span className="text-xs text-gray-500">Deletion requires review · account changes locked</span>}
                              {isSuperAdmin && !m.is_super_admin && m.role !== 'admin' && m.auth_user_id !== currentAuthUserId && (
                                <MemberDeletionControl
                                  key={m.id}
                                  profileId={m.id}
                                  onLocked={() => { setCompletedDeletionId(null); setDeletionLockedIds(current => new Set(current).add(m.id)) }}
                                  onReady={() => setDeletionLockedIds(current => { const next = new Set(current); next.delete(m.id); return next })}
                                  onCompleted={() => setCompletedDeletionId(m.id)}
                                  onChanged={refreshMemberLoginReadModels}
                                />
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => isEditing ? cancelEdit() : openEdit(m)}
                                  disabled={!lifecycleMutationEnabled || deletionLocked}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                    isEditing
                                      ? 'bg-[#002147] text-white border-[#002147]'
                                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'
                                  }`}
                                >
                                  {isEditing ? 'Cancel' : 'Edit'}
                                </button>
                                {m.presentation.action !== null && (
                                <button
                                  onClick={() => void applyMemberLifecycleAction(m)}
                                  disabled={togglingActive === m.id || !lifecycleMutationEnabled || deletionLocked}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${m.presentation.action === 'suspend' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}
                                >
                                  {togglingActive === m.id ? '…' : m.presentation.action === 'activate' ? 'Activate' : m.presentation.action === 'suspend' ? 'Suspend' : 'Restore to active'}
                                </button>
                                )}
                              </div>
                            </td>
                          </tr>,
                        ]
                        if (isEditing) {
                          rows.push(
                            <tr key={`${m.membership.membershipId}-edit`} className="bg-gray-50/80 border-b border-gray-100">
                              <td colSpan={7} className="px-5 py-4">
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
                                  {isSuperAdmin && (
                                    <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs font-semibold text-[#002147]">Platform access</p>
                                          <p className="mt-1 text-xs text-gray-600">
                                            {m.role === 'admin' && m.membership_is_active
                                              ? m.is_super_admin
                                                ? 'This active Admin has Super Admin access.'
                                                : 'This active Admin can be granted Super Admin access.'
                                              : 'Only active Admin members are eligible for Super Admin access.'}
                                          </p>
                                        </div>
                                        {m.role === 'admin' && m.membership_is_active && m.auth_user_id !== currentAuthUserId && (
                                          <button
                                            type="button"
                                            onClick={() => void updatePlatformAccess(m, !m.is_super_admin)}
                                            disabled={platformAccessUpdatingProfileId !== null}
                                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${m.is_super_admin ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-[#002147] text-[#002147] hover:bg-[#002147]/5'}`}
                                          >
                                            {platformAccessUpdatingProfileId === m.id
                                              ? 'Updating…'
                                              : m.is_super_admin ? 'Revoke Super Admin' : 'Grant Super Admin'}
                                          </button>
                                        )}
                                        {m.auth_user_id === currentAuthUserId && (
                                          <p className="text-xs text-gray-500">You cannot change your own Super Admin access.</p>
                                        )}
                                      </div>
                                    </section>
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
      {tab === 'friday-program' && (
        <FridayProgramPanel semesterId={activeSemesterId} canGenerate heading="Friday program groups" />
      )}

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
                              {cohortStartups.map(s => (
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
                <p className="text-xs text-gray-500 mt-0.5">{cohortStartups.length} startup{cohortStartups.length !== 1 ? 's' : ''} registered in the selected cohort.</p>
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
                    <StartupStagePicker value={csStage} onChange={setCsStage} />
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
                  <button type="submit" disabled={csLoading || !lifecycleMutationEnabled}
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

            {/* Search */}
            {cohortStartups.length > 0 && (
              <div className="mb-4">
                <input
                  type="search"
                  placeholder="Search startups…"
                  value={startupSearch}
                  onChange={e => setStartupSearch(e.target.value)}
                  className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 border border-gray-300 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"
                />
              </div>
            )}

            {(() => {
              const q = startupSearch.trim().toLowerCase()
              const filteredStartups = cohortStartups.filter(s => {
                if (!q) return true
                return [s.name, s.industry ?? '', s.stage ?? '', s.description ?? ''].join(' ').toLowerCase().includes(q)
              })
              return filteredStartups.length === 0 ? (
              <p className="text-sm text-gray-400">{cohortStartups.length === 0 ? 'No startups in the selected cohort yet.' : 'No startups match the current search.'}</p>
            ) : (
              <div className="space-y-3">
                {filteredStartups.map(s => {
                  const presentation = membershipPresentation({ status: s.membership_status, readinessStatus: s.readiness_status })
                  return (
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
                          {isSuperAdmin && <button
                            onClick={() => void deleteStartup(s)}
                            disabled={deletingStartupId === s.id}
                            className="text-[10px] font-medium text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-2 py-0.5 rounded-full transition-colors disabled:opacity-50"
                          >
                            {deletingStartupId === s.id ? 'Deleting…' : 'Delete permanently'}
                          </button>}
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${lifecycleToneClasses[presentation.tone]}`}>
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                            {presentation.label}
                          </span>
                          {s.membership_email && <Link href={adminMemberHref(s.membership_email, s.semester_id)} className="text-[10px] font-medium text-[#002147] underline-offset-2 hover:underline">Manage lifecycle</Link>}
                          {s.semester_name && (
                            <span className="text-[10px] font-semibold bg-[#75AADB]/20 text-[#002147] px-1.5 py-0.5 rounded-full">{s.semester_name}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{[s.industry, s.stage && formatEnumLabel(s.stage)].filter(Boolean).join(' · ')}</p>
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
                                    {cohortStartups.filter(os => os.id !== s.id).map(os => (
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
                )})}
              </div>
            )
            })()}
          </div>
        </div>
      )}

      <StartupModal startupId={selectedStartupId} onClose={() => setSelectedStartupId(null)} />

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
                    <StartupStagePicker value={esStage} onChange={setEsStage} />
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

    </div>
  )
}

export default function AdminDashboard() {
  return (
    <Suspense fallback={<DataLoading label="Loading admin workspace…" />}>
      <AdminDashboardContent />
    </Suspense>
  )
}
