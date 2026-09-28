import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../src/db/types.ts';
import { runNotificationPipeline } from '../../src/notifications/pipeline.ts';

type Row = Record<string, unknown>;
type Result = { data: Row[] | Row | null; error: { code?: string; message: string } | null };

function fakeClient(tables: Record<string, Row[]>): SupabaseClient<Database> {
  class Query implements PromiseLike<Result> {
    private readonly table: string;
    private filters: Array<(row: Row) => boolean> = [];
    private mode: 'read' | 'insert' | 'update' = 'read';
    private payload: Row = {};
    private maximum = Number.POSITIVE_INFINITY;
    private start = 0;
    private end = Number.POSITIVE_INFINITY;
    private orderColumn: string | null = null;
    constructor(table: string) { this.table = table; }
    select(): Query { return this; }
    eq(column: string, value: unknown): Query { this.filters.push(row => row[column] === value); return this; }
    gte(column: string, value: string): Query { this.filters.push(row => String(row[column]) >= value); return this; }
    lte(column: string, value: string): Query { this.filters.push(row => String(row[column]) <= value); return this; }
    lt(column: string, value: string): Query { this.filters.push(row => String(row[column]) < value); return this; }
    in(column: string, values: unknown[]): Query { this.filters.push(row => values.includes(row[column])); return this; }
    like(column: string, value: string): Query { const prefix = value.endsWith('%') ? value.slice(0, -1) : value; this.filters.push(row => String(row[column]).startsWith(prefix)); return this; }
    not(column: string, _operator: string, value: null): Query { this.filters.push(row => row[column] !== value); return this; }
    order(column: string): Query { this.orderColumn = column; return this; }
    limit(value: number): Query { this.maximum = value; return this; }
    range(start: number, end: number): Promise<Result> { this.start = start; this.end = end; return this.execute(); }
    insert(payload: Row): Query { this.mode = 'insert'; this.payload = payload; return this; }
    update(payload: Row): Query { this.mode = 'update'; this.payload = payload; return this; }
    maybeSingle(): Promise<Result> { return this.execute(true); }
    then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
      return this.execute().then(onfulfilled, onrejected);
    }
    private async execute(single = false): Promise<Result> {
      const rows = tables[this.table] ?? [];
      if (this.mode === 'insert') {
        if (rows.some(row => ['semester_id', 'event_kind', 'source_id', 'source_version', 'recipient_profile_id'].every(key => row[key] === this.payload[key]))) return { data: null, error: { code: '23505', message: 'duplicate' } };
        const inserted = { id: `delivery-${rows.length + 1}`, created_at: '2026-09-26T14:00:00Z', due_at: '2099-01-01T00:00:00Z', ...this.payload };
        rows.push(inserted); return { data: single ? inserted : [inserted], error: null };
      }
      const matched = rows.filter(row => this.filters.every(filter => filter(row)));
      if (this.mode === 'update') { matched.forEach(row => Object.assign(row, this.payload)); return { data: single ? matched[0] ?? null : matched, error: null }; }
      const ordered = this.orderColumn ? [...matched].sort((a, b) => String(a[this.orderColumn!]).localeCompare(String(b[this.orderColumn!]))) : matched;
      const page = ordered.slice(this.start, Math.min(this.end + 1, this.start + this.maximum));
      return { data: single ? page[0] ?? null : page, error: null };
    }
  }
  return { from: (table: string) => new Query(table) } as unknown as SupabaseClient<Database>;
}

