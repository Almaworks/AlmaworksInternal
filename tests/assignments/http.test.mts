import assert from "node:assert/strict";
import test from "node:test";

import {
  AssignmentHttpError,
  createAssignmentRoutes,
  type AssignmentDataSource,
  type CandidateSourceData,
} from "../../src/assignments/server.ts";
import { AuthorizationError } from "../../src/auth/server.ts";

const ids = {
  semester: "10000000-0000-4000-8000-000000000001",
  startup: "10000000-0000-4000-8000-000000000002",
  date: "10000000-0000-4000-8000-000000000003",
  mentor: "10000000-0000-4000-8000-000000000004",
  firstSlotMentor: "10000000-0000-4000-8000-000000000005",
};

const candidateData: CandidateSourceData = {
  sessionDate: { id: ids.date, semesterId: ids.semester, date: "2026-09-04" },
  startup: {
    id: ids.startup,
    semesterId: ids.semester,
    companySnapshot: "Acme Robotics",
    goals: ["Close pilot customers"],
    mentorNeedContext: "Need help building an enterprise sales motion.",
    mentorNeedNoPreference: false,
    mentorshipNeeds: ["Enterprise sales"],
    preferredExpertiseTags: ["Fundraising strategy"],
    stage: "mvp",
  },
  mentors: [
    {
      id: "schedule-mentor-1",
      profileId: ids.mentor,
      name: "Available mentor",
      expertise: ["Enterprise sales"],
      preferredFormat: "in_person",
    },
    {
      id: "schedule-mentor-2",
      profileId: ids.firstSlotMentor,
      name: "First slot mentor",
      expertise: ["Fundraising strategy"],
      preferredFormat: "in_person",
    },
  ],
  availability: [
    { profileId: ids.mentor, sessionDateId: ids.date, isAvailable: true },
    { profileId: ids.firstSlotMentor, sessionDateId: ids.date, isAvailable: true },
  ],
  sessions: [
    {
      mentorScheduleId: "schedule-mentor-2",
      sessionDateId: ids.date,
      timeSlot: "3:30-4:15",
      status: "confirmed",
    },
  ],
};

function createSource(overrides: Partial<AssignmentDataSource> = {}): AssignmentDataSource {
  return {
    loadCandidateData: async (input) => {
      if (
        input.semesterId !== ids.semester
        || input.startupSemesterId !== ids.startup
        || input.sessionDateId !== ids.date
        || input.timeSlot !== "4:15-5:00"
      ) {
        throw new AssignmentHttpError(400, "validation_error", "Slot and startup must belong to the selected semester.");
      }
      return candidateData;
    },
    commitAssignment: async (input) => {
      if (
        input.semesterId !== ids.semester
        || input.startupSemesterId !== ids.startup
        || input.sessionDateId !== ids.date
        || input.timeSlot !== "4:15-5:00"
        || input.mentorProfileId !== ids.mentor
        || input.idempotencyKey !== "retry-001"
      ) {
        throw new AssignmentHttpError(400, "validation_error", "Commit identifiers were not preserved.");
      }
      return { sessionId: "session-1", requestId: "request-1", auditId: "audit-1", replayed: false };
    },
    ...overrides,
  };
}

function routesFor(source: AssignmentDataSource, authorization?: AuthorizationError) {
  return createAssignmentRoutes({
    authorize: async () => {
      if (authorization) throw authorization;
      return source;
    },
  });
}

function candidateRequest(search = new URLSearchParams({
  semesterId: ids.semester,
  startupSemesterId: ids.startup,
  sessionDateId: ids.date,
  timeSlot: "4:15-5:00",
}).toString()): Request {
  return new Request(`https://almaworks.test/api/admin/assignments/candidates?${search}`);
}

function commitRequest(body: unknown, headers: HeadersInit = {}): Request {
  return new Request("https://almaworks.test/api/admin/assignments/commit", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "retry-001", ...headers },
    body: JSON.stringify(body),
  });
}

const validCommit = {
  semesterId: ids.semester,
  startupSemesterId: ids.startup,
  sessionDateId: ids.date,
  timeSlot: "4:15-5:00",
  mentorProfileId: ids.mentor,
  format: "in_person",
  rankingContext: { score: 85, rank: 1 },
};

