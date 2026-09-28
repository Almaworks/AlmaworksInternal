import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../db/types.ts';
import { renderBookingEmail } from './booking-email.ts';
import { renderFridayGroupEmail } from './friday-group-email.ts';
import { renderFridaySpeakerEmail } from './friday-speaker-email.ts';
import { renderOutreachDigest, selectOutreachDigestItems, type OutreachDigestOpportunity } from './outreach-digest.ts';
import { submitSequenzyNotification } from './sequenzy.ts';

type Client = SupabaseClient<Database>;
type Delivery = Database['public']['Tables']['notification_deliveries']['Row'];
type EventKind = Delivery['event_kind'];
type Recipient = { id: string; email: string; name: string };
type Memberships = { profiles: Map<string, Recipient>; mentors: Set<string>; startups: Map<string, Set<string>>; admins: Set<string> };
type Mail = { subject: string; html: string };
type LocalBookingTest = { bookingRequestId: string; recipientEmail: string };

function checked(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`Notification ${operation} failed: ${error.message}`);
}

export function fridayGroupVersion(group: string, position: number, firstFacilitator: string, secondFacilitator: string): string {
  return createHash('sha256').update(JSON.stringify([group, position, firstFacilitator, secondFacilitator])).digest('hex');
}

export function newYorkDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function digestIsDue(now: Date, hour = 9): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const weekday = parts.find(part => part.type === 'weekday')?.value;
  const localHour = Number(parts.find(part => part.type === 'hour')?.value);
  return weekday !== 'Sat' && weekday !== 'Sun' && localHour >= hour;
}

export function fridayStartAt(meetingDate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(meetingDate)) throw new Error('Invalid Friday date.');
  const noon = Date.parse(`${meetingDate}T12:00:00Z`);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' }).formatToParts(new Date(noon)).find(part => part.type === 'timeZoneName')?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/u.exec(name ?? '');
  if (!match) throw new Error('Friday timezone offset is unavailable.');
  const minutes = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '+' ? 1 : -1);
  return Date.parse(`${meetingDate}T15:00:00Z`) - minutes * 60_000;
}

async function pages<T>(fetchPage: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, operation: string): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < 10000; start += 500) {
    const result = await fetchPage(start, start + 499);
    checked(result.error, operation);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
  throw new Error(`Notification ${operation} exceeded its safe pagination limit.`);
}

async function memberships(client: Client, semesterId: string): Promise<Memberships> {
  const [members, teams, platformAdmins] = await Promise.all([
    pages((start, end) => client.from('semester_memberships').select('id,profile_id,role,status').eq('semester_id', semesterId).eq('status', 'active').range(start, end), 'membership read'),
    pages((start, end) => client.from('startup_team_memberships').select('semester_membership_id,startup_semester_id').eq('semester_id', semesterId).range(start, end), 'team read'),
    pages((start, end) => client.from('platform_roles').select('profile_id').eq('role', 'super_admin').range(start, end), 'platform administrator read'),
  ]);
  const ids = [...new Set([...members.map(member => member.profile_id), ...platformAdmins.map(admin => admin.profile_id)])];
  const profiles = new Map<string, Recipient>();
  if (ids.length) {
    for (let offset = 0; offset < ids.length; offset += 100) {
      const result = await client.from('profiles').select('id,email,full_name,status,is_active').in('id', ids.slice(offset, offset + 100));
      checked(result.error, 'profile read');
      for (const profile of result.data ?? []) if (profile.status === 'approved' && profile.is_active && profile.email.trim()) {
        profiles.set(profile.id, { id: profile.id, email: profile.email.trim().toLowerCase(), name: profile.full_name?.trim() || 'Almaworks member' });
      }
    }
  }
  const active = new Map(members.map(member => [member.id, member]));
  const mentors = new Set(members.filter(member => member.role === 'mentor' && profiles.has(member.profile_id)).map(member => member.profile_id));
  const admins = new Set(members.filter(member => member.role === 'admin' && profiles.has(member.profile_id)).map(member => member.profile_id));
  for (const admin of platformAdmins) if (profiles.has(admin.profile_id)) admins.add(admin.profile_id);
  const startups = new Map<string, Set<string>>();
  for (const team of teams) {
    const member = active.get(team.semester_membership_id);
    if (!member || member.role !== 'startup' || !profiles.has(member.profile_id)) continue;
    const people = startups.get(team.startup_semester_id) ?? new Set<string>();
    people.add(member.profile_id);
    startups.set(team.startup_semester_id, people);
  }
  return { profiles, mentors, startups, admins };
}

