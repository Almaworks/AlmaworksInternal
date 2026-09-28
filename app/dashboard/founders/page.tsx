'use client'

import Link from 'next/link'
import { DataLoading } from '@/components/DataLoading'
import { useEffect, useState } from 'react'

import { loadStartupDirectory } from '@/src/program/canonical-repository'
import { createClient } from '@/utils/supabase/client'

type FounderRow = {
  email: string | null
  id: string
  industry: string | null
  name: string
  needs: string[]
  startupName: string
}

export default function FoundersPage() {
  const [founders, setFounders] = useState<FounderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const client = createClient()
    void loadStartupDirectory(client).then((startups) => {
      if (!active) return
      setFounders(startups.flatMap((startup) => startup.founders.map((founder) => ({
        email: founder.email,
        id: founder.profile_id,
        industry: startup.industry,
        name: founder.name,
        needs: startup.mentorship_needs,
        startupName: startup.name,
      }))).sort((left, right) => left.name.localeCompare(right.name)))
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Founders could not be loaded.")
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Founders</h1>
        <Link href="/dashboard/admin/startups" className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
          Manage founder memberships
        </Link>
      </div>
      {loading ? <DataLoading label="Loading founders..." /> : error ? <div role="alert">{error} <button type="button" className="underline" onClick={() => { setLoading(true); setError(null); setAttempt(value => value + 1) }}>Try again</button></div> : founders.length === 0 ? <p className="text-gray-600">No founders yet</p> : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left">Founder</th><th className="px-6 py-3 text-left">Startup</th><th className="px-6 py-3 text-left">Industry</th><th className="px-6 py-3 text-left">Needs</th></tr></thead>
            <tbody className="divide-y divide-gray-200">{founders.map((founder) => (
              <tr key={`${founder.id}:${founder.startupName}`}>
                <td className="px-6 py-4"><Link className="font-medium text-blue-700 hover:underline" href={`/dashboard/founders/${founder.id}`}>{founder.name}</Link><span className="block text-xs text-gray-500">{founder.email}</span></td>
                <td className="px-6 py-4 text-gray-600">{founder.startupName}</td>
                <td className="px-6 py-4 text-gray-600">{founder.industry ?? '—'}</td>
                <td className="px-6 py-4 text-gray-600">{founder.needs.join(', ') || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
