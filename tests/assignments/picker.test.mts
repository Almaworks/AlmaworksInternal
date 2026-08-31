import assert from "node:assert/strict";
import test from "node:test";

import {
  assignmentRefreshFeedback,
  buildCommitPayload,
  buildHistoricalScheduleStartupColumns,
  buildScheduleStartupColumns,
  canSubmitAssignment,
  deriveStartupNeeds,
  filterCandidates,
  selectCandidate,
  selectVisibleCandidate,
  type PickerCandidate,
} from "../../src/assignments/picker.ts";

const candidates: PickerCandidate[] = [
  {
    mentor: {
      id: "mentor-sales",
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
    sessionDateId: "date-1",
    timeSlot: "4:15-5:00",
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
    sessionDateId: "date-1",
    timeSlot: "4:15-5:00",
    mentorProfileId: "mentor-ops",
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

test("derives primary and secondary Mentor Needs without preferred expertise displacing them", () => {
  assert.deepEqual(deriveStartupNeeds({
    mentorshipNeeds: ["Enterprise Sales", "Pricing"],
    preferredExpertiseTags: ["Fundraising", "Enterprise Sales"],
  }), {
    primary: "Enterprise Sales",
    secondary: "Pricing",
    preferredExpertise: ["Fundraising", "Enterprise Sales"],
  });
});

test("builds canonical startup columns and keeps an unresolved lifecycle startup visible", () => {
  assert.deepEqual(buildScheduleStartupColumns({
    startupSemesters: [
      { id: "startup-semester-a", startupOrganizationId: "organization-a" },
      { id: "startup-semester-b", startupOrganizationId: "organization-b" },
    ],
    organizations: [
      { id: "organization-a", name: "Canonical Alpha" },
      { id: "organization-b", name: "Canonical Beta" },
    ],
    bridges: [
      { startupSemesterId: "startup-semester-a", startupId: "legacy-startup-a", isPrimaryContact: true },
    ],
  }), [
    {
      startupSemesterId: "startup-semester-a",
      startupId: "legacy-startup-a",
      name: "Canonical Alpha",
      linked: true,
    },
    {
      startupSemesterId: "startup-semester-b",
      startupId: null,
      name: "Canonical Beta",
      linked: false,
    },
  ]);
});

test("keeps only selected-semester legacy occupied startups as historical columns", () => {
  assert.deepEqual(buildHistoricalScheduleStartupColumns({
    semesterId: "semester-current",
    canonicalStartupIds: ["legacy-startup-a"],
    sessions: [
      { semesterId: "semester-current", startupId: "legacy-startup-a", startupName: "Already canonical" },
      { semesterId: "semester-current", startupId: "legacy-startup-old", startupName: "Historical Co" },
      { semesterId: "semester-prior", startupId: "legacy-startup-prior", startupName: "Prior Co" },
      { semesterId: "semester-current", startupId: null, startupName: null },
    ],
  }), [{
    startupSemesterId: null,
    startupId: "legacy-startup-old",
    name: "Historical Co",
    linked: false,
    historicalOnly: true,
  }]);
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