async function queue(client: Client, input: { semesterId: string; kind: EventKind; sourceId: string; version: string; recipient: Recipient; dueAt?: string }): Promise<boolean> {
  const result = await client.from('notification_deliveries').insert({
    semester_id: input.semesterId, event_kind: input.kind, source_id: input.sourceId,
    source_version: input.version, recipient_profile_id: input.recipient.id,
    recipient_email: input.recipient.email, status: 'queued', ...(input.dueAt ? { due_at: input.dueAt } : {}),
  });
  if (result.error?.code === '23505') return false;
  checked(result.error, 'queue insert');
  return true;
}

function memberRecipients(members: Memberships, ids: Iterable<string>): Recipient[] {
  return [...new Set(ids)].flatMap(id => { const profile = members.profiles.get(id); return profile ? [profile] : []; });
}

async function scanBookingEvents(client: Client, semesterId: string, members: Memberships, now: Date, activation: Date, localTest?: LocalBookingTest): Promise<number> {
  const bookings = await pages((start, end) => {
    const query = client.from('mentor_booking_requests')
      .select('id,semester_id,mentor_profile_id,startup_semester_id,status,starts_at,requested_at,responded_at,cancelled_at,updated_at')
      .eq('semester_id', semesterId).gte('updated_at', activation.toISOString()).order('updated_at', { ascending: true });
    return (localTest ? query.eq('id', localTest.bookingRequestId) : query).range(start, end);
  }, 'booking scan');
  let count = 0;
  for (const booking of bookings) {
    if (localTest && booking.status !== 'pending' && booking.status !== 'accepted') continue;
    const startup = members.startups.get(booking.startup_semester_id) ?? new Set<string>();
    const mentor = members.mentors.has(booking.mentor_profile_id) ? [booking.mentor_profile_id] : [];
    const kind: EventKind = booking.status === 'pending' ? 'booking_requested' : booking.status === 'accepted' ? 'booking_confirmed' : booking.status === 'declined' ? 'booking_declined' : 'booking_canceled';
    const version = booking.status === 'pending' ? booking.requested_at : booking.status === 'cancelled' ? booking.cancelled_at : booking.responded_at;
    if (version) {
      const ids = booking.status === 'pending' ? mentor : booking.status === 'declined' ? startup : [...mentor, ...startup];
      for (const recipient of memberRecipients(members, ids)) {
        if (localTest && recipient.email !== localTest.recipientEmail) continue;
        if (await queue(client, { semesterId, kind, sourceId: booking.id, version, recipient, dueAt: now.toISOString() })) count++;
      }
    }
    const reminderAt = Date.parse(booking.starts_at) - 24 * 60 * 60 * 1000;
    if (!localTest && booking.status === 'accepted' && booking.responded_at && Date.parse(booking.responded_at) <= reminderAt && now.getTime() >= reminderAt && now.getTime() < Date.parse(booking.starts_at)) {
      for (const recipient of memberRecipients(members, [...mentor, ...startup])) if (await queue(client, { semesterId, kind: 'booking_reminder', sourceId: booking.id, version: booking.starts_at, recipient, dueAt: now.toISOString() })) count++;
    }
  }
  return count;
}

