import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipReadinessStatus } from "../lifecycle/membership-presentation.ts";
import type { MembershipStatus } from "../lifecycle/types.ts";
import { selectWithOptionalProfilePhotoPath } from "../profile-photos/schema-compatibility.ts";
import { createProfilePhotoUrlResolver } from "../profile-photos/urls.ts";

type ProgramClient = SupabaseClient;

type Related<T> = T | readonly T[] | null;

type MentorProfileRow = {
  biography: string | null;
  company: string | null;
  expertise_tags: string[] | null;
  linkedin_url: string | null;
  photo_url: string | null;
  title: string | null;
  website_url: string | null;
};

type ProfileRow = {
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  photo_path?: string | null;
  status: string | null;
  mentor_profile?: Related<MentorProfileRow>;
};

type MembershipRow = {
  id?: string;
  profile_id: string;
  profile: Related<ProfileRow>;
  semester_id: string;
  status?: MembershipStatus;
};

type MentorSemesterRow = {
  general_availability: string | null;
  id: string;
  membership: Related<MembershipRow>;
  opening_talk: string | null;
  per_week_availability: unknown;
  preferred_format: string | null;
  readiness_status: MembershipReadinessStatus;
  semester: Related<{ name: string }>;
  semester_id: string;
};

type StartupTeamRow = {
  is_primary_contact: boolean;
  membership: Related<MembershipRow>;
  semester_id: string;
};

type StartupSemesterRow = {
  goals: string[] | null;
  id: string;
  mentorship_needs: string[] | null;
  organization: Related<{
    description: string | null;
    id: string;
    industry: string | null;
    logo_url: string | null;
    name: string;
    slug: string;
    website_url: string | null;
  }>;
  readiness_status: MembershipReadinessStatus;
  semester: Related<{ name: string }>;
  semester_id: string;
  stage: string | null;
  team: Related<StartupTeamRow>;
};

function one<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value as T | null;
}

export type MentorView = {
  bio: string | null;
  company: string | null;
  email: string | null;
  expertise_tags: string[];
  full_name: string;
  general_availability: string | null;
  id: string;
  is_active: boolean;
  linkedin_url: string | null;
  opening_talk: string | null;
  per_week_availability: unknown;
  photo_url: string | null;
  preferred_format: string | null;
  profile_id: string;
  profile_active: boolean;
  membership_id: string;
  membership_status: MembershipStatus;
  readiness_status: MembershipReadinessStatus;
  role_title: string | null;
  semester_id: string;
  semester_name: string | null;
  slug: string;
  website_url: string | null;
};

export type StartupView = {
  description: string | null;
  founders: { email: string | null; name: string; profile_id: string }[];
  goals: string[];
  id: string;
  industry: string | null;
  is_active: boolean;
  logo_url: string | null;
  membership_email: string | null;
  membership_status: MembershipStatus;
  mentorship_needs: string[];
  name: string;
  organization_id: string;
  readiness_status: MembershipReadinessStatus;
  semester_id: string;
  semester_name: string | null;
  slug: string;
  stage: string | null;
  website: string | null;
};

const MENTOR_DIRECTORY_SELECT = `
  id,
  semester_id,
  mentorship_goals,
  preferred_format,
  general_availability,
  per_week_availability,
  opening_talk,
  readiness_status,
  semester:semesters(name),
  membership:semester_memberships!inner(
    id,
    profile_id,
    status,
    profile:profiles!inner(
      id,
      email,
      full_name,
      is_active,
      status,
      photo_path,
      mentor_profile:mentor_profiles(
        biography,
        company,
        title,
        linkedin_url,
        website_url,
        photo_url,
        expertise_tags
      )
    )
  )
`;

const MENTOR_DIRECTORY_SELECT_WITHOUT_PHOTO_PATH = MENTOR_DIRECTORY_SELECT.replace("\n      photo_path,", "");

function retainedForDeletedMemberHistory(row: MentorSemesterRow): boolean {
  const profile = one(one(row.membership)?.profile ?? null);
  return profile?.is_active === false && profile.status === "rejected";
}

