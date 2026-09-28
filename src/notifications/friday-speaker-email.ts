export type FridaySpeakerEmailInput = {
  appOrigin: string;
  semesterId: string;
  meetingId: string;
  meetingDate: string;
  speakerName: string;
  topic: string;
  bio: string | null;
  status: 'confirmed' | 'updated';
};

export type FridaySpeakerEmail = { subject: string; html: string; text: string; fridayUrl: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

export function renderFridaySpeakerEmail(input: FridaySpeakerEmailInput): FridaySpeakerEmail {
  const origin = new URL(input.appOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('A public HTTPS application origin is required for Friday email.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.meetingDate) || Number.isNaN(Date.parse(`${input.meetingDate}T12:00:00Z`))) {
    throw new Error('A valid Friday meeting date is required.');
  }
  const fridayUrl = new URL('/dashboard/participant', origin);
  fridayUrl.searchParams.set('tab', 'friday-program');
  fridayUrl.searchParams.set('semester', input.semesterId);
  fridayUrl.searchParams.set('meeting', input.meetingId);
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${input.meetingDate}T12:00:00Z`));
  const title = input.status === 'confirmed' ? 'Friday speaker confirmed' : 'Friday speaker updated';
  const details = [`Date: ${date}`, 'Friday program: 3:00–5:00 PM America/New_York', 'Speaker session: 3:15–4:00 PM America/New_York', `Speaker: ${input.speakerName}`, `Topic: ${input.topic}`, ...(input.bio?.trim() ? [`About the speaker: ${input.bio.trim()}`] : [])];
  const text = [title, '', ...details, '', `View this Friday session: ${fridayUrl.toString()}`, '', 'The Friday Program page shows the latest details.'].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;color:#17233b;line-height:1.5"><h1 style="font-size:22px;color:#002147">${escapeHtml(title)}</h1><ul style="padding-left:20px">${details.map((detail) => `<li style="margin:0 0 8px">${escapeHtml(detail)}</li>`).join('')}</ul><p><a href="${escapeHtml(fridayUrl.toString())}">View this Friday session</a></p><p style="font-size:13px;color:#526174">The Friday Program page shows the latest details.</p></div>`;
  return { subject: `Almaworks: ${title.toLowerCase()} for ${date}`, html, text, fridayUrl: fridayUrl.toString() };
}
