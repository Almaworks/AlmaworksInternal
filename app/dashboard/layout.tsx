'use client'

import { createClient } from '@/utils/supabase/client'
import { AlmaworksBrand } from '@/components/AlmaworksBrand'
import { AdminViewAsControl } from '@/components/AdminViewAsControl'
import { AdminViewTransitionShell } from '@/components/AdminViewTransitionShell'
import Link from 'next/link'
import { DataLoading } from '@/components/DataLoading'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState, useTransition } from 'react'
import { Bell, BookOpen, Building2, CalendarCheck, CalendarDays, CalendarPlus, CalendarRange, Download, ChevronLeft, ChevronRight, House, Inbox, KeyRound, LayoutDashboard, LogOut, Menu, Megaphone, Network, Settings, Target, UserRound, Users, X } from 'lucide-react'
import { isDashboardNavigationActive } from '@/src/assignments/schedule-navigation'
import { resolveDashboardPersona } from '@/src/auth/admin-capability'
import { authenticatedFetch } from '@/src/auth/authenticated-fetch'
import { loadCanonicalAccess } from '@/src/program/canonical-access'
import { adminViewDestination, resolveAdminViewTransition, shouldShowAdminViewLoading, type AdminView } from '@/src/dashboard/participant-preview'

type Profile = {
  full_name: string | null
  email: string
  role: 'mentor' | 'startup' | 'admin' | null
}

