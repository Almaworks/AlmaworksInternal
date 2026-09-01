import assert from "node:assert/strict";
import test from "node:test";

import { commitAssignment, parseCandidateQuery, parseCommitBody } from "../../src/assignments/server.ts";

const semesterId = "11111111-1111-4111-8111-111111111111";
const meetingId = "22222222-2222-4222-8222-222222222222";
const startupSemesterId = "33333333-3333-4333-8333-333333333333";
const mentorSemesterId = "44444444-4444-4444-8444-444444444444";

test("assignment candidates use canonical meeting and numeric slot query parameters", () => {
  const query = parseCandidateQuery(new URL(`https://almaworks.test/candidates?semesterId=${semesterId}&startupSemesterId=${startupSemesterId}&meetingId=${meetingId}&slot=2`));

  assert.deepEqual(query, {
    meetingId,
    semesterId,
    slot: 2,
    startupSemesterId,
  });
});

test("assignment commits use canonical meeting, slot, and mentor-semester RPC arguments", async () => {
  const observed: unknown[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      observed.push({ name, args });
      return { data: { sessionId: "session-1", replayed: false }, error: null };
    },
  };
  const input = parseCommitBody({
    semesterId,
    meetingId,
    slot: 2,
    startupSemesterId,
    mentorSemesterId,
    format: "in_person",
  }, new Headers({ "idempotency-key": "assignment-1" }));

  await commitAssignment(client, input);

  assert.deepEqual(observed, [{
    name: "commit_mentor_assignment",
    args: {
      p_format: "in_person",
      p_idempotency_key: "assignment-1",
      p_meeting_id: meetingId,
      p_mentor_semester_id: mentorSemesterId,
      p_override_reason: undefined,
      p_override_types: [],
      p_ranking_context: {},
      p_semester_id: semesterId,
      p_slot: 2,
      p_startup_semester_id: startupSemesterId,
      p_topic: undefined,
    },
  }]);
});

test("assignment commits reject legacy compatibility request fields", () => {
  assert.throws(() => parseCommitBody({
    semesterId,
    sessionDateId: meetingId,
    timeSlot: "4:15-5:00",
    startupSemesterId,
    mentorProfileId: mentorSemesterId,
    format: "in_person",
  }, new Headers({ "idempotency-key": "assignment-1" })), /meetingId/);
});
