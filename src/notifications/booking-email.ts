export type BookingEmailStatus = 'pending' | 'confirmed' | 'reminder' | 'declined' | 'canceled';

export type BookingEmailInput = {
  appOrigin: string;
  semesterId: string;
  requestId: string;
  mentorName: string;
  mentorBio: string | null;
  startupName: string;
  topic: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  status: BookingEmailStatus;
  recipientRole: 'mentor' | 'startup';
  allowLocalOrigin?: boolean;
};

export type BookingEmail = { subject: string; html: string; text: string; bookingUrl: string; calendarUrl: string | null };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function safeOrigin(value: string, allowLocalOrigin = false): URL {
  const url = new URL(value);
  if ((url.protocol !== 'https:' && !(allowLocalOrigin && url.origin === 'http://localhost:3000')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('A public HTTPS application origin is required for booking email.');
  }
  return url;
}

function localTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid booking time is required.');
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}

function subject(input: BookingEmailInput): string {
  switch (input.status) {
    case 'pending': return `Almaworks: new meeting request from ${input.startupName}`;
    case 'confirmed': return `Almaworks: meeting confirmed with ${input.recipientRole === 'mentor' ? input.startupName : input.mentorName}`;
    case 'reminder': return `Almaworks: your meeting with ${input.recipientRole === 'mentor' ? input.startupName : input.mentorName} is coming up`;
    case 'declined': return `Almaworks: meeting request declined`;
    case 'canceled': return `Almaworks: meeting canceled`;
  }
}

function heading(status: BookingEmailStatus): string {
  switch (status) {
    case 'pending': return 'A startup has requested your time';
    case 'confirmed': return 'Your meeting is confirmed';
    case 'reminder': return 'Your meeting is coming up';
    case 'declined': return 'This meeting request was declined';
    case 'canceled': return 'This meeting was canceled';
  }
}

export function renderBookingEmail(input: BookingEmailInput): BookingEmail {
  const start = localTime(input.startsAt, input.timeZone);
  const end = localTime(input.endsAt, input.timeZone);
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) throw new Error('Booking end must follow start.');
  const url = new URL('/dashboard/bookings', safeOrigin(input.appOrigin, input.allowLocalOrigin));
  url.searchParams.set('semester', input.semesterId);
  url.searchParams.set('booking', input.requestId);
  const bookingUrl = url.toString();
  const canAddCalendar = input.status === 'confirmed' || input.status === 'reminder';
  const calendarUrl = canAddCalendar ? (() => { const calendar = new URL(bookingUrl); calendar.searchParams.set('calendar', '1'); return calendar.toString(); })() : null;
  const details = [
    `Mentor: ${input.mentorName}`,
    `Startup: ${input.startupName}`,
    `Topic: ${input.topic}`,
    `Starts: ${start}`,
    `Ends: ${end}`,
    ...(input.mentorBio?.trim() ? [`About the mentor: ${input.mentorBio.trim()}`] : []),
  ];
  const action = input.status === 'pending' && input.recipientRole === 'mentor' ? 'Review the request' : 'View or manage your booking';
  const text = [heading(input.status), '', ...details, '', `${action}: ${bookingUrl}`,
    ...(calendarUrl ? [`Add to calendar: ${calendarUrl}`] : []),
    '', 'The Bookings page shows the latest status and details.',
  ].join('\n');
  const htmlDetails = details.map((detail) => `<li style="margin:0 0 8px">${escapeHtml(detail)}</li>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;color:#17233b;line-height:1.5"><h1 style="font-size:22px;color:#002147">${escapeHtml(heading(input.status))}</h1><ul style="padding-left:20px">${htmlDetails}</ul><p><a href="${escapeHtml(bookingUrl)}">${escapeHtml(action)}</a></p>${calendarUrl ? `<p><a href="${escapeHtml(calendarUrl)}">Add to calendar</a></p>` : ''}<p style="font-size:13px;color:#526174">The Bookings page shows the latest status and details.</p></div>`;
  return { subject: subject(input), html, text, bookingUrl, calendarUrl };
}
