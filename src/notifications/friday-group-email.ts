export type FridayGroupEmailInput = {
  appOrigin: string;
  semesterId: string;
  meetingId: string;
  meetingDate: string;
  startupName: string;
  group: 'A' | 'B';
  firstFacilitator: string;
  secondFacilitator: string;
  speakerName: string | null;
  speakerTopic: string | null;
  speakerBio: string | null;
  status: 'assigned' | 'updated' | 'reminder' | 'canceled' | 'restored';
};

const escape = (value: string) => value.replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);

export function renderFridayGroupEmail(input: FridayGroupEmailInput) {
  const origin = new URL(input.appOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('A public HTTPS origin is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.meetingDate) || Number.isNaN(Date.parse(`${input.meetingDate}T12:00:00Z`))) throw new Error('A valid Friday date is required.');
  const url = new URL('/dashboard/participant', origin);
  url.searchParams.set('tab', 'friday-program');
  url.searchParams.set('semester', input.semesterId);
  url.searchParams.set('meeting', input.meetingId);
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${input.meetingDate}T12:00:00Z`));
  const title = input.status === 'assigned' ? 'Your Friday group is confirmed' : input.status === 'updated' ? 'Your Friday group has changed' : input.status === 'reminder' ? 'Your Friday session is tomorrow' : input.status === 'canceled' ? 'Your Friday session was canceled' : 'Your Friday session is restored';
  const details = input.status === 'canceled' ? [
    `Startup: ${input.startupName}`, `Date: ${date}`, 'The Friday program is canceled. Do not attend this session.',
  ] : [
    `Startup: ${input.startupName}`, `Date: ${date}`, 'Friday program: 3:00–5:00 PM America/New_York',
    `Your group: ${input.group}`, `3:00 PM: startup standups`,
    `3:15–4:00 PM: speaker session${input.speakerName ? ` with ${input.speakerName}` : ''}`,
    ...(input.speakerTopic ? [`Speaker topic: ${input.speakerTopic}`] : []),
    ...(input.speakerBio?.trim() ? [`About the speaker: ${input.speakerBio.trim()}`] : []),
    `4:00–4:30 PM: ${input.firstFacilitator} leads your first group round`,
    `4:30–5:00 PM: ${input.secondFacilitator} leads your second group round`,
  ];
  const text = [title, '', ...details, '', `View your Friday session: ${url.toString()}`, '', 'The Friday Program page shows the latest assignment.'].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;color:#17233b;line-height:1.5"><h1 style="font-size:22px;color:#002147">${escape(title)}</h1><ul style="padding-left:20px">${details.map(detail => `<li style="margin:0 0 8px">${escape(detail)}</li>`).join('')}</ul><p><a href="${escape(url.toString())}">View your Friday session</a></p><p style="font-size:13px;color:#526174">The Friday Program page shows the latest assignment.</p></div>`;
  return { subject: `Almaworks: ${title.toLowerCase()} for ${date}`, text, html, fridayUrl: url.toString() };
}
