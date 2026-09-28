import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { formatEnumLabel } from "../presentation/display-labels.ts";
import { startupStageOrDefault } from "../program/startup-stage.ts";
import { selectWithOptionalProfilePhotoPath } from "../profile-photos/schema-compatibility.ts";
import { createProfilePhotoUrlResolver } from "../profile-photos/urls.ts";
import { weeklyAvailabilityForProfile } from "./participant-availability.ts";
import type {
  ParticipantBookingNotification,
  ParticipantDirectoryEntry,
  ParticipantMembershipInput,
} from "./participant-dashboard.ts";
import type { ParticipantDashboardSnapshot } from "./participant-dashboard-server.ts";
import { scopeActiveNetwork } from "./participant-network.ts";
import { buildStartupDirectory } from "./participant-startups.ts";

export type ParticipantSnapshotClient = SupabaseClient<Database>;
type ParticipantUser = Pick<User, "email" | "email_confirmed_at">;

type StartupRow = {
  company_snapshot: string | null;
  goals: string[];
  id: string;
  mentor_need_context: string | null;
  mentor_need_no_preference: boolean;
  mentorship_needs: string[];
  readiness_status: string;
  semester_id: string;
  stage: string | null;
  startup_organization_id: string;
  startup_organizations: {
    description: string | null;
    id: string;
    industry: string | null;
    logo_url: string | null;
    name: string;
    website_url: string | null;
  } | Array<{
    description: string | null;
    id: string;
    industry: string | null;
    logo_url: string | null;
    name: string;
    website_url: string | null;
  }> | null;
};

function ensure(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function membershipInputs(rows: Array<{
  id: string;
  profile_id: string;
  role: Database["public"]["Enums"]["user_role"];
  semester_id: string;
  status: Database["public"]["Enums"]["membership_lifecycle_status"];
}> | null): ParticipantMembershipInput[] {
  return (rows ?? []).map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    role: row.role,
    semesterId: row.semester_id,
    status: row.status,
  }));
}

function activeParticipantMembership(
  memberships: ParticipantMembershipInput[],
  semesterId: string | null,
): ParticipantMembershipInput | null {
  const eligible = semesterId
    ? memberships.filter((row) => (
      row.semesterId === semesterId
      && (row.role === "mentor" || row.role === "startup")
      && row.status !== "alumni"
      && row.status !== "suspended"
    ))
    : [];
  return eligible.find((row) => row.role === "mentor")
    ?? eligible.find((row) => row.role === "startup")
    ?? null;
}

async function loadNetwork(
  client: ParticipantSnapshotClient,
  resolvePhotoUrl: ReturnType<typeof createProfilePhotoUrlResolver>,
  networkMembershipsPromise: Promise<ParticipantMembershipInput[]>,
) {
  const networkMemberships = await networkMembershipsPromise;
  const networkProfileIds = [...new Set(networkMemberships.map((member) => member.profileId))];
  const mentorProfileIds = networkMemberships
    .filter((member) => member.role === "mentor")
    .map((member) => member.profileId);
  const networkProfilesResultPromise = networkProfileIds.length
    ? selectWithOptionalProfilePhotoPath(
      () => client.from("profiles").select("id,full_name,email,photo_path").in("id", networkProfileIds),
      () => client.from("profiles").select("id,full_name,email").in("id", networkProfileIds),
    )
    : Promise.resolve({ data: [], error: null });
  const [networkProfilesResult, networkMentorsResult] = await Promise.all([
    networkProfilesResultPromise,
    mentorProfileIds.length
      ? client.from("mentor_profiles").select("profile_id,biography,company,title,linkedin_url,website_url,photo_url,expertise_tags").in("profile_id", mentorProfileIds)
      : { data: [], error: null },
  ]);
  ensure(networkProfilesResult.error);
  ensure(networkMentorsResult.error);
  const networkPeople = networkProfilesResult.data ?? [];
  const networkMentors = new Map((networkMentorsResult.data ?? []).map((mentor) => [mentor.profile_id, mentor]));
  const resolvedPhotoUrls = await resolvePhotoUrl.resolveMany(networkPeople.map((person) => {
    const photoPathValue = "photo_path" in person ? person.photo_path : null;
    return {
      legacyPhotoUrl: networkMentors.get(person.id)?.photo_url,
      photoPath: typeof photoPathValue === "string" ? photoPathValue : null,
    };
  }));
  return {
    networkMemberships,
    networkMentors,
    networkPeople,
    networkPhotoUrls: new Map(networkPeople.map((person, index) => (
      [person.id, resolvedPhotoUrls[index] ?? null] as const
    ))),
    networkProfiles: new Map(networkPeople.map((person) => [person.id, person])),
  };
}

