import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFridayProgramHandlers, createFridayProgramStore, createFridaySpeakerHandlers, createFridayWeekCancellationHandlers, createFridayWeekLabelHandlers, FridayProgramHttpError, type FridayProgramStore } from "../../src/friday-program/server.ts";
import type { FridayProgramModelInput } from "../../src/friday-program/model.ts";
import type { Database } from "../../src/db/types.ts";

const semesterId = "11111111-1111-4111-8111-111111111111";
const meetingId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const input: FridayProgramModelInput = {
  semesterId,
  meetings: [{ id: meetingId, meetingDate: "2026-09-11", label: "Week 1" }],
  programs: [{ id: programId, meetingId, agendaVersion: 1, groupAFacilitator: "Les", groupBFacilitator: "Eric Chan", generatedAt: "2026-09-08T12:00:00Z" }],
  assignments: [{ programId, startupSemesterId: "startup-1", startupOrganizationId: "org-1", startupName: "Example", startupSlug: "example", group: "A", position: 1 }],
};
function request(body: unknown) { return new Request("http://localhost/api/admin/friday-program/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
function store(overrides: Partial<FridayProgramStore> = {}): FridayProgramStore {
  return { load: async () => input, generate: async () => ({ created: true, programId }), saveSpeaker: async () => {}, removeSpeaker: async () => {}, setWeekCanceled: async () => {}, saveWeekLabel: async () => {}, ...overrides };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

test("Friday program store starts independent meeting and program reads together", async () => {
  type Result = { data: readonly Record<string, unknown>[]; error: null };
  interface Query {
    eq(column: string, value: unknown): Query;
    in(column: string, values: readonly unknown[]): Query;
    order(column: string): Query;
    range(start: number, end: number): Promise<Result>;
    select(columns: string): Query;
  }
  const meetings = deferred<Result>();
  const programs = deferred<Result>();
  const started: string[] = [];
  const results: Record<string, Promise<Result>> = {
    meetings: meetings.promise,
    friday_programs: programs.promise,
    friday_speakers: Promise.resolve({ data: [], error: null }),
  };
  const client = {
    from(table: string) {
      const query: Query = {
        eq: () => query,
        in: () => query,
        order: () => query,
        range: async () => {
          started.push(table);
          return await results[table];
        },
        select: () => query,
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;

  const loading = createFridayProgramStore(client).load(semesterId);
  assert.deepEqual(started, ["meetings", "friday_programs"]);
  meetings.resolve({ data: [], error: null });
  programs.resolve({ data: [], error: null });
  assert.deepEqual(await loading, { semesterId, meetings: [], programs: [], assignments: [], speakers: [] });
});

test("missing speaker table does not hide the existing Friday program", async () => {
  type Result = { data: readonly Record<string, unknown>[] | null; error: { code: string; message: string } | null };
  interface Query {
    eq(column: string, value: unknown): Query;
    in(column: string, values: readonly unknown[]): Query;
    order(column: string): Query;
    range(start: number, end: number): Promise<Result>;
    select(columns: string): Query;
  }
  const client = {
    from(table: string) {
      const query: Query = {
        eq: () => query,
        in: () => query,
        order: () => query,
        range: async () => {
          if (table === "meetings") return { data: [{ id: meetingId, meeting_date: "2026-09-11", label: "Week 1" }], error: null };
          if (table === "friday_programs") return { data: [], error: null };
          if (table === "friday_speakers") return { data: null, error: { code: "PGRST205", message: "Table not found" } };
          throw new Error(`Unexpected table ${table}`);
        },
        select: () => query,
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;

  const loaded = await createFridayProgramStore(client).load(semesterId);
  assert.equal(loaded.meetings.length, 1);
  assert.deepEqual(loaded.speakers, []);
  assert.equal(loaded.speakerSetupPending, true);
});

test("missing cancellation columns keep the existing Friday program readable", async () => {
  type Result = { data: readonly Record<string, unknown>[] | null; error: { code: string; message: string } | null };
  interface Query {
    eq(column: string, value: unknown): Query;
    in(column: string, values: readonly unknown[]): Query;
    order(column: string): Query;
    range(start: number, end: number): Promise<Result>;
    select(columns: string): Query;
  }
  const client = {
    from(table: string) {
      let selected = "";
      const query: Query = {
        eq: () => query,
        in: () => query,
        order: () => query,
        range: async () => {
          if (table === "meetings" && selected.includes("friday_canceled_at")) return { data: null, error: { code: "PGRST204", message: "column missing" } };
          if (table === "meetings") return { data: [{ id: meetingId, meeting_date: "2026-09-11", label: "Week 1" }], error: null };
          return { data: [], error: null };
        },
        select: (columns) => { selected = columns; return query; },
      };
      return query;
    },
  } as unknown as SupabaseClient<Database>;

  const loaded = await createFridayProgramStore(client).load(semesterId);
  assert.equal(loaded.meetings.length, 1);
  assert.equal(loaded.cancellationSetupPending, true);
});

test("speaker save authorizes an admin and verifies the saved week", async () => {
  const calls: unknown[] = [];
  let saved = false;
  const speaker = { name: "Morgan", bio: "Founder", expertise: "Growth", topic: "Hiring", contactEmail: "morgan@example.com", contactPhone: null, linkedinUrl: null, websiteUrl: null };
  const handlers = createFridaySpeakerHandlers(async (_request, semester, mode) => {
    calls.push([semester, mode]);
    return store({ saveSpeaker: async (savedSemester, savedMeeting, savedSpeaker) => { calls.push([savedSemester, savedMeeting, savedSpeaker]); saved = true; }, load: async () => ({ ...input, speakers: saved ? [{ meetingId, ...speaker }] : [] }) });
  }, async () => ({ accepted: 0, queued: 0, rejected: 0, unknown: 0, skipped: 0 }));
  const response = await handlers.PUT(new Request("http://localhost/api/admin/friday-program/speaker", { method: "PUT", body: JSON.stringify({ semesterId, meetingId, ...speaker }) }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).speaker, speaker);
  assert.deepEqual(calls, [[semesterId, "speaker"], [semesterId, meetingId, speaker]]);
});

test("speaker save rejects invalid input and unauthorized requests", async () => {
  const body = { semesterId, meetingId, name: "Morgan", bio: "Founder", expertise: "Growth", topic: "Hiring", contactEmail: "morgan@example.com" };
  const invalid = createFridaySpeakerHandlers(async () => { throw new Error("must not authorize invalid input"); });
  assert.equal((await invalid.PUT(request({ ...body, websiteUrl: "http://example.com" }))).status, 400);
  const denied = createFridaySpeakerHandlers(async () => { throw new FridayProgramHttpError(403, "Denied"); });
  assert.equal((await denied.PUT(request(body))).status, 403);
});

test('repeat speaker save skips mutation and email dispatch', async () => {
  const speaker = { name: 'Morgan', bio: 'Founder', expertise: 'Growth', topic: 'Hiring', contactEmail: 'morgan@example.com', contactPhone: null, linkedinUrl: null, websiteUrl: null };
  let writes = 0;
  let announcements = 0;
  const handlers = createFridaySpeakerHandlers(async () => store({
    load: async () => ({ ...input, speakers: [{ meetingId, ...speaker }] }),
    saveSpeaker: async () => { writes += 1; },
  }), async () => { announcements += 1; return { accepted: 0, queued: 0, rejected: 0, unknown: 0, skipped: 0 }; });
  const response = await handlers.PUT(request({ semesterId, meetingId, ...speaker }));
  assert.equal(response.status, 200);
  assert.equal(writes, 0);
  assert.equal(announcements, 0);
  assert.equal((await response.json()).notification.skipped, 1);
});

test('existing saved speaker can be announced explicitly once authorized', async () => {
  const speaker = { name: 'Morgan', bio: 'Founder', expertise: 'Growth', topic: 'Hiring', contactEmail: 'morgan@example.com', contactPhone: null, linkedinUrl: null, websiteUrl: null };
  let announcements = 0;
  const handlers = createFridaySpeakerHandlers(async () => store({ load: async () => ({ ...input, speakers: [{ meetingId, ...speaker }] }) }), async (_request, details) => {
    assert.equal(details.previousSpeaker, null);
    assert.equal(details.currentSpeaker.name, 'Morgan');
    announcements += 1;
    return { accepted: 1, queued: 0, rejected: 0, unknown: 0, skipped: 0 };
  });
  const response = await handlers.POST(request({ semesterId, meetingId }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).notification.accepted, 1);
  assert.equal(announcements, 1);
});

test("speaker removal authorizes an admin and verifies the selected week is clear", async () => {
  const calls: unknown[] = [];
  const handlers = createFridaySpeakerHandlers(async (_request, semester, mode) => {
    calls.push([semester, mode]);
    return store({ removeSpeaker: async (savedSemester, savedMeeting) => { calls.push([savedSemester, savedMeeting]); }, load: async () => ({ ...input, speakers: [] }) });
  });
  const response = await handlers.DELETE(new Request("http://localhost/api/admin/friday-program/speaker", { method: "DELETE", body: JSON.stringify({ semesterId, meetingId }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { speaker: null });
  assert.deepEqual(calls, [[semesterId, "speaker"], [semesterId, meetingId]]);
});

test("speaker removal rejects bad IDs and unauthorized access", async () => {
  const invalid = createFridaySpeakerHandlers(async () => { throw new Error("must not authorize invalid input"); });
  assert.equal((await invalid.DELETE(new Request("http://localhost/api/admin/friday-program/speaker", { method: "DELETE", body: JSON.stringify({ semesterId, meetingId: "bad" }) }))).status, 400);
  const denied = createFridaySpeakerHandlers(async () => { throw new FridayProgramHttpError(403, "Denied"); });
  assert.equal((await denied.DELETE(new Request("http://localhost/api/admin/friday-program/speaker", { method: "DELETE", body: JSON.stringify({ semesterId, meetingId }) }))).status, 403);
});

test("week cancellation authorizes an admin and verifies canceled state without removing saved content", async () => {
  const calls: unknown[] = [];
  const canceledAt = "2026-09-10T15:30:00.000Z";
  const canceledByProfileId = "44444444-4444-4444-8444-444444444444";
  const handlers = createFridayWeekCancellationHandlers(async (_request, semester, mode) => {
    calls.push([semester, mode]);
    return store({
      setWeekCanceled: async (savedSemester, savedMeeting, canceled) => { calls.push([savedSemester, savedMeeting, canceled]); },
      load: async () => ({ ...input, meetings: [{ ...input.meetings[0]!, canceledAt, canceledByProfileId }] }),
    });
  });
  const response = await handlers.PUT(request({ semesterId, meetingId, canceled: true }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.meeting.status, "canceled");
  assert.equal(body.meeting.program.programId, programId);
  assert.deepEqual(calls, [[semesterId, "cancel"], [semesterId, meetingId, true]]);
});

test("week restoration clears canceled state and rejects malformed or unauthorized requests", async () => {
  const handlers = createFridayWeekCancellationHandlers(async () => store({ load: async () => input }));
  const restored = await handlers.PUT(request({ semesterId, meetingId, canceled: false }));
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).meeting.status, "published");

  const invalid = createFridayWeekCancellationHandlers(async () => { throw new Error("must not authorize invalid input"); });
  assert.equal((await invalid.PUT(request({ semesterId, meetingId, canceled: "false" }))).status, 400);
  const denied = createFridayWeekCancellationHandlers(async () => { throw new FridayProgramHttpError(403, "Denied"); });
  assert.equal((await denied.PUT(request({ semesterId, meetingId, canceled: true }))).status, 403);
});

test("week label update requires an admin and a valid label", async () => {
  const calls: unknown[] = [];
  const handlers = createFridayWeekLabelHandlers(async (_request, semester, mode) => {
    calls.push([semester, mode]);
    return store({ saveWeekLabel: async (...args) => { calls.push(args); } });
  });
  const saved = await handlers.PUT(request({ semesterId, meetingId, label: "Thanksgiving break" }));
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { label: "Thanksgiving break", meetingId });
  assert.deepEqual(calls, [[semesterId, "label"], [semesterId, meetingId, "Thanksgiving break"]]);
  assert.equal((await handlers.PUT(request({ semesterId, meetingId, label: "  " }))).status, 400);
  const denied = createFridayWeekLabelHandlers(async () => { throw new FridayProgramHttpError(403, "Denied"); });
  assert.equal((await denied.PUT(request({ semesterId, meetingId, label: "Week 9" }))).status, 403);
});

test("GET authorizes the requested semester and never generates groups", async () => {
  const calls: unknown[] = [];
  const handlers = createFridayProgramHandlers(async (_request, semester, mode) => {
    calls.push([semester, mode]);
    return store({ generate: async () => { throw new Error("GET mutated"); }, load: async (semester, meeting) => { calls.push([semester, meeting]); return input; } });
  });
  const response = await handlers.GET(new Request(`http://localhost/api/friday-program?semesterId=${semesterId}&meetingId=${meetingId}`));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [[semesterId, "read"], [semesterId, meetingId]]);
  const data = await response.json();
  assert.equal(data.meetings[0].program.groups.A[0].name, "Example");
  assert.equal(data.agenda[3].facilitators.A, "Eric Chan");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("POST returns 201 for publication and 200 for an idempotent retry", async () => {
  let created = true;
  const handlers = createFridayProgramHandlers(async (_request, semester, mode) => {
    assert.equal(semester, semesterId); assert.equal(mode, "generate");
    return store({ generate: async (semester, meeting) => { assert.equal(semester, semesterId); assert.equal(meeting, meetingId); return { created, programId }; } });
  });
  const first = await handlers.POST(request({ semesterId, meetingId }));
  assert.equal(first.status, 201);
  created = false;
  const retry = await handlers.POST(request({ semesterId, meetingId }));
  assert.equal(retry.status, 200);
  const firstData = await first.json(); const retryData = await retry.json();
  assert.deepEqual(firstData.program, retryData.program);
  assert.equal(retryData.created, false);
});

test("POST forwards an explicit regeneration request for the selected Friday only", async () => {
  const calls: unknown[] = [];
  const handlers = createFridayProgramHandlers(async () => store({
    generate: async (semester, meeting, regenerate) => {
      calls.push([semester, meeting, regenerate]);
      return { created: false, programId };
    },
  }));

  const response = await handlers.POST(request({ semesterId, meetingId, regenerate: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [[semesterId, meetingId, true]]);
});

test("invalid JSON and malformed IDs are rejected before authorization", async () => {
  const handlers = createFridayProgramHandlers(async () => { throw new Error("must not authorize invalid input"); });
  assert.equal((await handlers.POST(new Request("http://localhost", { method: "POST", body: "{" }))).status, 400);
  assert.equal((await handlers.POST(request({ semesterId, meetingId: "bad" }))).status, 400);
  assert.equal((await handlers.GET(new Request("http://localhost/api/friday-program"))).status, 400);
});

test("denied access does not load or mutate the semester", async () => {
  for (const status of [401, 403]) {
    const handlers = createFridayProgramHandlers(async () => { throw new FridayProgramHttpError(status, "Access denied"); });
    const response = await handlers.POST(request({ semesterId, meetingId }));
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: "Access denied" });
  }
});

test("missing meeting and empty roster errors retain actionable status", async () => {
  for (const status of [400, 404, 503]) {
    const handlers = createFridayProgramHandlers(async () => store({ generate: async () => { throw new FridayProgramHttpError(status, "Program unavailable"); } }));
    assert.equal((await handlers.POST(request({ semesterId, meetingId }))).status, status);
  }
});

test("unexpected internal errors are not exposed to clients", async () => {
  const handlers = createFridayProgramHandlers(async () => { throw new Error("private database detail"); });
  const response = await handlers.GET(new Request(`http://localhost/?semesterId=${semesterId}`));
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private database detail/);
});

test("a successful mutation without its matching persisted read model is not reported as success", async () => {
  const handlers = createFridayProgramHandlers(async () => store({ generate: async () => ({ created: true, programId: "wrong-program" }) }));
  assert.equal((await handlers.POST(request({ semesterId, meetingId }))).status, 500);
});

test("GET rejects a missing requested meeting without inventing an empty program", async () => {
  const handlers = createFridayProgramHandlers(async () => store({ load: async () => ({ ...input, meetings: [], programs: [], assignments: [] }) }));
  assert.equal((await handlers.GET(new Request(`http://localhost/?semesterId=${semesterId}&meetingId=${meetingId}`))).status, 404);
});