async function scanFridayEvents(client: Client, semesterId: string, members: Memberships, now: Date, activation: Date): Promise<number> {
  const programs = await pages((start, end) => client.from('friday_programs').select('id,meeting_id,generated_at,group_a_facilitator,group_b_facilitator').eq('semester_id', semesterId).range(start, end), 'Friday program scan');
  if (!programs.length) return 0;
  const meetings = await pages((start, end) => client.from('meetings').select('id,meeting_date,friday_canceled_at').eq('semester_id', semesterId).range(start, end), 'Friday meeting scan');
  const byMeeting = new Map(meetings.map(meeting => [meeting.id, meeting]));
  const assignments = await pages((start, end) => client.from('friday_program_assignments').select('program_id,startup_semester_id,group_code,group_position').eq('semester_id', semesterId).range(start, end), 'Friday assignment scan');
  let count = 0;
  for (const program of programs) {
    const meeting = byMeeting.get(program.meeting_id);
    if (!meeting || meeting.meeting_date < newYorkDay(now) || now.getTime() >= fridayStartAt(meeting.meeting_date) + 2 * 60 * 60_000) continue;
    const isNew = Date.parse(program.generated_at) >= activation.getTime();
    const startsAt = fridayStartAt(meeting.meeting_date);
    const reminderWindow = now.getTime() >= startsAt - 24 * 60 * 60 * 1000 && now.getTime() < startsAt;
    for (const assignment of assignments.filter(item => item.program_id === program.id)) {
      const first = assignment.group_code === 'A' ? program.group_a_facilitator : program.group_b_facilitator;
      const second = assignment.group_code === 'A' ? program.group_b_facilitator : program.group_a_facilitator;
      const version = fridayGroupVersion(assignment.group_code, assignment.group_position, first, second);
      const recipients = memberRecipients(members, members.startups.get(assignment.startup_semester_id) ?? []);
      if (meeting.friday_canceled_at) {
        if (Date.parse(meeting.friday_canceled_at) >= activation.getTime()) {
          for (const recipient of recipients) if (await queue(client, { semesterId, kind: 'friday_group_updated', sourceId: program.meeting_id, version: `canceled:${meeting.friday_canceled_at}`, recipient, dueAt: now.toISOString() })) count++;
        }
        continue;
      }
      for (const recipient of recipients) {
        const priorCancellation = await client.from('notification_deliveries').select('source_version').eq('semester_id', semesterId).eq('source_id', program.meeting_id).eq('recipient_profile_id', recipient.id).eq('event_kind', 'friday_group_updated').like('source_version', 'canceled:%').order('created_at', { ascending: false }).limit(1).maybeSingle();
        checked(priorCancellation.error, 'Friday cancellation history read');
        if (priorCancellation.data) {
          const prefix = `restored:${priorCancellation.data.source_version.slice('canceled:'.length)}:`;
          const alreadyRestored = await client.from('notification_deliveries').select('id').eq('semester_id', semesterId).eq('source_id', program.meeting_id).eq('recipient_profile_id', recipient.id).eq('event_kind', 'friday_group_updated').like('source_version', `${prefix}%`).limit(1);
          checked(alreadyRestored.error, 'Friday restoration history read');
          if ((alreadyRestored.data?.length ?? 0) === 0 && await queue(client, { semesterId, kind: 'friday_group_updated', sourceId: program.meeting_id, version: `${prefix}${version}`, recipient, dueAt: now.toISOString() })) count++;
        }
      }
      if (isNew) {
        for (const recipient of recipients) {
          const prior = await client.from('notification_deliveries').select('id').eq('semester_id', semesterId).eq('source_id', program.meeting_id).eq('recipient_profile_id', recipient.id).in('event_kind', ['friday_group_assigned', 'friday_group_updated']).limit(1);
          checked(prior.error, 'Friday history read');
          const matching = await client.from('notification_deliveries').select('id').eq('semester_id', semesterId).eq('source_id', program.meeting_id).eq('source_version', version).eq('recipient_profile_id', recipient.id).in('event_kind', ['friday_group_assigned', 'friday_group_updated']).limit(1);
          checked(matching.error, 'Friday version read');
          if ((matching.data?.length ?? 0) === 0) {
            const kind = (prior.data?.length ?? 0) ? 'friday_group_updated' : 'friday_group_assigned';
            if (await queue(client, { semesterId, kind, sourceId: program.meeting_id, version, recipient, dueAt: now.toISOString() })) count++;
          }
        }
      }
      if (reminderWindow && Date.parse(program.generated_at) <= startsAt - 24 * 60 * 60 * 1000) {
        for (const recipient of recipients) if (await queue(client, { semesterId, kind: 'friday_reminder', sourceId: program.meeting_id, version: meeting.meeting_date, recipient, dueAt: now.toISOString() })) count++;
      }
    }
  }
  return count;
}

