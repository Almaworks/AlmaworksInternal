import type { MentorBookingRequest, MentorBookingWorkspaceResponse } from "@/src/mentor-booking/types";

export type { MentorBookingRequest, MentorBookingWorkspaceResponse } from "@/src/mentor-booking/types";

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isString = (value: unknown): value is string => typeof value === "string";

export function isMentorBookingResponse(value: unknown): value is MentorBookingWorkspaceResponse {
  if (!isObject(value) || !isString(value.semesterId) || !isString(value.semesterStartDate) || !isString(value.semesterEndDate) || !isString(value.timeZone) || !isObject(value.viewer) || !Array.isArray(value.acceptedOccupancy) || !Array.isArray(value.windows) || !Array.isArray(value.history)) return false;
  if (!isString(value.viewer.profileId) || !["mentor", "startup", "admin"].includes(String(value.viewer.role)) || (value.viewer.mentorSemesterId !== null && !isString(value.viewer.mentorSemesterId)) || (value.viewer.startupSemesterId !== null && !isString(value.viewer.startupSemesterId)) || !isValidTimeZone(value.timeZone)) return false;
  return value.acceptedOccupancy.every((occupancy) => isObject(occupancy) && isString(occupancy.mentorSemesterId) && isDate(occupancy.startsAt) && isDate(occupancy.endsAt) && Date.parse(occupancy.endsAt) > Date.parse(occupancy.startsAt)) && value.windows.every((window) => isObject(window)
    && isString(window.windowId) && isString(window.semesterId) && isString(window.mentorSemesterId)
    && isObject(window.mentor) && isString(window.mentor.profileId) && isString(window.mentor.name)
    && isDate(window.startsAt) && isDate(window.endsAt)
    && ["available", "pending", "accepted"].includes(String(window.status))
    && typeof window.canWithdraw === "boolean" && typeof window.canRequest === "boolean"
    && (window.request === null || isRequest(window.request))) && value.history.every(isRequest);
}

function isRequest(value: unknown): value is MentorBookingRequest {
  return isObject(value) && isString(value.requestId) && isString(value.startupSemesterId)
    && isObject(value.startup) && isString(value.startup.organizationId) && isString(value.startup.name)
    && isString(value.topic) && ["pending", "accepted", "declined", "cancelled"].includes(String(value.status))
    && (value.windowId === null || isString(value.windowId)) && isString(value.mentorSemesterId) && isObject(value.mentor) && isString(value.mentor.profileId) && isString(value.mentor.name)
    && isDate(value.startsAt) && isDate(value.endsAt) && isDate(value.requestedAt) && (value.respondedAt === null || isDate(value.respondedAt))
    && (value.cancelledAt === null || isDate(value.cancelledAt))
    && typeof value.canAccept === "boolean" && typeof value.canDecline === "boolean" && typeof value.canCancel === "boolean";
}

export function isCurrentMentorBookingResponse(semesterId: string, value: MentorBookingWorkspaceResponse): boolean {
  return value.semesterId === semesterId && value.windows.every((window) => window.semesterId === semesterId);
}

export function bookingDateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

export function formatAvailabilityTimeLabel(value: string): string {
  if (!value.endsWith(":00")) return "";
  const hour = Number(value.slice(0, 2));
  return `${hour % 12 || 12} ${hour < 12 ? "AM" : "PM"}`;
}

function isDate(value: unknown): value is string { return isString(value) && !Number.isNaN(Date.parse(value)); }
function isValidTimeZone(value: string): boolean { try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; } }
