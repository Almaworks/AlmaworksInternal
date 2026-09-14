import type { CalendarBlocks } from "./calendar-selection.ts";

type WeeklyAvailability = {
  endsAt: string;
  mentor?: { profileId: string };
  mentorSemesterId: string;
  startsAt: string;
  weekday: number;
};

const dayByWeekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function clockMinutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

export function calendarBlocksFromWeeklyAvailability(availability: readonly WeeklyAvailability[], mentorSemesterId: string | null | undefined, viewerProfileId?: string): CalendarBlocks {
  const blocks: Record<keyof CalendarBlocks, string[]> = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
  const ownMentorSemesterId = mentorSemesterId ?? availability.find((range) => range.mentor?.profileId === viewerProfileId)?.mentorSemesterId;
  if (!ownMentorSemesterId) return blocks;
  for (const range of availability) {
    if (range.mentorSemesterId !== ownMentorSemesterId) continue;
    const day = dayByWeekday[range.weekday];
    if (!day) continue;
    for (let minute = clockMinutes(range.startsAt); minute < clockMinutes(range.endsAt); minute += 15) {
      blocks[day].push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
    }
  }
  return blocks;
}
