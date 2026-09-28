import assert from "node:assert/strict";
import test from "node:test";

import {
  AssignmentHttpError,
  createAssignmentRoutes,
  createSupabaseAssignmentDataSource,
  type AssignmentDataSource,
  type CandidateSourceData,
} from "../../src/assignments/server.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/db/types.ts";
import { AuthorizationError } from "../../src/auth/server.ts";

const ids = {
  semester: "10000000-0000-4000-8000-000000000001",
  startup: "10000000-0000-4000-8000-000000000002",
  date: "10000000-0000-4000-8000-000000000003",
  mentor: "10000000-0000-4000-8000-000000000004",
  firstSlotMentor: "10000000-0000-4000-8000-000000000005",
  mentorSemester: "10000000-0000-4000-8000-000000000007",
  firstSlotMentorSemester: "10000000-0000-4000-8000-000000000008",
};

const candidateData: CandidateSourceData = {
  sessionDate: { id: ids.date, semesterId: ids.semester, date: "2026-09-04" },
  sessionDates: [{ id: ids.date, semesterId: ids.semester, date: "2026-09-04" }],
  startupScheduleId: "schedule-startup-selected",
  startup: {
    id: ids.startup,
    semesterId: ids.semester,
    companySnapshot: "Acme Robotics",
    goals: ["Close pilot customers"],
    mentorNeedContext: "Need help building an enterprise sales motion.",
    mentorNeedNoPreference: false,
    mentorshipNeeds: ["Enterprise sales"],
    stage: "mvp",
  },
  mentors: [
    {
      id: ids.mentorSemester,
      scheduleMentorIds: [ids.mentorSemester],
      profileId: ids.mentor,
      name: "Available mentor",
      expertise: ["Enterprise sales"],
      preferredFormat: "in_person",
      capacity: 3,
    },
    {
      id: ids.firstSlotMentorSemester,
      scheduleMentorIds: [ids.firstSlotMentorSemester],
      profileId: ids.firstSlotMentor,
      name: "First slot mentor",
      expertise: ["Fundraising strategy"],
      preferredFormat: "in_person",
      capacity: 3,
    },
  ],
  availability: [
    { profileId: ids.mentor, sessionDateId: ids.date, isAvailable: true },
    { profileId: ids.firstSlotMentor, sessionDateId: ids.date, isAvailable: true },
  ],
  sessions: [
    {
      mentorScheduleId: ids.firstSlotMentorSemester,
      startupScheduleId: "schedule-startup-selected",
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
        || input.meetingId !== ids.date
        || input.slot !== 2
      ) {
        throw new AssignmentHttpError(400, "validation_error", "Slot and startup must belong to the selected semester.");
      }
      return candidateData;
    },
    commitAssignment: async (input) => {
      if (
        input.semesterId !== ids.semester
        || input.startupSemesterId !== ids.startup
        || input.meetingId !== ids.date
        || input.slot !== 2
        || input.mentorSemesterId !== ids.mentorSemester
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
  }, { allowLegacyWrites: true });
}

function candidateRequest(search = new URLSearchParams({
  semesterId: ids.semester,
  startupSemesterId: ids.startup,
  meetingId: ids.date,
  slot: "2",
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
  meetingId: ids.date,
  slot: 2,
  mentorSemesterId: ids.mentorSemester,
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
  assert.deepEqual(excluded?.reasons, ["available", "format fit", "workload tie-break", "excluded from second slot"]);
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

test("commit revalidates the exact override set against canonical candidate data", async () => {
  const data = structuredClone(candidateData);
  data.mentors[0] = { ...data.mentors[0]!, capacity: 0 };
  const source = createSource({ loadCandidateData: async () => data });

  const response = await routesFor(source).commit(commitRequest(validCommit));

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: "stale_assignment_context",
      message: "Assignment conditions changed. Refresh candidates and review the required overrides.",
    },
  });
});

