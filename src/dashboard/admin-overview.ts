import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/types.ts';

export interface AdminOverview {
  startups: number;
  openNeeds: number;
  mentors: number;
  confirmedSessions: number;
  unconfirmedSessions: number;
  acceptedMentorshipBookings: number;
  pendingMentorshipBookings: number;
}

export async function loadAdminOverview(client: SupabaseClient<Database>, semesterId: string | null): Promise<AdminOverview> {
  if (!semesterId) return {
    startups: 0,
    openNeeds: 0,
    mentors: 0,
    confirmedSessions: 0,
    unconfirmedSessions: 0,
    acceptedMentorshipBookings: 0,
    pendingMentorshipBookings: 0,
  };
  // Summary projections deliberately omit directories, photos, and per-session attendance.
  const [startups, mentors, sessions, mentorshipBookings] = await Promise.all([
    client.from('startup_semesters').select('mentorship_needs').eq('semester_id', semesterId),
    client.from('mentor_semesters').select('id,membership:semester_memberships!inner(role,status)', { count: 'exact', head: true })
      .eq('semester_id', semesterId).eq('membership.role', 'mentor').eq('membership.status', 'active'),
    client.from('sessions').select('status').eq('semester_id', semesterId),
    client.from('mentor_booking_requests').select('status').eq('semester_id', semesterId),
  ]);
  for (const result of [startups, mentors, sessions, mentorshipBookings]) if (result.error) throw new Error(result.error.message);
  return {
    startups: startups.data?.length ?? 0,
    openNeeds: startups.data?.filter(row => (row.mentorship_needs?.length ?? 0) > 0).length ?? 0,
    mentors: mentors.count ?? 0,
    confirmedSessions: sessions.data?.filter(row => row.status === 'confirmed').length ?? 0,
    unconfirmedSessions: sessions.data?.filter(row => row.status === 'requested').length ?? 0,
    acceptedMentorshipBookings: mentorshipBookings.data?.filter(row => row.status === 'accepted').length ?? 0,
    pendingMentorshipBookings: mentorshipBookings.data?.filter(row => row.status === 'pending').length ?? 0,
  };
}