const SIDEBAR_STORAGE_KEY = 'almaworks-dashboard-sidebar-collapsed'

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // These pages own their shell and authenticated data loader. Avoid mounting
  // an invisible second shell and repeating its identity/capability requests.
  if (pathname === '/dashboard/onboarding' || pathname === '/dashboard/mentor' || pathname === '/dashboard/startup' || pathname.startsWith('/dashboard/admin/preview/')) return <>{children}</>
  return <DashboardShell>{children}</DashboardShell>
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigationPending, startNavigationTransition] = useTransition()
  const [navigationLabel, setNavigationLabel] = useState('workspace')
  const [navigationReady, setNavigationReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [canManageAdmin, setCanManageAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [pendingView, setPendingView] = useState<AdminView | null>(null)
  const [isViewTransitionPending, startViewTransition] = useTransition()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [sidebarPreferenceLoaded, setSidebarPreferenceLoaded] = useState(false)

  useEffect(() => {
    const preference = window.setTimeout(() => {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true')
      setSidebarPreferenceLoaded(true)
    }, 0)
    return () => window.clearTimeout(preference)
  }, [])

  useEffect(() => {
    if (!sidebarPreferenceLoaded) return
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed, sidebarPreferenceLoaded])

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(async ({ data: { user }, error }) => {
      if (!active) return
      if (error || !user) {
        await supabase.auth.signOut({ scope: 'local' })
        if (active) router.replace('/')
        return
      }
      let access
      let capabilityResponse: Response | null
      try {
        ;[access, capabilityResponse] = await Promise.all([
          loadCanonicalAccess(supabase, user.id),
          authenticatedFetch('/api/auth/capabilities').catch(() => null),
        ])
      } catch {
        if (active) router.replace('/?error=identity_lookup_failed')
        return
      }
      if (!active) return
      if (!access) {
        router.replace('/?error=identity_link_missing')
        return
      }
      if (access.is_active === false) {
        await supabase.auth.signOut()
        if (active) window.location.href = '/?error=account_inactive'
        return
      }
      try {
        const payload: unknown = await capabilityResponse?.json().catch(() => null)
        if (!active) return
        const canManage = capabilityResponse?.ok === true
          && typeof payload === 'object'
          && payload !== null
          && 'data' in payload
          && typeof payload.data === 'object'
          && payload.data !== null
          && 'canManageAdmin' in payload.data
          && payload.data.canManageAdmin === true
        setCanManageAdmin(canManage)
        setIsSuperAdmin(canManage && typeof payload === 'object' && payload !== null && 'data' in payload && typeof payload.data === 'object' && payload.data !== null && 'isSuperAdmin' in payload.data && payload.data.isSuperAdmin === true)
      } catch {
        setCanManageAdmin(false)
        setIsSuperAdmin(false)
      }
      setProfile({ email: access.email, full_name: access.full_name, role: access.role })
      setNavigationReady(true)
    }).catch(() => {
      if (active) router.replace('/?error=identity_lookup_failed')
    })
    return () => { active = false }
  }, [router, supabase])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const viewTransition = resolveAdminViewTransition(pathname, pendingView, isViewTransitionPending)
  const effectiveRole = resolveDashboardPersona(profile?.role ?? null, canManageAdmin, viewTransition.sidebarView)

  const navItems =
    effectiveRole === 'admin'
      ? [
          { href: '/dashboard/admin', label: 'Overview' },
          ...(isSuperAdmin ? [{ href: '/dashboard/admin/access', label: 'Access' }] : []),
          { href: '/dashboard/admin/members', label: 'Members' },
          { href: '/dashboard/admin/startups', label: 'Startups' },
          { href: '/dashboard/admin/friday-program', label: 'Friday Program' },
          { href: '/dashboard/bookings', label: 'Bookings' },
          ...(isSuperAdmin ? [{ href: '/dashboard/admin/semesters', label: 'Semesters' }] : []),
          { href: '/dashboard/admin/outreach', label: 'Outreach' },
          { href: '/dashboard/admin/mentor-needs', label: 'Mentor Needs' },
          { href: '/dashboard/admin/mentors', label: 'Mentors' },
          { href: '/dashboard/admin/notify', label: 'Notify' },
          { href: '/dashboard/admin/export', label: 'Export' },
          { href: '/dashboard/resources', label: 'Resources' },
        ]
      : effectiveRole === 'mentor'
      ? [
          { href: '/dashboard/mentor', label: 'My Schedule' },
          { href: '/dashboard/mentor/inbox', label: 'Inbox' },
          { href: '/dashboard/mentor?tab=bookings', label: 'Bookings' },
          { href: '/dashboard/mentors', label: 'Mentor Directory' },
        ]
      : effectiveRole === 'startup'
      ? [
          { href: '/dashboard/startup', label: 'Dashboard' },
          { href: '/dashboard/mentors', label: 'Mentors' },
          { href: '/dashboard/startup?tab=bookings', label: 'Bookings' },
        ]
      : []

  const navIcons = {
    Overview: LayoutDashboard,
    Access: KeyRound,
    Members: Users,
    Startups: Building2,
    'Friday Program': CalendarCheck,
    Bookings: CalendarPlus,
    Semesters: CalendarRange,
    Outreach: Megaphone,
    'Mentor Needs': Target,
    Mentors: UserRound,
    Notify: Bell,
    Export: Download,
    Resources: BookOpen,
    'My Schedule': CalendarDays,
    Inbox: Inbox,
    'Mentor Directory': Network,
    Dashboard: House,
  } as const

  const roleLabel =
    effectiveRole === 'admin' ? 'Admin' :
    effectiveRole === 'mentor' ? 'Mentor' :
    effectiveRole === 'startup' ? 'Startup' : ''

  function handleViewChange(next: AdminView) {
    if (!shouldShowAdminViewLoading(pathname, next)) return
    setPendingView(next)
    startViewTransition(() => {
      router.push(adminViewDestination(next))
    })
  }

  function handleMobileViewChange(next: AdminView) {
    setMobileNavOpen(false)
    handleViewChange(next)
  }
  function navigateModule(event: { preventDefault: () => void }, href: string, label: string) {
    if (`${pathname}${searchParams.size ? `?${searchParams.toString()}` : ''}` === href) return
    event.preventDefault()
    setNavigationLabel(label)
    setMobileNavOpen(false)
    startNavigationTransition(() => router.push(href))
  }
  const showViewLoading = viewTransition.loading

  if (showViewLoading && pendingView) {
    return <AdminViewTransitionShell destination={pendingView} adminName={profile?.full_name ?? profile?.email} />
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`hidden bg-[#002147] md:flex flex-col shrink-0 transition-[width] duration-200 ${sidebarCollapsed ? 'w-[4.5rem]' : 'w-56'}`} aria-label="Dashboard sidebar">
        <div className={`relative border-b border-white/10 py-5 ${sidebarCollapsed ? 'px-3' : 'px-5'}`}>
          {sidebarCollapsed ? (
            <AlmaworksBrand compact tone="white" iconSize={32} className="justify-center" />
          ) : (
            <AlmaworksBrand tone="white" iconSize={30} />
          )}
          {roleLabel && (
            <span className={`${sidebarCollapsed ? 'sr-only' : 'inline-block'} mt-1 text-[10px] font-semibold tracking-widest uppercase text-[#75AADB]/80 bg-[#75AADB]/10 px-2 py-0.5 rounded-full`}>
              {roleLabel}
            </span>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(value => !value)}
            className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-[#002147] text-white/70 shadow-sm transition-colors hover:text-white"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronLeft size={14} aria-hidden="true" />}
          </button>
        </div>

        {/* Admin view switcher */}
        {canManageAdmin && (
          <AdminViewAsControl
            current={viewTransition.selectedView}
            onChange={handleViewChange}
            disabled={showViewLoading}
            className={`${sidebarCollapsed ? 'sr-only' : ''} px-3 pt-3 pb-1`}
          />
        )}

        <nav className={`flex-1 py-4 space-y-0.5 ${sidebarCollapsed ? 'px-2' : 'px-3'}`} aria-label="Dashboard navigation">
          {!navigationReady && <DataLoading compact label="Loading navigation..." />}
          {navItems.map(({ href, label }) => {
            const active = isDashboardNavigationActive(pathname, href, searchParams.get('tab'))
            const Icon = navIcons[label as keyof typeof navIcons] ?? Settings
            return (
              <Link
                key={href}
                href={href}
              onNavigate={(event) => navigateModule(event, href, label)}
                className={`group relative flex items-center rounded-lg text-sm font-medium transition-colors ${sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'} ${
                  active
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon size={17} aria-hidden="true" />
                <span className={sidebarCollapsed ? 'sr-only' : ''}>{label}</span>
                {sidebarCollapsed && <span className="pointer-events-none absolute left-full z-20 ml-3 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block group-focus-visible:block">{label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* User / sign out */}
        <div className={`px-3 py-4 border-t border-white/10 ${sidebarCollapsed ? 'flex justify-center' : ''}`}>
          {profile && (
            <p className={`${sidebarCollapsed ? 'sr-only' : ''} px-3 text-xs text-white/40 truncate mb-2`}>
              {profile.full_name ?? profile.email}
            </p>
          )}
          <button
            onClick={signOut}
            className={`${sidebarCollapsed ? 'w-auto' : 'w-full text-left'} px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white hover:bg-white/10 transition-colors`}
            aria-label="Sign out"
          >
            <span className={sidebarCollapsed ? 'sr-only' : ''}>Sign out</span>
            {sidebarCollapsed && <LogOut size={17} aria-hidden="true" />}
          </button>
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#002147] md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileNavOpen(value => !value)} className="rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white" aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileNavOpen}>
              {mobileNavOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
            <AlmaworksBrand tone="white" iconSize={28} />
          </div>
          <div className="flex items-center gap-3">
            {roleLabel && <span className="text-[10px] font-semibold uppercase tracking-widest text-[#9ac7e2]">{roleLabel}</span>}
            <button onClick={signOut} className="rounded-md px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white">Sign out</button>
          </div>
        </div>
        <nav className={`${mobileNavOpen ? 'flex' : 'hidden'} absolute left-0 right-0 top-14 flex-col gap-1 border-t border-white/10 bg-[#002147] px-3 py-3 shadow-xl`} aria-label="Mobile dashboard navigation">
          {canManageAdmin && (
            <AdminViewAsControl
              current={viewTransition.selectedView}
              onChange={handleMobileViewChange}
              disabled={showViewLoading}
              className="border-b border-white/10 px-0 pb-3"
            />
          )}
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onNavigate={(event) => navigateModule(event, href, label)}
              onClick={() => setMobileNavOpen(false)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${isDashboardNavigationActive(pathname, href, searchParams.get('tab')) ? 'bg-white text-[#002147]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        {mobileNavOpen && <button type="button" className="fixed inset-0 -z-10 h-screen w-screen bg-black/30" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay" />}
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto pt-[6.2rem] md:pt-0">
        <div className="p-4 md:p-8">{isNavigationPending && <DataLoading label={`Loading ${navigationLabel}...`} />}<div hidden={isNavigationPending}>{children}</div></div>
      </main>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<DataLoading label="Loading dashboard..." />}><DashboardLayoutContent>{children}</DashboardLayoutContent></Suspense>
}