test("an idempotent canonical replay returns before candidate revalidation", async () => {
  const source = createSource({
    findAssignmentReplay: async () => ({ sessionId: "existing-session", replayed: true }),
    loadCandidateData: async () => {
      throw new Error("replay must not reload candidates");
    },
  });

  const response = await routesFor(source).commit(commitRequest(validCommit));

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    data: { sessionId: "existing-session", replayed: true },
  });
});

const enrichedData = (sessions: Array<Record<string, unknown>>): CandidateSourceData => ({
  ...candidateData,
  startupScheduleId: "schedule-startup-selected",
  sessionDates: [
    { id: ids.date, semesterId: ids.semester, date: "2026-09-04" },
    { id: "10000000-0000-4000-8000-000000000006", semesterId: ids.semester, date: "2026-08-28" },
  ],
  mentors: candidateData.mentors.map((mentor) => ({ ...mentor, capacity: 1 })),
  sessions,
}) as unknown as CandidateSourceData;

test("second-slot exclusion applies only to the selected startup", async () => {
  const selectedStartup = enrichedData([{
    mentorScheduleId: ids.firstSlotMentorSemester,
    startupScheduleId: "schedule-startup-selected",
    sessionDateId: ids.date,
    timeSlot: "3:30-4:15",
    status: "confirmed",
  }]);
  const differentStartup = enrichedData([{
    mentorScheduleId: ids.firstSlotMentorSemester,
    startupScheduleId: "schedule-startup-other",
    sessionDateId: ids.date,
    timeSlot: "3:30-4:15",
    status: "confirmed",
  }]);
  for (const mentor of selectedStartup.mentors) mentor.capacity = 4;
  for (const mentor of differentStartup.mentors) mentor.capacity = 4;
  const sameResponse = await routesFor(createSource({ loadCandidateData: async () => selectedStartup })).getCandidates(candidateRequest());
  const differentResponse = await routesFor(createSource({ loadCandidateData: async () => differentStartup })).getCandidates(candidateRequest());
  const same = await sameResponse.json() as { data: { candidates: Array<{ mentor: { id: string }; requiredOverrideTypes?: string[] }> } };
  const different = await differentResponse.json() as { data: { candidates: Array<{ mentor: { id: string }; requiredOverrideTypes?: string[] }> } };

  assert.deepEqual(same.data.candidates.find((candidate) => candidate.mentor.id === ids.firstSlotMentor)?.requiredOverrideTypes, ["expertise", "second_slot"]);
  assert.deepEqual(different.data.candidates.find((candidate) => candidate.mentor.id === ids.firstSlotMentor)?.requiredOverrideTypes, ["expertise"]);
});

test("candidate metadata identifies every RPC override needed before commit", async () => {
  const data = enrichedData([
    {
      mentorScheduleId: ids.firstSlotMentorSemester,
      startupScheduleId: "schedule-startup-selected",
      sessionDateId: ids.date,
      timeSlot: "3:30-4:15",
      status: "confirmed",
    },
    {
      mentorScheduleId: ids.firstSlotMentorSemester,
      startupScheduleId: "schedule-startup-selected",
      sessionDateId: "10000000-0000-4000-8000-000000000006",
      timeSlot: "3:30-4:15",
      status: "confirmed",
    },
  ]);
  data.mentors[1] = {
    ...data.mentors[1]!,
    expertise: ["Operations"],
    capacity: 1,
  } as unknown as (typeof data.mentors)[number];
  data.availability = [{ profileId: ids.firstSlotMentor, sessionDateId: ids.date, isAvailable: false }];
  const response = await routesFor(createSource({ loadCandidateData: async () => data })).getCandidates(candidateRequest());
  const payload = await response.json() as { data: { candidates: Array<{ mentor: { id: string }; hardConflict?: boolean; requiredOverrideTypes?: string[]; requiresOverrideReason?: boolean }> } };
  const candidate = payload.data.candidates.find((item) => item.mentor.id === ids.firstSlotMentor);

  assert.equal(candidate?.hardConflict, false);
  assert.deepEqual(candidate?.requiredOverrideTypes, ["availability", "capacity", "expertise", "second_slot"]);
  assert.equal(candidate?.requiresOverrideReason, true);
});

