import { ALMAWORKS_SUPABASE_URL } from "./config.ts";
import { readCalendarSlotRanges } from "./slot-ranges.ts";
import { bookableCalendarWeek } from "../mentor-booking/startup-availability.ts";
import type { MentorBookingViewer, MentorEffectiveAvailability } from "../mentor-booking/types.ts";

const failure = () => new Error("Shared Calendar availability could not be loaded. Please refresh and try again.");
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw failure();
  return value as Record<string, unknown>;
}
function relation(value: unknown) { return object(Array.isArray(value) && value.length === 1 ? value[0] : value); }
function string(value: unknown): string { if (typeof value !== "string" || !value) throw failure(); return value; }

/** The RPC exposes free slots only; private event metadata never enters the workspace. */
export async function readWorkspaceCalendarAvailability(input: {
  environment: { url: string; anonKey: string }; token: string; semesterId: string;
  viewer: MentorBookingViewer; timeZone: string; semesterStartDate: string; weekOffset: number; now?: Date; fetch?: typeof fetch;
}): Promise<MentorEffectiveAvailability[]> {
  if (input.environment.url !== ALMAWORKS_SUPABASE_URL) throw new Error("Calendar Supabase project does not match the allowed Almaworks project.");
  if (!Number.isInteger(input.weekOffset) || input.weekOffset < 0 || input.weekOffset > 52) throw failure();
  const week = bookableCalendarWeek(input.now ?? new Date(), input.timeZone, input.semesterStartDate, input.weekOffset);
  // Cover the full local week even across UTC offsets and daylight-saving changes.
  // The client trims this bounded envelope to the seven displayed local dates.
  const from = new Date(Date.parse(`${week.startDate}T00:00:00Z`) - 14 * 3600000).toISOString();
  const until = new Date(Date.parse(`${week.endDate}T00:00:00Z`) + 38 * 3600000).toISOString();
  const fetcher = input.fetch ?? fetch;
  async function read(url: URL, body?: unknown): Promise<unknown[]> {
    const response = await fetcher(new Request(url, {
      method: body ? "POST" : "GET", headers: { apikey: input.environment.anonKey, Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
    }));
    if (!response.ok) throw failure();
    const data: unknown = await response.json(); if (!Array.isArray(data)) throw failure(); return data;
  }
  try {
    if (input.viewer.role === "mentor" && !input.viewer.mentorSemesterId) throw failure();
    const mentors: { id: string; profileId: string; name: string }[] = [];
    for (let offset = 0; ; offset += 500) {
      const url = new URL("/rest/v1/mentor_semesters", input.environment.url);
      url.searchParams.set("select", "id,semester_memberships!inner(profile_id,role,status,profiles!inner(full_name,is_active,status))");
      url.searchParams.set("semester_id", `eq.${input.semesterId}`);
      url.searchParams.set("semester_memberships.role", "eq.mentor");
      url.searchParams.set("semester_memberships.status", "eq.active");
      url.searchParams.set("semester_memberships.profiles.is_active", "eq.true");
      url.searchParams.set("semester_memberships.profiles.status", "eq.approved");
      if (input.viewer.role === "mentor") url.searchParams.set("id", `eq.${input.viewer.mentorSemesterId}`);
      url.searchParams.set("order", "id"); url.searchParams.set("limit", "500"); url.searchParams.set("offset", String(offset));
      const rows = await read(url);
      for (const value of rows) {
        const row = object(value), membership = relation(row.semester_memberships), profile = relation(membership.profiles);
        const id = string(row.id);
        if (input.viewer.role === "mentor" && id !== input.viewer.mentorSemesterId) throw failure();
        if (membership.role !== "mentor" || membership.status !== "active" || profile.is_active !== true || profile.status !== "approved") throw failure();
        mentors.push({ id, profileId: string(membership.profile_id), name: typeof profile.full_name === "string" && profile.full_name.trim() ? profile.full_name : "Mentor" });
      }
      if (rows.length < 500) break;
    }
    const results: MentorEffectiveAvailability[][] = new Array(mentors.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, mentors.length) }, async () => {
      while (cursor < mentors.length) {
        const index = cursor++, mentor = mentors[index]!;
        const values = await readCalendarSlotRanges(from,until,(a,b)=>read(new URL("/rest/v1/rpc/calendar_effective_slots", input.environment.url), { p_semester_id: input.semesterId, p_mentor_semester_id: mentor.id, p_from:a, p_until:b }));
        results[index] = values.map(value => {
          const row = object(value), startsAt = string(row.starts_at), endsAt = string(row.ends_at);
          const start = Date.parse(startsAt), end = Date.parse(endsAt);
          if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== 900000 || start < Date.parse(from) || end > Date.parse(until)) throw failure();
          return { mentorSemesterId: mentor.id, mentor: { profileId: mentor.profileId, name: mentor.name }, startsAt, endsAt };
        });
      }
    }));
    return results.flat().sort((a,b) => Date.parse(a.startsAt)-Date.parse(b.startsAt) || a.mentorSemesterId.localeCompare(b.mentorSemesterId));
  } catch { throw failure(); }
}
