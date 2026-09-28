import assert from 'node:assert/strict';
import test from 'node:test';

import { selectBookingDeepLink } from '../../src/mentor-booking/booking-deep-link.ts';

const semesters = [
  { id: '11111111-1111-4111-8111-111111111111', is_active: true, name: 'Fall' },
  { id: '22222222-2222-4222-8222-222222222222', is_active: true, name: 'Spring' },
];

test('a booking email selects its exact semester and request', () => {
  assert.deepEqual(selectBookingDeepLink(semesters, '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'), {
    semesterId: '22222222-2222-4222-8222-222222222222',
    requestId: '33333333-3333-4333-8333-333333333333',
    error: null,
  });
});

test('an unknown semester is not silently replaced with the active semester', () => {
  assert.deepEqual(selectBookingDeepLink(semesters, '44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333'), {
    semesterId: null,
    requestId: null,
    error: 'This booking is not available in your semesters.',
  });
});

test('ordinary Bookings navigation still selects the active semester', () => {
  assert.deepEqual(selectBookingDeepLink(semesters, null, null), { semesterId: semesters[0].id, requestId: null, error: null });
});
