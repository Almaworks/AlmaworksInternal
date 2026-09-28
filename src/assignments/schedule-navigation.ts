export const ADMIN_FRIDAY_PROGRAM_HREF = "/dashboard/admin/friday-program";
export const ADMIN_ACCESS_HREF = "/dashboard/admin/access";
export const ADMIN_MEMBERS_HREF = "/dashboard/admin/members";
export const ADMIN_STARTUPS_HREF = "/dashboard/admin/startups";

export type AdminDashboardTab = "overview" | "access" | "members" | "startups" | "friday-program";

export function adminDashboardHref(tab: AdminDashboardTab): string {
  if (tab === "overview") return "/dashboard/admin";
  if (tab === "access") return ADMIN_ACCESS_HREF;
  if (tab === "members") return ADMIN_MEMBERS_HREF;
  if (tab === "startups") return ADMIN_STARTUPS_HREF;
  if (tab === "friday-program") return ADMIN_FRIDAY_PROGRAM_HREF;
  return "/dashboard/admin";
}

export function adminMemberHref(email: string, semesterId?: string | null): string {
  const semesterQuery = semesterId ? `&semester=${encodeURIComponent(semesterId)}` : "";
  return `${adminDashboardHref("members")}?member=${encodeURIComponent(email)}${semesterQuery}`;
}

export function resolveAdminDashboardTab(
  pathname: string | null,
  queryTab: string | null = null,
): AdminDashboardTab {
  if (pathname === ADMIN_ACCESS_HREF) return "access";
  if (pathname === ADMIN_MEMBERS_HREF) return "members";
  if (pathname === ADMIN_STARTUPS_HREF) return "startups";
  if (pathname === ADMIN_FRIDAY_PROGRAM_HREF) return "friday-program";
  if (queryTab === "users") return "access";
  return queryTab === "members" || queryTab === "startups" || queryTab === "friday-program" ? queryTab : "overview";
}

export function isDashboardNavigationActive(pathname: string, href: string, selectedTab: string | null = null): boolean {
  const [targetPath, query] = href.split("?");
  if (pathname !== targetPath) return false;
  const targetTab = new URLSearchParams(query).get("tab");
  if (targetTab) return selectedTab === targetTab;
  if (pathname === "/dashboard/mentor" || pathname === "/dashboard/startup") return selectedTab !== "bookings";
  return true;
}