const STARTUP_DIRECTORY_SELECT = `
  id,
  semester_id,
  stage,
  goals,
  mentorship_needs,
  readiness_status,
  semester:semesters(name),
  organization:startup_organizations!inner(
    id,
    name,
    slug,
    description,
    industry,
    website_url,
    logo_url,
    durable_contact_data
  ),
  team:startup_team_memberships(
    id,
    is_primary_contact,
    semester_id,
    membership:semester_memberships!inner(
      id,
      profile_id,
      semester_id,
      status,
      profile:profiles!inner(id,email,full_name,is_active)
    )
  )
`;

function failIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function loadMentorDirectory(client: ProgramClient) {
  const selectMentors = (columns: string) => client
    .from("mentor_semesters")
    .select(columns)
    .eq("membership.role", "mentor")
    .order("full_name", { referencedTable: "membership.profile" });
  const result = await selectWithOptionalProfilePhotoPath(
    () => selectMentors(MENTOR_DIRECTORY_SELECT),
    () => selectMentors(MENTOR_DIRECTORY_SELECT_WITHOUT_PHOTO_PATH),
  );
  failIfError(result.error);
  const resolvePhoto = createProfilePhotoUrlResolver(client);
  const rows = ((result.data ?? []) as unknown as MentorSemesterRow[])
    .filter((row) => !retainedForDeletedMemberHistory(row));
  const mentors = rows.map(mapMentor);
  const photoUrls = await resolvePhoto.resolveMany(rows.map((row, index) => ({
    legacyPhotoUrl: mentors[index]?.photo_url,
    photoPath: one(one(row.membership)?.profile ?? null)?.photo_path,
  })));
  return mentors.map((mentor, index) => {
    return { ...mentor, photo_url: photoUrls[index] ?? null };
  });
}

function mapMentor(row: MentorSemesterRow): MentorView {
  const membership = one(row.membership);
  const profile = one(membership?.profile ?? null);
  const mentor = one(profile?.mentor_profile ?? null);
  const fullName = profile?.full_name ?? profile?.email ?? "Unnamed mentor";
  const slugBase = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return {
    bio: mentor?.biography ?? null,
    company: mentor?.company ?? null,
    email: profile?.email ?? null,
    expertise_tags: mentor?.expertise_tags ?? [],
    full_name: fullName,
    general_availability: row.general_availability,
    id: row.id,
    is_active: membership?.status === "active",
    linkedin_url: mentor?.linkedin_url ?? null,
    opening_talk: row.opening_talk,
    per_week_availability: row.per_week_availability,
    photo_url: mentor?.photo_url ?? null,
    preferred_format: row.preferred_format,
    profile_id: membership?.profile_id ?? "",
    profile_active: profile?.is_active ?? false,
    membership_id: membership?.id ?? "",
    membership_status: membership?.status ?? "invited",
    readiness_status: row.readiness_status,
    role_title: mentor?.title ?? null,
    semester_id: row.semester_id,
    semester_name: one(row.semester)?.name ?? null,
    slug: `${slugBase}-${row.id.slice(0, 8)}`,
    website_url: mentor?.website_url ?? null,
  };
}

export async function loadMentorProfile(client: ProgramClient, mentorSemesterId: string) {
  const selectMentor = (columns: string) => client
    .from("mentor_semesters")
    .select(columns)
    .eq("id", mentorSemesterId)
    .eq("membership.role", "mentor")
    .maybeSingle();
  const result = await selectWithOptionalProfilePhotoPath(
    () => selectMentor(MENTOR_DIRECTORY_SELECT),
    () => selectMentor(MENTOR_DIRECTORY_SELECT_WITHOUT_PHOTO_PATH),
  );
  failIfError(result.error);
  if (!result.data) return null;
  const row = result.data as unknown as MentorSemesterRow;
  const mentor = mapMentor(row);
  const profile = one(one(row.membership)?.profile ?? null);
  return { ...mentor, photo_url: await createProfilePhotoUrlResolver(client)(profile?.photo_path, mentor.photo_url) };
}

