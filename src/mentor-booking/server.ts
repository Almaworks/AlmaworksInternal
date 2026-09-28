import type { SupabaseClient } from "@supabase/supabase-js";

import { AuthorizationError, requireAuthenticatedUserWithRls } from "../auth/server.ts";
import type { Database } from "../db/types.ts";
import { calendarAvailabilityEnabled, calendarSupabaseEnvironment } from "../calendar/config.ts";
import { readWorkspaceCalendarAvailability } from "../calendar/workspace-availability.ts";
import { readCalendarHoldStatuses } from "../calendar/hold-status.ts";
import { refreshCalendarForBooking } from "../calendar/booking-refresh.ts";
import { CalendarHttpError } from "../calendar/authorization.ts";
import { readBearerToken } from "../auth/request.ts";
import { sendSavedBookingRequest } from "../notifications/booking-request-direct.ts";
import {
  buildMentorBookingWorkspace,
  MentorBookingDataError,
  MentorBookingRequestError,
  parseMentorBookingCommand,
  parseMentorBookingQuery,
  parseMentorBookingWeekOffset,
  type MentorBookingModelInput,
} from "./model.ts";
import type { MentorBookingCommand, MentorBookingRequestStatus, MentorBookingViewerRole } from "./types.ts";

export class MentorBookingHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = "MentorBookingHttpError"; this.status = status; }
}

export interface MentorBookingStore {
  execute(command: MentorBookingCommand): Promise<void>;
  load(semesterId: string, weekOffset?: number): Promise<MentorBookingModelInput>;
}

type AuthorizeMentorBooking = (request: Request, semesterId: string) => Promise<MentorBookingStore>;
type DatabaseError = { code?: string; message: string };
type QueryResult<T> = { data: T | null; error: DatabaseError | null };
type WeeklyAvailabilityRange = Extract<MentorBookingCommand, { action: "replace_weekly_availability" }>["availability"][number];
type RelationRecord = Record<string, unknown>;
type SemesterBookingMetadata = Pick<Database["public"]["Tables"]["semesters"]["Row"], "configuration" | "end_date" | "start_date">;

function firstRelationRecord(value: unknown): RelationRecord | null {
  if (Array.isArray(value)) return firstRelationRecord(value[0]);
  return value && typeof value === "object" ? value as RelationRecord : null;
}

/** Handles both PostgREST's object and array serializations for embedded relations. */
export function mentorWeeklyAvailabilityForWorkspace(row: {
  semester_id: string;
  mentor_semester_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  mentor_semesters: unknown;
}) {
  const mentorSemester = firstRelationRecord(row.mentor_semesters);
  const membership = firstRelationRecord(mentorSemester?.semester_memberships);
  const profile = firstRelationRecord(membership?.profiles);
  const mentorProfile = firstRelationRecord(membership?.mentor_profiles);
  const mentorProfileId = membership?.profile_id;
  if (typeof mentorProfileId !== "string") throw new MentorBookingDataError("Weekly availability is missing its mentor membership.");
  return {
    semesterId: row.semester_id,
    mentorSemesterId: row.mentor_semester_id,
    weekday: row.weekday,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    mentorProfileId,
    mentorName: typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name : "Mentor",
    ...(Array.isArray(mentorProfile?.expertise_tags) ? { mentorExpertiseTags: mentorProfile.expertise_tags.filter((tag): tag is string => typeof tag === "string") } : {}),
  };
}

export function mentorBookingDatabaseError(error: DatabaseError): never {
  console.error("[mentor-booking] database operation failed", { code: error.code ?? null, message: error.message });
  if (["PGRST200", "PGRST201", "PGRST202", "PGRST204", "PGRST205", "42P01", "42883"].includes(error.code ?? "")) {
    throw new MentorBookingHttpError(503, "Mentor booking is not available yet. An administrator needs to finish its setup.");
  }
  if (error.code === "42501") throw new MentorBookingHttpError(403, "You do not have access to this mentor booking action.");
  if (error.code === "P0002") throw new MentorBookingHttpError(404, "The selected booking record is not available.");
  if (["23505", "23P01", "40001", "55000"].includes(error.code ?? "")) throw new MentorBookingHttpError(409, "That availability or booking changed. Refresh and try again.");
  if (["22023", "23514"].includes(error.code ?? "")) throw new MentorBookingHttpError(400, "The booking request is invalid.");
  throw new MentorBookingHttpError(500, "Mentor booking could not be saved or loaded. Please try again.");
}

function databaseFailure(error: DatabaseError): never {
  return mentorBookingDatabaseError(error);
}

