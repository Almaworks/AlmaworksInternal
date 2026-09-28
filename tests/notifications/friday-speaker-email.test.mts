import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFridaySpeakerEmail } from '../../src/notifications/friday-speaker-email.ts';

const input = {
  appOrigin: 'https://app.alma.works',
  semesterId: '11111111-1111-4111-8111-111111111111',
  meetingId: '22222222-2222-4222-8222-222222222222',
  meetingDate: '2026-10-09',
  speakerName: 'Jordan <Lee>',
  topic: 'Pricing & growth',
  bio: 'Founder and advisor',
} as const;

test('confirmed Friday email names the speaker, time, and exact Friday meeting', () => {
  const mail = renderFridaySpeakerEmail({ ...input, status: 'confirmed' });
  assert.match(mail.text, /Friday, October 9, 2026/);
  assert.match(mail.text, /3:15–4:00 PM America\/New_York/);
  assert.match(mail.text, /Founder and advisor/);
  assert.match(mail.fridayUrl, /meeting=22222222-2222-4222-8222-222222222222/);
  assert.match(mail.html, /Jordan &lt;Lee&gt;/);
  assert.doesNotMatch(mail.html, /Jordan <Lee>/);
});

test('updated Friday email and absent bio use accurate wording', () => {
  const mail = renderFridaySpeakerEmail({ ...input, bio: null, status: 'updated' });
  assert.match(mail.subject, /updated/);
  assert.doesNotMatch(mail.text, /About the speaker/);
});
