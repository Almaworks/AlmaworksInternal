export type SessionRsvpResponse = "attending" | "not_attending";
export type SessionRsvpState = SessionRsvpResponse | "no_response";

export function sessionRsvpLabel(response: SessionRsvpState): string {
  if (response === "attending") return "Can attend";
  if (response === "not_attending") return "Can’t attend";
  return "No response";
}

export interface SessionAttendeeRsvp {
  semesterMembershipId: string;
  profileId: string;
  fullName: string;
  role: "mentor" | "startup";
  response: SessionRsvpState;
  respondedAt: string | null;
  updatedAt: string | null;
}

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const DEFAULT_TIMEZONE = "America/New_York";

function parseDate(meetingDate: string): Pick<DateTimeParts, "year" | "month" | "day"> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(meetingDate);
  if (!match) throw new Error("Invalid meeting date.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Invalid meeting date.");
  }
  return { year, month, day };
}

function parseTime(startsAt: string): Pick<DateTimeParts, "hour" | "minute" | "second"> {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(startsAt);
  if (!match) throw new Error("Invalid session start time.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) throw new Error("Invalid session start time.");
  return { hour, minute, second };
}

function formatterFor(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new Error("Invalid timezone.");
  }
}

function partsAt(formatter: Intl.DateTimeFormat, instant: number): DateTimeParts {
  const values = new Map(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function asUtc(parts: DateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

export function sessionStartIso(input: {
  meetingDate: string;
  startsAt: string;
  timezone?: string | null;
}): string {
  const desired = { ...parseDate(input.meetingDate), ...parseTime(input.startsAt) };
  const formatter = formatterFor(input.timezone?.trim() || DEFAULT_TIMEZONE);
  const nominal = asUtc(desired);
  let instant = nominal;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const offset = asUtc(partsAt(formatter, instant)) - instant;
    instant = nominal - offset;
  }
  const actual = partsAt(formatter, instant);
  if (asUtc(actual) !== nominal) throw new Error("Invalid local session start time.");
  return new Date(instant).toISOString();
}

export function canChangeSessionRsvp(input: {
  now: string;
  sessionStartsAt: string;
  status: string;
}): boolean {
  if (input.status !== "confirmed") return false;
  const now = Date.parse(input.now);
  const startsAt = Date.parse(input.sessionStartsAt);
  return Number.isFinite(now) && Number.isFinite(startsAt) && now < startsAt;
}

export function summarizeSessionRsvps(attendees: SessionAttendeeRsvp[]): {
  attending: number;
  notAttending: number;
  noResponse: number;
} {
  return attendees.reduce((summary, attendee) => {
    if (attendee.response === "attending") summary.attending += 1;
    else if (attendee.response === "not_attending") summary.notAttending += 1;
    else summary.noResponse += 1;
    return summary;
  }, { attending: 0, notAttending: 0, noResponse: 0 });
}
