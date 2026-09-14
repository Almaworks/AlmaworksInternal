import { notFound } from "next/navigation";

import MentorBookingWorkspace from "@/components/mentor-booking/MentorBookingWorkspace";
import type { MentorBookingViewerRole, MentorBookingWorkspaceResponse } from "@/src/mentor-booking/types";

function preview(role: MentorBookingViewerRole): MentorBookingWorkspaceResponse {
  const ownRequest = { requestId: "request-northstar", windowId: "window-two", mentorSemesterId: "mentor-les", mentor: { profileId: "mentor-les-profile", name: "Les Porter" }, startsAt: "2026-09-19T16:00:00.000Z", endsAt: "2026-09-19T16:45:00.000Z", startupSemesterId: "startup-northstar", startup: { organizationId: "northstar", name: "Northstar Labs" }, topic: "Pricing the first enterprise contract", status: "pending" as const, requestedAt: "2026-09-12T14:00:00.000Z", respondedAt: null, cancelledAt: null, canAccept: role === "mentor", canDecline: role === "mentor", canCancel: role === "startup" || role === "mentor" };
  const acceptedRequest = { ...ownRequest, requestId: "request-accepted", windowId: null, startsAt: "2026-09-16T18:00:00.000Z", endsAt: "2026-09-16T18:15:00.000Z", status: "accepted" as const, respondedAt: "2026-09-13T14:00:00.000Z", canAccept: false, canDecline: false };
  return { acceptedOccupancy: [{ mentorSemesterId: "mentor-les", startsAt: acceptedRequest.startsAt, endsAt: acceptedRequest.endsAt }], availability: [], semesterId: "preview-fall-2026", semesterStartDate: "2026-09-01", semesterEndDate: "2026-12-20", timeZone: "America/New_York", viewer: { profileId: `preview-${role}`, role, mentorSemesterId: role === "mentor" ? "mentor-les" : null, startupSemesterId: role === "startup" ? "startup-northstar" : null }, windows: [
    { windowId: "window-one", semesterId: "preview-fall-2026", mentorSemesterId: "mentor-les", mentor: { profileId: "mentor-les-profile", name: "Les Porter" }, startsAt: "2026-09-18T14:00:00.000Z", endsAt: "2026-09-18T14:30:00.000Z", status: "available", canWithdraw: role === "mentor", canRequest: role === "startup", request: null },
    { windowId: "window-two", semesterId: "preview-fall-2026", mentorSemesterId: "mentor-les", mentor: { profileId: "mentor-les-profile", name: "Les Porter" }, startsAt: "2026-09-19T16:00:00.000Z", endsAt: "2026-09-19T16:45:00.000Z", status: "pending", canWithdraw: false, canRequest: false, request: ownRequest },
  ], history: [acceptedRequest, { ...ownRequest, requestId: "request-closed", status: "declined", canAccept: false, canDecline: false, canCancel: false, respondedAt: "2026-09-11T12:00:00.000Z" }] };
}

export default async function MentorBookingPreviewPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const role: MentorBookingViewerRole = query.role === "mentor" || query.role === "startup" ? query.role : "admin";
  return <main className="mx-auto max-w-5xl p-4 md:p-8"><p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">Previewing a fictional {role} workspace. Actions do not call booking endpoints.</p><MentorBookingWorkspace semesterId="preview-fall-2026" previewData={preview(role)} /></main>;
}