test("candidate hard-conflict metadata distinguishes occupied mentor and startup slots", async () => {
  const mentorOccupied = enrichedData([{
    mentorScheduleId: ids.mentorSemester,
    startupScheduleId: "schedule-startup-other",
    sessionDateId: ids.date,
    timeSlot: "4:15-5:00",
    status: "confirmed",
  }]);
  const startupOccupied = enrichedData([{
    mentorScheduleId: ids.firstSlotMentorSemester,
    startupScheduleId: "schedule-startup-selected",
    sessionDateId: ids.date,
    timeSlot: "4:15-5:00",
    status: "confirmed",
  }]);
  for (const mentor of mentorOccupied.mentors) mentor.capacity = 4;
  for (const mentor of startupOccupied.mentors) mentor.capacity = 4;
  const mentorPayload = await (await routesFor(createSource({ loadCandidateData: async () => mentorOccupied })).getCandidates(candidateRequest())).json() as { data: { candidates: Array<{ mentor: { id: string }; hardConflict: boolean; hardConflictTypes: string[] }> } };
  const startupPayload = await (await routesFor(createSource({ loadCandidateData: async () => startupOccupied })).getCandidates(candidateRequest())).json() as { data: { candidates: Array<{ hardConflict: boolean; hardConflictTypes: string[] }> } };

  const occupiedMentor = mentorPayload.data.candidates.find((candidate) => candidate.mentor.id === ids.mentor);
  assert.equal(occupiedMentor?.hardConflict, true);
  assert.deepEqual(occupiedMentor?.hardConflictTypes, ["mentor_slot"]);
  assert.ok(startupPayload.data.candidates.every((candidate) => candidate.hardConflictTypes.includes("startup_slot")));
});

test("recency counts only prior sessions for the selected mentor and startup", async () => {
  const priorDateId = "10000000-0000-4000-8000-000000000006";
  const data = enrichedData([
    { mentorScheduleId: ids.mentorSemester, startupScheduleId: "schedule-startup-selected", sessionDateId: ids.date, timeSlot: "3:30-4:15", status: "confirmed" },
    { mentorScheduleId: ids.mentorSemester, startupScheduleId: "schedule-startup-other", sessionDateId: priorDateId, timeSlot: "3:30-4:15", status: "confirmed" },
    { mentorScheduleId: ids.mentorSemester, startupScheduleId: "schedule-startup-selected", sessionDateId: priorDateId, timeSlot: "3:30-4:15", status: "confirmed" },
  ]);
  for (const mentor of data.mentors) mentor.capacity = 5;
  const payload = await (await routesFor(createSource({ loadCandidateData: async () => data })).getCandidates(candidateRequest())).json() as { data: { candidates: Array<{ mentor: { id: string; recentMeetingCount: number } }> } };

  assert.equal(payload.data.candidates.find((candidate) => candidate.mentor.id === ids.mentor)?.mentor.recentMeetingCount, 1);
});

test("candidate format aliases are canonicalized and two startup needs remain primary then secondary", async () => {
  const data = enrichedData([]);
  data.startup = {
    ...data.startup!,
    mentorshipNeeds: ["Enterprise sales", "Fundraising strategy"],
  };
  data.mentors[0] = { ...data.mentors[0]!, expertise: ["Enterprise sales"], preferredFormat: "hybrid", capacity: 4 } as unknown as (typeof data.mentors)[number];
  data.mentors[1] = { ...data.mentors[1]!, expertise: ["Fundraising strategy"], preferredFormat: "hybrid", capacity: 4 } as unknown as (typeof data.mentors)[number];
  const response = await routesFor(createSource({ loadCandidateData: async () => data })).getCandidates(candidateRequest(`${new URL(candidateRequest().url).searchParams}&format=virtual`));
  const payload = await response.json() as { data: { slot: { format: string }; candidates: Array<{ mentor: { id: string }; reasons: string[] }> } };

  assert.equal(payload.data.slot.format, "remote");
  assert.ok(payload.data.candidates.find((candidate) => candidate.mentor.id === ids.mentor)?.reasons.includes("primary expertise match"));
  assert.ok(payload.data.candidates.find((candidate) => candidate.mentor.id === ids.firstSlotMentor)?.reasons.includes("secondary expertise match"));
});