async function scanOutreachDigest(client: Client, semesterId: string, members: Memberships, now: Date): Promise<number> {
  if (!digestIsDue(now)) return 0;
  const opportunities = await pages((start, end) => client.from('outreach_opportunities')
    .select('id,semester_id,contact_id,owner_profile_id,stage,next_follow_up_at,snoozed_until,is_silenced,semester_notes,archived_at')
    .eq('semester_id', semesterId).not('next_follow_up_at', 'is', null).range(start, end), 'outreach scan');
  const owners = [...members.admins];
  let count = 0;
  for (const ownerId of owners) {
    if (!members.admins.has(ownerId)) continue;
    const owner = members.profiles.get(ownerId);
    if (!owner) continue;
    const eligible = opportunities.some(item => (item.owner_profile_id === ownerId || item.owner_profile_id === null) && item.stage !== 'closed' && item.stage !== 'declined' && !item.archived_at && !item.is_silenced && (!item.snoozed_until || Date.parse(item.snoozed_until) <= now.getTime()) && !!item.next_follow_up_at && newYorkDay(new Date(item.next_follow_up_at)) <= newYorkDay(now));
    if (eligible && await queue(client, { semesterId, kind: 'outreach_digest', sourceId: semesterId, version: newYorkDay(now), recipient: owner, dueAt: now.toISOString() })) count++;
  }
  return count;
}

async function bookingMail(client: Client, delivery: Delivery, members: Memberships, appOrigin: string, now: Date): Promise<Mail | null> {
  const result = await client.from('mentor_booking_requests').select('id,mentor_profile_id,mentor_name,startup_semester_id,startup_name,topic,status,starts_at,ends_at,requested_at,responded_at,cancelled_at').eq('semester_id', delivery.semester_id).eq('id', delivery.source_id).maybeSingle();
  checked(result.error, 'booking recheck');
  const booking = result.data;
  if (!booking) return null;
  const expectedStatus = delivery.event_kind === 'booking_requested' ? 'pending' : delivery.event_kind === 'booking_confirmed' || delivery.event_kind === 'booking_reminder' ? 'accepted' : delivery.event_kind === 'booking_declined' ? 'declined' : 'cancelled';
  const expectedVersion = delivery.event_kind === 'booking_requested' ? booking.requested_at : delivery.event_kind === 'booking_reminder' ? booking.starts_at : delivery.event_kind === 'booking_canceled' ? booking.cancelled_at : booking.responded_at;
  if (booking.status !== expectedStatus || delivery.source_version !== expectedVersion || (delivery.event_kind === 'booking_reminder' && Date.parse(booking.starts_at) <= now.getTime())) return null;
  const isMentor = booking.mentor_profile_id === delivery.recipient_profile_id && members.mentors.has(delivery.recipient_profile_id);
  const isStartup = members.startups.get(booking.startup_semester_id)?.has(delivery.recipient_profile_id) ?? false;
  if (delivery.event_kind === 'booking_requested' ? !isMentor : delivery.event_kind === 'booking_declined' ? !isStartup : !isMentor && !isStartup) return null;
  const [mentor, semester] = await Promise.all([
    client.from('mentor_profiles').select('biography').eq('profile_id', booking.mentor_profile_id).maybeSingle(),
    client.from('semesters').select('configuration').eq('id', delivery.semester_id).maybeSingle(),
  ]);
  checked(mentor.error, 'mentor bio read'); checked(semester.error, 'semester timezone read');
  const configuration = semester.data?.configuration;
  const timeZone = configuration && typeof configuration === 'object' && !Array.isArray(configuration) && 'timezone' in configuration && typeof configuration.timezone === 'string' ? configuration.timezone : 'America/New_York';
  const status = delivery.event_kind === 'booking_requested' ? 'pending' : delivery.event_kind === 'booking_confirmed' ? 'confirmed' : delivery.event_kind === 'booking_reminder' ? 'reminder' : delivery.event_kind === 'booking_declined' ? 'declined' : 'canceled';
  return renderBookingEmail({ appOrigin, semesterId: delivery.semester_id, requestId: booking.id, mentorName: booking.mentor_name, mentorBio: mentor.data?.biography ?? null, startupName: booking.startup_name, topic: booking.topic, startsAt: booking.starts_at, endsAt: booking.ends_at, timeZone, status, recipientRole: isMentor ? 'mentor' : 'startup', allowLocalOrigin: appOrigin === 'http://localhost:3000' });
}

