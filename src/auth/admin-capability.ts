import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../db/types.ts";

type AdminCapabilityClient = Pick<SupabaseClient<Database>, "from">;

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

export type AdminRouteAuthority = {
  isSuperAdmin: boolean;
  hasActiveSemesterAdminMembership: boolean;
  lookupFailed: boolean;
};

export async function resolveAdminCapability(
  source: AdminCapabilitySource,
  profileId: string,
): Promise<{ canManageAdmin: boolean; canRemoveMemberLogin: boolean; isSuperAdmin: boolean }> {
  const superAdmin = await source.isSuperAdmin(profileId);
  if (superAdmin.error !== null) {
    return { canManageAdmin: false, canRemoveMemberLogin: false, isSuperAdmin: false };
  }
  if (superAdmin.data) {
    return { canManageAdmin: true, canRemoveMemberLogin: true, isSuperAdmin: true };
  }

  const membership = await source.hasActiveSemesterAdminMembership(profileId);
  return {
    canManageAdmin: membership.error === null && membership.data,
    canRemoveMemberLogin: false,
    isSuperAdmin: false,
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
  client: AdminCapabilityClient,
): AdminCapabilitySource {
  return {
    isSuperAdmin: async (profileId) => {
      const result = await client
        .from("platform_roles")
        .select("role")
        .eq("profile_id", profileId)
        .eq("role", "super_admin")
        .maybeSingle();
      return { data: result.data !== null, error: result.error };
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

export async function loadAdminRouteAuthority(
  client: AdminCapabilityClient,
  profileId: string,
): Promise<AdminRouteAuthority> {
  const source = createSupabaseAdminCapabilitySource(client);
  const superAdmin = await source.isSuperAdmin(profileId);
  if (superAdmin.error !== null) {
    return {
      isSuperAdmin: false,
      hasActiveSemesterAdminMembership: false,
      lookupFailed: true,
    };
  }
  if (superAdmin.data) {
    return {
      isSuperAdmin: true,
      hasActiveSemesterAdminMembership: false,
      lookupFailed: false,
    };
  }

  const membership = await source.hasActiveSemesterAdminMembership(profileId);
  return {
    isSuperAdmin: false,
    hasActiveSemesterAdminMembership: membership.error === null && membership.data,
    lookupFailed: membership.error !== null,
  };
}
