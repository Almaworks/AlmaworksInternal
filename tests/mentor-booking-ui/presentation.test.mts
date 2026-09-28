import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as presentation from "../../components/mentor-booking/presentation.ts";
import { isCurrentMentorBookingResponse, isMentorBookingResponse } from "../../components/mentor-booking/presentation.ts";
import type { MentorBookingWorkspaceResponse } from "../../src/mentor-booking/types.ts";

const request = { requestId: "request-1", windowId: "window-1", mentorSemesterId: "mentor-1", mentor: { profileId: "profile-mentor", name: "Les" }, startsAt: "2026-09-18T14:00:00.000Z", endsAt: "2026-09-18T14:30:00.000Z", startupSemesterId: "startup-1", startup: { organizationId: "org-1", name: "Northstar" }, topic: "Pricing", status: "pending", requestedAt: "2026-09-12T14:00:00.000Z", respondedAt: null, cancelledAt: null, canAccept: true, canDecline: true, canCancel: false } as const;
const workspace = { semesterId: "semester-1", semesterStartDate: "2026-09-01", semesterEndDate: "2026-12-20", timeZone: "America/New_York", acceptedOccupancy: [], viewer: { profileId: "profile-mentor", role: "mentor", mentorSemesterId: "mentor-1", startupSemesterId: null }, windows: [{ windowId: "window-1", semesterId: "semester-1", mentorSemesterId: "mentor-1", mentor: { profileId: "profile-mentor", name: "Les" }, startsAt: "2026-09-18T14:00:00.000Z", endsAt: "2026-09-18T14:30:00.000Z", status: "pending", canWithdraw: false, canRequest: false, request }], history: [request] } as const satisfies MentorBookingWorkspaceResponse;

test("accepts the complete shared booking response and rejects stale semesters", () => {
  assert.equal(isMentorBookingResponse(workspace), true);
  assert.equal(isCurrentMentorBookingResponse("semester-1", workspace), true);
  assert.equal(isCurrentMentorBookingResponse("semester-old", workspace), false);
});

test("accepts calendar-first booking history without a synthetic availability window", () => {
  const calendarFirstWorkspace = {
    ...workspace,
    history: [{ ...workspace.history[0], windowId: null }],
  };

  assert.equal(isMentorBookingResponse(calendarFirstWorkspace), true);
});

test("mentor booking responses retain a pending request for its owning mentor", () => {
  assert.equal(workspace.history[0]?.canAccept, true);
  assert.equal(workspace.history[0]?.canDecline, true);
});

test("rejects malformed timestamps and time zones before rendering", () => {
  assert.equal(isMentorBookingResponse({ ...workspace, timeZone: "Not/AZone" }), false);
  assert.equal(isMentorBookingResponse({ ...workspace, windows: [{ ...workspace.windows[0], startsAt: "later" }] }), false);
  assert.equal(isMentorBookingResponse({ ...workspace, acceptedOccupancy: [{ mentorSemesterId: "mentor-1", startsAt: "2026-09-18T15:00:00Z", endsAt: "2026-09-18T14:00:00Z" }] }), false);
});

test("mentor availability calendar labels full hours without labeling quarter-hour rows", () => {
  const formatter = (presentation as Record<string, unknown>)["formatAvailabilityTimeLabel"];

  assert.equal(typeof formatter, "function");
  if (typeof formatter !== "function") return;

  assert.deepEqual([formatter("08:00"), formatter("08:15"), formatter("12:00")], ["8 AM", "", "12 PM"]);
});

test("pending and upcoming mentorship sessions are displayed before shared booking controls", async () => {
  const source = await readFile(new URL("../../components/mentor-booking/MentorBookingWorkspace.tsx", import.meta.url), "utf8");
  const pendingSessions = source.indexOf('PendingSessions requests={meetingSections.pending}');
  const upcomingSessions = source.indexOf('UpcomingSessions requests={meetingSections.upcoming}');
  const availabilityCalendar = source.indexOf("<CalendarConnectionCard");
  const startupCalendar = source.indexOf("<StartupAvailabilityBrowser");

  assert.notEqual(pendingSessions, -1);
  assert.notEqual(upcomingSessions, -1);
  assert.notEqual(availabilityCalendar, -1);
  assert.notEqual(startupCalendar, -1);
  assert.ok(pendingSessions < availabilityCalendar);
  assert.ok(upcomingSessions < availabilityCalendar);
  assert.ok(pendingSessions < startupCalendar);
  assert.ok(upcomingSessions < startupCalendar);
});

test("booking sections use information-focused headings instead of independent mentorship terminology", async () => {
  const source = await readFile(new URL("../../components/mentor-booking/MentorBookingWorkspace.tsx", import.meta.url), "utf8");

  assert.match(source, /title="Pending requests"/);
  assert.match(source, /title="Upcoming meetings"/);
  assert.doesNotMatch(source, /Independent mentor bookings/);
  assert.doesNotMatch(source, /Pending mentorship sessions/);
  assert.doesNotMatch(source, /Upcoming mentorship sessions/);
});

test("mentor and startup booking workspaces display the cohort-aware booking week prominently", async () => {
  const source = await readFile(new URL("../../components/mentor-booking/MentorBookingWorkspace.tsx", import.meta.url), "utf8");

  assert.match(source, /bookableCalendarWeek/u);
  assert.match(source, />Booking week</u);
  assert.match(source, /text-2xl/u);
});

test("accepted occupancy is supplied to the shared booking calendar", async () => {
  const source = await readFile(new URL("../../components/mentor-booking/StartupAvailabilityBrowser.tsx", import.meta.url), "utf8");

  assert.match(source, /acceptedOccupancy: data\.acceptedOccupancy/u);
  assert.match(source, /startupBookingSlots/u);
  assert.match(source, /setInterval\(\(\) => setNow\(new Date\(\)\), 60_000\)/u);
});
