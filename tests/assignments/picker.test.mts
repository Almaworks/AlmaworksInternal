import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCommitPayload,
  canSubmitAssignment,
  filterCandidates,
  selectCandidate,
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