export function toWeeklyAvailabilityRpcPayload(availability: readonly WeeklyAvailabilityRange[]) {
  return availability.map((range) => ({ weekday: range.weekday, starts_at: range.startsAt, ends_at: range.endsAt }));
}

export function startupNeedsForWorkspace(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((need): need is string => typeof need === "string").map((need) => need.trim()).filter(Boolean) : [];
}

export function acceptedOccupancyForWorkspace(row: { semester_id: string; mentor_semester_id: string; starts_at: string; ends_at: string }) {
  return { semesterId: row.semester_id, mentorSemesterId: row.mentor_semester_id, startsAt: row.starts_at, endsAt: row.ends_at };
}

async function allRows<T>(page: (start: number, end: number) => PromiseLike<QueryResult<T[]>>): Promise<T[]> {
  const result: T[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const response = await page(offset, offset + size - 1);
    if (response.error) databaseFailure(response.error);
    const rows = response.data ?? [];
    result.push(...rows);
    if (rows.length < size) return result;
  }
}

export function createMentorBookingStore(
  client: SupabaseClient<Database>,
  viewer: MentorBookingModelInput["viewer"],
  authorizedSemester?: SemesterBookingMetadata,
  calendarToken?: string,
  refreshCalendar: typeof refreshCalendarForBooking = refreshCalendarForBooking,
): MentorBookingStore {
  return {
    async load(semesterId, weekOffset = 0) {
      const rosterPromise = viewer.role === "admin" || viewer.role === "startup"
        ? allRows((start, end) => {
          let query = client.from("startup_semesters").select("id,startup_organizations(name)").eq("semester_id", semesterId);
          if (viewer.role === "startup") query = query.eq("id", viewer.startupSemesterId ?? "00000000-0000-0000-0000-000000000000");
          return query.order("id").range(start, end);
        }) : Promise.resolve([]);
      void rosterPromise.catch(() => undefined);
      const semesterPromise = authorizedSemester
        ? Promise.resolve({ data: authorizedSemester, error: null })
        : client.from("semesters").select("configuration,start_date,end_date").eq("id", semesterId).single();
      const availabilityPromise = allRows((start, end) => client.from("mentor_weekly_availability")
        .select("semester_id,mentor_semester_id,weekday,starts_at,ends_at,mentor_semesters!inner(semester_memberships!inner(profile_id,profiles!inner(full_name)))")
        .eq("semester_id", semesterId).order("mentor_semester_id").order("weekday").order("starts_at").range(start, end));
      const requestsPromise = allRows((start, end) => client.from("mentor_booking_requests")
        .select("id,semester_id,window_id,mentor_semester_id,mentor_profile_id,mentor_name,startup_semester_id,startup_organization_id,startup_name,topic,status,starts_at,ends_at,requested_at,responded_at,cancelled_at")
        .eq("semester_id", semesterId).order("requested_at", { ascending: false }).order("id").range(start, end));
      const acceptedOccupancyPromise = allRows((start, end) => client.from("mentor_booking_accepted_occupancy")
        .select("semester_id,mentor_semester_id,starts_at,ends_at")
        .eq("semester_id", semesterId).gt("ends_at", new Date().toISOString()).order("starts_at").range(start, end));
      const workspaceRowsPromise = Promise.all([availabilityPromise, requestsPromise, acceptedOccupancyPromise]);
      void workspaceRowsPromise.catch(() => undefined);
      const semester = await semesterPromise;
      if (semester.error) databaseFailure(semester.error);
      const [availabilityRows, requests, acceptedOccupancyRows] = await workspaceRowsPromise;
      const availability = availabilityRows.map((row) => mentorWeeklyAvailabilityForWorkspace(row));
      const configuredZone = semester.data?.configuration && typeof semester.data.configuration === "object" && !Array.isArray(semester.data.configuration)
        ? semester.data.configuration.timezone : undefined;
      const timeZone = typeof configuredZone === "string" && configuredZone.trim() ? configuredZone : "America/New_York";
      const effectiveAvailability = calendarToken ? await readWorkspaceCalendarAvailability({ environment: calendarSupabaseEnvironment(), token: calendarToken, semesterId, viewer, timeZone, semesterStartDate: semester.data.start_date, weekOffset }) : undefined;
      const mentorProfileIds = [...new Set([
        ...availability.map((range) => range.mentorProfileId),
        ...(effectiveAvailability ?? []).map((slot) => slot.mentor.profileId),
      ])];
      const mentorProfiles = mentorProfileIds.length > 0
        ? await client.from("mentor_profiles").select("profile_id,expertise_tags").in("profile_id", mentorProfileIds)
        : { data: [], error: null };
      if (mentorProfiles.error) databaseFailure(mentorProfiles.error);
      const expertiseByProfileId = new Map((mentorProfiles.data ?? []).map((profile) => [profile.profile_id, profile.expertise_tags]));
      const holdStatuses = calendarToken && viewer.role !== "admin" ? await readCalendarHoldStatuses({
        environment: calendarSupabaseEnvironment(), token: calendarToken, semesterId,
        requestIds: requests.filter(row => row.status === "accepted" || row.status === "cancelled").map(row => row.id),
      }) : {};
      const startupRoster = (await rosterPromise).map(row => ({ startupSemesterId: row.id, name: String(firstRelationRecord(row.startup_organizations)?.name ?? "Startup") }));
      return {
        startupRoster,
        ...(effectiveAvailability ? { effectiveAvailability: effectiveAvailability.map(slot => ({ ...slot, mentor: { ...slot.mentor, expertiseTags: expertiseByProfileId.get(slot.mentor.profileId) ?? [] } })), availabilityWeekOffset: weekOffset } : {}),
        semesterStartDate: semester.data.start_date,
        semesterEndDate: semester.data.end_date,
        semesterId,
        timeZone,
        viewer,
        acceptedOccupancy: acceptedOccupancyRows.map(acceptedOccupancyForWorkspace),
        availability: availability.map((range) => ({ ...range, mentorExpertiseTags: expertiseByProfileId.get(range.mentorProfileId) ?? range.mentorExpertiseTags ?? [] })),
        windows: [],
        requests: requests.map((row) => {
          if (!["pending", "accepted", "declined", "cancelled"].includes(row.status)) throw new MentorBookingDataError("Unknown booking request status.");
          return {
            requestId: row.id, semesterId: row.semester_id, windowId: row.window_id,
            ...(holdStatuses[row.id] ? { calendarHoldStatus: holdStatuses[row.id] } : {}),
            mentorSemesterId: row.mentor_semester_id, mentorProfileId: row.mentor_profile_id,
            mentorName: row.mentor_name, startupSemesterId: row.startup_semester_id,
            startupOrganizationId: row.startup_organization_id, startupName: row.startup_name,
            topic: row.topic, status: row.status as MentorBookingRequestStatus, startsAt: row.starts_at,
            endsAt: row.ends_at, requestedAt: row.requested_at, respondedAt: row.responded_at,
            cancelledAt: row.cancelled_at,
          };
        }),
      };
    },
    async execute(command) {
      if (calendarToken && command.action === "request_booking") {
        await refreshCalendar({ token: calendarToken, semesterId: command.semesterId, mentorSemesterId: command.mentorSemesterId });
      } else if (calendarToken && command.action === "accept_request") {
        const booking = await client.from("mentor_booking_requests").select("mentor_semester_id,status")
          .eq("semester_id", command.semesterId).eq("id", command.requestId).maybeSingle();
        if (booking.error) databaseFailure(booking.error);
        // An acceptance retry must not classify its already-created hold as a
        // new conflict. The database command still validates ownership/status.
        if (booking.data?.status === "pending") {
          await refreshCalendar({ token: calendarToken, semesterId: command.semesterId, mentorSemesterId: booking.data.mentor_semester_id });
        }
      }
      let response: QueryResult<unknown>;
      switch (command.action) {
        case "publish_window":
          throw new MentorBookingRequestError("Mentors cannot change program availability.");
        case "withdraw_window":
          throw new MentorBookingRequestError("Mentors cannot change program availability.");
        case "request_window":
          response = await client.rpc("request_mentor_booking_window", { p_semester_id: command.semesterId, p_window_id: command.windowId, p_topic: command.topic });
          break;
        case "replace_weekly_availability":
          throw new MentorBookingRequestError("Mentors cannot change program availability.");
        case "request_booking":
          response = await client.rpc("request_mentor_booking", { p_semester_id: command.semesterId, p_mentor_semester_id: command.mentorSemesterId, p_starts_at: command.startsAt, p_ends_at: command.endsAt, p_topic: command.topic });
          break;
        case "accept_request":
        case "decline_request":
          response = await client.rpc("respond_to_mentor_booking_request", { p_semester_id: command.semesterId, p_request_id: command.requestId, p_response: command.action === "accept_request" ? "accepted" : "declined" });
          break;
        case "cancel_request":
          response = await client.rpc("cancel_mentor_booking_request", { p_semester_id: command.semesterId, p_request_id: command.requestId });
          break;
      }
      if (response.error) databaseFailure(response.error);
      if (command.action === "request_booking" && viewer.role === "startup" && typeof response.data === "string") {
        try {
          await sendSavedBookingRequest({ client, bookingId: response.data, semesterId: command.semesterId,
            startupProfileId: viewer.profileId, startupSemesterId: viewer.startupSemesterId ?? "" });
        } catch (cause) {
          // The saved booking remains valid when the email provider is unavailable.
          console.error("[mentor-booking] request email failed", cause);
        }
      }
    },
  };
}

