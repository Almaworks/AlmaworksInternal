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
    preferredExpertiseTags: ["Fundraising strategy"],
    stage: "mvp",
  },
  mentors: [
    {
      id: "schedule-mentor-1",
      scheduleMentorIds: ["schedule-mentor-1"],
      profileId: ids.mentor,
      name: "Available mentor",
      expertise: ["Enterprise sales"],
      preferredFormat: "in_person",
      capacity: 3,
    },
    {
      id: "schedule-mentor-2",
      scheduleMentorIds: ["schedule-mentor-2"],
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
      mentorScheduleId: "schedule-mentor-2",
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
  assert.deepEqual(excluded?.reasons, ["primary expertise match", "available", "format fit", "workload tie-break", "excluded from second slot"]);
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
    mentorScheduleId: "schedule-mentor-2",
    startupScheduleId: "schedule-startup-selected",
    sessionDateId: ids.date,
    timeSlot: "3:30-4:15",
    status: "confirmed",
  }]);
  const differentStartup = enrichedData([{
    mentorScheduleId: "schedule-mentor-2",
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

  assert.deepEqual(same.data.candidates.find((candidate) => candidate.mentor.id === ids.firstSlotMentor)?.requiredOverrideTypes, ["second_slot"]);
  assert.deepEqual(different.data.candidates.find((candidate) => candidate.mentor.id === ids.firstSlotMentor)?.requiredOverrideTypes, []);
});

test("candidate metadata identifies every RPC override needed before commit", async () => {
  const data = enrichedData([
    {
      mentorScheduleId: "schedule-mentor-2",
      startupScheduleId: "schedule-startup-selected",
      sessionDateId: ids.date,
      timeSlot: "3:30-4:15",
      status: "confirmed",
    },
    {
      mentorScheduleId: "schedule-mentor-2",
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
    mentorScheduleId: "schedule-mentor-1",
    startupScheduleId: "schedule-startup-other",
    sessionDateId: ids.date,
    timeSlot: "4:15-5:00",
    status: "confirmed",
  }]);
  const startupOccupied = enrichedData([{
    mentorScheduleId: "schedule-mentor-2",
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
    { mentorScheduleId: "schedule-mentor-1", startupScheduleId: "schedule-startup-selected", sessionDateId: ids.date, timeSlot: "3:30-4:15", status: "confirmed" },
    { mentorScheduleId: "schedule-mentor-1", startupScheduleId: "schedule-startup-other", sessionDateId: priorDateId, timeSlot: "3:30-4:15", status: "confirmed" },
    { mentorScheduleId: "schedule-mentor-1", startupScheduleId: "schedule-startup-selected", sessionDateId: priorDateId, timeSlot: "3:30-4:15", status: "confirmed" },
  ]);
  for (const mentor of data.mentors) mentor.capacity = 5;
  const payload = await (await routesFor(createSource({ loadCandidateData: async () => data })).getCandidates(candidateRequest())).json() as { data: { candidates: Array<{ mentor: { id: string; recentMeetingCount: number } }> } };

  assert.equal(payload.data.candidates.find((candidate) => candidate.mentor.id === ids.mentor)?.mentor.recentMeetingCount, 1);
});

test("candidate format aliases are canonicalized and two startup needs remain primary then secondary", async () => {
  const data = enrichedData([]);
  data.startup = {
    ...data.startup!,
    preferredExpertiseTags: [],
    mentorshipNeeds: ["Enterprise sales", "Fundraising strategy"],
  };
  data.mentors[0] = { ...data.mentors[0]!, expertise: ["Enterprise sales"], capacity: 4 } as unknown as (typeof data.mentors)[number];
  data.mentors[1] = { ...data.mentors[1]!, expertise: ["Fundraising strategy"], capacity: 4 } as unknown as (typeof data.mentors)[number];
  const response = await routesFor(createSource({ loadCandidateData: async () => data })).getCandidates(candidateRequest(`${new URL(candidateRequest().url).searchParams}&format=virtual`));
  const payload = await response.json() as { data: { slot: { format: string }; candidates: Array<{ mentor: { id: string }; reasons: string[] }> } };

  assert.equal(payload.data.slot.format, "remote");
  assert.ok(payload.data.candidates.find((candidate) => candidate.mentor.id === ids.mentor)?.reasons.includes("primary expertise match"));
  assert.ok(payload.data.candidates.find((candidate) => candidate.mentor.id === ids.firstSlotMentor)?.reasons.includes("secondary expertise match"));
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
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({ data: result.single ?? null, error: result.error ?? null }),
      then: <TResult1 = { data: unknown[]; error: { code?: string; message: string } | null }, TResult2 = never>(
        onfulfilled?: ((value: { data: unknown[]; error: { code?: string; message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve({ data: result.rows, error: result.error ?? null }).then(onfulfilled, onrejected),
    };
    return builder;
  };
  return { from, rpc: async () => rpcResult } as unknown as SupabaseClient<Database>;
}

test("Supabase candidate source maps lifecycle mentors and the selected schedule startup", async () => {
  const source = createSupabaseAssignmentDataSource(fakeSupabase({
    session_dates: { rows: [{ id: ids.date, date: "2026-09-04", semester_id: ids.semester }], single: { id: ids.date, date: "2026-09-04", semester_id: ids.semester } },
    startup_semesters: { rows: [], single: { id: ids.startup, semester_id: ids.semester, company_snapshot: null, goals: [], mentor_need_context: "context", mentor_need_no_preference: false, mentorship_needs: ["Enterprise sales"], preferred_expertise_tags: [], stage: "mvp" } },
    semester_memberships: { rows: [
      { id: "mentor-membership", profile_id: ids.mentor, semester_id: ids.semester, role: "mentor", status: "active" },
      { id: "startup-membership", profile_id: "startup-profile", semester_id: ids.semester, role: "startup", status: "active" },
    ] },
    mentor_semesters: { rows: [{ semester_membership_id: "mentor-membership", semester_id: ids.semester, capacity: 3, preferred_format: "online" }] },
    mentor_profiles: { rows: [{ profile_id: ids.mentor, expertise_tags: ["Enterprise sales"] }] },
    mentors: { rows: [
      { id: "schedule-mentor-z", user_id: ids.mentor, full_name: "Wrong duplicate", semester_id: ids.semester, is_active: true },
      { id: "schedule-mentor-1", user_id: ids.mentor, full_name: "Lifecycle mentor", semester_id: ids.semester, is_active: true },
    ] },
    startup_team_memberships: { rows: [{ id: "team-membership", startup_semester_id: ids.startup, semester_membership_id: "startup-membership", semester_id: ids.semester, is_primary_contact: true }] },
    startups: { rows: [
      { id: "schedule-startup-z", user_id: "startup-profile", semester_id: ids.semester, is_active: true },
      { id: "schedule-startup-selected", user_id: "startup-profile", semester_id: ids.semester, is_active: true },
    ] },
    availability: { rows: [] },
    sessions: { rows: [] },
  }));
  const result = await source.loadCandidateData({ semesterId: ids.semester, startupSemesterId: ids.startup, sessionDateId: ids.date, timeSlot: "3:30-4:15", format: "online" } as unknown as Parameters<typeof source.loadCandidateData>[0]);

  assert.equal(result.startupScheduleId, "schedule-startup-selected");
  assert.deepEqual(result.mentors, [{ id: "schedule-mentor-1", scheduleMentorIds: ["schedule-mentor-1", "schedule-mentor-z"], profileId: ids.mentor, name: "Lifecycle mentor", expertise: ["Enterprise sales"], preferredFormat: "online", capacity: 3 }]);
});

test("duplicate legacy mentor rows count profile-wide capacity and recency", async () => {
  const priorDateId = "10000000-0000-4000-8000-000000000006";
  const source = createSupabaseAssignmentDataSource(fakeSupabase({
    session_dates: { rows: [
      { id: ids.date, date: "2026-09-04", semester_id: ids.semester },
      { id: priorDateId, date: "2026-08-28", semester_id: ids.semester },
    ] },
    startup_semesters: { rows: [], single: { id: ids.startup, semester_id: ids.semester, company_snapshot: null, goals: [], mentor_need_context: null, mentor_need_no_preference: false, mentorship_needs: ["Enterprise sales"], preferred_expertise_tags: [], stage: "mvp" } },
    semester_memberships: { rows: [
      { id: "mentor-membership", profile_id: ids.mentor, semester_id: ids.semester, role: "mentor", status: "active" },
      { id: "startup-membership", profile_id: "startup-profile", semester_id: ids.semester, role: "startup", status: "active" },
    ] },
    mentor_semesters: { rows: [{ semester_membership_id: "mentor-membership", semester_id: ids.semester, capacity: 1, preferred_format: "online" }] },
    mentor_profiles: { rows: [{ profile_id: ids.mentor, expertise_tags: ["Enterprise sales"] }] },
    mentors: { rows: [
      { id: "schedule-mentor-1", user_id: ids.mentor, full_name: "Lifecycle mentor", semester_id: ids.semester, is_active: true },
      { id: "schedule-mentor-z", user_id: ids.mentor, full_name: "Inactive historical duplicate", semester_id: ids.semester, is_active: false },
    ] },
    startup_team_memberships: { rows: [{ id: "team-membership", startup_semester_id: ids.startup, semester_membership_id: "startup-membership", semester_id: ids.semester, is_primary_contact: true }] },
    startups: { rows: [{ id: "schedule-startup-selected", user_id: "startup-profile", semester_id: ids.semester, is_active: true }] },
    availability: { rows: [] },
    sessions: { rows: [{ mentor_id: "schedule-mentor-z", startup_id: "schedule-startup-selected", session_date_id: priorDateId, time_slot: "3:30-4:15", status: "confirmed" }] },
  }));
  const response = await routesFor(source).getCandidates(candidateRequest());
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
    const source = createSupabaseAssignmentDataSource(fakeSupabase({}, { data: null, error: { code: scenario.code, message: "sensitive database detail" } }));
    const response = await routesFor(source).commit(commitRequest(validCommit));
    assert.equal(response.status, scenario.status);
    assert.deepEqual(await response.json(), scenario.body);
  }
});
