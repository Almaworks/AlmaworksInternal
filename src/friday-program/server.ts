import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthorizationError, requireAuthenticatedUserWithRls } from "../auth/server.ts";
import type { Database } from "../db/types.ts";
import { buildFridayProgramResponse, FridayProgramDataError, FridayProgramRequestError, parseFridayProgramQuery, parseGenerateFridayProgramRequest, parseRemoveFridaySpeakerRequest, parseSaveFridaySpeakerRequest, parseSetFridayWeekCanceledRequest, type FridayProgramModelInput } from "./model.ts";
import type { FridaySpeaker } from "./types.ts";
import { ALMAWORKS_SUPABASE_URL } from '../calendar/config.ts';
import { dispatchFridaySpeakerAnnouncement, speakerAnnouncementChanged, type FridaySpeakerDeliverySummary } from '../notifications/friday-speaker-delivery.ts';

export class FridayProgramHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "FridayProgramHttpError";
    this.status = status;
  }
}

export interface FridayProgramStore {
  load(semesterId: string, meetingId?: string): Promise<FridayProgramModelInput>;
  generate(semesterId: string, meetingId: string, regenerate: boolean): Promise<{ created: boolean; programId: string }>;
  saveSpeaker(semesterId: string, meetingId: string, speaker: FridaySpeaker): Promise<void>;
  removeSpeaker(semesterId: string, meetingId: string): Promise<void>;
  setWeekCanceled(semesterId: string, meetingId: string, canceled: boolean): Promise<void>;
}

type AuthorizeFridayProgram = (request: Request, semesterId: string, mode: "cancel" | "read" | "generate" | "speaker") => Promise<FridayProgramStore>;
type DatabaseError = { code?: string; message: string };
type QueryResult<T> = { data: T | null; error: DatabaseError | null };

function databaseFailure(error: DatabaseError): never {
  if (error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42P01" || error.code === "42883") {
    throw new FridayProgramHttpError(503, "The Friday program is not available yet. An administrator needs to finish its setup.");
  }
  if (error.code === "42501") throw new FridayProgramHttpError(403, "You do not have access to this Friday program.");
  if (error.code === "P0002") throw new FridayProgramHttpError(404, "This meeting is not available in the selected active semester.");
  if (error.code === "23503") throw new FridayProgramHttpError(404, "This meeting is not available in the selected semester.");
  if (error.code === "23514") throw new FridayProgramHttpError(400, "The speaker details did not meet the saved format requirements.");
  if (error.code === "P0001") throw new FridayProgramHttpError(400, "Groups require an active semester and at least one startup company with an active member.");
  if (error.code === "P0003") throw new FridayProgramHttpError(409, error.message);
  throw new FridayProgramHttpError(500, "The Friday program could not be saved or loaded. Please try again.");
}

async function allRows<T>(page: (start: number, end: number) => PromiseLike<QueryResult<T[]>>, onMissingSchema?: () => void): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const response = await page(offset, offset + pageSize - 1);
    if (response.error) {
      if (onMissingSchema && ["PGRST204", "PGRST205", "42P01", "42703"].includes(response.error.code ?? "")) {
        onMissingSchema();
        return [];
      }
      databaseFailure(response.error);
    }
    const rows = response.data ?? [];
    result.push(...rows);
    if (rows.length < pageSize) return result;
  }
}

