import assert from "node:assert/strict";
import test from "node:test";

import {
  assignmentRefreshFeedback,
  buildCommitPayload,
  buildScheduleStartupColumns,
  buildScheduleRows,
  canSubmitAssignment,
  deriveStartupNeeds,
  filterCandidates,
  sessionFormatPresentation,
  selectCandidate,
  selectVisibleCandidate,
  type PickerCandidate,
} from "../../src/assignments/picker.ts";

const candidates: PickerCandidate[] = [
  {
    mentor: {
      id: "mentor-sales",
      scheduleMentorIds: ["mentor-semester-sales"],
      name: "Avery Sales",
      expertise: ["Enterprise Sales", "Fundraising"],
      availability: ["2026-09-04"],
      recentMeetingCount: 0,
      assignmentLoad: 1,
      formats: ["in_person"],
    },
    score: 123,
    eligible: true,
    rankingEligible: true,
    hardConflict: false,
    hardConflictTypes: [],
    requiredOverrideTypes: [],
    requiresOverrideReason: false,
    reasons: ["primary expertise match", "available"],
    explanations: ["primary expertise match", "available"],
  },
  {
    mentor: {
      id: "mentor-ops",
      scheduleMentorIds: ["mentor-semester-ops"],
      name: "Morgan Operator",
      expertise: ["Operations"],
      availability: [],
      recentMeetingCount: 1,
      assignmentLoad: 4,
      formats: ["remote"],
    },
    score: -30,
    eligible: false,
    rankingEligible: false,
    hardConflict: false,
    hardConflictTypes: [],
    requiredOverrideTypes: ["availability", "capacity", "expertise"],
    requiresOverrideReason: true,
    reasons: ["unavailable for selected slot"],
    explanations: ["Availability is explicitly marked unavailable; an availability override is required."],
  },
  {
    mentor: {
      id: "mentor-busy",
      scheduleMentorIds: ["mentor-semester-busy"],
      name: "Taylor Busy",
      expertise: ["Enterprise Sales"],
      availability: ["2026-09-04"],
      recentMeetingCount: 0,
      assignmentLoad: 2,
      formats: ["in_person"],
    },
    score: 110,
    eligible: false,
    rankingEligible: true,
    hardConflict: true,
    hardConflictTypes: ["mentor_slot"],
    requiredOverrideTypes: [],
    requiresOverrideReason: false,
    reasons: ["primary expertise match"],
    explanations: ["Mentor is already assigned in the selected slot."],
  },
];

test("filters ranked candidates by mentor name and expertise without changing rank order", () => {
  assert.deepEqual(
    filterCandidates(candidates, "avery", "Enterprise Sales").map((candidate) => candidate.mentor.id),
    ["mentor-sales"],
  );
  assert.deepEqual(
    filterCandidates(candidates, "", "Enterprise Sales").map((candidate) => candidate.mentor.id),
    ["mentor-sales", "mentor-busy"],
  );
  assert.deepEqual(
    filterCandidates(candidates, "OPERATOR", "").map((candidate) => candidate.mentor.id),
    ["mentor-ops"],
  );
});
test("selects override candidates but never selects a hard conflict", () => {
  assert.equal(selectCandidate(candidates, "mentor-busy"), null);
  assert.equal(selectCandidate(candidates, "mentor-ops")?.mentor.id, "mentor-ops");
});
test("a selected mentor stops being assignable when the current filters hide them", () => {
  const visible = filterCandidates(candidates, "avery", "");

  assert.equal(selectVisibleCandidate(visible, "mentor-ops"), null);
  assert.equal(selectVisibleCandidate(visible, "mentor-sales")?.mentor.id, "mentor-sales");
});

test("requires explicit acknowledgement and a non-empty reason for override candidates", () => {
  assert.equal(canSubmitAssignment(candidates[1]!, false, "Capacity approved"), false);
  assert.equal(canSubmitAssignment(candidates[1]!, true, "   "), false);
  assert.equal(canSubmitAssignment(candidates[1]!, true, "Capacity approved"), true);
  assert.equal(canSubmitAssignment(candidates[0]!, false, ""), true);
  assert.equal(canSubmitAssignment(candidates[2]!, true, "Conflict override"), false);
});