test('saved booking request, acceptance and cancellation each mail eligible people once', async () => {
  const semesterId = '11111111-1111-4111-8111-111111111111';
  const mentor = '22222222-2222-4222-8222-222222222222';
  const startup = '33333333-3333-4333-8333-333333333333';
  const booking: Row = { id: '44444444-4444-4444-8444-444444444444', semester_id: semesterId, mentor_profile_id: mentor, mentor_name: 'Mentor Maya', startup_semester_id: 'startup-term', startup_name: 'New Venture', topic: 'Pricing', status: 'pending', starts_at: '2026-10-08T14:00:00Z', ends_at: '2026-10-08T14:30:00Z', requested_at: '2026-09-26T10:00:00Z', responded_at: null, cancelled_at: null, updated_at: '2026-09-26T10:00:00Z' };
  const tables: Record<string, Row[]> = {
    semesters: [{ id: semesterId, is_active: true, configuration: { timezone: 'America/New_York' } }],
    semester_memberships: [
      { id: 'mentor-membership', semester_id: semesterId, profile_id: mentor, role: 'mentor', status: 'active' },
      { id: 'startup-membership', semester_id: semesterId, profile_id: startup, role: 'startup', status: 'active' },
    ],
    startup_team_memberships: [{ semester_membership_id: 'startup-membership', startup_semester_id: 'startup-term', semester_id: semesterId }],
    platform_roles: [],
    profiles: [{ id: mentor, email: 'mentor@example.test', full_name: 'Mentor Maya', status: 'approved', is_active: true }, { id: startup, email: 'founder@example.test', full_name: 'Founder', status: 'approved', is_active: true }],
    mentor_profiles: [{ profile_id: mentor, biography: 'Experienced mentor.' }],
    mentor_booking_requests: [booking], friday_programs: [], outreach_opportunities: [], notification_deliveries: [],
  };
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  const input = { client: fakeClient(tables), apiKey: 'test-key', appOrigin: 'https://alma.works', activatedAt: '2026-09-25T00:00:00Z', semesterIds: [semesterId], now: new Date('2026-09-26T14:00:00Z'), submit: async (options: { to: string; subject: string; html: string }) => { sent.push(options); return { kind: 'accepted' as const, emailSendId: `send-${sent.length}` }; } };
  assert.deepEqual(await runNotificationPipeline(input), { queued: 1, accepted: 1, rejected: 0, unknown: 0, suppressed: 0 });
  assert.equal(sent[0]?.to, 'mentor@example.test');
  assert.match(sent[0]!.subject, /new meeting request/);
  assert.deepEqual(await runNotificationPipeline(input), { queued: 0, accepted: 0, rejected: 0, unknown: 0, suppressed: 0 });
  booking.status = 'accepted'; booking.responded_at = '2026-09-26T14:05:00Z'; booking.updated_at = '2026-09-26T14:05:00Z';
  assert.deepEqual(await runNotificationPipeline(input), { queued: 2, accepted: 2, rejected: 0, unknown: 0, suppressed: 0 });
  assert.equal(sent.length, 3);
  assert.ok(sent.slice(1).some(message => message.to === 'founder@example.test' && message.html.includes('Experienced mentor.')));
  booking.status = 'cancelled'; booking.cancelled_at = '2026-09-26T14:10:00Z'; booking.updated_at = '2026-09-26T14:10:00Z';
  assert.deepEqual(await runNotificationPipeline(input), { queued: 2, accepted: 2, rejected: 0, unknown: 0, suppressed: 0 });
  assert.equal(sent.length, 5);
  assert.ok(sent.slice(3).every(message => message.subject.includes('meeting canceled')));
});