export async function loadStartupDirectory(client: ProgramClient) {
  const result = await client
    .from("startup_semesters")
    .select(STARTUP_DIRECTORY_SELECT)
    .order("name", { referencedTable: "organization" });
  failIfError(result.error);
  return ((result.data ?? []) as unknown as StartupSemesterRow[]).map(mapStartup);
}

function mapStartup(row: StartupSemesterRow): StartupView {
  const organization = one(row.organization);
  const unscopedTeam = Array.isArray(row.team) ? row.team : row.team ? [row.team] : [];
  const team = unscopedTeam.filter((teamMember) => {
    const membership = one(teamMember.membership);
    return teamMember.semester_id === row.semester_id && membership?.semester_id === row.semester_id;
  });
  const founders = team
    .map((teamMember) => one(teamMember.membership))
    .filter((membership): membership is MembershipRow => membership !== null)
    .map((membership) => {
      const profile = one(membership.profile);
      return {
        email: profile?.email ?? null,
        name: profile?.full_name ?? profile?.email ?? "Unnamed founder",
        profile_id: membership.profile_id,
      };
    });
  const primaryTeamMember = team.find((teamMember) => teamMember.is_primary_contact) ?? team[0] ?? null;
  const primaryMembership = one(primaryTeamMember?.membership ?? null);
  const primaryProfile = one(primaryMembership?.profile ?? null);
  return {
    description: organization?.description ?? null,
    founders,
    goals: row.goals ?? [],
    id: row.id,
    industry: organization?.industry ?? null,
    is_active: primaryMembership?.status === "active",
    logo_url: organization?.logo_url ?? null,
    membership_email: primaryProfile?.email ?? null,
    membership_status: primaryMembership?.status ?? "invited",
    mentorship_needs: row.mentorship_needs ?? [],
    name: organization?.name ?? "Unnamed startup",
    organization_id: organization?.id ?? "",
    readiness_status: row.readiness_status,
    semester_id: row.semester_id,
    semester_name: one(row.semester)?.name ?? null,
    slug: organization?.slug ?? row.id,
    stage: row.stage,
    website: organization?.website_url ?? null,
  };
}

export async function loadStartupProfile(client: ProgramClient, startupSemesterId: string) {
  const result = await client
    .from("startup_semesters")
    .select(STARTUP_DIRECTORY_SELECT)
    .eq("id", startupSemesterId)
    .maybeSingle();
  failIfError(result.error);
  return result.data ? mapStartup(result.data as unknown as StartupSemesterRow) : null;
}

export async function loadMentorAvailability(
  client: ProgramClient,
  profileId: string,
  semesterId: string,
) {
  const membershipResult = await client
    .from("semester_memberships")
    .select("id")
    .eq("profile_id", profileId)
    .eq("semester_id", semesterId)
    .eq("role", "mentor")
    .maybeSingle();
  failIfError(membershipResult.error);
  if (!membershipResult.data) return [];

  const result = await client
    .from("meeting_availability")
    .select("meeting_id, slot, is_available, meeting:meetings(meeting_date, label)")
    .eq("semester_membership_id", membershipResult.data.id)
    .order("meeting_date", { referencedTable: "meeting" })
    .order("slot");
  failIfError(result.error);
  return result.data ?? [];
}

