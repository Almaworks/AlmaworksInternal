"use client";

import Link from "next/link";
import { DataLoading } from "@/components/DataLoading";
import { loadCanonicalAccess } from "@/src/program/canonical-access";
import { useEffect, useMemo, useState } from "react";

import { ProfileAvatar } from "@/components/profile-photo/ProfileAvatar";
import { loadMentorDirectory } from "@/src/program/canonical-repository";
import { createClient } from "@/utils/supabase/client";

type MentorCard = { id: string; full_name: string; company: string | null; role_title: string | null; linkedin_url: string | null; bio: string | null; expertise_tags: string[]; is_active: boolean; photo_url: string | null };

export default function MentorDirectoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const [mentors, setMentors] = useState<MentorCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function init() {
      setLoading(true); setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to view the mentor directory.");
      const [access, mentorData] = await Promise.all([
        loadCanonicalAccess(supabase, user.id),
        loadMentorDirectory(supabase),
      ]);
      if (!active) return;
      setUserRole(access?.role ?? null);
      setMentors(mentorData.filter((mentor) => mentor.is_active));
      setLoading(false);
    }
    void init().catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : "Mentors could not be loaded."); setLoading(false); } });
    return () => { active = false; };
  }, [supabase, attempt]);

  const allTags = useMemo(() => [...new Set(mentors.flatMap((mentor) => mentor.expertise_tags ?? []))].sort(), [mentors]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mentors.filter((mentor) => (!tagFilter || (mentor.expertise_tags ?? []).includes(tagFilter)) && (!query || [mentor.full_name, mentor.company ?? "", mentor.role_title ?? "", ...(mentor.expertise_tags ?? [])].join(" ").toLowerCase().includes(query)));
  }, [mentors, search, tagFilter]);

  if (loading) return <DataLoading label="Loading mentors..." />;
  if (error) return <div role="alert">{error} <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>;
  return <div className="max-w-4xl"><div className="mb-6"><h1 className="text-2xl font-semibold text-[#002147]">Mentor Directory</h1><p className="mt-1 text-sm text-gray-500">Browse mentors and their areas of expertise.</p></div><div className="mb-5 flex flex-col gap-3 sm:flex-row"><input type="search" placeholder="Search mentors…" value={search} onChange={(event) => setSearch(event.target.value)} className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40" /><select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#75AADB]/40"><option value="">All expertise</option>{allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select><p className="shrink-0 self-center text-xs text-gray-400">{filtered.length} mentor{filtered.length === 1 ? "" : "s"}</p></div>{loading ? <div className="flex items-center gap-2 py-8"><div className="h-4 w-4 animate-spin rounded-full border-2 border-[#002147] border-t-transparent" /><span className="text-sm text-gray-400">Loading…</span></div> : filtered.length === 0 ? <p className="text-sm text-gray-400">No mentors found.</p> : <div className="grid gap-4 sm:grid-cols-2">{filtered.map((mentor) => <article key={mentor.id} className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-5"><ProfileAvatar name={mentor.full_name} photoUrl={mentor.photo_url} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#002147]">{mentor.full_name}</p>{(mentor.role_title || mentor.company) && <p className="mt-0.5 truncate text-xs text-gray-500">{[mentor.role_title, mentor.company].filter(Boolean).join(" · ")}</p>}{mentor.bio && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-500">{mentor.bio}</p>}<div className="mt-2 flex flex-wrap gap-1">{(mentor.expertise_tags ?? []).slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-[#002147]/8 px-2 py-0.5 text-[10px] font-medium text-[#002147]">{tag}</span>)}</div><div className="mt-3 flex flex-wrap items-center gap-3">{mentor.linkedin_url && <a href={mentor.linkedin_url.startsWith("http") ? mentor.linkedin_url : `https://${mentor.linkedin_url}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-blue-600 hover:text-blue-800">LinkedIn</a>}{userRole === "startup" && <Link href={`/dashboard/bookings?mentor=${encodeURIComponent(mentor.id)}`} className="rounded-lg bg-[#002147] px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[#002147]/90">View booking windows</Link>}</div></div></article>)}</div>}</div>;
}
