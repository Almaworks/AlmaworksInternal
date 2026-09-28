import assert from "node:assert/strict";
import test from "node:test";
import * as presentation from "../../components/friday-program/presentation.ts";

import {
  applyPublishedProgram,
  agendaTimeLabel,
  isFridayProgramResponse,
  isFridayProgram,
  isCurrentFridayProgramResponse,
  meetingProgramState,
  participantGroupLabel,
  type FridayAgendaItem,
  type FridayProgramMeeting,
} from "../../components/friday-program/presentation.ts";

type FridayMeetingSelection = {
  meeting: FridayProgramMeeting;
  weekNumber: number;
  timing: "current" | "upcoming" | "most-recent";
};

const selectDefaultFridayMeeting = (
  presentation as typeof presentation & {
    selectDefaultFridayMeeting?: (
      meetings: readonly FridayProgramMeeting[],
      today: string,
    ) => FridayMeetingSelection | null;
  }
).selectDefaultFridayMeeting;

const agenda: FridayAgendaItem[] = [
  { key: "standups", offsetMinutes: 0, durationMinutes: 15, label: "Startup standups" },
  { key: "speaker", offsetMinutes: 15, durationMinutes: 45, label: "Speaker session" },
  { key: "group_round_1", offsetMinutes: 60, durationMinutes: 30, label: "Small-group round 1", facilitators: { A: "Les", B: "Eric Chan" } },
  { key: "group_round_2", offsetMinutes: 90, durationMinutes: 30, label: "Small-group round 2", facilitators: { A: "Eric Chan", B: "Les" } },
];

const unpublished: FridayProgramMeeting = {
  meetingId: "meeting-1",
  meetingDate: "2026-09-11",
  label: "Week 1",
  status: "unpublished",
  program: null,
};

test("renders every Friday agenda window across the full 120 minutes", () => {
  assert.deepEqual(agenda.map(agendaTimeLabel), ["0–15 min", "15–60 min", "60–90 min", "90–120 min"]);
  assert.deepEqual(agenda.slice(2).map((item) => "facilitators" in item ? item.facilitators : null), [
    { A: "Les", B: "Eric Chan" },
    { A: "Eric Chan", B: "Les" },
  ]);
});

test("marks an unpublished week as awaiting an administrator without inventing groups", () => {
  assert.deepEqual(meetingProgramState(unpublished), {
    kind: "unpublished",
    message: "Groups have not been published for this Friday yet.",
  });
});

test("selects the next scheduled Friday and reports its meeting-week number", () => {
  assert.equal(typeof selectDefaultFridayMeeting, "function");
  const selection = selectDefaultFridayMeeting?.([
    { ...unpublished, meetingId: "meeting-1", meetingDate: "2026-09-04" },
    { ...unpublished, meetingId: "meeting-2", meetingDate: "2026-09-18" },
    { ...unpublished, meetingId: "meeting-3", meetingDate: "2026-09-25" },
  ], "2026-09-11");

  assert.deepEqual(selection, {
    meeting: { ...unpublished, meetingId: "meeting-2", meetingDate: "2026-09-18" },
    weekNumber: 2,
    timing: "upcoming",
  });
});

test("selects today’s Friday before later meetings", () => {
  const selection = selectDefaultFridayMeeting?.([
    { ...unpublished, meetingId: "meeting-1", meetingDate: "2026-09-04" },
    { ...unpublished, meetingId: "meeting-2", meetingDate: "2026-09-11" },
    { ...unpublished, meetingId: "meeting-3", meetingDate: "2026-09-18" },
  ], "2026-09-11");

  assert.equal(selection?.meeting.meetingId, "meeting-2");
  assert.equal(selection?.weekNumber, 2);
  assert.equal(selection?.timing, "current");
});

test("labels a participant's saved group and leaves unassigned participants unlabelled", () => {
  const published: FridayProgramMeeting = {
    ...unpublished,
    status: "published",
    program: {
      programId: "program-1",
      generatedAt: "2026-09-08T12:00:00.000Z",
      groups: {
        A: [{ startupSemesterId: "startup-a", startupOrganizationId: "org-a", name: "Northstar", slug: "northstar", position: 1 }],
        B: [{ startupSemesterId: "startup-b", startupOrganizationId: "org-b", name: "Orbit", slug: "orbit", position: 1 }],
      },
    },
  };

  assert.equal(participantGroupLabel(published, "startup-b"), "Group B");
  assert.equal(participantGroupLabel(published, "startup-missing"), null);
});

test("ignores a Friday program response that belongs to a previous semester", () => {
  assert.equal(isCurrentFridayProgramResponse("fall-2026", { semesterId: "fall-2026" }), true);
  assert.equal(isCurrentFridayProgramResponse("spring-2026", { semesterId: "fall-2026" }), false);
});

test("rejects a malformed successful Friday program payload before rendering it", () => {
  assert.equal(isFridayProgramResponse({ semesterId: "fall-2026", agenda: [], meetings: [] }), true);
  assert.equal(isFridayProgramResponse({ semesterId: "fall-2026", agenda: [] }), false);
  assert.equal(isFridayProgramResponse({ semesterId: "fall-2026", agenda: [{ key: "standups" }], meetings: [] }), false);
  assert.equal(isFridayProgramResponse({ semesterId: "fall-2026", agenda: [], meetings: [null] }), false);
});

test("accepts canceled meetings with preserved program data", () => {
  const canceled = {
    ...unpublished,
    status: "canceled",
    canceledAt: "2026-09-10T15:30:00.000Z",
    canceledByProfileId: "70000000-0000-4000-8000-000000000001",
  };
  assert.equal(isFridayProgramResponse({ semesterId: "fall-2026", agenda: [], meetings: [canceled] }), true);
  assert.equal(isFridayProgramResponse({ semesterId: "fall-2026", agenda: [], meetings: [{ ...canceled, canceledByProfileId: null }] }), true);
  assert.equal(isFridayProgramResponse({ semesterId: "fall-2026", agenda: [], meetings: [{ ...canceled, canceledAt: null }] }), false);
});

test("rejects a malformed generation result before displaying saved groups", () => {
  assert.equal(isFridayProgram({ programId: "p", generatedAt: "now", groups: { A: [null], B: [] } }), false);
  assert.equal(isFridayProgram({ programId: "p", generatedAt: "now" }), false);
});

test("applies an idempotent generation response without changing its saved company order", () => {
  const existingProgram = {
    programId: "program-1",
    generatedAt: "2026-09-08T12:00:00.000Z",
    groups: {
      A: [{ startupSemesterId: "startup-a", startupOrganizationId: "org-a", name: "Northstar", slug: "northstar", position: 1 }],
      B: [{ startupSemesterId: "startup-b", startupOrganizationId: "org-b", name: "Orbit", slug: "orbit", position: 1 }],
    },
  };
  const retry = applyPublishedProgram([unpublished], "meeting-1", existingProgram);

  assert.equal(retry[0]?.status, "published");
  assert.deepEqual(retry[0]?.program?.groups.A.map((startup) => startup.name), ["Northstar"]);
  assert.deepEqual(retry[0]?.program?.groups.B.map((startup) => startup.name), ["Orbit"]);
});