export async function loadMentorInbox(client: ProgramClient, profileId: string) {
  const mentorResult = await client
    .from("mentor_semesters")
    .select("id, membership:semester_memberships!inner(profile_id, status)")
    .eq("membership.profile_id", profileId)
    .eq("membership.status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  failIfError(mentorResult.error);
  if (!mentorResult.data) return [];

  const result = await client
    .from("sessions")
    .select(`
      id,
      status,
      topic,
      slot,
      format,
      meeting:meetings!inner(meeting_date,label),
      startup:startup_semesters!inner(
        organization:startup_organizations!inner(name,slug)
      )
    `)
    .eq("mentor_semester_id", mentorResult.data.id)
    .eq("status", "requested")
    .order("meeting_date", { referencedTable: "meeting" })
    .order("slot");
  failIfError(result.error);
  return result.data ?? [];
}

export async function loadMentorSessions(
  client: ProgramClient,
  mentorSemesterId: string,
  semesterId: string,
) {
  const result = await client
    .from("sessions")
    .select(`
      id,
      status,
      topic,
      slot,
      format,
      meeting:meetings!inner(meeting_date,label,semester_id),
      startup:startup_semesters!inner(
        organization:startup_organizations!inner(name)
      )
    `)
    .eq("mentor_semester_id", mentorSemesterId)
    .eq("meeting.semester_id", semesterId)
    .order("meeting_date", { referencedTable: "meeting" });
  failIfError(result.error);
  return result.data ?? [];
}

type FounderTeamRow = {
  startup_semester_id: string;
  startup: Related<{
    organization: Related<{ name: string }>;
    semester: Related<{ is_active: boolean; name: string }>;
    semester_id?: string;
  }>;
};

export async function loadFounderHistory(client: ProgramClient, profileId: string) {
  const profileResult = await client.from("profiles").select("email,full_name").eq("id", profileId).maybeSingle();
  failIfError(profileResult.error);
  if (!profileResult.data) return null;

  const membershipResult = await client
    .from("semester_memberships")
    .select("id")
    .eq("profile_id", profileId)
    .eq("role", "startup");
  failIfError(membershipResult.error);
  const membershipIds = (membershipResult.data ?? []).map((membership) => membership.id);
  if (membershipIds.length === 0) return { profile: profileResult.data, participations: [], sessions: [] };

  const teamResult = await client
    .from("startup_team_memberships")
    .select(`
      startup_semester_id,
      startup:startup_semesters!inner(
        semester_id,
        semester:semesters!inner(name,is_active),
        organization:startup_organizations!inner(name)
      )
    `)
    .in("semester_membership_id", membershipIds);
  failIfError(teamResult.error);
  const participations = ((teamResult.data ?? []) as unknown as FounderTeamRow[]).map((row) => {
    const startup = one(row.startup);
    const semester = one(startup?.semester ?? null);
    return {
      isActive: semester?.is_active ?? false,
      semesterId: startup?.semester_id ?? "",
      semesterName: semester?.name ?? "Unknown semester",
      startupName: one(startup?.organization ?? null)?.name ?? "Unnamed startup",
      startupSemesterId: row.startup_semester_id,
    };
  }).sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.semesterName.localeCompare(a.semesterName) || a.startupName.localeCompare(b.startupName));

  const startupSemesterIds = participations.map((participation) => participation.startupSemesterId);
  if (startupSemesterIds.length === 0) return { profile: profileResult.data, participations, sessions: [] };
  const sessionResult = await client
    .from("sessions")
    .select("id,startup_semester_id,slot,status,meeting:meetings!inner(meeting_date,label),mentor:mentor_semesters(membership:semester_memberships(profile:profiles(full_name)))")
    .in("startup_semester_id", startupSemesterIds)
    .order("meeting_date", { referencedTable: "meeting" })
    .order("slot");
  failIfError(sessionResult.error);
  return { profile: profileResult.data, participations, sessions: sessionResult.data ?? [] };
}

export type CreateSessionRequestInput = {
  format: string | null;
  meetingId: string;
  mentorSemesterId: string;
  semesterId: string;
  slot: 1 | 2;
  startupSemesterId: string;
  topic: string | null;
};

export async function createSessionRequest(
  client: ProgramClient,
  input: CreateSessionRequestInput,
) {
  const result = await client.from("sessions").insert({
    format: input.format,
    meeting_id: input.meetingId,
    mentor_semester_id: input.mentorSemesterId,
    semester_id: input.semesterId,
    slot: input.slot,
    startup_semester_id: input.startupSemesterId,
    status: "requested",
    topic: input.topic,
  });
  failIfError(result.error);
}

export { MENTOR_DIRECTORY_SELECT, STARTUP_DIRECTORY_SELECT };
