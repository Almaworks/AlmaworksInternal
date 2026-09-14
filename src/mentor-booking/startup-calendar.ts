import type { MentorBookingMentorIdentity } from "./types.ts";
import type { StartupBookingSlot } from "./startup-availability.ts";

export interface StartupCalendarCell {
  endsAt: string;
  mentors: MentorBookingMentorIdentity[];
  startsAt: string;
}

export interface StartupCalendar {
  cells: StartupCalendarCell[];
}

export interface RankedMentor extends MentorBookingMentorIdentity {
  matchCount: number;
}

function normalize(value: string): string { return value.trim().toLocaleLowerCase(); }

export function buildStartupCalendar({ slots }: { slots: readonly StartupBookingSlot[]; timeZone: string }): StartupCalendar {
  const cells = new Map<string, StartupCalendarCell>();
  for (const slot of slots) {
    const cell = cells.get(slot.startsAt) ?? { startsAt: slot.startsAt, endsAt: slot.endsAt, mentors: [] };
    if (!cell.mentors.some((mentor) => mentor.profileId === slot.mentor.profileId)) cell.mentors.push(slot.mentor);
    cells.set(slot.startsAt, cell);
  }
  return { cells: [...cells.values()].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)) };
}

export function isMentorHighlighted(cell: StartupCalendarCell, query: string): boolean {
  const normalized = normalize(query);
  return normalized.length > 0 && cell.mentors.some((mentor) => normalize(mentor.name).includes(normalized) || normalize(mentor.profileId).includes(normalized));
}

export function rankAvailableMentors({ mentors, startupNeeds }: { mentors: readonly MentorBookingMentorIdentity[]; startupNeeds: readonly string[] }): RankedMentor[] {
  const needs = new Set(startupNeeds.map(normalize).filter(Boolean));
  return mentors.map((mentor) => ({ ...mentor, matchCount: (mentor.expertiseTags ?? []).filter((tag) => needs.has(normalize(tag))).length }))
    .sort((left, right) => right.matchCount - left.matchCount || left.name.localeCompare(right.name));
}
