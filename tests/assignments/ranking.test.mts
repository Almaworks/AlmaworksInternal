import test from "node:test";
import assert from "node:assert/strict";
import { rankMentorCandidates, type AssignmentSlot, type MentorCandidate } from "../../src/assignments/ranking.ts";

const slot: AssignmentSlot = { id: "slot-2", semesterId: "sem", date: "2026-09-04", start: "16:15", end: "17:00", format: "in_person" };
const mentor = (id: string, overrides: Partial<MentorCandidate> = {}): MentorCandidate => ({ id, name: id, expertise: [], availability: [], recentMeetingCount: 0, assignmentLoad: 0, formats: ["in_person"], ...overrides });

test("ranks primary expertise above secondary and unrelated matches", () => {
  const result = rankMentorCandidates({ primaryNeed: "Fundraising strategy", secondaryNeed: "Enterprise sales", slot, mentors: [mentor("other"), mentor("secondary", { expertise: ["Enterprise sales"] }), mentor("primary", { expertise: ["Fundraising strategy"] })] });
  assert.deepEqual(result.map((x) => x.mentor.id), ["primary", "secondary", "other"]);
});

test("availability, recent meetings, workload, and format affect ranking", () => {
  const result = rankMentorCandidates({ primaryNeed: "Product strategy", secondaryNeed: null, slot, mentors: [mentor("available", { expertise: ["Product strategy"], availability: [slot.id] }), mentor("busy", { expertise: ["Product strategy"], availability: ["other"], recentMeetingCount: 2, assignmentLoad: 4, formats: ["remote"] })] });
  assert.equal(result[0].mentor.id, "available");
  assert.ok(result[1].reasons.some((reason) => reason.includes("unavailable")));
});

test("second slot excludes the mentor assigned in the first slot", () => {
  const result = rankMentorCandidates({ primaryNeed: null, secondaryNeed: null, slot, mentors: [mentor("first"), mentor("other")], excludeMentorIds: ["first"] });
  assert.equal(result.find((x) => x.mentor.id === "first")?.eligible, false);
  assert.match(result.find((x) => x.mentor.id === "first")?.exclusionReason ?? "", /second slot/i);
});

test("ties are stable by mentor id", () => {
  const result = rankMentorCandidates({ primaryNeed: null, secondaryNeed: null, slot, mentors: [mentor("z"), mentor("a")] });
  assert.deepEqual(result.map((x) => x.mentor.id), ["a", "z"]);
});
