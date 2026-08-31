export const ADMIN_SCHEDULE_HREF = "/dashboard/admin/schedule";

export type AdminDashboardTab = "users" | "members" | "schedule" | "startups";

export type ScheduleDirectoryEntry = {
  href: string;
  label: string;
};

export function adminDashboardHref(tab: AdminDashboardTab): string {
  return tab === "schedule"
    ? ADMIN_SCHEDULE_HREF
    : `/dashboard/admin?tab=${tab}`;
}

export function resolveAdminDashboardTab(
  pathname: string | null,
  queryTab: string | null = null,
): AdminDashboardTab {
  if (pathname === ADMIN_SCHEDULE_HREF) return "schedule";
  return queryTab === "members" || queryTab === "startups" ? queryTab : "users";
}

export function isDashboardNavigationActive(pathname: string, href: string): boolean {
  return pathname === href;
}

export function mentorDirectoryScheduleEntry(canManageAdmin: boolean): ScheduleDirectoryEntry | null {
  return canManageAdmin
    ? { href: ADMIN_SCHEDULE_HREF, label: "Assign mentors" }
    : null;
}