export function createFridayProgramStore(client: SupabaseClient<Database>): FridayProgramStore {
  return {
    async load(semesterId, meetingId) {
      const meetingQuery = () => {
        const query = client.from("meetings").select("id,meeting_date,label,friday_canceled_at,friday_canceled_by_profile_id").eq("semester_id", semesterId).order("meeting_date").order("id");
        return meetingId ? query.eq("id", meetingId) : query;
      };
      const legacyMeetingQuery = () => {
        const query = client.from("meetings").select("id,meeting_date,label").eq("semester_id", semesterId).order("meeting_date").order("id");
        return meetingId ? query.eq("id", meetingId) : query;
      };
      const programQuery = () => {
        const query = client.from("friday_programs").select("id,meeting_id,agenda_version,group_a_facilitator,group_b_facilitator,generated_at").eq("semester_id", semesterId).order("id");
        return meetingId ? query.eq("meeting_id", meetingId) : query;
      };
      let cancellationSetupPending = false;
      const meetingsPromise = allRows((start, end) => meetingQuery().range(start, end), () => { cancellationSetupPending = true; });
      const programsPromise = allRows((start, end) => programQuery().range(start, end));
      void programsPromise.catch(() => undefined);
      const currentMeetings = await meetingsPromise;
      const meetings: Array<{ friday_canceled_at?: string | null; friday_canceled_by_profile_id?: string | null; id: string; label: string | null; meeting_date: string }> = cancellationSetupPending
        ? await allRows((start, end) => legacyMeetingQuery().range(start, end))
        : currentMeetings;
      if (meetingId && meetings.length === 0) throw new FridayProgramHttpError(404, "This meeting is not available in the selected semester.");
      const programs = await programsPromise;
      let speakerSetupPending = false;
      const speakers = await allRows((start, end) => {
        const query = client.from("friday_speakers").select("meeting_id,name,bio,expertise,topic,contact_email,contact_phone,linkedin_url,website_url").eq("semester_id", semesterId).order("meeting_id");
        return (meetingId ? query.eq("meeting_id", meetingId) : query).range(start, end);
      }, () => { speakerSetupPending = true; });
      const assignments = programs.length === 0 ? [] : await allRows((start, end) => {
        const query = client.from("friday_program_assignments").select("program_id,startup_semester_id,startup_organization_id,startup_name,startup_slug,group_code,group_position").eq("semester_id", semesterId).order("id");
        return (meetingId ? query.in("program_id", programs.map((program) => program.id)) : query).range(start, end);
      });
      return {
        semesterId,
        ...(cancellationSetupPending ? { cancellationSetupPending: true } : {}),
        ...(speakerSetupPending ? { speakerSetupPending: true } : {}),
        meetings: meetings.map((meeting) => ({
          id: meeting.id,
          meetingDate: meeting.meeting_date,
          label: meeting.label,
          ...(typeof meeting.friday_canceled_at === "string"
            ? { canceledAt: meeting.friday_canceled_at, canceledByProfileId: typeof meeting.friday_canceled_by_profile_id === "string" ? meeting.friday_canceled_by_profile_id : null }
            : {}),
        })),
        programs: programs.map((program) => ({ id: program.id, meetingId: program.meeting_id, agendaVersion: program.agenda_version, groupAFacilitator: program.group_a_facilitator, groupBFacilitator: program.group_b_facilitator, generatedAt: program.generated_at })),
        assignments: assignments.map((assignment) => {
          if (assignment.group_code !== "A" && assignment.group_code !== "B") throw new FridayProgramDataError("Unknown saved Friday group.");
          return { programId: assignment.program_id, startupSemesterId: assignment.startup_semester_id, startupOrganizationId: assignment.startup_organization_id, startupName: assignment.startup_name, startupSlug: assignment.startup_slug, group: assignment.group_code, position: assignment.group_position };
        }),
        speakers: speakers.map((speaker) => ({ meetingId: speaker.meeting_id, name: speaker.name, bio: speaker.bio, expertise: speaker.expertise, topic: speaker.topic, contactEmail: speaker.contact_email, contactPhone: speaker.contact_phone, linkedinUrl: speaker.linkedin_url, websiteUrl: speaker.website_url })),
      };
    },
    async generate(semesterId, meetingId, regenerate) {
      const response = await client.rpc("generate_friday_program", { p_semester_id: semesterId, p_meeting_id: meetingId, p_regenerate: regenerate });
      if (response.error) databaseFailure(response.error);
      const result = response.data?.[0];
      if (!result || typeof result.was_created !== "boolean" || typeof result.program_id !== "string") throw new FridayProgramDataError("Friday publication did not return its saved identifier.");
      return { created: result.was_created, programId: result.program_id };
    },
    async saveSpeaker(semesterId, meetingId, speaker) {
      const meeting = await client.from("meetings").select("id").eq("semester_id", semesterId).eq("id", meetingId).maybeSingle();
      if (meeting.error) databaseFailure(meeting.error);
      if (!meeting.data) throw new FridayProgramHttpError(404, "This meeting is not available in the selected semester.");
      const result = await client.from("friday_speakers").upsert({
        semester_id: semesterId, meeting_id: meetingId, name: speaker.name, bio: speaker.bio,
        expertise: speaker.expertise, topic: speaker.topic, contact_email: speaker.contactEmail,
        contact_phone: speaker.contactPhone, linkedin_url: speaker.linkedinUrl, website_url: speaker.websiteUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: "meeting_id" });
      if (result.error) databaseFailure(result.error);
    },
    async removeSpeaker(semesterId, meetingId) {
      const meeting = await client.from("meetings").select("id").eq("semester_id", semesterId).eq("id", meetingId).maybeSingle();
      if (meeting.error) databaseFailure(meeting.error);
      if (!meeting.data) throw new FridayProgramHttpError(404, "This meeting is not available in the selected semester.");
      const result = await client.from("friday_speakers").delete().eq("semester_id", semesterId).eq("meeting_id", meetingId);
      if (result.error) databaseFailure(result.error);
    },
    async setWeekCanceled(semesterId, meetingId, canceled) {
      const result = await client.rpc("set_friday_week_canceled", {
        p_semester_id: semesterId,
        p_meeting_id: meetingId,
        p_canceled: canceled,
      });
      if (result.error) databaseFailure(result.error);
      if (result.data !== true) throw new FridayProgramDataError("Friday week cancellation did not return a saved result.");
    },
  };
}