test("candidate route returns a stable unauthenticated envelope", async () => {
  const response = await routesFor(createSource(), new AuthorizationError("Missing bearer token.", 401)).getCandidates(candidateRequest());

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: { code: "unauthenticated", message: "Missing bearer token." } });
});

test("commit route returns a stable forbidden envelope", async () => {
  const response = await routesFor(createSource(), new AuthorizationError("Semester administrator access required.", 403)).commit(commitRequest(validCommit));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { code: "forbidden", message: "Semester administrator access required." } });
});

test("candidate route rejects malformed query fields before loading candidate data", async () => {
  const response = await routesFor(createSource()).getCandidates(candidateRequest("semesterId=not-a-uuid"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "validation_error", message: "semesterId must be a UUID.", field: "semesterId" },
  });
});

test("commit route rejects malformed JSON with a stable envelope", async () => {
  const response = await routesFor(createSource()).commit(new Request("https://almaworks.test/api/admin/assignments/commit", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "retry-001" },
    body: "{",
  }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: { code: "invalid_json", message: "Request body must be valid JSON." } });
});

test("commit route validates required idempotency and typed body fields", async () => {
  const missingKey = await routesFor(createSource()).commit(commitRequest(validCommit, { "idempotency-key": " " }));
  const invalidOverrides = await routesFor(createSource()).commit(commitRequest({ ...validCommit, overrideTypes: ["availability", 2] }));

  assert.equal(missingKey.status, 400);
  assert.deepEqual(await missingKey.json(), {
    error: { code: "validation_error", message: "Idempotency-Key header is required.", field: "Idempotency-Key" },
  });
  assert.equal(invalidOverrides.status, 400);
  assert.deepEqual(await invalidOverrides.json(), {
    error: { code: "validation_error", message: "overrideTypes must be an array of strings.", field: "overrideTypes" },
  });
});

test("candidate route returns semester-scoped startup context, selected slot, and explained rankings", async () => {
  const response = await routesFor(createSource()).getCandidates(candidateRequest());

  assert.equal(response.status, 200);
  const payload = await response.json() as {
    data: {
      startup: { id: string; mentorshipNeeds: string[]; mentorNeedContext: string | null };
      slot: { id: string; semesterId: string; date: string; start: string; end: string; format: string };
      candidates: Array<{ mentor: { id: string }; eligible: boolean; exclusionReason?: string; reasons: string[] }>;
    };
  };
  assert.equal(payload.data.startup.id, ids.startup);
  assert.deepEqual(payload.data.startup.mentorshipNeeds, ["Enterprise sales"]);
  assert.equal(payload.data.startup.mentorNeedContext, "Need help building an enterprise sales motion.");
  assert.deepEqual(payload.data.slot, {
    id: `${ids.date}:4:15-5:00`, semesterId: ids.semester, date: "2026-09-04", start: "4:15", end: "5:00", format: "in_person",
  });
  assert.equal(payload.data.candidates[0]?.mentor.id, ids.mentor);
  const excluded = payload.data.candidates[1];
  assert.equal(excluded?.mentor.id, ids.firstSlotMentor);
  assert.equal(excluded?.eligible, false);
  assert.equal(excluded?.exclusionReason, "Mentor already assigned to the first slot; excluded from second slot.");
  assert.deepEqual(excluded?.reasons, ["primary expertise match", "available", "format fit", "recent meeting penalty", "workload tie-break", "excluded from second slot"]);
});

test("candidate route rejects a stale slot or startup mapping", async () => {
  const stale = createSource({
    loadCandidateData: async () => ({ ...candidateData, sessionDate: null }),
  });
  const response = await routesFor(stale).getCandidates(candidateRequest());

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "validation_error", message: "Slot and startup must belong to the selected semester." },
  });
});

test("commit route maps an atomic slot conflict to 409", async () => {
  const source = createSource({
    commitAssignment: async () => {
      throw new AssignmentHttpError(409, "assignment_conflict", "Mentor is already assigned in this slot.");
    },
  });
  const response = await routesFor(source).commit(commitRequest(validCommit));

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: { code: "assignment_conflict", message: "Mentor is already assigned in this slot." },
  });
});

test("commit route returns the atomic assignment result", async () => {
  const response = await routesFor(createSource()).commit(commitRequest(validCommit));

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    data: { sessionId: "session-1", requestId: "request-1", auditId: "audit-1", replayed: false },
  });
});
