import type { CalendarHoldStatus } from '../calendar/hold-presentation.ts';
import type { MentorBookingRequestStatus } from './types.ts';

export type PersonalCalendarInput = {
  requestId: string;
  mentorName: string;
  startupName: string;
  topic: string;
  startsAt: string;
  endsAt: string;
  bookingUrl: string;
  status: MentorBookingRequestStatus;
  googleHoldStatus: CalendarHoldStatus | null;
};

function utcStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid booking time is required.');
  return date.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
}

function icsText(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/\r\n|\n|\r/gu, '\\n').replace(/;/gu, '\\;').replace(/,/gu, '\\,');
}

export function createBookingCalendarOptions(input: PersonalCalendarInput): { googleAddUrl: string | null; ics: string; icsFilename: string } {
  if (input.status !== 'accepted') throw new Error('Only accepted bookings can be added to a personal calendar.');
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) throw new Error('Booking end must follow start.');
  const start = utcStamp(input.startsAt);
  const end = utcStamp(input.endsAt);
  const details = `Topic: ${input.topic}\nMentor: ${input.mentorName}\nStartup: ${input.startupName}\nCurrent status and management: ${input.bookingUrl}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Almaworks//Mentor Bookings//EN',
    'BEGIN:VEVENT', `UID:almaworks-booking-${input.requestId}@almaworks`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`, `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${icsText(`Almaworks mentorship with ${input.mentorName}`)}`,
    `DESCRIPTION:${icsText(details)}`, `URL:${icsText(input.bookingUrl)}`,
    'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR', '',
  ];
  let googleAddUrl: string | null = null;
  if (input.googleHoldStatus === 'not_recorded') {
    const url = new URL('https://calendar.google.com/calendar/render');
    url.searchParams.set('action', 'TEMPLATE');
    url.searchParams.set('text', `Almaworks mentorship with ${input.mentorName}`);
    url.searchParams.set('dates', `${start}/${end}`);
    url.searchParams.set('details', details);
    googleAddUrl = url.toString();
  }
  return { googleAddUrl, ics: lines.join('\r\n'), icsFilename: `almaworks-booking-${input.requestId}.ics` };
}
