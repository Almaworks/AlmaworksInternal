import type {
  MentorBookingCommand,
  MentorBookingRequest,
  MentorBookingRequestStatus,
  MentorBookingViewer,
  MentorBookingWorkspaceResponse,
  MentorEffectiveAvailability,
} from "./types.ts";

export class MentorBookingRequestError extends Error {
  constructor(message: string) { super(message); this.name = "MentorBookingRequestError"; }
}

export class MentorBookingDataError extends Error {
  constructor(message: string) { super(message); this.name = "MentorBookingDataError"; }
}

export interface MentorBookingWindowRecord {
  endsAt: string;
  mentorName: string;
  mentorProfileId: string;
  mentorSemesterId: string;
  semesterId: string;
  startsAt: string;
  windowId: string;
  withdrawnAt: string | null;
}

export interface MentorBookingRequestRecord {
  calendarHoldStatus?: MentorBookingRequest["calendarHoldStatus"];
  cancelledAt: string | null;
  endsAt: string;
  mentorName: string;
  mentorProfileId: string;
  mentorSemesterId: string;
  requestId: string;
  requestedAt: string;
  respondedAt: string | null;
  semesterId: string;
  startsAt: string;
  startupName: string;
  startupOrganizationId: string;
  startupSemesterId: string;
  status: MentorBookingRequestStatus;
  topic: string;
  windowId: string | null;
}

export interface MentorWeeklyAvailabilityRecord {
  endsAt: string;
  mentorName: string;
  mentorProfileId: string;
  mentorSemesterId: string;
  mentorExpertiseTags?: string[];
  semesterId: string;
  startsAt: string;
  weekday: number;
}

export interface MentorBookingAcceptedOccupancyRecord {
  endsAt: string;
  mentorSemesterId: string;
  semesterId: string;
  startsAt: string;
}

export interface MentorBookingModelInput {
  startupRoster?: Array<{ startupSemesterId: string; name: string }>;
  effectiveAvailability?: readonly MentorEffectiveAvailability[];
  availabilityWeekOffset?: number;
  acceptedOccupancy?: readonly MentorBookingAcceptedOccupancyRecord[];
  availability?: readonly MentorWeeklyAvailabilityRecord[];
  claims?: readonly { status: "accepted" | "pending"; windowId: string }[];
  requests: readonly MentorBookingRequestRecord[];
  semesterEndDate: string;
  semesterId: string;
  semesterStartDate: string;
  timeZone: string;
  viewer: MentorBookingViewer;
  windows?: readonly MentorBookingWindowRecord[];
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OFFSET_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|([+-])(\d{2}):(\d{2}))$/u;

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new MentorBookingRequestError("Request body must be a JSON object.");
  return value as Record<string, unknown>;
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new MentorBookingRequestError(`${field} is required.`);
  const result = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(result)) throw new MentorBookingRequestError(`${field} must be a valid UUID.`);
  return result;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "" || !Number.isFinite(Date.parse(value))) throw new MentorBookingRequestError(`${field} must be a valid ISO timestamp.`);
  const match = OFFSET_TIMESTAMP_PATTERN.exec(value.trim());
  if (!match) throw new MentorBookingRequestError(`${field} must include an explicit timezone offset or Z.`);
  const [,yearText,monthText,dayText,hourText,minuteText,secondText = "0",,offsetSign,offsetHourText = "0",offsetMinuteText = "0"] = match;
  const [year,month,day,hour,minute,second,offsetHour,offsetMinute] = [yearText,monthText,dayText,hourText,minuteText,secondText,offsetHourText,offsetMinuteText].map(Number);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > maxDay || hour > 23 || minute > 59 || second > 59) {
    throw new MentorBookingRequestError(`${field} must contain a valid calendar date and time.`);
  }
  if (offsetSign && (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0))) {
    throw new MentorBookingRequestError(`${field} has an invalid timezone offset.`);
  }
  return new Date(value).toISOString();
}

function localTime(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(value)) throw new MentorBookingRequestError(`${field} must be a local HH:MM time.`);
  if (Number(value.slice(3)) % 15 !== 0) throw new MentorBookingRequestError(`${field} must align to 15 minutes.`);
  return value;
}

