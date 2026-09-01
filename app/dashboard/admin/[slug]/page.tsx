'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { loadStartupDirectory } from '@/src/program/canonical-repository'

type Founder = {
  name: string
  email?: string
  phone?: string
}

type Startup = {
  id: string
  name: string
  slug: string
  description: string | null
  industry: string | null
  stage: string | null
  logo_url: string | null
  website: string | null
  preferred_tags: string[]
  founders: Founder[]
}

export default function StartupProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  const supabase = createClient()

  const [startup, setStartup] = useState<Startup | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      let data = null
      let error: Error | null = null
      try {
        data = (await loadStartupDirectory(supabase)).find((row) => row.slug === slug) ?? null
      } catch (cause) {
        error = cause instanceof Error ? cause : new Error('Unable to load startup')
      }

      if (error || !data) {
        setNotFound(true)
      } else {
        setStartup(data as Startup)
      }
      setLoading(false)
    }
    load()
  }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-[#002147] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || !startup) {
    return (
      <div className="text-center py-16">
        <p className="text-2xl font-bold text-[#002147]">404</p>
        <p className="text-gray-500 mt-1">Startup not found.</p>
        <Link href="/dashboard/admin" className="mt-4 inline-block text-sm text-[#75AADB] hover:underline">
          Back to admin
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      {/* Back link */}
      <Link
        href="/dashboard/admin"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-[#002147] transition-colors mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Startups
      </Link>

      {/* Logo + name */}
      <div className="flex items-center gap-5 mb-6">
        {startup.logo_url ? (
          <img
            src={startup.logo_url}
            alt={startup.name}
            className="w-16 h-16 rounded-2xl object-contain bg-white border border-gray-100 shadow-sm"
          />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-[#002147] flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-white text-xl font-bold">
              {startup.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-[#002147]">{startup.name}</h1>
          {[startup.industry, startup.stage].filter(Boolean).length > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              {[startup.industry, startup.stage].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Tags */}
      {startup.preferred_tags && startup.preferred_tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {startup.preferred_tags.map(tag => (
            <span
              key={tag}
              className="text-xs font-semibold px-3 py-1 rounded-full bg-[#002147]/8 text-[#002147] border border-[#002147]/10"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {startup.description && (
        <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5 mb-4 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">About</h2>
          <p className="text-gray-700 text-sm leading-relaxed">{startup.description}</p>
        </div>
      )}

      {/* Website */}
      {startup.website && (
        <div className="bg-white rounded-2xl border border-gray-100 px-6 py-4 mb-4 shadow-sm flex items-center gap-3">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <a
            href={startup.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-[#75AADB] hover:underline truncate"
          >
            {startup.website}
          </a>
        </div>
      )}

      {/* Founders */}
      {startup.founders && startup.founders.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5 shadow-sm">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Founder{startup.founders.length !== 1 ? 's' : ''}
          </h2>
          <div className="space-y-3">
            {startup.founders.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#002147]/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-[#002147]">
                    {f.name.charAt(0).toUpperCase()}
                  </span>
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
  )
}
