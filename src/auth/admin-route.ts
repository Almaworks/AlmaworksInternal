export type ProfileRole = "admin" | "mentor" | "startup" | null;

export type AdminRouteProfile = {
  role: ProfileRole;
  status: string | null;
  is_active: boolean;
};

export type AdminRouteAccessInput = {
  authenticated: boolean;
  profile: AdminRouteProfile | null;
  authority: {
    isSuperAdmin: boolean;
    hasActiveSemesterAdminMembership: boolean;
    lookupFailed: boolean;
  };
};

export function isAdminDashboardPath(pathname: string): boolean {
  return pathname === '/dashboard/admin' || pathname.startsWith('/dashboard/admin/');
}

export function resolveAdminRouteAccess(input: AdminRouteAccessInput): string | null {
  if (!input.authenticated) return "/";
  if (input.profile?.is_active === false) return '/?error=account_inactive';
  if (!input.profile || input.profile.status !== "approved") return "/pending";
  if (
    !input.authority.lookupFailed
    && (input.authority.isSuperAdmin || input.authority.hasActiveSemesterAdminMembership)
  ) return null;
  if (input.profile.role === "mentor") return "/dashboard/mentor";
  if (input.profile.role === "startup") return "/dashboard/startup";
  return "/pending";
}

export function resolveSuperAdminRouteAccess(input: AdminRouteAccessInput): string | null {
  const destination = resolveAdminRouteAccess(input);
  if (destination) return destination;
  return input.authority.isSuperAdmin ? null : "/dashboard/admin";
}