async function fridayMail(client: Client, delivery: Delivery, members: Memberships, appOrigin: string, now: Date): Promise<Mail | null> {
  const [meetingResult, programResult, speakerResult] = await Promise.all([
    client.from('meetings').select('meeting_date,friday_canceled_at').eq('semester_id', delivery.semester_id).eq('id', delivery.source_id).maybeSingle(),
    client.from('friday_programs').select('id,generated_at,group_a_facilitator,group_b_facilitator').eq('semester_id', delivery.semester_id).eq('meeting_id', delivery.source_id).maybeSingle(),
    client.from('friday_speakers').select('name,bio,topic,updated_at').eq('semester_id', delivery.semester_id).eq('meeting_id', delivery.source_id).maybeSingle(),
  ]);
  checked(meetingResult.error, 'Friday meeting recheck'); checked(programResult.error, 'Friday program recheck'); checked(speakerResult.error, 'Friday speaker recheck');
  const meeting = meetingResult.data, program = programResult.data, speaker = speakerResult.data;
  if (!meeting || meeting.meeting_date < newYorkDay(now) || now.getTime() >= fridayStartAt(meeting.meeting_date) + 2 * 60 * 60_000) return null;
  const startupId = [...members.startups].find(([, ids]) => ids.has(delivery.recipient_profile_id))?.[0];
  if (!startupId) return null;
  if (delivery.event_kind === 'friday_speaker_confirmed' || delivery.event_kind === 'friday_speaker_updated') {
    if (meeting.friday_canceled_at || !speaker || speaker.updated_at !== delivery.source_version) return null;
    return renderFridaySpeakerEmail({ appOrigin, semesterId: delivery.semester_id, meetingId: delivery.source_id, meetingDate: meeting.meeting_date, speakerName: speaker.name, topic: speaker.topic, bio: speaker.bio, status: delivery.event_kind === 'friday_speaker_confirmed' ? 'confirmed' : 'updated' });
  }
  if (!program) return null;
  const assignmentResult = await client.from('friday_program_assignments').select('startup_name,group_code,group_position').eq('semester_id', delivery.semester_id).eq('program_id', program.id).eq('startup_semester_id', startupId).maybeSingle();
  checked(assignmentResult.error, 'Friday assignment recheck');
  const assignment = assignmentResult.data;
  if (!assignment || (assignment.group_code !== 'A' && assignment.group_code !== 'B')) return null;
  const first = assignment.group_code === 'A' ? program.group_a_facilitator : program.group_b_facilitator;
  const second = assignment.group_code === 'A' ? program.group_b_facilitator : program.group_a_facilitator;
  const groupVersion = fridayGroupVersion(assignment.group_code, assignment.group_position, first, second);
  let status: 'assigned' | 'updated' | 'reminder' | 'canceled' | 'restored';
  if (meeting.friday_canceled_at) {
    if (delivery.event_kind !== 'friday_group_updated' || delivery.source_version !== `canceled:${meeting.friday_canceled_at}`) return null;
    status = 'canceled';
  } else if (delivery.source_version.startsWith('restored:')) {
    const cancellation = await client.from('notification_deliveries').select('source_version').eq('semester_id', delivery.semester_id).eq('source_id', delivery.source_id).eq('recipient_profile_id', delivery.recipient_profile_id).eq('event_kind', 'friday_group_updated').like('source_version', 'canceled:%').order('created_at', { ascending: false }).limit(1).maybeSingle();
    checked(cancellation.error, 'Friday restoration recheck');
    if (delivery.event_kind !== 'friday_group_updated' || !cancellation.data || delivery.source_version !== `restored:${cancellation.data.source_version.slice('canceled:'.length)}:${groupVersion}`) return null;
    status = 'restored';
  } else {
    const version = delivery.event_kind === 'friday_reminder' ? meeting.meeting_date : groupVersion;
    if (delivery.source_version !== version || (delivery.event_kind === 'friday_reminder' && meeting.meeting_date <= newYorkDay(now))) return null;
    status = delivery.event_kind === 'friday_group_assigned' ? 'assigned' : delivery.event_kind === 'friday_group_updated' ? 'updated' : 'reminder';
  }
  return renderFridayGroupEmail({ appOrigin, semesterId: delivery.semester_id, meetingId: delivery.source_id, meetingDate: meeting.meeting_date, startupName: assignment.startup_name, group: assignment.group_code, firstFacilitator: first, secondFacilitator: second, speakerName: speaker?.name ?? null, speakerTopic: speaker?.topic ?? null, speakerBio: speaker?.bio ?? null, status });
}