async function authorizeMentorBooking(request: Request, semesterId: string): Promise<MentorBookingStore> {
  const auth = await requireAuthenticatedUserWithRls(request);
  const [semester, memberships, management] = await Promise.all([
    auth.userClient.from("semesters").select("id,configuration,start_date,end_date").eq("id", semesterId).eq("is_active", true).maybeSingle(),
    auth.userClient.from("semester_memberships").select("id,role").eq("semester_id", semesterId).eq("profile_id", auth.profileId).eq("status", "active").in("role", ["mentor", "startup"]),
    auth.userClient.rpc("can_manage_semester", { target_semester_id: semesterId, candidate_id: auth.user.id }),
  ]);
  if (semester.error) databaseFailure(semester.error);
  if (!semester.data) throw new MentorBookingHttpError(403, "An active mentor or startup membership is required for this semester.");
  if (memberships.error) databaseFailure(memberships.error);
  const participantMembership = (memberships.data ?? []).find((membership) => membership.role === "mentor")
    ?? (memberships.data ?? []).find((membership) => membership.role === "startup")
    ?? null;
  if (management.error) databaseFailure(management.error);
  if (!participantMembership && management.data !== true) throw new MentorBookingHttpError(403, "An active mentor or startup membership is required for this semester.");
  const role: MentorBookingViewerRole = participantMembership?.role as MentorBookingViewerRole ?? "admin";
  const membershipId = participantMembership?.id ?? null;
  let mentorSemesterId: string | null = null;
  let startupSemesterId: string | null = null;
  if (role === "mentor" && membershipId) {
    const mentor = await auth.userClient.from("mentor_semesters").select("id").eq("semester_id", semesterId).eq("semester_membership_id", membershipId).maybeSingle();
    if (mentor.error) databaseFailure(mentor.error);
    mentorSemesterId = mentor.data?.id ?? null;
  }
  if (role === "startup" && membershipId) {
    const startup = await auth.userClient.from("startup_team_memberships").select("startup_semester_id").eq("semester_id", semesterId).eq("semester_membership_id", membershipId).maybeSingle();
    if (startup.error) databaseFailure(startup.error);
    startupSemesterId = startup.data?.startup_semester_id ?? null;
  }
  let startupNeeds: string[] | undefined;
  if (startupSemesterId) {
    const startup = await auth.userClient.from("startup_semesters").select("mentorship_needs").eq("id", startupSemesterId).eq("semester_id", semesterId).maybeSingle();
    if (startup.error) databaseFailure(startup.error);
    startupNeeds = startupNeedsForWorkspace(startup.data?.mentorship_needs);
  }
  return createMentorBookingStore(
    auth.userClient,
    { profileId: auth.profileId, role, mentorSemesterId, startupSemesterId, ...(startupNeeds ? { startupNeeds } : {}) },
    {
      configuration: semester.data.configuration,
      end_date: semester.data.end_date,
      start_date: semester.data.start_date,
    },
    calendarAvailabilityEnabled() ? readBearerToken(request.headers.get("authorization")) ?? undefined : undefined,
  );
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function failure(cause: unknown): Response {
  if (cause instanceof AuthorizationError || cause instanceof MentorBookingHttpError || cause instanceof CalendarHttpError) return json({ error: cause.message }, cause.status);
  if (cause instanceof SyntaxError) return json({ error: "Request body must be valid JSON." }, 400);
  if (cause instanceof MentorBookingRequestError) return json({ error: (cause as Error).message }, 400);
  return json({ error: "Mentor booking could not be saved or loaded. Please try again." }, 500);
}

export function createMentorBookingHandlers(authorize: AuthorizeMentorBooking = authorizeMentorBooking) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        const { semesterId, weekOffset } = parseMentorBookingQuery(request.url);
        const store = await authorize(request, semesterId);
        return json(buildMentorBookingWorkspace(await store.load(semesterId, weekOffset)));
      } catch (cause) { return failure(cause); }
    },
    async POST(request: Request): Promise<Response> {
      try {
        const command = parseMentorBookingCommand(await request.json());
        const weekOffset = parseMentorBookingWeekOffset(request.url);
        const store = await authorize(request, command.semesterId);
        await store.execute(command);
        return json({ workspace: buildMentorBookingWorkspace(await store.load(command.semesterId, weekOffset)) });
      } catch (cause) { return failure(cause); }
    },
  };
}
