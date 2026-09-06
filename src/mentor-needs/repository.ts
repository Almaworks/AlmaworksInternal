import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import { buildMentorNeedsBoard, type MentorNeedSelection, type MentorNeedsBoardRow } from "./domain.ts";

export class MentorNeedsRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MentorNeedsRepositoryError";
  }
}

function fail(label: string, message: string): never {
  throw new MentorNeedsRepositoryError(`Unable to ${label}: ${message}`);
}

export interface StartupMentorNeedsRecord extends MentorNeedSelection {
  startupSemesterId: string;
  semesterId: string;
  semesterName: string;
  startupName: string;
}

export async function loadStartupMentorNeeds(
  client: SupabaseClient<Database>,
  profileId: string,
  semesterId: string,
): Promise<StartupMentorNeedsRecord | null> {
  const memberships = await client.from("semester_memberships").select("id").eq("profile_id", profileId).eq("semester_id", semesterId).eq("role", "startup").in("status", ["onboarding", "active"]);
  if (memberships.error !== null) fail("load startup membership", memberships.error.message);
  const membershipIds = (memberships.data ?? []).map((row) => row.id);
  if (membershipIds.length === 0) return null;
  const teams = await client.from("startup_team_memberships").select("startup_semester_id").in("semester_membership_id", membershipIds);
  if (teams.error !== null) fail("load startup team", teams.error.message);
  const startupSemesterId = teams.data?.[0]?.startup_semester_id;
  if (startupSemesterId === undefined) return null;
  const record = await client.from("startup_semesters").select("id, semester_id, startup_organization_id, mentorship_needs, mentor_need_context, mentor_need_no_preference").eq("id", startupSemesterId).maybeSingle();
  if (record.error !== null) fail("load mentor needs", record.error.message);
  if (record.data === null) return null;
  const [semester, organization] = await Promise.all([
    client.from("semesters").select("name").eq("id", record.data.semester_id).single(),
    client.from("startup_organizations").select("name").eq("id", record.data.startup_organization_id).single(),
  ]);
  if (semester.error !== null) fail("load semester", semester.error.message);
  if (organization.error !== null) fail("load startup", organization.error.message);
  return {
    startupSemesterId: record.data.id,
    semesterId: record.data.semester_id,
    semesterName: semester.data.name,
    startupName: organization.data.name,
    needs: record.data.mentorship_needs,
    context: record.data.mentor_need_context,
    noPreference: record.data.mentor_need_no_preference,
  };
}

export async function saveStartupMentorNeeds(
  client: SupabaseClient<Database>,
  startupSemesterId: string,
  selection: MentorNeedSelection,
): Promise<void> {
  const result = await client.from("startup_semesters").update({
    mentorship_needs: selection.needs,
    mentor_need_context: selection.context,
    mentor_need_no_preference: selection.noPreference,
  }).eq("id", startupSemesterId);
  if (result.error !== null) fail("save mentor needs", result.error.message);
}

const ACTIVE_OUTREACH_STAGES = ["prospect", "researching", "ready", "contacted", "responded", "meeting", "nurture"] as const;

export interface MentorNeedsBoardData {
  rows: MentorNeedsBoardRow[];
  summary: {
    activeMentorCount: number;
    activeOutreachContactCount: number;
  };
}

