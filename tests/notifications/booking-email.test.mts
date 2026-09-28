import assert from 'node:assert/strict';
import test from 'node:test';

import { renderBookingEmail } from '../../src/notifications/booking-email.ts';

const booking = {
  appOrigin: 'https://app.alma.works',
  semesterId: '11111111-1111-4111-8111-111111111111',
  requestId: '33333333-3333-4333-8333-333333333333',
  mentorName: 'Dr. Jordan <Lee>',
  mentorBio: 'Founder & advisor on pricing.',
  startupName: 'Bright & Bold',
  topic: 'Pricing <strategy>',
  startsAt: '2026-11-06T20:30:00.000Z',
  endsAt: '2026-11-06T20:45:00.000Z',
  timeZone: 'America/New_York',
} as const;

test('confirmed booking email has contextual details and an exact Bookings link', () => {
  const email = renderBookingEmail({ ...booking, status: 'confirmed', recipientRole: 'startup' });
  assert.match(email.subject, /confirmed/i);
  assert.match(email.text, /Dr\. Jordan <Lee>/);
  assert.match(email.text, /Pricing <strategy>/);
  assert.match(email.text, /November 6, 2026/);
  assert.match(email.text, /3:30 PM/);
  assert.match(email.text, /EST/);
  assert.match(email.text, /Founder & advisor on pricing/);
  assert.match(email.text, /View or manage your booking/);
  assert.match(email.text, /booking=33333333-3333-4333-8333-333333333333/);
  assert.match(email.text, /calendar=1/);
  assert.match(email.html, /Pricing &lt;strategy&gt;/);
  assert.doesNotMatch(email.html, /Pricing <strategy>/);
});

test('pending and canceled booking emails do not claim a confirmed meeting', () => {
  const pending = renderBookingEmail({ ...booking, status: 'pending', recipientRole: 'mentor', mentorBio: null });
  assert.match(pending.subject, /request/i);
  assert.match(pending.text, /Bright & Bold/);
  assert.doesNotMatch(pending.text, /confirmed/i);
  assert.doesNotMatch(pending.text, /Add to calendar/);
  const canceled = renderBookingEmail({ ...booking, status: 'canceled', recipientRole: 'startup', mentorBio: null });
  assert.match(canceled.subject, /canceled/i);
  assert.doesNotMatch(canceled.text, /confirmed meeting/i);
  assert.doesNotMatch(canceled.text, /Add to calendar/);
});

test('booking links reject a non-HTTPS public origin', () => {
  assert.throws(() => renderBookingEmail({ ...booking, appOrigin: 'http://localhost:3000', status: 'confirmed', recipientRole: 'startup' }), /HTTPS/);
});

test('an explicit local test link stays on localhost while other HTTP origins remain rejected', () => {
  const email = renderBookingEmail({ ...booking, appOrigin: 'http://localhost:3000', status: 'pending', recipientRole: 'mentor', allowLocalOrigin: true });
  assert.match(email.bookingUrl, /^http:\/\/localhost:3000\/dashboard\/bookings\?/);
  assert.throws(() => renderBookingEmail({ ...booking, appOrigin: 'http://example.com', status: 'pending', recipientRole: 'mentor', allowLocalOrigin: true }), /HTTPS/);
});
