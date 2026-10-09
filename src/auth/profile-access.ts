export type PostLoginAccess = {
  is_active: boolean;
  role: "admin" | "mentor" | "startup" | null;
  status: string;
};

export function shouldRenderAuthError(pathname: string, error: string | null): boolean {
  return pathname === "/" && error !== null;
}

export function resolvePostLoginDestination(access: PostLoginAccess | null): string {
  if (!access) return "/?error=identity_link_missing";
  if (!access.is_active) return "/?error=account_inactive";
  if (access.status === "unregistered") return "/request-access";
  if (access.status === "rejected") return "/access-rejected";
  if (access.status === "pending") return "/pending";
  if (access.status !== "approved" || !access.role) return "/membership-unavailable";
  if (access.role === "admin") return "/dashboard/admin";
  if (access.role === "mentor") return "/dashboard/mentor";
  return "/dashboard/startup";
}
