"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CANONICAL_MENTOR_NEEDS, suggestMentorNeeds } from "@/src/mentor-needs/domain";
import { createClient } from "@/utils/supabase/client";

interface MentorNeedsFormProps {
  semesterId: string | null;
  semesterName: string | null;
}

async function authorizedRequest(url: string, init?: RequestInit) {
  const client = createClient();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body) headers.set("Content-Type", "application/json");
  return await fetch(url, { ...init, headers });
}

export default function MentorNeedsForm({ semesterId, semesterName }: MentorNeedsFormProps) {
  const [primary, setPrimary] = useState<string | null>(null);
  const [secondary, setSecondary] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [context, setContext] = useState("");
  const [noPreference, setNoPreference] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => suggestMentorNeeds(query, CANONICAL_MENTOR_NEEDS.filter((need) => need !== primary && need !== secondary)), [primary, query, secondary]);

  useEffect(() => {
    if (!semesterId) return;
    let active = true;
    setLoading(true);
    authorizedRequest(`/api/mentor-needs?semesterId=${encodeURIComponent(semesterId)}`)
      .then(async (response) => {
        const payload = await response.json() as { record?: { needs: string[]; context: string | null; noPreference: boolean } | null; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load mentor needs.");
        if (active && payload.record) {
          setPrimary(payload.record.needs[0] ?? null);
          setSecondary(payload.record.needs[1] ?? null);
          setContext(payload.record.context ?? "");
          setNoPreference(payload.record.noPreference);
        }
      })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Unable to load mentor needs."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [semesterId]);

  function selectNeed(label: string) {
    if (primary === null) setPrimary(label);
    else setSecondary(label);
    setNoPreference(false);
    setQuery("");
  }

  async function save() {
    if (!semesterId) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await authorizedRequest("/api/mentor-needs", { method: "PUT", body: JSON.stringify({ semesterId, primary, secondary, noPreference, context }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save mentor needs.");
      setMessage("Mentor needs saved for this semester.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save mentor needs.");
    } finally {
      setSaving(false);
    }
  }

  const canAdd = primary === null || secondary === null;
  return (
    <section aria-labelledby="mentor-needs-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div><h2 id="mentor-needs-title" className="text-base font-semibold text-[#002147]">Mentor Needs</h2><p className="mt-1 text-sm text-gray-500">Share the expertise that would move you forward. This is optional and specific to {semesterName ?? "the selected semester"}.</p></div>
        {semesterName && <span className="rounded-full bg-[#002147]/8 px-3 py-1 text-xs font-semibold text-[#002147]">{semesterName}</span>}
      </div>
      <div className="space-y-5 rounded-xl border border-gray-100 bg-white p-5">
        {loading ? <p className="text-sm text-gray-500">Loading mentor needs…</p> : <>
          <div>
            <label htmlFor="mentor-need-search" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Search mentor need</label>
            <div className="relative">
              <input ref={inputRef} id="mentor-need-search" type="search" autoComplete="off" disabled={noPreference || !canAdd} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={primary ? "Add an optional secondary need" : "Search common categories"} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 disabled:bg-gray-50" />
              {query.trim() && canAdd && !noPreference && <div role="listbox" aria-label="Mentor need suggestions" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                {suggestions.canonical.map((need) => <button type="button" role="option" aria-selected="false" key={need} onClick={() => selectNeed(need)} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-[#002147] hover:bg-blue-50"><span>{need}</span><small className="text-gray-400">Common category</small></button>)}
                {suggestions.custom && <button type="button" onClick={() => selectNeed(suggestions.custom!)} className="w-full rounded-md border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-[#0066a1] hover:bg-blue-50">Create “{suggestions.custom}” <small className="ml-2 text-gray-400">Custom</small></button>}
              </div>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[primary, secondary].map((need, index) => need && <span key={`${need}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{index === 0 ? "Primary · " : "Secondary · "}{need}<button type="button" aria-label={`Remove ${need}`} onClick={() => index === 0 ? (setPrimary(secondary), setSecondary(null)) : setSecondary(null)} className="text-amber-700 hover:text-amber-950">×</button></span>)}
            </div>
          </div>
          <label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-3"><input type="checkbox" checked={noPreference} onChange={(event) => { setNoPreference(event.target.checked); if (event.target.checked) { setPrimary(null); setSecondary(null); setQuery(""); } }} className="mt-1" /><span><strong className="block text-sm text-[#002147]">I don’t have a preference yet</strong><small className="text-gray-500">Almaworks can recommend a mentor based on your context.</small></span></label>
          <div><label htmlFor="mentor-need-context" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Context <span className="font-normal normal-case">(optional)</span></label><textarea id="mentor-need-context" rows={4} maxLength={2000} value={context} onChange={(event) => setContext(event.target.value)} placeholder="What decision, challenge, or milestone would you like to discuss?" className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" /></div>
          <div className="flex flex-wrap items-center gap-3"><button type="button" onClick={save} disabled={saving || !semesterId || (!primary && !noPreference)} className="rounded-full bg-[#002147] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#002147]/90 disabled:opacity-50">{saving ? "Saving…" : "Save mentor needs"}</button>{message && <p role="status" className={`text-sm ${message.startsWith("Mentor needs saved") ? "text-green-700" : "text-red-600"}`}>{message}</p>}</div>
        </>}
      </div>
    </section>
  );
}
