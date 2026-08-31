import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient;

function requireData<T>(data: T | null, error: { message: string } | null, message: string): T {
  if (error) throw new Error(error.message);
  if (!data) throw new Error(message);
  return data;
}

export type CreateMentorRecordsInput = {
  biography: string | null;
  company: string | null;
  expertiseTags: string[];
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
  const membershipResult = await client
    .from("semester_memberships")
    .upsert({
      profile_id: input.profileId,
      role: "mentor",
      semester_id: input.semesterId,
      status: input.isActive ? "active" : "onboarding",
    }, { onConflict: "semester_id,profile_id" })
    .select("id")
    .single();
  const membership = requireData(membershipResult.data, membershipResult.error, "Unable to create mentor membership.");

  const profileResult = await client.from("mentor_profiles").upsert({
    biography: input.biography,
    company: input.company,
    expertise_tags: input.expertiseTags,
    linkedin_url: input.linkedinUrl,
    profile_id: input.profileId,
    title: input.title,
  }, { onConflict: "profile_id" });
  if (profileResult.error) throw new Error(profileResult.error.message);

  const termResult = await client
    .from("mentor_semesters")
    .upsert({
      general_availability: input.generalAvailability ?? null,
      opening_talk: input.openingTalk ?? null,
      preferred_format: input.preferredFormat,
      readiness_status: input.isActive ? "ready" : "not_started",
      semester_id: input.semesterId,
      semester_membership_id: membership.id,
    }, { onConflict: "semester_id,semester_membership_id" })
    .select("id")
    .single();
  return requireData(termResult.data, termResult.error, "Unable to create mentor semester.").id;
}

export type UpdateMentorRecordsInput = {
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
  const termResult = await client
    .from("mentor_semesters")
    .select("semester_membership_id, membership:semester_memberships!inner(profile_id)")
    .eq("id", input.mentorSemesterId)
    .single();
  const term = requireData(termResult.data, termResult.error, "Mentor semester not found.");
  const membership = Array.isArray(term.membership) ? term.membership[0] : term.membership;
  if (!membership?.profile_id) throw new Error("Mentor profile identity not found.");

  const identityFields: Record<string, unknown> = {};
  if (input.email !== undefined) identityFields.email = input.email;
  if (input.fullName !== undefined) identityFields.full_name = input.fullName;
  if (Object.keys(identityFields).length > 0) {
    const result = await client.from("profiles").update(identityFields).eq("id", membership.profile_id);
    if (result.error) throw new Error(result.error.message);
  }

  const biographyFields: Record<string, unknown> = {};
  if (input.biography !== undefined) biographyFields.biography = input.biography;
  if (input.company !== undefined) biographyFields.company = input.company;
  if (input.expertiseTags !== undefined) biographyFields.expertise_tags = input.expertiseTags;
  if (input.linkedinUrl !== undefined) biographyFields.linkedin_url = input.linkedinUrl;
  if (input.title !== undefined) biographyFields.title = input.title;
  if (Object.keys(biographyFields).length > 0) {
    const result = await client.from("mentor_profiles").update(biographyFields).eq("profile_id", membership.profile_id);
    if (result.error) throw new Error(result.error.message);
  }

  const semesterFields: Record<string, unknown> = {};
  if (input.generalAvailability !== undefined) semesterFields.general_availability = input.generalAvailability;
  if (input.openingTalk !== undefined) semesterFields.opening_talk = input.openingTalk;
  if (input.preferredFormat !== undefined) semesterFields.preferred_format = input.preferredFormat;
  if (Object.keys(semesterFields).length > 0) {
    const result = await client.from("mentor_semesters").update(semesterFields).eq("id", input.mentorSemesterId);
    if (result.error) throw new Error(result.error.message);
  }

  if (input.isActive !== undefined) {
    const result = await client
      .from("semester_memberships")
      .update({ status: input.isActive ? "active" : "suspended" })
      .eq("id", term.semester_membership_id);
    if (result.error) throw new Error(result.error.message);
  }
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

  const membershipResult = await client
    .from("semester_memberships")
    .upsert({
      profile_id: input.profileId,
      role: "startup",
      semester_id: term.semester_id,
      status: "active",
    }, { onConflict: "semester_id,profile_id" })
    .select("id")
    .single();
  const membership = requireData(membershipResult.data, membershipResult.error, "Unable to create startup membership.");

  const teamResult = await client.from("startup_team_memberships").upsert({
    semester_id: term.semester_id,
    semester_membership_id: membership.id,
    startup_semester_id: input.startupSemesterId,
  }, { onConflict: "startup_semester_id,semester_membership_id" });
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
  const result = await client.rpc("set_semester_member_access", {
    p_approve: input.approve,
    p_email: input.email,
    p_full_name: input.fullName,
    p_profile_id: input.profileId,
    p_role: input.role,
    p_semester_id: input.semesterId,
  });
  if (result.error) throw new Error(result.error.message);
  return result.data;
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
