'use client'

import { createClient } from '@/utils/supabase/client'
import { loadMentorInbox } from '@/src/program/canonical-repository'
import { useEffect, useMemo, useState } from 'react'

type PendingSession = {
  id: string
  status: string
  topic: string | null
  slot: number
  format: string | null
  meeting: { meeting_date: string; label: string | null } | null
  startup: { organization: { name: string } | null } | null
}

export default function MentorInboxPage() {
  const supabase = useMemo(() => createClient(), [])
  const [sessions, setSessions] = useState<PendingSession[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const data = await loadMentorInbox(supabase, user.id)
      setSessions(data as unknown as PendingSession[])
      setLoading(false)
    }
    void load()
  }, [supabase])

  async function updateStatus(id: string, status: 'confirmed' | 'declined') {
    setActionId(id)
    await supabase.from('sessions').update({ status }).eq('id', id)
    setSessions(prev => prev.filter(s => s.id !== id))
    setActionId(null)
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[#002147]">Inbox</h1>
        <p className="text-sm text-gray-500 mt-1">Pending session requests waiting for your response.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8">
          <div className="w-4 h-4 border-2 border-[#002147] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Loading…</span>
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">All caught up</p>
          <p className="text-xs text-gray-400 mt-1">No pending session requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#002147]">{s.startup?.organization?.name ?? 'Session request'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.meeting?.label ?? s.meeting?.meeting_date ?? 'Date TBD'}
                    {` · Slot ${s.slot}`}
                    {s.format ? ` · ${s.format}` : ''}
                  </p>
                  {s.topic && <p className="text-xs text-gray-500 mt-1">Topic: {s.topic}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => void updateStatus(s.id, 'confirmed')}
                    disabled={actionId === s.id}
                    className="px-3 py-1.5 bg-[#002147] text-white text-xs font-medium rounded-lg hover:bg-[#002147]/90 disabled:opacity-50 transition-colors"
                  >
                    {actionId === s.id ? '…' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => void updateStatus(s.id, 'declined')}
                    disabled={actionId === s.id}
                    className="px-3 py-1.5 text-red-500 hover:bg-red-50 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
