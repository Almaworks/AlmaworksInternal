"use client";

import { useEffect, useId, useState } from "react";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";
import { STARTUP_STAGES } from "@/src/program/startup-stage";

export function StartupStagePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [suggestions, setSuggestions] = useState<string[]>(STARTUP_STAGES.map(stage => stage.value));
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void authenticatedFetch("/api/startup-stages").then(async response => {
      if (!response.ok) throw new Error("Stage suggestions unavailable");
      const payload: unknown = await response.json();
      if (active && payload && typeof payload === "object" && "stages" in payload && Array.isArray(payload.stages) && payload.stages.every(stage => typeof stage === "string")) {
        setSuggestions([...new Set([...STARTUP_STAGES.map(stage => stage.value), ...payload.stages])]);
      }
    }).catch(() => { if (active) setNotice("Saved suggestions are unavailable. You can still enter a stage."); });
    return () => { active = false; };
  }, []);
  return <div className="space-y-2">
    <input aria-label="Stage" aria-describedby={`${id}-help`} list={`${id}-options`} maxLength={40} value={value} onChange={event => onChange(event.target.value)} placeholder="Search stages or type your own" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900" />
    <datalist id={`${id}-options`}>{suggestions.map(stage => <option key={stage.toLowerCase()} value={stage} />)}</datalist>
    {value.trim() && <span className="inline-block rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">{value.trim()}</span>}
    <p id={`${id}-help`} className="text-xs text-slate-600">One stage per startup. Choose an existing tag or enter a new one; save the profile to apply it.</p>
    {notice && <p role="status" className="text-xs text-amber-800">{notice}</p>}
  </div>;
}