test("only structured Mentor Needs contribute to assignment matches", async () => {
  const data = enrichedData([]);
  data.startup = {
    ...data.startup!,
    mentorshipNeeds: ["Enterprise sales", "Pricing"],
  };
  data.mentors[0] = { ...data.mentors[0]!, expertise: ["Enterprise sales"], preferredFormat: "hybrid", capacity: 4 } as unknown as (typeof data.mentors)[number];
  data.mentors[1] = { ...data.mentors[1]!, expertise: ["Fundraising strategy"], preferredFormat: "hybrid", capacity: 4 } as unknown as (typeof data.mentors)[number];

  const response = await routesFor(createSource({ loadCandidateData: async () => data })).getCandidates(candidateRequest());
  const payload = await response.json() as { data: { candidates: Array<{ mentor: { id: string }; reasons: string[] }> } };

  assert.ok(payload.data.candidates.find((candidate) => candidate.mentor.id === ids.mentor)?.reasons.includes("primary expertise match"));
  assert.equal(payload.data.candidates.find((candidate) => candidate.mentor.id === ids.firstSlotMentor)?.reasons.includes("primary expertise match"), false);
  assert.equal(payload.data.candidates.find((candidate) => candidate.mentor.id === ids.firstSlotMentor)?.reasons.includes("secondary expertise match"), false);
  assert.equal(payload.data.candidates.find((candidate) => candidate.mentor.id === ids.firstSlotMentor)?.reasons.includes("primary expertise match"), false);
});

test("candidate route rejects an unsupported optional format", async () => {
  const response = await routesFor(createSource()).getCandidates(candidateRequest(`${new URL(candidateRequest().url).searchParams}&format=telephone`));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "validation_error", message: "format is unsupported.", field: "format" },
  });
});

test("commit rejects unsupported format with a field-specific validation envelope", async () => {
  const response = await routesFor(createSource()).commit(commitRequest({ ...validCommit, format: "telephone" }));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: { code: "validation_error", message: "format is unsupported.", field: "format" },
  });
});

test("legacy mentor assignment writes are retired before authorization or persistence", async () => {
  let authorizationCalls = 0;
  let writes = 0;
  const routes = createAssignmentRoutes({
    authorize: async () => {
      authorizationCalls++;
      return createSource({ commitAssignment: async () => { writes++; return {}; } });
    },
  });

  const response = await routes.commit(commitRequest(validCommit));

  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    error: {
      code: "assignment_retired",
      message: "New mentor assignments are no longer scheduled in Friday sessions. Use independent mentor booking instead.",
    },
  });
  assert.equal(authorizationCalls, 0);
  assert.equal(writes, 0);
});

interface FakeTableResult {
  rows: unknown[];
  single?: unknown | null;
  error?: { code?: string; message: string } | null;
}

