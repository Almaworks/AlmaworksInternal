import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../db/types.ts";
import { requireAuthenticatedUserWithRls } from "../auth/server.ts";
import { calendarSupabaseEnvironment } from "./config.ts";

import { CalendarHttpError } from './http-error.ts';
export { CalendarHttpError } from './http-error.ts';
export interface CalendarParticipant {
  profileId: string;
  semesterId: string;
  membershipId: string;
  membershipStatus: "invited" | "onboarding" | "active";
  role: "mentor" | "startup";
  mentorSemesterId: string | null;
  startupSemesterId: string | null;
  semesterStartDate: string;
  semesterEndDate: string;
  programTimeZone: string;
  userClient: SupabaseClient<Database>;
}
type RlsContext = { profileId: string; userClient: SupabaseClient<Database> };

export async function resolveCalendarParticipant(context: RlsContext, semesterId: string): Promise<CalendarParticipant> {
  const { userClient, profileId } = context;
  const [profile, semester, memberships] = await Promise.all([
    userClient.from("profiles").select("id,is_active,status").eq("id", profileId).maybeSingle(),
    userClient.from("semesters").select("id,is_active,configuration,start_date,end_date").eq("id", semesterId).eq("is_active", true).maybeSingle(),
    userClient.from("semester_memberships").select("id,role,status").eq("profile_id", profileId).eq("semester_id", semesterId).in("status", ["invited", "onboarding", "active"]).in("role", ["mentor", "startup"]),
  ]);
  if (profile.error || semester.error || memberships.error) throw new CalendarHttpError(503, "Calendar membership could not be verified. Please try again.");
  if (!profile.data?.is_active || profile.data.status !== "approved" || !semester.data?.is_active) throw new CalendarHttpError(403, "Calendar requires your current Almaworks membership.");
  const candidates = (memberships.data ?? []).filter(m => ["invited", "onboarding", "active"].includes(m.status));
  const membership = candidates.find(m => m.role === "mentor") ?? candidates.find(m => m.role === "startup");
  if (!membership || (membership.role !== "mentor" && membership.role !== "startup")) throw new CalendarHttpError(403, "A current mentor or startup membership is required.");
  let mentorSemesterId: string | null = null, startupSemesterId: string | null = null;
  if (membership.role === "mentor") {
    const term = await userClient.from("mentor_semesters").select("id").eq("semester_id", semesterId).eq("semester_membership_id", membership.id).maybeSingle();
    if (term.error) throw new CalendarHttpError(503, "Your mentor Calendar setup could not be loaded.");
    if (!term.data) throw new CalendarHttpError(403, "Your mentor membership is not ready for Calendar setup.");
    mentorSemesterId = term.data.id;
  } else {
    const team = await userClient.from("startup_team_memberships").select("startup_semester_id").eq("semester_id", semesterId).eq("semester_membership_id", membership.id).maybeSingle();
    if (team.error) throw new CalendarHttpError(503, "Your startup Calendar setup could not be loaded.");
    if (!team.data) throw new CalendarHttpError(403, "A current startup team assignment is required.");
    startupSemesterId = team.data.startup_semester_id;
  }
  const configuration = semester.data.configuration;
  const zone = configuration && typeof configuration === "object" && !Array.isArray(configuration) ? configuration.timezone : null;
  const programTimeZone = typeof zone === "string" ? zone : "America/New_York";
  try { new Intl.DateTimeFormat("en", { timeZone: programTimeZone }); } catch { throw new CalendarHttpError(503, "The program timezone needs administrator attention."); }
  return { profileId, semesterId, membershipId: membership.id, membershipStatus: membership.status as CalendarParticipant["membershipStatus"], role: membership.role, mentorSemesterId, startupSemesterId, semesterStartDate: semester.data.start_date, semesterEndDate: semester.data.end_date, programTimeZone, userClient };
}

export async function authorizeCalendar(request: Request, semesterId: string): Promise<CalendarParticipant> {
  calendarSupabaseEnvironment();
  return resolveCalendarParticipant(await requireAuthenticatedUserWithRls(request), semesterId);
}
