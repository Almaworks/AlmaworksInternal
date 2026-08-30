import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";
import type { CohortMember, CohortSummary } from "./cohort-management.ts";

export class CohortRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CohortRepositoryError";
  }
}

export async function loadManageableCohorts(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<CohortSummary[]> {
  const { data, error } = await client
    .from("semesters")
    .select("id, name, start_date, is_active")
    .order("start_date", { ascending: false });
  if (error !== null) throw new CohortRepositoryError(error.message);

  const checks = await Promise.all((data ?? []).map(async (semester) => {
    const result = await client.rpc("can_manage_semester", {
      target_semester_id: semester.id,
      candidate_id: userId,
    });
    if (result.error !== null) throw new CohortRepositoryError(result.error.message);
    return result.data === true ? semester : null;
  }));

  return checks.flatMap((semester) => semester === null ? [] : [{
    id: semester.id,
    name: semester.name,
    startsOn: semester.start_date,
    isActive: semester.is_active,
  }]);
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
  const profileResult = profileIds.length === 0
    ? { data: [], error: null }
    : await client.from("profiles").select("id, full_name, email").in("id", profileIds);
  if (profileResult.error !== null) throw new CohortRepositoryError(profileResult.error.message);

  const profiles = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
  const semesterNames = new Map(semesters.map((semester) => [semester.id, semester.name]));
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
      semesterId: membership.semester_id,
      semesterName,
    }];
  });
}
