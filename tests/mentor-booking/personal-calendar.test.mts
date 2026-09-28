import assert from 'node:assert/strict';
import test from 'node:test';

import { createBookingCalendarOptions } from '../../src/mentor-booking/personal-calendar.ts';

const booking = {
  requestId: '33333333-3333-4333-8333-333333333333',
  mentorName: 'Jordan Lee',
  startupName: 'Bright & Bold',
  topic: 'Pricing, growth',
  startsAt: '2026-11-06T20:30:00.000Z',
  endsAt: '2026-11-06T20:45:00.000Z',
  bookingUrl: 'https://app.alma.works/dashboard/bookings?semester=one&booking=two',
} as const;

test('accepted booking offers Apple-compatible ICS and no duplicate Google add when synced', () => {
  const result = createBookingCalendarOptions({ ...booking, status: 'accepted', googleHoldStatus: 'placed' });
  assert.equal(result.googleAddUrl, null);
  assert.match(result.ics, /BEGIN:VCALENDAR\r\nVERSION:2\.0/);
  assert.match(result.ics, /DTSTART:20261106T203000Z/);
  assert.match(result.ics, /DTEND:20261106T204500Z/);
  assert.match(result.ics, /UID:almaworks-booking-33333333-3333-4333-8333-333333333333@almaworks/);
  assert.match(result.ics, /Pricing\\, growth/);
});

test('an unconnected accepted booking can be added to Google Calendar', () => {
  const result = createBookingCalendarOptions({ ...booking, status: 'accepted', googleHoldStatus: 'not_recorded' });
  assert.match(result.googleAddUrl ?? '', /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(result.googleAddUrl ?? '', /dates=20261106T203000Z%2F20261106T204500Z/);
});

test('pending and canceled bookings cannot be exported as confirmed events', () => {
  assert.throws(() => createBookingCalendarOptions({ ...booking, status: 'pending', googleHoldStatus: 'not_recorded' }), /accepted/);
  assert.throws(() => createBookingCalendarOptions({ ...booking, status: 'cancelled', googleHoldStatus: 'not_recorded' }), /accepted/);
});