test('local booking test only queues and sends the requested mentor email once', async () => {
  const semesterId = '11111111-1111-4111-8111-111111111111';
  const requestId = '44444444-4444-4444-8444-444444444444';
  const mentorId = '22222222-2222-4222-8222-222222222222';
  const tables: Record<string, Row[]> = {
    semesters: [{ id: semesterId, is_active: true, configuration: { timezone: 'America/New_York' } }],
    semester_memberships: [{ id: 'mentor-membership', semester_id: semesterId, profile_id: mentorId, role: 'mentor', status: 'active' }],
    startup_team_memberships: [], platform_roles: [],
    profiles: [{ id: mentorId, email: 'mentor@example.test', full_name: 'Mentor Maya', status: 'approved', is_active: true }],
    mentor_profiles: [{ profile_id: mentorId, biography: null }],
    mentor_booking_requests: [{ id: requestId, semester_id: semesterId, mentor_profile_id: mentorId, mentor_name: 'Mentor Maya', startup_semester_id: 'startup-term', startup_name: 'New Venture', topic: 'Pricing', status: 'pending', starts_at: '2026-10-08T14:00:00Z', ends_at: '2026-10-08T14:30:00Z', requested_at: '2026-09-26T10:00:00Z', responded_at: null, cancelled_at: null, updated_at: '2026-09-26T10:00:00Z' }],
    friday_programs: [], outreach_opportunities: [], notification_deliveries: [],
  };
  const sent: Array<{ to: string; html: string; subject: string }> = [];
  const input = { client: fakeClient(tables), apiKey: 'test-key', appOrigin: 'http://localhost:3000', activatedAt: '2026-09-26T09:00:00Z', semesterIds: [semesterId], now: new Date('2026-09-26T14:00:00Z'), localTest: { bookingRequestId: requestId, recipientEmail: 'mentor@example.test' }, submit: async (options: { to: string; html: string; subject: string }) => { sent.push(options); return { kind: 'accepted' as const, emailSendId: 'send-1' }; } };
  assert.deepEqual(await runNotificationPipeline(input), { queued: 1, accepted: 1, rejected: 0, unknown: 0, suppressed: 0 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, 'mentor@example.test');
  assert.match(sent[0]!.html, /http:\/\/localhost:3000\/dashboard\/bookings/);
  assert.deepEqual(await runNotificationPipeline(input), { queued: 0, accepted: 0, rejected: 0, unknown: 0, suppressed: 0 });
  const booking = tables.mentor_booking_requests[0]!;
  booking.status = 'accepted'; booking.responded_at = '2026-09-26T14:05:00Z'; booking.updated_at = '2026-09-26T14:05:00Z';
  input.now = new Date('2026-09-26T14:10:00Z');
  assert.deepEqual(await runNotificationPipeline(input), { queued: 1, accepted: 1, rejected: 0, unknown: 0, suppressed: 0 });
  assert.equal(sent.length, 2);
  assert.equal(sent[1]?.to, 'mentor@example.test');
  assert.match(sent[1]!.subject, /meeting confirmed/i);
});

test('Friday group assignment and regeneration only mail affected startup members', async () => {
  const semesterId = '11111111-1111-4111-8111-111111111111';
  const firstProfile = '22222222-2222-4222-8222-222222222222';
  const secondProfile = '33333333-3333-4333-8333-333333333333';
  const meetingId = '44444444-4444-4444-8444-444444444444';
  const program: Row = { id: 'program', semester_id: semesterId, meeting_id: meetingId, generated_at: '2026-09-26T10:00:00Z', group_a_facilitator: 'Les', group_b_facilitator: 'Eric Chan' };
  const firstAssignment: Row = { program_id: 'program', semester_id: semesterId, startup_semester_id: 'startup-one', startup_name: 'First Startup', group_code: 'A', group_position: 1 };
  const tables: Record<string, Row[]> = {
    semesters: [{ id: semesterId, is_active: true }], platform_roles: [],
    semester_memberships: [
      { id: 'member-one', semester_id: semesterId, profile_id: firstProfile, role: 'startup', status: 'active' },
      { id: 'member-two', semester_id: semesterId, profile_id: secondProfile, role: 'startup', status: 'active' },
    ],
    startup_team_memberships: [{ semester_membership_id: 'member-one', startup_semester_id: 'startup-one', semester_id: semesterId }, { semester_membership_id: 'member-two', startup_semester_id: 'startup-two', semester_id: semesterId }],
    profiles: [{ id: firstProfile, email: 'one@example.test', full_name: 'One', status: 'approved', is_active: true }, { id: secondProfile, email: 'two@example.test', full_name: 'Two', status: 'approved', is_active: true }],
    mentor_booking_requests: [], friday_programs: [program], meetings: [{ id: meetingId, semester_id: semesterId, meeting_date: '2026-10-09', friday_canceled_at: null }],
    friday_program_assignments: [firstAssignment, { program_id: 'program', semester_id: semesterId, startup_semester_id: 'startup-two', startup_name: 'Second Startup', group_code: 'B', group_position: 1 }],
    friday_speakers: [{ semester_id: semesterId, meeting_id: meetingId, name: 'Guest Speaker', bio: 'Founder bio', topic: 'Growth', updated_at: '2026-09-26T10:00:00Z' }],
    outreach_opportunities: [], notification_deliveries: [],
  };
  const sent: Array<{ to: string; html: string; subject: string }> = [];
  const input = { client: fakeClient(tables), apiKey: 'test-key', appOrigin: 'https://alma.works', activatedAt: '2026-09-25T00:00:00Z', semesterIds: [semesterId], now: new Date('2026-09-26T14:00:00Z'), submit: async (options: { to: string; subject: string; html: string }) => { sent.push(options); return { kind: 'accepted' as const, emailSendId: `send-${sent.length}` }; } };
  assert.deepEqual(await runNotificationPipeline(input), { queued: 2, accepted: 2, rejected: 0, unknown: 0, suppressed: 0 });
  assert.ok(sent.some(message => message.to === 'one@example.test' && message.html.includes('Your group: A')));
  assert.ok(sent.some(message => message.to === 'two@example.test' && message.html.includes('Your group: B')));
  assert.deepEqual(await runNotificationPipeline(input), { queued: 0, accepted: 0, rejected: 0, unknown: 0, suppressed: 0 });
  program.generated_at = '2026-09-27T10:00:00Z'; firstAssignment.group_code = 'B'; firstAssignment.group_position = 2;
  assert.deepEqual(await runNotificationPipeline(input), { queued: 1, accepted: 1, rejected: 0, unknown: 0, suppressed: 0 });
  assert.equal(sent.length, 3);
  assert.equal(sent[2]?.to, 'one@example.test');
  assert.match(sent[2]!.subject, /group has changed/);
  tables.meetings[0]!.friday_canceled_at = '2026-09-28T10:00:00Z';
  input.now = new Date('2026-09-28T14:00:00Z');
  assert.deepEqual(await runNotificationPipeline(input), { queued: 2, accepted: 2, rejected: 0, unknown: 0, suppressed: 0 });
  assert.ok(sent.slice(3).every(message => message.subject.includes('canceled') && !message.html.includes('4:00–4:30 PM')));
  tables.meetings[0]!.friday_canceled_at = null;
  input.now = new Date('2026-09-29T14:00:00Z');
  assert.deepEqual(await runNotificationPipeline(input), { queued: 2, accepted: 2, rejected: 0, unknown: 0, suppressed: 0 });
  assert.ok(sent.slice(5).every(message => message.subject.includes('restored')));
  assert.deepEqual(await runNotificationPipeline(input), { queued: 0, accepted: 0, rejected: 0, unknown: 0, suppressed: 0 });
});

test('weekday digest combines an admin’s assigned and unassigned due work once', async () => {
  const semesterId = '11111111-1111-4111-8111-111111111111';
  const adminId = '22222222-2222-4222-8222-222222222222';
  const tables: Record<string, Row[]> = {
    semesters: [{ id: semesterId, is_active: true }], platform_roles: [],
    semester_memberships: [{ id: 'admin-member', semester_id: semesterId, profile_id: adminId, role: 'admin', status: 'active' }],
    startup_team_memberships: [], profiles: [{ id: adminId, email: 'admin@example.test', full_name: 'Admin Alex', status: 'approved', is_active: true }],
    mentor_booking_requests: [], friday_programs: [],
    outreach_opportunities: [
      { id: 'assigned', semester_id: semesterId, contact_id: 'contact-one', owner_profile_id: adminId, stage: 'contacted', next_follow_up_at: '2026-10-02T16:00:00Z', snoozed_until: null, is_silenced: false, archived_at: null, semester_notes: 'Send the agreed introduction' },
      { id: 'unassigned', semester_id: semesterId, contact_id: 'contact-two', owner_profile_id: null, stage: 'not_contacted', next_follow_up_at: '2026-10-01T16:00:00Z', snoozed_until: null, is_silenced: false, archived_at: null, semester_notes: null },
      { id: 'silenced', semester_id: semesterId, contact_id: 'contact-three', owner_profile_id: adminId, stage: 'contacted', next_follow_up_at: '2026-10-01T16:00:00Z', snoozed_until: null, is_silenced: true, archived_at: null, semester_notes: null },
    ],
    outreach_contacts: [{ id: 'contact-one', full_name: 'Pat Founder', archived_at: null }, { id: 'contact-two', full_name: 'Sam Founder', archived_at: null }, { id: 'contact-three', full_name: 'Hidden Founder', archived_at: null }],
    outreach_contact_companies: [{ contact_id: 'contact-one', company_id: 'company-one', is_primary: true }],
    outreach_companies: [{ id: 'company-one', name: 'Acme Venture' }], notification_deliveries: [],
  };
  const sent: Array<{ to: string; html: string; subject: string }> = [];
  const input = { client: fakeClient(tables), apiKey: 'test-key', appOrigin: 'https://alma.works', activatedAt: '2026-09-25T00:00:00Z', semesterIds: [semesterId], now: new Date('2026-10-02T13:00:00Z'), submit: async (options: { to: string; subject: string; html: string }) => { sent.push(options); return { kind: 'accepted' as const, emailSendId: 'digest-send' }; } };
  assert.deepEqual(await runNotificationPipeline(input), { queued: 1, accepted: 1, rejected: 0, unknown: 0, suppressed: 0 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, 'admin@example.test');
  assert.match(sent[0]!.html, /Pat Founder/);
  assert.match(sent[0]!.html, /Sam Founder/);
  assert.match(sent[0]!.html, /Unassigned opportunity/);
  assert.doesNotMatch(sent[0]!.html, /Hidden Founder/);
  assert.deepEqual(await runNotificationPipeline(input), { queued: 0, accepted: 0, rejected: 0, unknown: 0, suppressed: 0 });
});