async function outreachMail(client: Client, delivery: Delivery, members: Memberships, appOrigin: string, now: Date): Promise<Mail | null> {
  if (delivery.source_id !== delivery.semester_id || delivery.source_version !== newYorkDay(now) || !members.admins.has(delivery.recipient_profile_id)) return null;
  const recipient = members.profiles.get(delivery.recipient_profile_id);
  if (!recipient) return null;
  const opportunities = await pages((start, end) => client.from('outreach_opportunities')
    .select('id,semester_id,contact_id,owner_profile_id,stage,next_follow_up_at,snoozed_until,is_silenced,semester_notes,archived_at')
    .eq('semester_id', delivery.semester_id).range(start, end), 'outreach recheck');
  const contactIds = [...new Set(opportunities.map(item => item.contact_id))];
  const contacts = new Map<string, { full_name: string; archived_at: string | null }>();
  for (let offset = 0; offset < contactIds.length; offset += 100) {
    const result = await client.from('outreach_contacts').select('id,full_name,archived_at').in('id', contactIds.slice(offset, offset + 100));
    checked(result.error, 'outreach contact recheck');
    for (const contact of result.data ?? []) contacts.set(contact.id, contact);
  }
  const relationships: Array<{ contact_id: string; company_id: string }> = [];
  for (let offset = 0; offset < contactIds.length; offset += 100) {
    relationships.push(...await pages((start, end) => client.from('outreach_contact_companies').select('contact_id,company_id').in('contact_id', contactIds.slice(offset, offset + 100)).eq('is_primary', true).range(start, end), 'outreach company links'));
  }
  const companyIds = [...new Set(relationships.map(item => item.company_id))];
  const companies = new Map<string, string>();
  for (let offset = 0; offset < companyIds.length; offset += 100) {
    const result = await client.from('outreach_companies').select('id,name').in('id', companyIds.slice(offset, offset + 100));
    checked(result.error, 'outreach company read');
    for (const company of result.data ?? []) companies.set(company.id, company.name);
  }
  const companyByContact = new Map(relationships.map(item => [item.contact_id, companies.get(item.company_id) ?? null]));
  const digestRows: OutreachDigestOpportunity[] = opportunities.flatMap(item => {
    const contact = contacts.get(item.contact_id);
    if (!contact) return [];
    return [{ id: item.id, semesterId: item.semester_id, contactName: contact.full_name, companyName: companyByContact.get(item.contact_id) ?? null,
      nextAction: item.semester_notes?.trim().slice(0, 240) || 'Review the contact and send a follow-up', stage: item.stage as OutreachDigestOpportunity['stage'], ownerProfileId: item.owner_profile_id,
      ownerIsActive: true, isActive: true, isArchived: !!item.archived_at || !!contact.archived_at, isSilenced: item.is_silenced, snoozedUntil: item.snoozed_until, nextFollowUpAt: item.next_follow_up_at }];
  });
  const items = selectOutreachDigestItems({ ownerProfileId: recipient.id, includeUnassigned: true, now: now.toISOString(), opportunities: digestRows });
  if (!items.length) return null;
  return renderOutreachDigest({ appOrigin, ownerName: recipient.name, items });
}

async function currentMail(client: Client, delivery: Delivery, appOrigin: string, now: Date): Promise<Mail | null> {
  const members = await memberships(client, delivery.semester_id);
  const recipient = members.profiles.get(delivery.recipient_profile_id);
  if (!recipient || recipient.email !== delivery.recipient_email) return null;
  if (delivery.event_kind.startsWith('booking_')) return bookingMail(client, delivery, members, appOrigin, now);
  if (delivery.event_kind.startsWith('friday_')) return fridayMail(client, delivery, members, appOrigin, now);
  if (delivery.event_kind === 'outreach_digest') return outreachMail(client, delivery, members, appOrigin, now);
  return null;
}