function topic(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new MentorBookingRequestError("topic is required.");
  const result = value.trim();
  if (result.length > 1000) throw new MentorBookingRequestError("topic must be at most 1000 characters.");
  return result;
}

export function parseMentorBookingWeekOffset(url: string): number {
  const value = new URL(url).searchParams.get("weekOffset") ?? "0";
  if (!/^\d{1,2}$/.test(value) || Number(value) > 52) throw new MentorBookingRequestError("weekOffset must be between 0 and 52.");
  return Number(value);
}
export function parseMentorBookingQuery(url: string): { semesterId: string; weekOffset: number } {
  return { semesterId: uuid(new URL(url).searchParams.get("semesterId"), "semesterId"), weekOffset: parseMentorBookingWeekOffset(url) };
}

export function parseMentorBookingCommand(value: unknown): MentorBookingCommand {
  const body = object(value);
  const semesterId = uuid(body.semesterId, "semesterId");
  if (body.action === "publish_window") {
    const startsAt = timestamp(body.startsAt, "startsAt");
    const endsAt = timestamp(body.endsAt, "endsAt");
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new MentorBookingRequestError("endsAt must be after startsAt.");
    return { action: body.action, semesterId, startsAt, endsAt };
  }
  if (body.action === "withdraw_window") return { action: body.action, semesterId, windowId: uuid(body.windowId, "windowId") };
  if (body.action === "request_window") {
    return { action: body.action, semesterId, windowId: uuid(body.windowId, "windowId"), topic: topic(body.topic) };
  }
  if (body.action === "replace_weekly_availability") {
    if (!Array.isArray(body.availability)) throw new MentorBookingRequestError("availability must be an array.");
    const availability = body.availability.map((entry) => {
      const range = object(entry);
      const weekday = range.weekday;
      if (!Number.isInteger(weekday) || (weekday as number) < 0 || (weekday as number) > 6) throw new MentorBookingRequestError("weekday must be between 0 and 6.");
      const startsAt = localTime(range.startsAt, "availability.startsAt");
      const endsAt = localTime(range.endsAt, "availability.endsAt");
      if (endsAt <= startsAt) throw new MentorBookingRequestError("availability endsAt must be after startsAt.");
      return { weekday: weekday as number, startsAt, endsAt };
    });
    return { action: body.action, semesterId, availability };
  }
  if (body.action === "request_booking") {
    const startsAt = timestamp(body.startsAt, "startsAt");
    const endsAt = timestamp(body.endsAt, "endsAt");
    const durationMinutes = (Date.parse(endsAt) - Date.parse(startsAt)) / 60_000;
    if (durationMinutes !== 15 && durationMinutes !== 30) throw new MentorBookingRequestError("Booking requests must be 15 or 30 minutes.");
    return { action: body.action, semesterId, mentorSemesterId: uuid(body.mentorSemesterId, "mentorSemesterId"), startsAt, endsAt, topic: topic(body.topic) };
  }
  if (body.action === "accept_request" || body.action === "decline_request" || body.action === "cancel_request") {
    return { action: body.action, semesterId, requestId: uuid(body.requestId, "requestId") };
  }
  throw new MentorBookingRequestError("action is not supported.");
}

function requestView(record: MentorBookingRequestRecord, viewer: MentorBookingViewer): MentorBookingRequest {
  const pending = record.status === "pending";
  const ownMentor = viewer.role === "mentor" && viewer.mentorSemesterId === record.mentorSemesterId;
  const ownStartup = viewer.role === "startup" && viewer.startupSemesterId === record.startupSemesterId;
  return {
    requestId: record.requestId,
    ...(record.calendarHoldStatus ? { calendarHoldStatus: record.calendarHoldStatus } : {}),
    windowId: record.windowId,
    mentorSemesterId: record.mentorSemesterId,
    mentor: { profileId: record.mentorProfileId, name: record.mentorName },
    startupSemesterId: record.startupSemesterId,
    startup: { organizationId: record.startupOrganizationId, name: record.startupName },
    topic: record.topic,
    status: record.status,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    requestedAt: record.requestedAt,
    respondedAt: record.respondedAt,
    cancelledAt: record.cancelledAt,
    canAccept: pending && ownMentor,
    canDecline: pending && ownMentor,
    canCancel: (pending || record.status === "accepted") && (ownMentor || ownStartup),
  };
}