test("shapes an atomic commit payload with trimmed topic, exact overrides, and ranking context", () => {
  assert.deepEqual(buildCommitPayload({
    semesterId: "semester-1",
    startupSemesterId: "startup-semester-1",
    meetingId: "date-1",
    slot: 2,
    format: "in_person",
    topic: "  Enterprise pipeline  ",
    candidate: candidates[1]!,
    candidateRank: 2,
    search: "morgan",
    expertiseFilter: "Operations",
    overrideAcknowledged: true,
    overrideReason: "  Approved after confirming alternate availability.  ",
  }), {
    semesterId: "semester-1",
    startupSemesterId: "startup-semester-1",
    meetingId: "date-1",
    slot: 2,
    mentorSemesterId: "mentor-semester-ops",
    format: "in_person",
    topic: "Enterprise pipeline",
    overrideTypes: ["availability", "capacity", "expertise"],
    overrideReason: "Approved after confirming alternate availability.",
    rankingContext: {
      rank: 2,
      score: -30,
      reasons: ["unavailable for selected slot"],
      explanations: ["Availability is explicitly marked unavailable; an availability override is required."],
      rankingEligible: false,
      search: "morgan",
      expertiseFilter: "Operations",
    },
  });
});
test("derives assignment priorities exclusively from structured Mentor Needs", () => {
  assert.deepEqual(deriveStartupNeeds({
    mentorshipNeeds: ["Enterprise Sales", "Pricing"],
  }), {
    primary: "Enterprise Sales",
    secondary: "Pricing",
  });
});

test("builds schedule columns directly from canonical startup semesters", () => {
  assert.deepEqual(buildScheduleStartupColumns({
    startupSemesters: [
      { id: "startup-semester-a", startupOrganizationId: "organization-a" },
      { id: "startup-semester-b", startupOrganizationId: "organization-b" },
    ],
    organizations: [
      { id: "organization-a", name: "Canonical Alpha" },
      { id: "organization-b", name: "Canonical Beta" },
    ],
  }), [
    {
      startupSemesterId: "startup-semester-a",
      startupId: "startup-semester-a",
      name: "Canonical Alpha",
      linked: true,
    },
    {
      startupSemesterId: "startup-semester-b",
      startupId: "startup-semester-b",
      name: "Canonical Beta",
      linked: true,
    },
  ]);
});

test("builds both mentorship-session rows for every Friday meeting even before assignments exist", () => {
  assert.deepEqual(buildScheduleRows([
    { id: "meeting-1", date: "2026-09-04", label: "Opening Friday" },
  ]), [
    { dateId: "meeting-1:1", meetingId: "meeting-1", date: "2026-09-04", label: "Opening Friday", slot: "3:30-4:15" },
    { dateId: "meeting-1:2", meetingId: "meeting-1", date: "2026-09-04", label: "Opening Friday", slot: "4:15-5:00" },
  ]);
});

test("presents canonical and legacy in-person session formats with the same calendar treatment", () => {
  assert.deepEqual(sessionFormatPresentation("in_person"), {
    tone: "in_person",
    label: "In-Person",
  });
  assert.deepEqual(sessionFormatPresentation("in-person"), {
    tone: "in_person",
    label: "In-Person",
  });
});

test("refresh failure feedback reports a saved assignment and requests retry even for replay", () => {
  assert.deepEqual(assignmentRefreshFeedback({
    startupName: "Canonical Alpha",
    date: "2026-09-04",
    timeSlot: "4:15-5:00",
    replayed: true,
    refreshSucceeded: false,
  }), {
    message: "Canonical Alpha's assignment was saved, but the schedule refresh failed.",
    retryRequired: true,
  });

  assert.deepEqual(assignmentRefreshFeedback({
    startupName: "Canonical Alpha",
    date: "2026-09-04",
    timeSlot: "4:15-5:00",
    replayed: false,
    refreshSucceeded: true,
  }), {
    message: "Canonical Alpha's mentor was assigned for 2026-09-04, 4:15-5:00.",
    retryRequired: false,
  });
});
// End of assignment picker tests.
