import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

export class KnownDatabaseRejectionError extends Error {
  readonly outcome = "rejected";

  constructor(message: string) {
    super(message);
    this.name = "KnownDatabaseRejectionError";
  }
}

export class AmbiguousDatabaseOutcomeError extends Error {
  readonly outcome = "unknown";

  constructor(message: string) {
    super(message);
    this.name = "AmbiguousDatabaseOutcomeError";
  }
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

async function runUuidRpc(
  client: AdminClient,
  name: string,
  args: Record<string, unknown>,
  fallback: string,
) {
  let result: { data: unknown; error: { code?: string; message: string } | null };
  try {
    result = await client.rpc(name, args);
  } catch (cause) {
    throw new AmbiguousDatabaseOutcomeError(errorMessage(cause, fallback));
  }
  if (result.error) {
    if (!result.error.code?.trim()) {
      throw new AmbiguousDatabaseOutcomeError(result.error.message);
    }
    throw new KnownDatabaseRejectionError(result.error.message);
  }
  if (typeof result.data !== "string" || result.data.length === 0) {
    throw new AmbiguousDatabaseOutcomeError(`${fallback} The database returned no operation identifier.`);
  }
  return result.data;
}

function requireData<T>(data: T | null, error: { message: string } | null, message: string): T {
  if (error) throw new Error(error.message);
  if (!data) throw new Error(message);
  return data;
}

export type CreateMentorRecordsInput = {
  actorProfileId: string;
  biography: string | null;
  company: string | null;
  expertiseTags: string[];
  email: string;
  generalAvailability?: string | null;
  isActive: boolean;
  linkedinUrl: string | null;
  openingTalk?: string | null;
  preferredFormat: string | null;
  profileId: string;
  semesterId: string;
  title: string | null;
};

export async function createMentorRecords(client: AdminClient, input: CreateMentorRecordsInput) {
  return runUuidRpc(client, "create_mentor_records", {
    p_actor_profile_id: input.actorProfileId,
    p_biography: input.biography,
    p_company: input.company,
    p_email: input.email,
    p_expertise_tags: input.expertiseTags,
    p_general_availability: input.generalAvailability ?? null,
    p_is_active: input.isActive,
    p_linkedin_url: input.linkedinUrl,
    p_opening_talk: input.openingTalk ?? null,
    p_preferred_format: input.preferredFormat,
    p_profile_id: input.profileId,
    p_semester_id: input.semesterId,
    p_title: input.title,
  }, "Unable to create mentor records.");
}

export type UpdateMentorRecordsInput = {
  actorProfileId: string;
  biography?: string | null;
  company?: string | null;
  email?: string | null;
  expertiseTags?: string[];
  fullName?: string;
  generalAvailability?: string | null;
  isActive?: boolean;
  linkedinUrl?: string | null;
  mentorSemesterId: string;
  openingTalk?: string | null;
  preferredFormat?: string | null;
  title?: string | null;
};

export async function updateMentorRecords(client: AdminClient, input: UpdateMentorRecordsInput) {
  const patch: Record<string, unknown> = {};
  if (input.biography !== undefined) patch.biography = input.biography;
  if (input.company !== undefined) patch.company = input.company;
  if (input.email !== undefined) patch.email = input.email;
  if (input.expertiseTags !== undefined) patch.expertise_tags = input.expertiseTags;
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.generalAvailability !== undefined) patch.general_availability = input.generalAvailability;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (input.linkedinUrl !== undefined) patch.linkedin_url = input.linkedinUrl;
  if (input.openingTalk !== undefined) patch.opening_talk = input.openingTalk;
  if (input.preferredFormat !== undefined) patch.preferred_format = input.preferredFormat;
  if (input.title !== undefined) patch.title = input.title;
  return runUuidRpc(client, "update_mentor_records", {
    p_actor_profile_id: input.actorProfileId,
    p_mentor_semester_id: input.mentorSemesterId,
    p_patch: patch,
  }, "Unable to update mentor records.");
}

export type CreateStartupRecordsInput = {
  description: string | null;
  industry: string | null;
  name: string;
  preferredTags: string[];
  semesterId: string;
  slug: string;
  stage: string | null;
};

export async function createStartupRecords(client: AdminClient, input: CreateStartupRecordsInput) {
  const organizationResult = await client
    .from("startup_organizations")
    .insert({
      description: input.description,
      industry: input.industry,
      name: input.name,
      slug: input.slug,
    })
    .select("id")
    .single();
  const organization = requireData(organizationResult.data, organizationResult.error, "Unable to create startup organization.");

  const semesterResult = await client
    .from("startup_semesters")
    .insert({
      preferred_expertise_tags: input.preferredTags,
      readiness_status: "ready",
      semester_id: input.semesterId,
      stage: input.stage,
      startup_organization_id: organization.id,
    })
    .select("id")
    .single();
  const semester = requireData(semesterResult.data, semesterResult.error, "Unable to create startup semester.");
  return { organizationId: organization.id, startupSemesterId: semester.id };
}

