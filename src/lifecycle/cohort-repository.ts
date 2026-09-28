import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import type { CohortMember, CohortSummary } from "./cohort-management.ts";
import type { MembershipReadinessStatus } from "./membership-presentation.ts";

export class CohortRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CohortRepositoryError";
  }
}

function membershipReadinessStatus(value: string | null | undefined): MembershipReadinessStatus {
  return value === "not_started" || value === "in_progress" || value === "ready" ? value : null;
}

export async function loadManageableCohorts(
  client: SupabaseClient<Database>,
  userId: string,
  knownProfileId?: string,
): Promise<CohortSummary[]> {
  let profileId = knownProfileId;
  if (!profileId) {
    const profileResult = await client
      .from("profiles")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (profileResult.error !== null) throw new CohortRepositoryError(profileResult.error.message);
    if (profileResult.data === null) return [];
    profileId = profileResult.data.id;
  }

  const [platformRoleResult, adminMembershipResult, semesterResult] = await Promise.all([
    client
      .from("platform_roles")
      .select("role")
      .eq("profile_id", profileId)
      .eq("role", "super_admin"),
    client
      .from("semester_memberships")
      .select("semester_id")
      .eq("profile_id", profileId)
      .eq("role", "admin")
      .eq("status", "active"),
    client
      .from("semesters")
      .select("id, name, start_date, is_active")
      .order("start_date", { ascending: false }),
  ]);
  if (platformRoleResult.error !== null) throw new CohortRepositoryError(platformRoleResult.error.message);
  if (adminMembershipResult.error !== null) throw new CohortRepositoryError(adminMembershipResult.error.message);
  if (semesterResult.error !== null) throw new CohortRepositoryError(semesterResult.error.message);

  const isSuperAdmin = (platformRoleResult.data ?? []).some((row) => row.role === "super_admin");
  const manageableSemesterIds = new Set((adminMembershipResult.data ?? []).map((row) => row.semester_id));
  return (semesterResult.data ?? []).flatMap((semester) => (
    !isSuperAdmin && !manageableSemesterIds.has(semester.id) ? [] : [{
    id: semester.id,
    name: semester.name,
    startsOn: semester.start_date,
    isActive: semester.is_active,
    }]
  ));
}

export async function loadCohortMembers(
  client: SupabaseClient<Database>,
  semesters: readonly CohortSummary[],
): Promise<CohortMember[]> {
  const semesterIds = semesters.map((semester) => semester.id);
  if (semesterIds.length === 0) return [];
  const membershipResult = await client
    .from("semester_memberships")
    .select("id, semester_id, profile_id, role, status")
    .in("semester_id", semesterIds)
    .order("created_at", { ascending: false });
  if (membershipResult.error !== null) {
    throw new CohortRepositoryError(membershipResult.error.message);
  }

  const profileIds = [...new Set((membershipResult.data ?? []).map((row) => row.profile_id))];
  const [profileResult, mentorReadinessResult, startupReadinessResult] = await Promise.all([
    profileIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : client.from("profiles").select("id, full_name, email").in("id", profileIds),
    client
      .from("mentor_semesters")
      .select("semester_membership_id,readiness_status")
      .in("semester_id", semesterIds),
    client
      .from("startup_team_memberships")
      .select("semester_membership_id,semester_id,startup_semester:startup_semesters!inner(semester_id,readiness_status)")
      .in("semester_id", semesterIds),
  ]);
  if (profileResult.error !== null) throw new CohortRepositoryError(profileResult.error.message);
  if (mentorReadinessResult.error !== null) throw new CohortRepositoryError(mentorReadinessResult.error.message);
  if (startupReadinessResult.error !== null) throw new CohortRepositoryError(startupReadinessResult.error.message);

  const profiles = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
  const semesterNames = new Map(semesters.map((semester) => [semester.id, semester.name]));
  const semesterByMembershipId = new Map(
    (membershipResult.data ?? []).map((membership) => [membership.id, membership.semester_id]),
  );
  const readinessByMembershipId = new Map<string, MembershipReadinessStatus>();
  const conflictingReadiness = new Set<string>();
  const recordReadiness = (membershipId: string, readinessStatus: MembershipReadinessStatus) => {
    if (conflictingReadiness.has(membershipId)) return;
    if (!readinessByMembershipId.has(membershipId)) {
      readinessByMembershipId.set(membershipId, readinessStatus);
      return;
    }
    if (readinessByMembershipId.get(membershipId) !== readinessStatus) {
      readinessByMembershipId.set(membershipId, null);
      conflictingReadiness.add(membershipId);
    }
  };
  for (const mentor of mentorReadinessResult.data ?? []) {
    recordReadiness(
      mentor.semester_membership_id,
      membershipReadinessStatus(mentor.readiness_status),
    );
  }
  for (const startup of startupReadinessResult.data ?? []) {
    const membershipSemesterId = semesterByMembershipId.get(startup.semester_membership_id);
    if (
      membershipSemesterId === undefined
      || startup.semester_id !== membershipSemesterId
      || startup.startup_semester?.semester_id !== membershipSemesterId
    ) continue;
    recordReadiness(
      startup.semester_membership_id,
      membershipReadinessStatus(startup.startup_semester?.readiness_status),
    );
  }
  return (membershipResult.data ?? []).flatMap((membership) => {
    const profile = profiles.get(membership.profile_id);
    const semesterName = semesterNames.get(membership.semester_id);
    if (profile === undefined || semesterName === undefined) return [];
    return [{
      membershipId: membership.id,
      profileId: membership.profile_id,
      name: profile.full_name?.trim() || profile.email,
      email: profile.email,
      role: membership.role,
      status: membership.status,
      readinessStatus: readinessByMembershipId.get(membership.id) ?? null,
      semesterId: membership.semester_id,
      semesterName,
    }];
  });
}