export async function runNotificationPipeline(input: { client: Client; apiKey: string; appOrigin: string; activatedAt: string; semesterIds: readonly string[]; localTest?: LocalBookingTest; now?: Date; submit?: typeof submitSequenzyNotification }): Promise<{ queued: number; accepted: number; rejected: number; unknown: number; suppressed: number }> {
  const now = input.now ?? new Date();
  const activation = new Date(input.activatedAt);
  if (Number.isNaN(activation.getTime())) throw new Error('Notification activation timestamp is invalid.');
  const origin = new URL(input.appOrigin);
  if ((origin.protocol !== 'https:' && !(input.localTest && origin.origin === 'http://localhost:3000')) || origin.origin !== input.appOrigin) throw new Error('A public HTTPS application origin is required.');
  if (input.localTest && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(input.localTest.bookingRequestId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.localTest.recipientEmail))) throw new Error('Local notification test scope is invalid.');
  if (!input.semesterIds.length || input.semesterIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id))) throw new Error('Explicit notification semester IDs are required.');
  const summary = { queued: 0, accepted: 0, rejected: 0, unknown: 0, suppressed: 0 };
  const semesters = await pages((start, end) => input.client.from('semesters').select('id').eq('is_active', true).in('id', [...input.semesterIds]).range(start, end), 'semester scan');
  if (semesters.length !== new Set(input.semesterIds).size) throw new Error('Notification worker cannot verify every configured active semester.');
  for (const semester of semesters) {
    const members = await memberships(input.client, semester.id);
    summary.queued += await scanBookingEvents(input.client, semester.id, members, now, activation, input.localTest);
    if (!input.localTest) {
      summary.queued += await scanFridayEvents(input.client, semester.id, members, now, activation);
      summary.queued += await scanOutreachDigest(input.client, semester.id, members, now);
    }
  }
  const stale = input.localTest ? [] : await pages((start, end) => input.client.from('notification_deliveries').select('id').in('semester_id', [...input.semesterIds]).eq('status', 'submitting').lt('updated_at', new Date(now.getTime() - 15 * 60_000).toISOString()).range(start, end), 'stale submission scan');
  for (const item of stale) {
    const update = await input.client.from('notification_deliveries').update({ status: 'unknown', last_error: 'Submission interrupted. Check Sequenzy before any retry.', updated_at: now.toISOString() }).eq('id', item.id).eq('status', 'submitting');
    checked(update.error, 'stale submission quarantine'); summary.unknown++;
  }
  const readyQuery = input.client.from('notification_deliveries').select('*').in('semester_id', [...input.semesterIds]).eq('status', 'queued').gte('created_at', activation.toISOString()).lte('due_at', now.toISOString()).order('due_at');
  const ready = await (input.localTest ? readyQuery.eq('source_id', input.localTest.bookingRequestId).eq('recipient_email', input.localTest.recipientEmail).in('event_kind', ['booking_requested', 'booking_confirmed']) : readyQuery).limit(25);
  checked(ready.error, 'queued delivery scan');
  const deliveries = ready.data ?? [];
  for (const delivery of deliveries) {
    const claim = await input.client.from('notification_deliveries').update({ status: 'submitting', updated_at: now.toISOString() }).eq('id', delivery.id).eq('status', 'queued').select('id').maybeSingle();
    checked(claim.error, 'delivery claim');
    if (!claim.data) continue;
    let mail: Mail | null;
    try { mail = await currentMail(input.client, delivery, input.appOrigin, now); }
    catch {
      const update = await input.client.from('notification_deliveries').update({ status: 'unknown', last_error: 'Message rendering or source verification failed. Check server logs.', updated_at: now.toISOString() }).eq('id', delivery.id).eq('status', 'submitting');
      checked(update.error, 'render failure record'); summary.unknown++; continue;
    }
    if (!mail) {
      const update = await input.client.from('notification_deliveries').update({ status: 'suppressed', last_error: 'Source or recipient changed before submission.', updated_at: now.toISOString() }).eq('id', delivery.id).eq('status', 'submitting');
      checked(update.error, 'suppression record'); summary.suppressed++; continue;
    }
    let result: Awaited<ReturnType<typeof submitSequenzyNotification>>;
    try { result = await (input.submit ?? submitSequenzyNotification)({ apiKey: input.apiKey, to: delivery.recipient_email, subject: mail.subject, html: mail.html }); }
    catch { result = { kind: 'unknown', error: 'Sequenzy submission state is unknown. Check the provider before retrying.' }; }
    const update = await input.client.from('notification_deliveries').update({ status: result.kind, provider_id: result.kind === 'accepted' ? result.emailSendId : null, last_error: result.kind === 'accepted' ? null : result.error, updated_at: now.toISOString() }).eq('id', delivery.id).eq('status', 'submitting');
    checked(update.error, 'provider result record'); summary[result.kind]++;
  }
  return summary;
}
