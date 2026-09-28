import type { SupabaseClient } from "@supabase/supabase-js";

type AccessClient = SupabaseClient;
export type CanonicalRole = "admin" | "mentor" | "startup";

type MembershipRow = {
  role: CanonicalRole;
  semester: { is_active: boolean; name: string } | { is_active: boolean; name: string }[] | null;
  semester_id: string;
  status: string;
};

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadCanonicalAccess(client: AccessClient, authUserId: string) {
  const profileResult = await client
    .from("profiles")
    .select("id,email,full_name,is_active,status")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  throwIfError(profileResult.error);
  if (!profileResult.data) return null;
  const profileId = profileResult.data.id;

  const [platformResult, membershipResult] = await Promise.all([
    client
      .from("platform_roles")
      .select("role")
      .eq("profile_id", profileId)
      .eq("role", "super_admin"),
    client
      .from("semester_memberships")
      .select("role,status,semester_id,semester:semesters!inner(name,is_active)")
      .eq("profile_id", profileId)
      .in("status", ["invited", "onboarding", "active"])
      .order("is_active", { ascending: false, referencedTable: "semester" }),
  ]);
  throwIfError(platformResult.error);
  throwIfError(membershipResult.error);

  const memberships = (membershipResult.data ?? []) as unknown as MembershipRow[];
  const membership = memberships.find((row) => one(row.semester)?.is_active) ?? memberships[0] ?? null;
  const isGlobalAdmin = (platformResult.data ?? []).some((row) => row.role === "super_admin");
  return {
    email: profileResult.data.email,
    full_name: profileResult.data.full_name,
    is_active: profileResult.data.is_active,
    profileId,
    status: profileResult.data.status,
    isGlobalAdmin,
    membershipRole: membership?.role ?? null,
    role: isGlobalAdmin ? "admin" as const : membership?.role ?? null,
    semesterId: membership?.semester_id ?? null,
    semesterName: one(membership?.semester ?? null)?.name ?? null,
  };
}

export async function requireActiveSemesterAdmin(client: AccessClient, profileId: string) {
  const semesterResult = await client
    .from("semesters")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  throwIfError(semesterResult.error);
  if (!semesterResult.data) throw new Error("No active semester.");

  return requireSemesterAdmin(client, profileId, semesterResult.data.id);
}

export async function requireSemesterAdmin(client: AccessClient, profileId: string, semesterId: string) {
  const manageResult = await client.rpc("can_manage_semester", {
    candidate_id: profileId,
    target_semester_id: semesterId,
  });
  throwIfError(manageResult.error);
  if (manageResult.data !== true) throw new Error("Semester administrator access required.");
  return semesterId;
}
