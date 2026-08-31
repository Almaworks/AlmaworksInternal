import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";

export type LegacyProfileRole = "admin" | "mentor" | "startup" | null;
export type DashboardPersona = "admin" | "mentor" | "startup";

interface CapabilityLookup<T> {
  data: T;
  error: unknown | null;
}

export interface AdminCapabilitySource {
  isSuperAdmin(profileId: string): Promise<CapabilityLookup<boolean>>;
  hasActiveSemesterAdminMembership(profileId: string): Promise<CapabilityLookup<boolean>>;
}

export async function resolveAdminCapability(
  source: AdminCapabilitySource,
  profileId: string,
): Promise<{ canManageAdmin: boolean }> {
  const superAdmin = await source.isSuperAdmin(profileId);
  if (superAdmin.error !== null) return { canManageAdmin: false };
  if (superAdmin.data) return { canManageAdmin: true };

  const membership = await source.hasActiveSemesterAdminMembership(profileId);
  return {
    canManageAdmin: membership.error === null && membership.data,
  };
}

export function resolveDashboardPersona(
  legacyRole: LegacyProfileRole,
  canManageAdmin: boolean,
  viewAs: DashboardPersona,
): DashboardPersona | null {
  if (canManageAdmin) return viewAs;
  return legacyRole === "mentor" || legacyRole === "startup" ? legacyRole : null;
}

export function createSupabaseAdminCapabilitySource(
  client: SupabaseClient<Database>,
): AdminCapabilitySource {
  return {
    isSuperAdmin: async (profileId) => {
      const result = await client.rpc("is_super_admin", { candidate_id: profileId });
      return { data: result.data === true, error: result.error };
    },
    hasActiveSemesterAdminMembership: async (profileId) => {
      const result = await client
        .from("semester_memberships")
        .select("id")
        .eq("profile_id", profileId)
        .eq("role", "admin")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      return { data: result.data !== null, error: result.error };
    },
  };
}