export async function loadMentorNeedsBoard(
  client: SupabaseClient<Database>,
  semesterIds: readonly string[],
): Promise<MentorNeedsBoardData> {
  if (semesterIds.length === 0) {
    return { rows: [], summary: { activeMentorCount: 0, activeOutreachContactCount: 0 } };
  }
  const [startupMemberships, mentorMemberships, outreachOpportunities, activeOutreachContacts] = await Promise.all([
    client.from("semester_memberships").select("id").in("semester_id", [...semesterIds]).eq("role", "startup").eq("status", "active"),
    client.from("semester_memberships").select("profile_id").in("semester_id", [...semesterIds]).eq("role", "mentor").eq("status", "active"),
    client.from("outreach_opportunities").select("contact_id, stage").in("semester_id", [...semesterIds]).in("stage", [...ACTIVE_OUTREACH_STAGES]).eq("is_silenced", false),
    client.from("outreach_opportunities").select("contact_id").in("semester_id", [...semesterIds]).eq("is_silenced", false),
  ]);
  if (startupMemberships.error !== null) fail("load active startups", startupMemberships.error.message);
  if (mentorMemberships.error !== null) fail("load active mentors", mentorMemberships.error.message);
  if (outreachOpportunities.error !== null) fail("load outreach pipeline", outreachOpportunities.error.message);
  if (activeOutreachContacts.error !== null) fail("load active Outreach contacts", activeOutreachContacts.error.message);

  const startupMembershipIds = (startupMemberships.data ?? []).map((row) => row.id);
  const teamRows = startupMembershipIds.length === 0
    ? { data: [], error: null }
    : await client.from("startup_team_memberships").select("startup_semester_id").in("semester_membership_id", startupMembershipIds);
  if (teamRows.error !== null) fail("load active startup teams", teamRows.error.message);
  const startupSemesterIds = [...new Set((teamRows.data ?? []).map((row) => row.startup_semester_id))];
  const startupRows = startupSemesterIds.length === 0
    ? { data: [], error: null }
    : await client.from("startup_semesters").select("id, startup_organization_id, mentorship_needs, mentor_need_context").in("id", startupSemesterIds);
  if (startupRows.error !== null) fail("load startup demand", startupRows.error.message);

  const organizationIds = [...new Set((startupRows.data ?? []).map((row) => row.startup_organization_id))];
  const mentorIds = [...new Set((mentorMemberships.data ?? []).map((row) => row.profile_id))];
  const contactIds = [...new Set((outreachOpportunities.data ?? []).map((row) => row.contact_id))];
  const [organizations, profiles, mentorProfiles, contacts] = await Promise.all([
    organizationIds.length === 0 ? Promise.resolve({ data: [], error: null }) : client.from("startup_organizations").select("id, name").in("id", organizationIds),
    mentorIds.length === 0 ? Promise.resolve({ data: [], error: null }) : client.from("profiles").select("id, full_name, email").in("id", mentorIds),
    mentorIds.length === 0 ? Promise.resolve({ data: [], error: null }) : client.from("mentor_profiles").select("profile_id, expertise_tags").in("profile_id", mentorIds),
    contactIds.length === 0 ? Promise.resolve({ data: [], error: null }) : client.from("outreach_contacts").select("id, full_name, expertise_tags").in("id", contactIds),
  ]);
  for (const [label, result] of [["startup names", organizations], ["mentor names", profiles], ["mentor tags", mentorProfiles], ["outreach contacts", contacts]] as const) {
    if (result.error !== null) fail(`load ${label}`, result.error.message);
  }
  const organizationById = new Map((organizations.data ?? []).map((row) => [row.id, row.name]));
  const profileById = new Map((profiles.data ?? []).map((row) => [row.id, row.full_name?.trim() || row.email]));
  const stageByContact = new Map((outreachOpportunities.data ?? []).map((row) => [row.contact_id, row.stage]));
  return {
    rows: buildMentorNeedsBoard({
      startups: (startupRows.data ?? []).map((row) => ({ id: row.id, name: organizationById.get(row.startup_organization_id) ?? "Unnamed startup", needs: row.mentorship_needs, context: row.mentor_need_context })),
      mentors: (mentorProfiles.data ?? []).map((row) => ({ id: row.profile_id, name: profileById.get(row.profile_id) ?? "Unnamed mentor", tags: row.expertise_tags })),
      outreach: (contacts.data ?? []).map((row) => ({ id: row.id, name: row.full_name, tags: row.expertise_tags, stage: stageByContact.get(row.id) ?? "prospect" })),
    }),
    summary: {
      activeMentorCount: (mentorMemberships.data ?? []).length,
      activeOutreachContactCount: new Set((activeOutreachContacts.data ?? []).map((row) => row.contact_id)).size,
    },
  };
}
