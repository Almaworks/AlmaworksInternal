'use client'

import { createClient } from '@/utils/supabase/client'
import { AlmaworksBrand } from '@/components/AlmaworksBrand'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Inbox, LayoutDashboard, LogOut, Menu, Megaphone, Network, Search, Settings, Target, Users, X } from 'lucide-react'

type Profile = {
  full_name: string | null
  email: string
  role: 'mentor' | 'startup' | 'admin' | null
}

type ViewAs = 'admin' | 'mentor' | 'startup'

const SIDEBAR_STORAGE_KEY = 'almaworks-dashboard-sidebar-collapsed'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [viewAs, setViewAs] = useState<ViewAs>('admin')
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
    supabase.auth.getUser().then(async ({ data: { user }, error }) => {
      if (error || !user) {
        await supabase.auth.signOut({ scope: 'local' })
        router.replace('/')
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('full_name, email, role, is_active')
        .eq('id', user.id)
        .single()
      if ((data as typeof data & { is_active?: boolean })?.is_active === false) {
        await supabase.auth.signOut()
        window.location.href = '/?error=account_inactive'
        return
      }
      setProfile(data)
    })
  }, [supabase])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  const effectiveRole = profile?.role === 'admin' ? viewAs : profile?.role
  const isOnboarding = pathname === '/dashboard/onboarding'

  const navItems =
    effectiveRole === 'admin'
      ? [
          { href: '/dashboard/admin', label: 'Overview' },
          { href: '/dashboard/admin/semesters', label: 'Semesters' },
          { href: '/dashboard/admin/outreach', label: 'Outreach' },
          { href: '/dashboard/admin/mentor-needs', label: 'Mentor Needs' },
          { href: '/dashboard/admin/mentors', label: 'Mentors' },
          { href: '/dashboard/admin/notify', label: 'Notify' },
          { href: '/dashboard/resources', label: 'Resources' },
        ]
      : effectiveRole === 'mentor'
      ? [
          { href: '/dashboard/mentor', label: 'My Schedule' },
          { href: '/dashboard/mentor/inbox', label: 'Inbox' },
          { href: '/dashboard/mentors', label: 'Mentor Directory' },
        ]
      : [
          { href: '/dashboard/startup', label: 'Dashboard' },
          { href: '/dashboard/mentors', label: 'Mentors' },
        ]

  const navIcons = {
    Overview: LayoutDashboard,
    Semesters: CalendarDays,
    Outreach: Megaphone,
    'Mentor Needs': Target,
    Mentors: Users,
    Notify: Megaphone,
    Resources: Search,
    'My Schedule': CalendarDays,
    Inbox,
    'Mentor Directory': Network,
    Dashboard: LayoutDashboard,
  } as const

  const roleLabel =
    effectiveRole === 'admin' ? 'Admin' :
    effectiveRole === 'mentor' ? 'Mentor' :
    effectiveRole === 'startup' ? 'Startup' : ''

  function handleViewChange(next: ViewAs) {
    setViewAs(next)
    const dest =
      next === 'admin' ? '/dashboard/admin' :
      next === 'mentor' ? '/dashboard/mentor' :
      '/dashboard/startup'
    router.push(dest)
  }

  if (isOnboarding) return <>{children}</>

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
        {profile?.role === 'admin' && (
          <div className={`${sidebarCollapsed ? 'sr-only' : ''} px-3 pt-3 pb-1`}>
            <p className="px-1 text-[9px] font-semibold tracking-widest uppercase text-white/30 mb-1.5">View as</p>
            <div className="flex rounded-lg overflow-hidden border border-white/10">
              {(['admin', 'startup', 'mentor'] as ViewAs[]).map(v => (
                <button
                  key={v}
                  onClick={() => handleViewChange(v)}
                  className={`flex-1 py-1.5 text-[10px] font-semibold capitalize transition-colors ${
                    viewAs === v
                      ? 'bg-white/20 text-white'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/10'
                  }`}
                >
                  {v === 'admin' ? 'Admin' : v === 'startup' ? 'Startup' : 'Mentor'}
                </button>
              ))}
            </div>
          </div>
        )}

        <nav className={`flex-1 py-4 space-y-0.5 ${sidebarCollapsed ? 'px-2' : 'px-3'}`} aria-label="Dashboard navigation">
          {navItems.map(({ href, label }) => {
            const active = pathname === href
            const Icon = navIcons[label as keyof typeof navIcons] ?? Settings
            return (
              <Link
                key={href}
                href={href}
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
          {navItems.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileNavOpen(false)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium ${pathname === href ? 'bg-white text-[#002147]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        {mobileNavOpen && <button type="button" className="fixed inset-0 -z-10 h-screen w-screen bg-black/30" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay" />}
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto pt-[6.2rem] md:pt-0">
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  )
}
