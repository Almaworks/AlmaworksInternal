import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "@/src/auth/server";
import {
  createParticipantDashboardService,
  type ParticipantDashboardRepository,
  type ParticipantDashboardSnapshot,
  type ParticipantProfileForm,
} from "@/src/dashboard/participant-dashboard-server";
import type { ParticipantDirectoryEntry, ParticipantMembershipInput, ParticipantSessionInput } from "@/src/dashboard/participant-dashboard";
import type { Database } from "@/src/db/types";
import type { SessionAttendeeRsvp, SessionRsvpState } from "@/src/sessions/rsvp";
import { normalizeAvailabilityFormat } from "@/src/program/availability-windows";
import { scopeActiveNetwork } from "@/src/dashboard/participant-network";

type RlsClient = SupabaseClient<Database>;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function ensure(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function timezoneFrom(configuration: Database["public"]["Tables"]["semesters"]["Row"]["configuration"]): string | null {
  if (!configuration || Array.isArray(configuration) || typeof configuration !== "object") return null;
  const value = (configuration as Record<string, unknown>).timezone;
  return typeof value === "string" ? value : null;
}

async function loadSnapshot(client: RlsClient, user: User, profileId: string): Promise<ParticipantDashboardSnapshot> {
  const [semesterResult, membershipsResult, profileResult] = await Promise.all([
    client.from("semesters").select("id,name,configuration").eq("is_active", true).maybeSingle(),
    client.from("semester_memberships").select("id,semester_id,profile_id,role,status").eq("profile_id", profileId),
    client.from("profiles").select("id,full_name,email").eq("id", profileId).maybeSingle(),
  ]);
  ensure(semesterResult.error);
  ensure(membershipsResult.error);
  ensure(profileResult.error);

  const activeSemester = semesterResult.data ? { id: semesterResult.data.id, name: semesterResult.data.name, configuration: semesterResult.data.configuration } : null;
  const memberships = (membershipsResult.data ?? []).map((row): ParticipantMembershipInput => ({
    id: row.id,
    semesterId: row.semester_id,
    profileId: row.profile_id,
    role: row.role,
    status: row.status,
  }));
  const membership = activeSemester
    ? memberships.find((row) => row.semesterId === activeSemester.id && (row.role === "mentor" || row.role === "startup") && row.status !== "alumni" && row.status !== "suspended")
    : null;
  const profile = profileResult.data;
  const base: ParticipantDashboardSnapshot = {
    activeSemester,
    memberships,
    identity: {
      profileId,
      fullName: profile?.full_name ?? user.email?.split("@")[0] ?? "Participant",
      email: user.email ?? profile?.email ?? "",
      emailVerified: Boolean(user.email_confirmed_at),
    },
    startupSemesterId: null,
    mentorSemesterId: null,
    profileComplete: Boolean(profile?.full_name?.trim()),
    roleSetupComplete: false,
    sessions: [],
    network: [],
  };
  if (!activeSemester || !membership || membership.role === "admin") return base;

  const [meetingsResult, notificationReadsResult] = await Promise.all([
    client.from("meetings")
      .select("id,meeting_date,slot_1_starts_at,slot_1_ends_at,slot_2_starts_at,slot_2_ends_at")
      .eq("semester_id", activeSemester.id),
    client.from("participant_notification_reads")
      .select("notification_key")
      .eq("profile_id", profileId)
      .eq("semester_id", activeSemester.id),
  ]);
  ensure(meetingsResult.error);
  ensure(notificationReadsResult.error);
  base.readNotificationKeys = (notificationReadsResult.data ?? []).map((row) => row.notification_key);
  const meetings = new Map((meetingsResult.data ?? []).map((row) => [row.id, row]));
  const sessionsResult = await client.from("sessions")
    .select("id,semester_id,meeting_id,mentor_semester_id,startup_semester_id,slot,status,topic,format")
    .eq("semester_id", activeSemester.id);
  ensure(sessionsResult.error);

  const startupRowsResult = await client.from("startup_semesters")
    .select("id,semester_id,startup_organization_id,company_snapshot,stage,goals,mentorship_needs,mentor_need_context,mentor_need_no_preference,readiness_status,startup_organizations(id,name,description,industry,website_url,logo_url)")
    .eq("semester_id", activeSemester.id);
  ensure(startupRowsResult.error);
  const startupRows = (startupRowsResult.data ?? []) as unknown as Array<{
    id: string; semester_id: string; startup_organization_id: string; company_snapshot: string | null; stage: string | null;
    goals: string[]; mentorship_needs: string[]; mentor_need_context: string | null; mentor_need_no_preference: boolean; readiness_status: string;
    startup_organizations: { id: string; name: string; description: string | null; industry: string | null; website_url: string | null; logo_url: string | null } | null;
  }>;
  const startupNames = new Map(startupRows.map((row) => [row.id, relation(row.startup_organizations)?.name ?? "Startup"]));

  let mentorNames = new Map<string, string>();
  if (membership.role === "mentor") {
    const mentorSemesterResult = await client.from("mentor_semesters")
      .select("id,readiness_status,general_availability,mentorship_goals,preferred_format")
      .eq("semester_id", activeSemester.id)
      .eq("semester_membership_id", membership.id)
      .maybeSingle();
    ensure(mentorSemesterResult.error);
    const mentorProfileResult = await client.from("mentor_profiles")
      .select("biography,company,title,linkedin_url,website_url,expertise_tags")
      .eq("profile_id", profileId)
      .maybeSingle();
    ensure(mentorProfileResult.error);
    const own = mentorProfileResult.data;
    base.mentorSemesterId = mentorSemesterResult.data?.id ?? null;
    base.profileComplete = Boolean(profile?.full_name?.trim() && own?.biography?.trim() && own?.title?.trim());
    base.roleSetupComplete = Boolean(mentorSemesterResult.data?.general_availability?.trim() || mentorSemesterResult.data?.readiness_status === "ready");
    base.profile = {
      headline: [own?.title, own?.company].filter(Boolean).join(" · "),
      summary: own?.biography ?? "",
      tags: own?.expertise_tags ?? [],
      websiteUrl: own?.website_url ?? "",
      linkedinUrl: own?.linkedin_url ?? "",
    };
    const availabilityResult = await client.from("meeting_availability")
      .select("meeting_id,slot,is_available")
      .eq("semester_id", activeSemester.id)
      .eq("semester_membership_id", membership.id);
    ensure(availabilityResult.error);
    const availabilityBySlot = new Map((availabilityResult.data ?? []).map((row) => [`${row.meeting_id}:${row.slot}`, row]));
    base.availability = [...meetings.values()]
      .filter((meeting) => Date.parse(`${meeting.meeting_date}T23:59:59Z`) >= Date.now())
      .sort((left, right) => left.meeting_date.localeCompare(right.meeting_date))
      .flatMap((meeting) => ([1, 2] as const).map((slot) => {
        const saved = availabilityBySlot.get(`${meeting.id}:${slot}`);
        const confirmed = (sessionsResult.data ?? []).find((session) => session.meeting_id === meeting.id && session.slot === slot && session.mentor_semester_id === base.mentorSemesterId && session.status === "confirmed");
        return {
          meetingId: meeting.id,
          meetingDate: meeting.meeting_date,
          slot,
          startsAt: slot === 1 ? meeting.slot_1_starts_at : meeting.slot_2_starts_at,
          endsAt: slot === 1 ? meeting.slot_1_ends_at : meeting.slot_2_ends_at,
          timezone: timezoneFrom(activeSemester.configuration),
          isAvailable: saved?.is_available ?? false,
          format: normalizeAvailabilityFormat(mentorSemesterResult.data?.preferred_format),
          confirmedSession: confirmed ? { id: confirmed.id, startup: startupNames.get(confirmed.startup_semester_id) ?? "Startup", topic: confirmed.topic, format: confirmed.format } : null,
        };
      }));
  } else {
    const teamResult = await client.from("startup_team_memberships")
      .select("startup_semester_id")
      .eq("semester_id", activeSemester.id)
      .eq("semester_membership_id", membership.id)
      .maybeSingle();
    ensure(teamResult.error);
    base.startupSemesterId = teamResult.data?.startup_semester_id ?? null;
    const own = startupRows.find((row) => row.id === base.startupSemesterId);
    base.profileComplete = Boolean(profile?.full_name?.trim() && own?.company_snapshot?.trim());
    base.roleSetupComplete = Boolean(own && (own.mentorship_needs.length > 0 || own.readiness_status === "ready"));
    base.profile = {
      headline: own?.mentor_need_context ?? "",
      summary: own?.company_snapshot ?? "",
      tags: own?.mentorship_needs ?? [],
      websiteUrl: relation(own?.startup_organizations ?? null)?.website_url ?? "",
      linkedinUrl: "",
    };
    base.mentorNeeds = {
      needs: own?.mentorship_needs ?? [],
      context: own?.mentor_need_context ?? null,
      noPreference: own?.mentor_need_no_preference ?? false,
    };
  }

  const networkMembershipsResult = await client.from("semester_memberships")
    .select("id,semester_id,profile_id,role,status")
    .eq("semester_id", activeSemester.id).eq("status", "active").in("role", ["mentor", "startup"]);
  ensure(networkMembershipsResult.error);
  const networkMemberships = (networkMembershipsResult.data ?? []).map((row): ParticipantMembershipInput => ({
    id: row.id, semesterId: row.semester_id, profileId: row.profile_id, role: row.role, status: row.status,
  }));
  const networkProfileIds = [...new Set(networkMemberships.map((member) => member.profileId))];
  const mentorProfileIds = networkMemberships.filter((member) => member.role === "mentor").map((member) => member.profileId);
  const [networkProfilesResult, networkMentorsResult] = await Promise.all([
    networkProfileIds.length ? client.from("profiles").select("id,full_name,email").in("id", networkProfileIds) : { data: [], error: null },
    mentorProfileIds.length ? client.from("mentor_profiles").select("profile_id,biography,company,title,linkedin_url,website_url,photo_url,expertise_tags").in("profile_id", mentorProfileIds) : { data: [], error: null },
  ]);
  ensure(networkProfilesResult.error);
  ensure(networkMentorsResult.error);
  const networkProfiles = new Map((networkProfilesResult.data ?? []).map((person) => [person.id, person]));
  const networkMentors = new Map((networkMentorsResult.data ?? []).map((mentor) => [mentor.profile_id, mentor]));

  const timezone = timezoneFrom(activeSemester.configuration);

  const mentorTermsResult = await client.from("mentor_semesters")
    .select("id,semester_membership_id")
    .eq("semester_id", activeSemester.id);
  ensure(mentorTermsResult.error);
  const teamRowsResult = await client.from("startup_team_memberships")
    .select("startup_semester_id,semester_membership_id")
    .eq("semester_id", activeSemester.id);
  ensure(teamRowsResult.error);
  base.network = scopeActiveNetwork(activeSemester.id, profileId, networkMemberships, networkMemberships.flatMap((member): ParticipantDirectoryEntry[] => {
    const person = networkProfiles.get(member.profileId);
    if (!person) return [];
    if (member.role === "mentor") {
      const mentor = networkMentors.get(member.profileId);
      return [{
        id: person.id, semesterId: member.semesterId, kind: "mentor", name: person.full_name || "Almaworks mentor",
        headline: [mentor?.title, mentor?.company].filter(Boolean).join(" · "), tags: mentor?.expertise_tags ?? [],
        summary: mentor?.biography ?? "", websiteUrl: mentor?.website_url ?? null, photoUrl: mentor?.photo_url ?? null,
        email: person.email, linkedinUrl: mentor?.linkedin_url ?? null,
      }];
    }
    const team = (teamRowsResult.data ?? []).find((row) => row.semester_membership_id === member.id);
    const startup = startupRows.find((row) => row.id === team?.startup_semester_id);
    const org = relation(startup?.startup_organizations ?? null);
    return [{
      id: person.id, semesterId: member.semesterId, kind: "startup", name: person.full_name || "Startup member",
      headline: [org?.name, org?.industry, startup?.stage].filter(Boolean).join(" · "), tags: [...(startup?.goals ?? []), ...(startup?.mentorship_needs ?? [])],
      summary: startup?.company_snapshot ?? org?.description ?? "", websiteUrl: org?.website_url ?? null, photoUrl: null,
      email: person.email, linkedinUrl: null,
    }];
  }));
  const eligibleMembershipIds = [...new Set([
    ...(mentorTermsResult.data ?? []).map((row) => row.semester_membership_id),
    ...(teamRowsResult.data ?? []).map((row) => row.semester_membership_id),
  ])];
  const attendeeMembershipsResult = eligibleMembershipIds.length === 0
    ? { data: [], error: null }
    : await client.from("semester_memberships").select("id,profile_id,role").in("id", eligibleMembershipIds);
  ensure(attendeeMembershipsResult.error);
  const attendeeProfileIds = [...new Set((attendeeMembershipsResult.data ?? []).map((row) => row.profile_id))];
  const attendeeProfilesResult = attendeeProfileIds.length === 0
    ? { data: [], error: null }
    : await client.from("profiles").select("id,full_name,email").in("id", attendeeProfileIds);
  ensure(attendeeProfilesResult.error);
  const attendeeProfiles = new Map((attendeeProfilesResult.data ?? []).map((row) => [row.id, row.full_name?.trim() || row.email]));
  const attendeeMemberships = new Map((attendeeMembershipsResult.data ?? []).map((row) => [row.id, row]));
  const mentorMembershipByTerm = new Map((mentorTermsResult.data ?? []).map((row) => [row.id, row.semester_membership_id]));
  mentorNames = new Map((mentorTermsResult.data ?? []).map((term) => {
    const mentorMembership = attendeeMemberships.get(term.semester_membership_id);
    return [term.id, mentorMembership ? attendeeProfiles.get(mentorMembership.profile_id) ?? "Assigned mentor" : "Assigned mentor"];
  }));
  const startupMemberships = new Map<string, string[]>();
  for (const row of teamRowsResult.data ?? []) {
    startupMemberships.set(row.startup_semester_id, [...(startupMemberships.get(row.startup_semester_id) ?? []), row.semester_membership_id]);
  }
  const rsvpsResult = await client.from("session_rsvps")
    .select("session_id,semester_membership_id,response,responded_at,updated_at")
    .eq("semester_id", activeSemester.id);
  ensure(rsvpsResult.error);
  const rsvpBySessionMembership = new Map((rsvpsResult.data ?? []).map((row) => [`${row.session_id}:${row.semester_membership_id}`, row]));

  function attendee(membershipId: string, sessionId: string): SessionAttendeeRsvp | null {
    const member = attendeeMemberships.get(membershipId);
    if (!member || (member.role !== "mentor" && member.role !== "startup")) return null;
    const rsvp = rsvpBySessionMembership.get(`${sessionId}:${membershipId}`);
    return {
      semesterMembershipId: membershipId,
      profileId: member.profile_id,
      fullName: attendeeProfiles.get(member.profile_id) ?? "Participant",
      role: member.role,
      response: (rsvp?.response ?? "no_response") as SessionRsvpState,
      respondedAt: rsvp?.responded_at ?? null,
      updatedAt: rsvp?.updated_at ?? null,
    };
  }

  base.sessions = (sessionsResult.data ?? []).flatMap((row): ParticipantSessionInput[] => {
    const meeting = meetings.get(row.meeting_id);
    if (!meeting) return [];
    const slot = row.slot === 2 ? 2 : 1;
    return [{
      id: row.id,
      semesterId: row.semester_id,
      mentorSemesterId: row.mentor_semester_id,
      startupSemesterId: row.startup_semester_id,
      partnerName: membership.role === "mentor" ? startupNames.get(row.startup_semester_id) ?? "Startup" : mentorNames.get(row.mentor_semester_id) ?? "Assigned mentor",
      meetingDate: meeting.meeting_date,
      startsAt: slot === 1 ? meeting.slot_1_starts_at : meeting.slot_2_starts_at,
      endsAt: slot === 1 ? meeting.slot_1_ends_at : meeting.slot_2_ends_at,
      timezone,
      topic: row.topic,
      format: row.format,
      status: row.status,
      attendees: [
        mentorMembershipByTerm.get(row.mentor_semester_id),
        ...(startupMemberships.get(row.startup_semester_id) ?? []),
      ].flatMap((membershipId) => membershipId ? [attendee(membershipId, row.id)].filter((value): value is SessionAttendeeRsvp => value !== null) : []),
    }];
  });
  return base;
}

function repository(client: RlsClient, user: User, profileId: string): ParticipantDashboardRepository {
  return {
    load: async () => await loadSnapshot(client, user, profileId),
    updateProfile: async (profileId, context, payload) => {
      const profileResult = await client.from("profiles").update(payload.profile).eq("id", profileId);
      ensure(profileResult.error);
      if (context.role === "mentor" && "mentorProfile" in payload && payload.mentorProfile) {
        const result = await client.from("mentor_profiles").update(payload.mentorProfile).eq("profile_id", profileId);
        ensure(result.error);
      }
      if (context.role === "startup" && "startupSemester" in payload && payload.startupSemester) {
        const team = await client.from("startup_team_memberships").select("startup_semester_id").eq("semester_membership_id", context.membershipId).maybeSingle();
        ensure(team.error);
        if (!team.data) throw new Error("Startup team assignment is missing.");
        const result = await client.from("startup_semesters").update(payload.startupSemester).eq("id", team.data.startup_semester_id).eq("semester_id", context.semesterId);
        ensure(result.error);
      }
    },
  };
}

async function context(request: Request) {
  const auth = await requireAuthenticatedUserWithRls(request);
  return { auth, service: createParticipantDashboardService(repository(auth.userClient, auth.user, auth.profileId)) };
}

export async function GET(request: Request) {
  try {
    const { auth, service } = await context(request);
    return NextResponse.json({ data: await service.load(auth.profileId) });
  } catch (cause) {
    if (cause instanceof AuthorizationError) return fail(cause.message, cause.status);
    return fail(cause instanceof Error ? cause.message : "Dashboard data could not be loaded.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return fail("A profile payload is required.", 422);
    const candidate = body as Record<string, unknown>;
    const required = ["fullName", "headline", "summary", "tags", "websiteUrl", "linkedinUrl"] as const;
    if (required.some((field) => typeof candidate[field] !== "string")) return fail("Profile fields must be strings.", 422);
    const form = Object.fromEntries(required.map((field) => [field, text(candidate[field])])) as unknown as ParticipantProfileForm;
    const { auth, service } = await context(request);
    await service.update(auth.profileId, form);
    return NextResponse.json({ data: { saved: true } });
  } catch (cause) {
    if (cause instanceof AuthorizationError) return fail(cause.message, cause.status);
    return fail(cause instanceof Error ? cause.message : "Profile could not be saved.", 500);
  }
}
