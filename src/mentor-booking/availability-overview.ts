import type { CalendarBlocks } from "./calendar-selection.ts";

type AvailabilityOverviewDay = {
  day: keyof CalendarBlocks;
  label: string;
  ranges: string[];
};

type AvailabilityOverviewCalendarDay = {
  day: keyof CalendarBlocks;
  label: string;
  ranges: {
    label: string;
    spanSlots: number;
    startSlot: number;
  }[];
};

const days: readonly { day: keyof CalendarBlocks; label: string }[] = [
  { day: "monday", label: "Mon" },
  { day: "tuesday", label: "Tue" },
  { day: "wednesday", label: "Wed" },
  { day: "thursday", label: "Thu" },
  { day: "friday", label: "Fri" },
  { day: "saturday", label: "Sat" },
  { day: "sunday", label: "Sun" },
];

function minutes(value: string): number { return Number(value.slice(0, 2)) * 60 + Number(value.slice(3)); }
function time(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`; }
function formatTime(value: string): string { const hour = Number(value.slice(0, 2)); return `${hour % 12 || 12}:${value.slice(3)} ${hour < 12 ? "AM" : "PM"}`; }
function formatRange(startsAt: string, endsAt: string): string {
  const start = formatTime(startsAt);
  const end = formatTime(endsAt);
  return start.slice(-2) === end.slice(-2) ? `${start.slice(0, -3)}–${end}` : `${start}–${end}`;
}

export function availabilityOverviewDays(blocks: CalendarBlocks): AvailabilityOverviewDay[] {
  return days.map(({ day, label }) => {
    const values = [...new Set(blocks[day])].map(minutes).sort((left, right) => left - right);
    const ranges: string[] = [];
    for (let index = 0; index < values.length;) {
      const start = values[index]!;
      let end = start + 15;
      index += 1;
      while (values[index] === end) { end += 15; index += 1; }
      ranges.push(formatRange(time(start), time(end)));
    }
    return { day, label, ranges };
  });
}

export function availabilityOverviewCalendar(blocks: CalendarBlocks): AvailabilityOverviewCalendarDay[] {
  return days.map(({ day, label }) => {
    const values = [...new Set(blocks[day])].map(minutes).sort((left, right) => left - right);
    const ranges: AvailabilityOverviewCalendarDay["ranges"] = [];
    for (let index = 0; index < values.length;) {
      const start = values[index]!;
      let end = start + 15;
      index += 1;
      while (values[index] === end) { end += 15; index += 1; }
      ranges.push({
        label: formatRange(time(start), time(end)),
        startSlot: (start - 8 * 60) / 15,
        spanSlots: (end - start) / 15,
      });
    }
    return { day, label, ranges };
  });
}

export function hasAvailabilityOverview(blocks: CalendarBlocks): boolean {
  return Object.values(blocks).some((times) => times.length > 0);
}