async function authorizeFridayProgram(request: Request, semesterId: string, mode: "cancel" | "read" | "generate" | "speaker"): Promise<FridayProgramStore> {
  const auth = await requireAuthenticatedUserWithRls(request);
  const management = await auth.userClient.rpc("can_manage_semester", { target_semester_id: semesterId, candidate_id: auth.user.id });
  if (management.error) databaseFailure(management.error);
  if (management.data !== true) {
    if (mode !== "read") throw new FridayProgramHttpError(403, "Semester administrator access is required to manage the Friday program.");
    const membership = await auth.userClient.from("semester_memberships").select("id").eq("semester_id", semesterId).eq("profile_id", auth.profileId).in("role", ["mentor", "startup", "admin"]).in("status", ["active", "alumni"]).limit(1).maybeSingle();
    if (membership.error) databaseFailure(membership.error);
    if (!membership.data) throw new FridayProgramHttpError(403, "You do not have access to this semester's Friday program.");
  }
  return createFridayProgramStore(auth.userClient);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function failure(cause: unknown): Response {
  if (cause instanceof AuthorizationError || cause instanceof FridayProgramHttpError) return json({ error: cause.message }, cause.status);
  if (cause instanceof SyntaxError) return json({ error: "Request body must be valid JSON." }, 400);
  if (cause instanceof FridayProgramRequestError) return json({ error: cause.message }, 400);
  return json({ error: "The Friday program could not be saved or loaded. Please try again." }, 500);
}

export function createFridayProgramHandlers(authorize: AuthorizeFridayProgram = authorizeFridayProgram) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        const query = parseFridayProgramQuery(request.url);
        const store = await authorize(request, query.semesterId, "read");
        const input = await store.load(query.semesterId, query.meetingId);
        if (input.semesterId !== query.semesterId) throw new FridayProgramDataError("Unexpected semester read model.");
        if (query.meetingId && !input.meetings.some((meeting) => meeting.id === query.meetingId)) throw new FridayProgramHttpError(404, "This meeting is not available in the selected semester.");
        return json(buildFridayProgramResponse(input));
      } catch (cause) { return failure(cause); }
    },
    async POST(request: Request): Promise<Response> {
      try {
        const input = parseGenerateFridayProgramRequest(await request.json());
        const store = await authorize(request, input.semesterId, "generate");
        const result = await store.generate(input.semesterId, input.meetingId, input.regenerate);
        const saved = await store.load(input.semesterId, input.meetingId);
        if (saved.semesterId !== input.semesterId) throw new FridayProgramDataError("Unexpected semester read model.");
        const program = buildFridayProgramResponse(saved).meetings.find((meeting) => meeting.meetingId === input.meetingId)?.program;
        if (!program || program.programId !== result.programId) throw new FridayProgramDataError("The saved Friday program could not be verified.");
        return json({ created: result.created, program }, result.created ? 201 : 200);
      } catch (cause) { return failure(cause); }
    },
  };
}

type NotifyFridaySpeaker = (request: Request, input: { semesterId: string; meetingId: string; previousSpeaker: FridaySpeaker | null; currentSpeaker: FridaySpeaker }) => Promise<FridaySpeakerDeliverySummary>;

async function notifyFridaySpeaker(request: Request, input: { semesterId: string; meetingId: string; previousSpeaker: FridaySpeaker | null; currentSpeaker: FridaySpeaker }): Promise<FridaySpeakerDeliverySummary> {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== ALMAWORKS_SUPABASE_URL) throw new Error('Notification Supabase project does not match the allowed Almaworks project.');
  const auth = await requireAuthenticatedUserWithRls(request);
  return dispatchFridaySpeakerAnnouncement({
    client: auth.userClient,
    ...input,
    appOrigin: process.env.NOTIFICATION_APP_ORIGIN?.trim() || process.env.CALENDAR_APP_ORIGIN?.trim() || null,
    apiKey: process.env.NOTIFICATION_ENABLED === 'true' ? process.env.SEQUENZY_API_KEY?.trim() || null : null,
  });
}