function fakeSupabase(
  tables: Record<string, FakeTableResult> = {},
  rpcResult: { data: unknown; error: { code?: string; message: string } | null } = { data: {}, error: null },
): SupabaseClient<Database> {
  const from = (table: string) => {
    const result = tables[table] ?? { rows: [], single: null, error: null };
    const equalityPredicates: Array<{ column: string; value: unknown }> = [];
    const matchesEqualityPredicates = (row: unknown): boolean => (
      typeof row === "object"
      && row !== null
      && equalityPredicates.every(({ column, value }) => (
        column in row && (row as Record<string, unknown>)[column] === value
      ))
    );
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        equalityPredicates.push({ column, value });
        return builder;
      },
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        const single = result.single ?? null;
        return {
          data: single !== null && matchesEqualityPredicates(single) ? single : null,
          error: result.error ?? null,
        };
      },
      then: <TResult1 = { data: unknown[]; error: { code?: string; message: string } | null }, TResult2 = never>(
        onfulfilled?: ((value: { data: unknown[]; error: { code?: string; message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve({
        data: result.rows.filter(matchesEqualityPredicates),
        error: result.error ?? null,
      }).then(onfulfilled, onrejected),
    };
    return builder;
  };
  return { from, rpc: async () => rpcResult } as unknown as SupabaseClient<Database>;
}

test("Supabase candidate source maps lifecycle mentors and the selected schedule startup", async () => {
  const source = createSupabaseAssignmentDataSource(fakeSupabase({
    meetings: { rows: [{ id: ids.date, meeting_date: "2026-09-04", semester_id: ids.semester }] },
    startup_semesters: { rows: [], single: { id: ids.startup, semester_id: ids.semester, company_snapshot: null, goals: [], mentor_need_context: "context", mentor_need_no_preference: false, mentorship_needs: ["Enterprise sales"], stage: "mvp" } },
    semester_memberships: { rows: [
      { id: "mentor-membership", profile_id: ids.mentor, semester_id: ids.semester, role: "mentor", status: "active" },
    ] },
    mentor_semesters: { rows: [{ id: "mentor-semester", semester_membership_id: "mentor-membership", semester_id: ids.semester, capacity: 3, preferred_format: "online", readiness_status: "ready" }] },
    profiles: { rows: [{ id: ids.mentor, full_name: "Lifecycle mentor", email: "mentor@example.com" }] },
    mentor_profiles: { rows: [{ profile_id: ids.mentor, expertise_tags: ["Enterprise sales"] }] },
    meeting_availability: { rows: [], error: { code: "42P01", message: "Retired relation must not be queried" } },
    sessions: { rows: [] },
  }));
  const result = await source.loadCandidateData({ semesterId: ids.semester, startupSemesterId: ids.startup, meetingId: ids.date, slot: 1, format: "online" });

  assert.equal(result.startupScheduleId, ids.startup);
  assert.deepEqual(result.availability, []);
  assert.deepEqual(result.mentors, [{ id: "mentor-semester", scheduleMentorIds: ["mentor-semester"], profileId: ids.mentor, name: "Lifecycle mentor", expertise: ["Enterprise sales"], preferredFormat: "online", capacity: 3 }]);
});

test("canonical mentor-semester sessions count capacity and recency", async () => {
  const priorDateId = "10000000-0000-4000-8000-000000000006";
  const source = createSupabaseAssignmentDataSource(fakeSupabase({
    meetings: { rows: [
      { id: ids.date, meeting_date: "2026-09-04", semester_id: ids.semester },
      { id: priorDateId, meeting_date: "2026-08-28", semester_id: ids.semester },
    ] },
    startup_semesters: { rows: [], single: { id: ids.startup, semester_id: ids.semester, company_snapshot: null, goals: [], mentor_need_context: null, mentor_need_no_preference: false, mentorship_needs: ["Enterprise sales"], stage: "mvp" } },
    semester_memberships: { rows: [
      { id: "mentor-membership", profile_id: ids.mentor, semester_id: ids.semester, role: "mentor", status: "active" },
    ] },
    mentor_semesters: { rows: [{ id: "mentor-semester", semester_membership_id: "mentor-membership", semester_id: ids.semester, capacity: 1, preferred_format: "online", readiness_status: "ready" }] },
    profiles: { rows: [{ id: ids.mentor, full_name: "Lifecycle mentor", email: "mentor@example.com" }] },
    mentor_profiles: { rows: [{ profile_id: ids.mentor, expertise_tags: ["Enterprise sales"] }] },
    meeting_availability: { rows: [] },
    sessions: { rows: [{ mentor_semester_id: "mentor-semester", startup_semester_id: ids.startup, meeting_id: priorDateId, slot: 1, status: "confirmed", semester_id: ids.semester }] },
  }));
  const response = await routesFor(source).getCandidates(candidateRequest(`${new URL(candidateRequest().url).searchParams}&format=online`));
  const payload = await response.json() as { data: { candidates: Array<{ mentor: { id: string; assignmentLoad: number; recentMeetingCount: number }; requiredOverrideTypes: string[] }> } };
  const candidate = payload.data.candidates.find((item) => item.mentor.id === ids.mentor);

  assert.equal(candidate?.mentor.assignmentLoad, 1);
  assert.equal(candidate?.mentor.recentMeetingCount, 1);
  assert.deepEqual(candidate?.requiredOverrideTypes, ["capacity"]);
});

test("actual RPC adapter maps known SQLSTATEs and hides unknown database messages", async () => {
  const cases: Array<{ code?: string; status: number; body: unknown }> = [
    { code: "23505", status: 409, body: { error: { code: "assignment_conflict", message: "Assignment conflicts with the current schedule." } } },
    { code: "23514", status: 409, body: { error: { code: "assignment_conflict", message: "Assignment conflicts with the current schedule." } } },
    { code: "40001", status: 409, body: { error: { code: "assignment_conflict", message: "Assignment conflicts with the current schedule." } } },
    { code: "42501", status: 403, body: { error: { code: "forbidden", message: "Semester administrator access required." } } },
    { code: "XX000", status: 500, body: { error: { code: "internal_error", message: "Unable to process assignment." } } },
  ];
  for (const scenario of cases) {
    const adapter = createSupabaseAssignmentDataSource(fakeSupabase({}, { data: null, error: { code: scenario.code, message: "sensitive database detail" } }));
    const source: AssignmentDataSource = {
      ...adapter,
      findAssignmentReplay: async () => null,
      loadCandidateData: async () => candidateData,
    };
    const response = await routesFor(source).commit(commitRequest(validCommit));
    assert.equal(response.status, scenario.status);
    assert.deepEqual(await response.json(), scenario.body);
  }
});

for (const format of ["online", "in_person"] as const) {
  test(`candidate list for ${format} includes Either and exact formats only`, async () => {
    const data = structuredClone(candidateData);
    data.sessions = [];
    data.mentors[0].preferredFormat = "hybrid";
    data.mentors[1].preferredFormat = format === "online" ? "in_person" : "online";
    const exactId = "10000000-0000-4000-8000-000000000009";
    data.mentors.push({ ...data.mentors[0], id: exactId, profileId: exactId, scheduleMentorIds: [exactId], preferredFormat: format });
    const response = await routesFor(createSource({ loadCandidateData: async () => data })).getCandidates(
      candidateRequest(`${new URL(candidateRequest().url).searchParams}&format=${format}`));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload.data.candidates.map((item: { mentor: { id: string } }) => item.mentor.id), [ids.mentor, exactId]);
    assert.ok(payload.data.candidates[0].reasons.includes("format fit"));
  });
}

test("slot format overrides general preference and other slot preferences", async () => {
  const data = structuredClone(candidateData);
  data.sessions = [];
  data.mentors[0].preferredFormat = "online";
  data.availability = [
    { profileId: ids.mentor, sessionDateId: ids.date, timeSlot: "3:30-4:15", isAvailable: true, format: "online" },
    { profileId: ids.mentor, sessionDateId: ids.date, timeSlot: "4:15-5:00", isAvailable: true, format: "hybrid" },
    { profileId: ids.firstSlotMentor, sessionDateId: ids.date, timeSlot: "4:15-5:00", isAvailable: true, format: "remote" },
  ];
  const response = await routesFor(createSource({ loadCandidateData: async () => data })).getCandidates(candidateRequest());
  const payload = await response.json();
  assert.deepEqual(payload.data.candidates.map((item: { mentor: { id: string } }) => item.mentor.id), [ids.mentor]);
});

test("assignment refuses Either as a meeting format", async () => {
  const routes = routesFor(createSource());
  assert.equal((await routes.getCandidates(candidateRequest(`${new URL(candidateRequest().url).searchParams}&format=hybrid`))).status, 400);
  assert.equal((await routes.commit(commitRequest({ ...validCommit, format: "hybrid" }))).status, 400);
});

test("commit rechecks mentor format and never writes an incompatible assignment", async () => {
  let writes = 0;
  const routes = routesFor(createSource({ commitAssignment: async () => { writes++; return {}; } }));
  const response = await routes.commit(commitRequest({ ...validCommit, format: "online" }));
  assert.equal(response.status, 409);
  assert.equal(writes, 0);
});
