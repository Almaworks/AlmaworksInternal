"use client";

import { useEffect, useMemo, useState } from "react";

import { authenticatedFetch } from "@/src/auth/authenticated-fetch";

type Suggestion = { id: string; name: string; score: number; reason: "exact" | "prefix" | "alias" | "acronym" | "fuzzy" };

interface ExpertiseTagPickerProps {
  value: readonly string[];
  onChange: (next: string[]) => void;
  maxSelections?: number;
  placeholder?: string;
}

function suggestionDetail(reason: Suggestion["reason"]): string | null {
  if (reason === "acronym") return "Matches acronym";
  if (reason === "alias") return "Matches an alias";
  if (reason === "fuzzy") return "Similar to your search";
  return null;
}

export function ExpertiseTagPicker({ value, onChange, maxSelections, placeholder = "Search expertise tags" }: ExpertiseTagPickerProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<readonly Suggestion[]>([]);
  const [createName, setCreateName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canAdd = maxSelections === undefined || value.length < maxSelections;

  useEffect(() => {
    if (!canAdd) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void authenticatedFetch(`/api/expertise-tags?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json() as { suggestions?: Suggestion[]; create?: { name: string } | null; error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Unable to search expertise tags.");
          setSuggestions(payload.suggestions ?? []);
          setCreateName(payload.create?.name ?? null);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setMessage(error instanceof Error ? error.message : "Unable to search expertise tags.");
        });
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [canAdd, query]);

  const availableSuggestions = useMemo(
    () => suggestions.filter((suggestion) => !value.includes(suggestion.name)),
    [suggestions, value],
  );

  function select(name: string) {
    if (!canAdd || value.includes(name)) return;
    onChange([...value, name]);
    setQuery("");
    setCreateName(null);
  }

  async function createTag() {
    if (createName === null) return;
    setMessage(null);
    try {
      const response = await authenticatedFetch("/api/expertise-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName }),
      });
      const payload = await response.json() as { tag?: { name: string }; error?: string };
      if (!response.ok || payload.tag === undefined) throw new Error(payload.error ?? "Unable to create expertise tag.");
      select(payload.tag.name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create expertise tag.");
    }
  }

  return <div className="space-y-2">
    <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} disabled={!canAdd} placeholder={placeholder} aria-label={placeholder} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40 disabled:bg-gray-50" />
    {canAdd && query.trim() && <div role="listbox" aria-label="Expertise tag suggestions" className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
      {availableSuggestions.map((suggestion) => <button type="button" role="option" aria-selected="false" key={suggestion.id} onClick={() => select(suggestion.name)} className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-[#002147] hover:bg-blue-50"><span>{suggestion.name}</span>{suggestionDetail(suggestion.reason) && <small className="text-gray-500">{suggestionDetail(suggestion.reason)}</small>}</button>)}
      {createName && <button type="button" onClick={() => void createTag()} className="w-full rounded-md border-t border-gray-100 px-3 py-2 text-left text-sm font-medium text-[#0066a1] hover:bg-blue-50">Create “{createName}” <small className="ml-2 text-gray-500">Make available to everyone</small></button>}
    </div>}
    {value.length > 0 && <div className="flex flex-wrap gap-2">{value.map((tag) => <span key={tag} className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{tag}<button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((item) => item !== tag))} className="text-amber-700 hover:text-amber-950">×</button></span>)}</div>}
    {message && <p role="status" className="text-sm text-red-600">{message}</p>}
  </div>;
}