export async function assignFounderMembership(
  client: AdminClient,
  input: { profileId: string; startupSemesterId: string },
) {
  const termResult = await client
    .from("startup_semesters")
    .select("semester_id")
    .eq("id", input.startupSemesterId)
    .single();
  const term = requireData(termResult.data, termResult.error, "Startup not found.");

  const membershipInsertResult = await client
    .from("semester_memberships")
    .upsert({
      profile_id: input.profileId,
      role: "startup",
      semester_id: term.semester_id,
      status: "active",
    }, { ignoreDuplicates: true, onConflict: "semester_id,profile_id" })
    .select("id")
    .maybeSingle();
  if (membershipInsertResult.error) throw new Error(membershipInsertResult.error.message);

  const membershipResult = membershipInsertResult.data
    ? membershipInsertResult
    : await client
      .from("semester_memberships")
      .update({ status: "active" })
      .eq("semester_id", term.semester_id)
      .eq("profile_id", input.profileId)
      .select("id")
      .single();
  const membership = requireData(membershipResult.data, membershipResult.error, "Unable to create startup membership.");

  const teamResult = await client.from("startup_team_memberships").upsert({
    semester_id: term.semester_id,
    semester_membership_id: membership.id,
    startup_semester_id: input.startupSemesterId,
  }, { ignoreDuplicates: true, onConflict: "startup_semester_id,semester_membership_id" });
  if (teamResult.error) throw new Error(teamResult.error.message);
}

export async function removeFounderMembership(
  client: AdminClient,
  input: { profileId: string; startupSemesterId: string },
) {
  const termResult = await client.from("startup_semesters").select("semester_id").eq("id", input.startupSemesterId).single();
  const term = requireData(termResult.data, termResult.error, "Startup not found.");
  const membershipResult = await client
    .from("semester_memberships")
    .select("id")
    .eq("semester_id", term.semester_id)
    .eq("profile_id", input.profileId)
    .maybeSingle();
  if (membershipResult.error) throw new Error(membershipResult.error.message);
  if (!membershipResult.data) return;
  const result = await client
    .from("startup_team_memberships")
    .delete()
    .eq("startup_semester_id", input.startupSemesterId)
    .eq("semester_membership_id", membershipResult.data.id);
  if (result.error) throw new Error(result.error.message);
}

export async function moveFounderMembership(
  client: AdminClient,
  input: { fromStartupSemesterId: string; profileId: string; toStartupSemesterId: string },
) {
  const result = await client.rpc("move_startup_team_membership", {
    p_from_startup_semester_id: input.fromStartupSemesterId,
    p_profile_id: input.profileId,
    p_to_startup_semester_id: input.toStartupSemesterId,
  });
  if (result.error) throw new Error(result.error.message);
}

export type SetSemesterMemberAccessInput = {
  actorProfileId: string;
  approve: boolean;
  email: string | null;
  fullName: string | null;
  profileId: string;
  role: "admin" | "mentor" | "startup";
  semesterId: string;
};

export async function setSemesterMemberAccess(
  client: AdminClient,
  input: SetSemesterMemberAccessInput,
) {
  return runUuidRpc(client, "set_semester_member_access", {
    p_actor_profile_id: input.actorProfileId,
    p_approve: input.approve,
    p_email: input.email,
    p_full_name: input.fullName,
    p_profile_id: input.profileId,
    p_role: input.role,
    p_semester_id: input.semesterId,
  }, "Unable to update semester member access.");
}

export async function authorizeSemesterMemberIdentityUpdate(
  client: AdminClient,
  input: { profileId: string; semesterId: string },
) {
  return runUuidRpc(client, "authorize_semester_member_identity_update", {
    p_profile_id: input.profileId,
    p_semester_id: input.semesterId,
  }, "Unable to authorize member identity update.");
}

export type UpdateStartupRecordsInput = {
  description: string | null;
  industry: string | null;
  mentorshipNeeds: string[];
  name: string;
  preferredTags: string[];
  slug: string;
  stage: string | null;
  startupSemesterId: string;
};

export async function updateStartupRecords(client: AdminClient, input: UpdateStartupRecordsInput) {
  const result = await client.rpc("update_startup_records", {
    p_description: input.description,
    p_industry: input.industry,
    p_mentorship_needs: input.mentorshipNeeds,
    p_name: input.name,
    p_preferred_expertise_tags: input.preferredTags,
    p_slug: input.slug,
    p_stage: input.stage,
    p_startup_semester_id: input.startupSemesterId,
  });
  if (result.error) throw new Error(result.error.message);
}