export function createFridaySpeakerHandlers(authorize: AuthorizeFridayProgram = authorizeFridayProgram, notify: NotifyFridaySpeaker = notifyFridaySpeaker) {
  return {
    async POST(request: Request): Promise<Response> {
      try {
        const input = parseRemoveFridaySpeakerRequest(await request.json());
        const store = await authorize(request, input.semesterId, "speaker");
        const saved = await store.load(input.semesterId, input.meetingId);
        const meeting = buildFridayProgramResponse(saved).meetings.find((item) => item.meetingId === input.meetingId);
        if (!meeting) throw new FridayProgramHttpError(404, "This meeting is not available in the selected semester.");
        if (meeting.status === 'canceled' || !meeting.speaker) throw new FridayProgramHttpError(409, 'An active Friday speaker assignment is required before notifying startups.');
        const notification = await notify(request, { semesterId: input.semesterId, meetingId: input.meetingId, previousSpeaker: null, currentSpeaker: meeting.speaker });
        return json({ notification });
      } catch (cause) { return failure(cause); }
    },
    async PUT(request: Request): Promise<Response> {
      try {
        const input = parseSaveFridaySpeakerRequest(await request.json());
        const store = await authorize(request, input.semesterId, "speaker");
        const before = await store.load(input.semesterId, input.meetingId);
        const previousMeeting = buildFridayProgramResponse(before).meetings.find((meeting) => meeting.meetingId === input.meetingId);
        if (!previousMeeting) throw new FridayProgramHttpError(404, 'This meeting is not available in the selected semester.');
        if (previousMeeting.status === 'canceled') throw new FridayProgramHttpError(409, 'Canceled Friday weeks cannot receive speaker updates.');
        const previousSpeaker = previousMeeting.speaker ?? null;
        const changed = speakerAnnouncementChanged(previousSpeaker, input.speaker);
        if (changed) await store.saveSpeaker(input.semesterId, input.meetingId, input.speaker);
        const saved = await store.load(input.semesterId, input.meetingId);
        const speaker = buildFridayProgramResponse(saved).meetings.find((meeting) => meeting.meetingId === input.meetingId)?.speaker;
        if (!speaker) throw new FridayProgramDataError("The saved speaker could not be verified.");
        if (!changed) return json({ speaker, notification: { accepted: 0, queued: 0, rejected: 0, unknown: 0, skipped: 1 } });
        try {
          const notification = await notify(request, { semesterId: input.semesterId, meetingId: input.meetingId, previousSpeaker, currentSpeaker: speaker });
          return json({ speaker, notification });
        } catch (cause) {
          console.error('[friday-program] speaker saved but notification dispatch failed', cause);
          return json({ speaker, notificationError: 'Speaker saved, but email notifications could not be queued or sent. Please contact an administrator before retrying.' });
        }
      } catch (cause) { return failure(cause); }
    },
    async DELETE(request: Request): Promise<Response> {
      try {
        const input = parseRemoveFridaySpeakerRequest(await request.json());
        const store = await authorize(request, input.semesterId, "speaker");
        await store.removeSpeaker(input.semesterId, input.meetingId);
        const saved = await store.load(input.semesterId, input.meetingId);
        if (saved.semesterId !== input.semesterId) throw new FridayProgramDataError("Unexpected semester read model.");
        const meeting = buildFridayProgramResponse(saved).meetings.find((item) => item.meetingId === input.meetingId);
        if (!meeting) throw new FridayProgramHttpError(404, "This meeting is not available in the selected semester.");
        if (meeting.speaker) throw new FridayProgramDataError("The speaker removal could not be verified.");
        return json({ speaker: null });
      } catch (cause) { return failure(cause); }
    },
  };
}

export function createFridayWeekCancellationHandlers(authorize: AuthorizeFridayProgram = authorizeFridayProgram) {
  return {
    async PUT(request: Request): Promise<Response> {
      try {
        const input = parseSetFridayWeekCanceledRequest(await request.json());
        const store = await authorize(request, input.semesterId, "cancel");
        await store.setWeekCanceled(input.semesterId, input.meetingId, input.canceled);
        const saved = await store.load(input.semesterId, input.meetingId);
        if (saved.semesterId !== input.semesterId) throw new FridayProgramDataError("Unexpected semester read model.");
        const meeting = buildFridayProgramResponse(saved).meetings.find((item) => item.meetingId === input.meetingId);
        if (!meeting) throw new FridayProgramHttpError(404, "This meeting is not available in the selected semester.");
        if ((meeting.status === "canceled") !== input.canceled) throw new FridayProgramDataError("The Friday week cancellation could not be verified.");
        return json({ meeting });
      } catch (cause) { return failure(cause); }
    },
  };
}