async function loadMentorRole(
  client: ParticipantSnapshotClient,
  profileId: string,
  semesterId: string,
) {
  const [mentorProfileResult, weeklyAvailabilityResult, upcomingMeetingsResult, bookingNotificationsResult] = await Promise.all([
    client.from("mentor_profiles")
      .select("biography,company,title,linkedin_url,website_url,expertise_tags")
      .eq("profile_id", profileId)
      .maybeSingle(),
    client.from("mentor_weekly_availability")
      .select("weekday,starts_at,ends_at,mentor_semesters!inner(semester_memberships!inner(profile_id))")
      .eq("semester_id", semesterId)
      .order("weekday")
      .order("starts_at"),
    client.from("mentor_booking_requests")
      .select("starts_at,ends_at,startup_name,topic")
      .eq("semester_id", semesterId)
      .eq("mentor_profile_id", profileId)
      .eq("status", "accepted")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(3),
    client.from("mentor_booking_requests")
      .select("id,status,startup_name,topic,requested_at,starts_at,ends_at")
      .eq("semester_id", semesterId)
      .eq("mentor_profile_id", profileId)
      .in("status", ["pending", "accepted", "declined", "cancelled"])
      .order("requested_at", { ascending: false }),
  ]);
  ensure(mentorProfileResult.error);
  ensure(weeklyAvailabilityResult.error);
  ensure(upcomingMeetingsResult.error);
  ensure(bookingNotificationsResult.error);
  return {
    bookingNotifications: (bookingNotificationsResult.data ?? [])
      .filter((booking): booking is typeof booking & { status: ParticipantBookingNotification["status"] } => (
        booking.status === "pending"
        || booking.status === "accepted"
        || booking.status === "declined"
        || booking.status === "cancelled"
      ))
      .map((booking) => ({
        counterpartName: booking.startup_name,
        durationMinutes: (Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60000,
        createdAt: booking.requested_at,
        requestId: booking.id,
        status: booking.status,
        topic: booking.topic,
      })),
    mentorProfile: mentorProfileResult.data,
    upcomingMeetings: (upcomingMeetingsResult.data ?? []).map((meeting) => ({
      counterpartName: meeting.startup_name,
      endsAt: meeting.ends_at,
      startsAt: meeting.starts_at,
      topic: meeting.topic,
    })),
    weeklyAvailability: weeklyAvailabilityForProfile(weeklyAvailabilityResult.data ?? [], profileId),
  };
}

async function loadStartupRole(
  client: ParticipantSnapshotClient,
  membershipId: string,
  semesterId: string,
) {
  const teamResult = await client.from("startup_team_memberships")
    .select("startup_semester_id")
    .eq("semester_id", semesterId)
    .eq("semester_membership_id", membershipId)
    .maybeSingle();
  ensure(teamResult.error);
  const startupSemesterId = teamResult.data?.startup_semester_id ?? null;
  if (!startupSemesterId) {
    return { bookingNotifications: [], startupSemesterId, upcomingMeetings: [] };
  }
  const [upcomingMeetingsResult, bookingNotificationsResult] = await Promise.all([
    client.from("mentor_booking_requests")
      .select("starts_at,ends_at,mentor_name,topic")
      .eq("semester_id", semesterId)
      .eq("startup_semester_id", startupSemesterId)
      .eq("status", "accepted")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(3),
    client.from("mentor_booking_requests")
      .select("id,status,mentor_name,topic,responded_at")
      .eq("semester_id", semesterId)
      .eq("startup_semester_id", startupSemesterId)
      .in("status", ["accepted", "declined"])
      .order("responded_at", { ascending: false }),
  ]);
  ensure(upcomingMeetingsResult.error);
  ensure(bookingNotificationsResult.error);
  return {
    bookingNotifications: (bookingNotificationsResult.data ?? [])
      .filter((booking): booking is typeof booking & { responded_at: string; status: "accepted" | "declined" } => (
        (booking.status === "accepted" || booking.status === "declined") && booking.responded_at !== null
      ))
      .map((booking) => ({
        counterpartName: booking.mentor_name,
        createdAt: booking.responded_at,
        requestId: booking.id,
        status: booking.status,
        topic: booking.topic,
      })),
    startupSemesterId,
    upcomingMeetings: (upcomingMeetingsResult.data ?? []).map((meeting) => ({
      counterpartName: meeting.mentor_name,
      endsAt: meeting.ends_at,
      startsAt: meeting.starts_at,
      topic: meeting.topic,
    })),
  };
}

export async function loadParticipantProfileUpdateSnapshot(
  client: ParticipantSnapshotClient,
  user: ParticipantUser,
  profileId: string,
): Promise<ParticipantDashboardSnapshot> {
  const [semesterResult, membershipsResult] = await Promise.all([
    client.from("semesters").select("id,name,configuration").eq("is_active", true).maybeSingle(),
    client.from("semester_memberships").select("id,semester_id,profile_id,role,status").eq("profile_id", profileId),
  ]);
  ensure(semesterResult.error);
  ensure(membershipsResult.error);
  return {
    activeSemester: semesterResult.data ? {
      id: semesterResult.data.id,
      name: semesterResult.data.name,
    } : null,
    identity: {
      email: user.email ?? "",
      emailVerified: Boolean(user.email_confirmed_at),
      fullName: user.email?.split("@")[0] ?? "Participant",
      photoUrl: null,
      profileId,
    },
    memberships: membershipInputs(membershipsResult.data),
    mentorSemesterId: null,
    network: [],
    profileComplete: false,
    roleSetupComplete: false,
    startupSemesterId: null,
    weeklyAvailability: [],
  };
}

export async function loadParticipantDashboardSnapshot(
  client: ParticipantSnapshotClient,
  user: ParticipantUser,
  profileId: string,
): Promise<ParticipantDashboardSnapshot> {
  const resolvePhotoUrl = createProfilePhotoUrlResolver(client);
  const profileResultPromise = selectWithOptionalProfilePhotoPath(
    () => client.from("profiles").select("id,full_name,email,photo_path").eq("id", profileId).maybeSingle(),
    () => client.from("profiles").select("id,full_name,email").eq("id", profileId).maybeSingle(),
  );
  const [semesterResult, membershipsResult, profileResult, ownMentorPhotoResult] = await Promise.all([
    client.from("semesters").select("id,name,configuration").eq("is_active", true).maybeSingle(),
    client.from("semester_memberships").select("id,semester_id,profile_id,role,status").eq("profile_id", profileId),
    profileResultPromise,
    client.from("mentor_profiles").select("photo_url").eq("profile_id", profileId).maybeSingle(),
  ]);
  ensure(semesterResult.error);
  ensure(membershipsResult.error);
  ensure(profileResult.error);
  ensure(ownMentorPhotoResult.error);

  const activeSemester = semesterResult.data ? {
    id: semesterResult.data.id,
    name: semesterResult.data.name,
  } : null;
  const memberships = membershipInputs(membershipsResult.data);
  const membership = activeParticipantMembership(memberships, activeSemester?.id ?? null);
  const profile = profileResult.data;
  const ownPhotoPath = profile && "photo_path" in profile ? profile.photo_path : null;
  const ownPhotoUrlPromise = resolvePhotoUrl(ownPhotoPath, ownMentorPhotoResult.data?.photo_url);
  const base: ParticipantDashboardSnapshot = {
    activeSemester,
    identity: {
      email: user.email ?? profile?.email ?? "",
      emailVerified: Boolean(user.email_confirmed_at),
      fullName: profile?.full_name ?? user.email?.split("@")[0] ?? "Participant",
      photoUrl: null,
      profileId,
    },
    memberships,
    mentorSemesterId: null,
    network: [],
    profileComplete: Boolean(profile?.full_name?.trim()),
    roleSetupComplete: false,
    startupSemesterId: null,
    weeklyAvailability: [],
  };
  if (!activeSemester || !membership) {
    base.identity.photoUrl = await ownPhotoUrlPromise;
    return base;
  }

  const notificationReadsPromise = (async () => {
    const result = await client.from("participant_notification_reads")
      .select("notification_key")
      .eq("profile_id", profileId)
      .eq("semester_id", activeSemester.id);
    ensure(result.error);
    return (result.data ?? []).map((row) => row.notification_key);
  })();
  const startupRowsPromise = (async () => {
    const result = await client.from("startup_semesters")
      .select("id,semester_id,startup_organization_id,company_snapshot,stage,goals,mentorship_needs,mentor_need_context,mentor_need_no_preference,readiness_status,startup_organizations(id,name,description,industry,website_url,logo_url)")
      .eq("semester_id", activeSemester.id);
    ensure(result.error);
    return (result.data ?? []) as unknown as StartupRow[];
  })();
  const networkMembershipsPromise = (async () => {
    const result = await client.from("semester_memberships")
      .select("id,semester_id,profile_id,role,status")
      .eq("semester_id", activeSemester.id)
      .eq("status", "active")
      .in("role", ["mentor", "startup"]);
    ensure(result.error);
    return membershipInputs(result.data);
  })();
  const teamRowsPromise = (async () => {
    const result = await client.from("startup_team_memberships")
      .select("startup_semester_id,semester_membership_id")
      .eq("semester_id", activeSemester.id);
    ensure(result.error);
    return result.data ?? [];
  })();
  const networkPromise = loadNetwork(client, resolvePhotoUrl, networkMembershipsPromise);
  const mentorRolePromise = membership.role === "mentor"
    ? loadMentorRole(client, profileId, activeSemester.id)
    : null;
  const startupRolePromise = membership.role === "startup"
    ? loadStartupRole(client, membership.id, activeSemester.id)
    : null;

  const [readNotificationKeys, startupRows, teamRows, networkData, mentorRole, startupRole, ownPhotoUrl] = await Promise.all([
    notificationReadsPromise,
    startupRowsPromise,
    teamRowsPromise,
    networkPromise,
    mentorRolePromise,
    startupRolePromise,
    ownPhotoUrlPromise,
  ]);
  base.identity.photoUrl = ownPhotoUrl;
  base.readNotificationKeys = readNotificationKeys;

  if (mentorRole) {
    const own = mentorRole.mentorProfile;
    base.bookingNotifications = mentorRole.bookingNotifications;
    base.profile = {
      company: own?.company ?? "",
      headline: own?.title ?? "",
      linkedinUrl: own?.linkedin_url ?? "",
      summary: own?.biography ?? "",
      tags: own?.expertise_tags ?? [],
      websiteUrl: own?.website_url ?? "",
    };
    base.profileComplete = Boolean(profile?.full_name?.trim() && own?.biography?.trim() && own?.title?.trim());
    base.upcomingMeetings = mentorRole.upcomingMeetings;
    base.weeklyAvailability = mentorRole.weeklyAvailability;
    base.startups = buildStartupDirectory(
      activeSemester.id,
      startupRows.map((startup) => {
        const organization = relation(startup.startup_organizations);
        return {
          description: startup.company_snapshot || organization?.description || "",
          goals: startup.goals ?? [],
          id: startup.id,
          industry: organization?.industry ?? "",
          mentorNeedContext: startup.mentor_need_context,
          mentorshipNeeds: startup.mentorship_needs ?? [],
          name: organization?.name ?? "Startup",
          semesterId: startup.semester_id,
          stage: startup.stage ?? "",
          websiteUrl: organization?.website_url ?? null,
        };
      }),
      networkData.networkMemberships,
      teamRows,
      networkData.networkPeople.map((person) => ({
        ...person,
        photoUrl: networkData.networkPhotoUrls.get(person.id) ?? null,
      })),
    );
  }

  if (startupRole) {
    base.bookingNotifications = startupRole.bookingNotifications;
    base.startupSemesterId = startupRole.startupSemesterId;
    base.upcomingMeetings = startupRole.upcomingMeetings;
    const own = startupRows.find((row) => row.id === base.startupSemesterId);
    const organization = relation(own?.startup_organizations ?? null);
    base.mentorNeeds = {
      context: own?.mentor_need_context ?? null,
      needs: own?.mentorship_needs ?? [],
      noPreference: own?.mentor_need_no_preference ?? false,
    };
    base.profile = {
      headline: own?.mentor_need_context ?? "",
      linkedinUrl: "",
      summary: own?.company_snapshot ?? "",
      tags: own?.mentorship_needs ?? [],
      websiteUrl: organization?.website_url ?? "",
    };
    base.profileComplete = Boolean(profile?.full_name?.trim() && own?.company_snapshot?.trim());
    base.roleSetupComplete = Boolean(own && (own.mentorship_needs.length > 0 || own.readiness_status === "ready"));
    base.startupProfile = own && organization ? {
      description: organization.description ?? "",
      industry: organization.industry ?? "",
      name: organization.name,
      stage: startupStageOrDefault(own.stage),
      websiteUrl: organization.website_url ?? "",
    } : null;
  }

  base.network = scopeActiveNetwork(
    activeSemester.id,
    profileId,
    networkData.networkMemberships,
    networkData.networkMemberships.flatMap((member): ParticipantDirectoryEntry[] => {
      const person = networkData.networkProfiles.get(member.profileId);
      if (!person) return [];
      if (member.role === "mentor") {
        const mentor = networkData.networkMentors.get(member.profileId);
        return [{
          email: person.email,
          headline: [mentor?.title, mentor?.company].filter(Boolean).join(" · "),
          id: person.id,
          kind: "mentor",
          linkedinUrl: mentor?.linkedin_url ?? null,
          name: person.full_name || "Almaworks mentor",
          photoUrl: networkData.networkPhotoUrls.get(person.id) ?? null,
          semesterId: member.semesterId,
          summary: mentor?.biography ?? "",
          tags: mentor?.expertise_tags ?? [],
          websiteUrl: mentor?.website_url ?? null,
        }];
      }
      const team = teamRows.find((row) => row.semester_membership_id === member.id);
      const startup = startupRows.find((row) => row.id === team?.startup_semester_id);
      const organization = relation(startup?.startup_organizations ?? null);
      return [{
        email: person.email,
        headline: [organization?.name, organization?.industry, startup?.stage && formatEnumLabel(startup.stage)].filter(Boolean).join(" · "),
        id: person.id,
        kind: "startup",
        linkedinUrl: null,
        name: person.full_name || "Startup member",
        photoUrl: networkData.networkPhotoUrls.get(person.id) ?? null,
        semesterId: member.semesterId,
        summary: startup?.company_snapshot ?? organization?.description ?? "",
        tags: [...(startup?.goals ?? []), ...(startup?.mentorship_needs ?? [])],
        websiteUrl: organization?.website_url ?? null,
      }];
    }),
  );
  return base;
}
