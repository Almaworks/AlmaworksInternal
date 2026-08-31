export const ADMIN_SCHEDULE_HREF = "/dashboard/admin/schedule";

export type AdminDashboardTab = "users" | "members" | "schedule" | "startups";

export type ScheduleDirectoryEntry = {
  href: string;
  label: string;
};

export function resolveAdminDashboardTab(pathname: string | null): AdminDashboardTab {
  return pathname === ADMIN_SCHEDULE_HREF ? "schedule" : "users";
}

export function isDashboardNavigationActive(pathname: string, href: string): boolean {
  return pathname === href;
}

export function mentorDirectoryScheduleEntry(role: string | null): ScheduleDirectoryEntry | null {
  return role === "admin"
    ? { href: ADMIN_SCHEDULE_HREF, label: "Assign mentors" }
    : null;
}