export function buildMentorBookingWorkspace(input: MentorBookingModelInput): MentorBookingWorkspaceResponse {
  const acceptedOccupancy = input.acceptedOccupancy ?? [];
  const availability = input.availability ?? [];
  const windows = input.windows ?? [];
  if (!input.timeZone.trim()) throw new MentorBookingDataError("Semester timezone is missing.");
  if (acceptedOccupancy.some((occupancy) => !Number.isFinite(Date.parse(occupancy.startsAt)) || !Number.isFinite(Date.parse(occupancy.endsAt)) || Date.parse(occupancy.endsAt) <= Date.parse(occupancy.startsAt))) {
    throw new MentorBookingDataError("Accepted booking occupancy has an invalid interval.");
  }
  if (acceptedOccupancy.some((occupancy) => occupancy.semesterId !== input.semesterId) || availability.some((range) => range.semesterId !== input.semesterId) || windows.some((window) => window.semesterId !== input.semesterId) || input.requests.some((request) => request.semesterId !== input.semesterId)) {
    throw new MentorBookingDataError("A booking record belongs to a different semester.");
  }
  const visibleRecords = input.requests.filter((record) => input.viewer.role === "admin"
    || (input.viewer.role === "mentor" && input.viewer.mentorSemesterId === record.mentorSemesterId)
    || (input.viewer.role === "startup" && input.viewer.startupSemesterId === record.startupSemesterId));
  const requests = visibleRecords.map((record) => requestView(record, input.viewer));
  const liveRequestByWindow = new Map(requests.filter((request) => request.status === "pending" || request.status === "accepted").map((request) => [request.windowId, request]));
  const claimByWindow = new Map((input.claims ?? []).map((claim) => [claim.windowId, claim.status]));
  const now = Date.now();
  return {
    acceptedOccupancy: acceptedOccupancy.map((occupancy) => ({
      mentorSemesterId: occupancy.mentorSemesterId,
      startsAt: occupancy.startsAt,
      endsAt: occupancy.endsAt,
    })),
    ...(input.effectiveAvailability ? { effectiveAvailability: [...input.effectiveAvailability], availabilityWeekOffset: input.availabilityWeekOffset ?? 0 } : {}),
    availability: availability.map((range) => ({
      mentorSemesterId: range.mentorSemesterId,
      mentor: { profileId: range.mentorProfileId, name: range.mentorName, ...(range.mentorExpertiseTags?.length ? { expertiseTags: range.mentorExpertiseTags } : {}) },
      weekday: range.weekday,
      startsAt: range.startsAt,
      endsAt: range.endsAt,
    })),
    semesterEndDate: input.semesterEndDate,
    semesterId: input.semesterId,
    semesterStartDate: input.semesterStartDate,
    timeZone: input.timeZone,
    viewer: input.viewer,
    windows: windows.filter((window) => window.withdrawnAt === null).map((window) => {
      const request = liveRequestByWindow.get(window.windowId) ?? null;
      const status = claimByWindow.get(window.windowId) ?? "available";
      return {
        windowId: window.windowId,
        semesterId: window.semesterId,
        mentorSemesterId: window.mentorSemesterId,
        mentor: { profileId: window.mentorProfileId, name: window.mentorName },
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        status,
        canWithdraw: input.viewer.role === "mentor" && input.viewer.mentorSemesterId === window.mentorSemesterId && request === null && Date.parse(window.startsAt) > now,
        canRequest: input.viewer.role === "startup" && input.viewer.startupSemesterId !== null && status === "available" && Date.parse(window.startsAt) > now,
        request,
      };
    }),
    ...(input.startupRoster ? { startupRoster: input.startupRoster.filter(startup => input.viewer.role === "admin" || startup.startupSemesterId === input.viewer.startupSemesterId) } : {}),
    history: requests,
  };
}
