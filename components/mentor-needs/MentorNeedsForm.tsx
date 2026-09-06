"use client";

import { useEffect, useState } from "react";

import { ExpertiseTagPicker } from "@/components/ExpertiseTagPicker";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";

export interface MentorNeedsFormRecord { needs: string[]; context: string | null; noPreference: boolean; }
interface MentorNeedsFormProps { semesterId: string | null; semesterName: string | null; initialRecord?: MentorNeedsFormRecord | null; preview?: boolean; onSaved?: (record: MentorNeedsFormRecord) => void; }

export default function MentorNeedsForm({ semesterId, semesterName, initialRecord = null, preview = false, onSaved }: MentorNeedsFormProps) {
  const [needs, setNeeds] = useState<string[]>(initialRecord?.needs.slice(0, 2) ?? []);
  const [context, setContext] = useState(initialRecord?.context ?? "");
  const [noPreference, setNoPreference] = useState(initialRecord?.noPreference ?? false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!semesterId || preview) return;
    let active = true; setLoading(true);
    authenticatedFetch(`/api/mentor-needs?semesterId=${encodeURIComponent(semesterId)}`).then(async (response) => {
      const payload = await response.json() as { record?: MentorNeedsFormRecord | null; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load mentor needs.");
      if (active && payload.record) { setNeeds(payload.record.needs.slice(0, 2)); setContext(payload.record.context ?? ""); setNoPreference(payload.record.noPreference); }
    }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Unable to load mentor needs."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [preview, semesterId]);

  async function save() {
    if (!semesterId) return;
    setSaving(true); setMessage(null);
    const record = { needs: noPreference ? [] : needs, context: context.trim() || null, noPreference };
    try {
      if (preview) { onSaved?.(record); setMessage("Demo changes saved for this preview only."); return; }
      const response = await authenticatedFetch("/api/mentor-needs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ semesterId, primary: record.needs[0] ?? null, secondary: record.needs[1] ?? null, noPreference, context }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save mentor needs.");
      onSaved?.(record); setMessage("Mentor needs saved for this semester.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save mentor needs."); } finally { setSaving(false); }
  }

  return <section aria-labelledby="mentor-needs-title"><div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h2 id="mentor-needs-title" className="text-base font-semibold text-[#002147]">Mentor Needs</h2><p className="mt-1 text-sm text-gray-500">Choose up to two shared expertise tags for {semesterName ?? "the selected semester"}.</p></div>{semesterName && <span className="rounded-full bg-[#002147]/8 px-3 py-1 text-xs font-semibold text-[#002147]">{semesterName}</span>}</div><div className="space-y-5 rounded-xl border border-gray-100 bg-white p-5">{loading ? <p className="text-sm text-gray-500">Loading mentor needs…</p> : <><div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Search mentor need</label><ExpertiseTagPicker value={needs} onChange={(next) => { setNeeds(next.slice(0, 2)); setNoPreference(false); }} maxSelections={2} placeholder={needs.length === 1 ? "Add an optional secondary need" : "Search shared expertise tags"} /><p className="mt-2 text-xs text-gray-500">The first tag is primary; the second is optional.</p></div><label className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-3"><input type="checkbox" checked={noPreference} onChange={(event) => { setNoPreference(event.target.checked); if (event.target.checked) setNeeds([]); }} className="mt-1" /><span><strong className="block text-sm text-[#002147]">I don’t have a preference yet</strong><small className="text-gray-500">Almaworks can recommend a mentor based on your context.</small></span></label><div><label htmlFor="mentor-need-context" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Context <span className="font-normal normal-case">(optional)</span></label><textarea id="mentor-need-context" rows={4} maxLength={2000} value={context} onChange={(event) => setContext(event.target.value)} placeholder="What decision, challenge, or milestone would you like to discuss?" className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" /></div><div className="flex flex-wrap items-center gap-3"><button type="button" onClick={() => void save()} disabled={saving || !semesterId || (needs.length === 0 && !noPreference)} className="rounded-full bg-[#002147] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#002147]/90 disabled:opacity-50">{saving ? "Saving…" : "Save mentor needs"}</button>{message && <p role="status" className={`text-sm ${message.includes("saved") ? "text-green-700" : "text-red-600"}`}>{message}</p>}</div></>}</div></section>;
}
