'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { loadStartupProfile } from '@/src/program/canonical-repository'
import { formatEnumLabel } from '@/src/presentation/display-labels'

type Founder = {
  name: string
  email?: string | null
}

type Startup = {
  id: string
  name: string
  description: string | null
  industry: string | null
  stage: string | null
  logo_url: string | null
  website: string | null
  preferred_tags: string[]
  mentorship_needs: string[]
  founders: Founder[]
}

type Props = {
  startupId: string | null
  onClose: () => void
}

export default function StartupModal({ startupId, onClose }: Props) {
  const supabase = createClient()
  const [startup, setStartup] = useState<Startup | null>(null)
  const loading = startupId !== null && startup?.id !== startupId

  useEffect(() => {
    if (!startupId) return
    void loadStartupProfile(supabase, startupId).then((data) => {
      setStartup(data as Startup | null)
    })
  }, [startupId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!startupId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startupId, onClose])

  useEffect(() => {
    document.body.style.overflow = startupId ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [startupId])

  if (!startupId) return null

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

        {loading || !startup ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-[#002147] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Logo + name */}
            <div className="flex items-center gap-5 pr-8">
              {startup.logo_url ? (
                <img
                  src={startup.logo_url}
                  alt={startup.name}
                  className="w-16 h-16 rounded-2xl object-contain bg-white border border-gray-100 shadow-sm shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-[#002147] flex items-center justify-center shrink-0 shadow-sm">
                  <span className="text-white text-xl font-bold">{startup.name.charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold text-[#002147]">{startup.name}</h2>
                {[startup.industry, startup.stage].filter(Boolean).length > 0 && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {[startup.industry, startup.stage && formatEnumLabel(startup.stage)].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </div>

            {/* Tags */}
            {startup.preferred_tags && startup.preferred_tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {startup.preferred_tags.map(tag => (
                  <span key={tag} className="text-xs font-semibold px-3 py-1 rounded-full bg-[#002147]/8 text-[#002147] border border-[#002147]/10">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Mentorship needs */}
            {startup.mentorship_needs && startup.mentorship_needs.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Mentorship Needs</h3>
                <div className="flex flex-wrap gap-2">
                  {startup.mentorship_needs.map(tag => (
                    <span key={tag} className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {startup.description && (
              <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">About</h3>
                <p className="text-gray-700 text-sm leading-relaxed">{startup.description}</p>
              </div>
            )}

            {/* Website */}
            {startup.website && (
              <div className="bg-white rounded-2xl border border-gray-100 px-6 py-4 shadow-sm flex items-center gap-3">
                <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <a href={startup.website} target="_blank" rel="noopener noreferrer" className="text-sm text-[#75AADB] hover:underline truncate">
                  {startup.website}
                </a>
              </div>
            )}

            {/* Founders */}
            {startup.founders && startup.founders.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Founder{startup.founders.length !== 1 ? 's' : ''}
                </h3>
                <div className="space-y-3">
                  {startup.founders.map((f, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#002147]/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-[#002147]">{f.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#002147]">{f.name}</p>
                        {f.email && <p className="text-xs text-gray-500">{f.email}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
