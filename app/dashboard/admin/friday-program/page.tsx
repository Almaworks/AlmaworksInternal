'use client'

import { useEffect, useState } from 'react'
import { DataLoading } from '@/components/DataLoading'
import { createClient } from '@/utils/supabase/client'
import { FridayProgramPanel } from '@/components/friday-program/FridayProgramPanel'

export default function FridayProgramPage() {
  const [semesterId, setSemesterId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void Promise.resolve(createClient().from('semesters').select('id').eq('is_active', true).maybeSingle()).then(result => {
      if (!active) return
      if (result.error) throw new Error(result.error.message)
      setSemesterId(result.data?.id ?? null)
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Unable to load the active semester.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])
  if (loading) return <DataLoading label="Loading Friday program..." />
  if (error) return <p role="alert">{error} <button type="button" className="underline" onClick={() => { setLoading(true); setError(null); setAttempt(value => value + 1) }}>Try again</button></p>
  return <FridayProgramPanel semesterId={semesterId} canGenerate canEditSpeaker heading="Friday program groups" />
}
