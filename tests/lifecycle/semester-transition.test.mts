import assert from "node:assert/strict";
import test from "node:test";

import {
  SemesterTransitionError,
  buildWeeklyMeetingDates,
  createActivateSemesterCommand,
  createReplaceMeetingsCommand,
  createSemesterDraftCommand,
  parseActivateSemesterRequest,
  parseCreateSemesterDraftRequest,
  parseReplaceMeetingsRequest,
} from "../../src/lifecycle/semester-transition.ts";

test("draft input is normalized into a private semester configuration", () => {
  assert.deepEqual(parseCreateSemesterDraftRequest({
    sourceSemesterId: " spring-2026 ",
    name: " Fall 2026 ",
    startDate: "2026-08-31",
    endDate: "2026-12-11",
    location: " New York ",
    sessionCadence: "weekly",
    defaultFormat: "online",
  }), {
    sourceSemesterId: "spring-2026",
    name: "Fall 2026",
    startDate: "2026-08-31",
    endDate: "2026-12-11",
    configuration: {
      location: "New York",
      sessionCadence: "weekly",
      defaultFormat: "online",
    },
  });
});

test("draft input rejects an end date before the start date", () => {
  assert.throws(
    () => parseCreateSemesterDraftRequest({
      sourceSemesterId: "spring-2026",
      name: "Fall 2026",
      startDate: "2026-12-11",
      endDate: "2026-08-31",
      location: "New York",
      sessionCadence: "weekly",
      defaultFormat: "online",
    }),
    /endDate must be after startDate/,
  );
});

test("draft creation authorizes the current semester and returns the persisted draft", async () => {
  const observed: unknown[] = [];
  const command = createSemesterDraftCommand(async (_request, semesterId) => {
    observed.push({ authorizedSemesterId: semesterId });
    return {
      createSemesterDraft: async (args) => {
        observed.push(args);
        return {
          data: [{ semester_id: "fall-2026", semester_name: "Fall 2026" }],
          error: null,
        };
      },
    };
  });

  const result = await command({
    request: new Request("https://example.test"),
    sourceSemesterId: "spring-2026",
    name: "Fall 2026",
    startDate: "2026-08-31",
    endDate: "2026-12-11",
    configuration: { location: "New York", sessionCadence: "weekly", defaultFormat: "online" },
  });

  assert.deepEqual(result, { id: "fall-2026", name: "Fall 2026", status: "draft" });
  assert.deepEqual(observed, [
    { authorizedSemesterId: "spring-2026" },
    {
      p_configuration: { location: "New York", sessionCadence: "weekly", defaultFormat: "online" },
      p_end_date: "2026-12-11",
      p_name: "Fall 2026",
      p_source_semester_id: "spring-2026",
      p_start_date: "2026-08-31",
    },
  ]);
});

test("activation requires an explicit close acknowledgement", () => {
  assert.throws(
    () => parseActivateSemesterRequest({
      sourceSemesterId: "spring-2026",
      targetSemesterId: "fall-2026",
      closeAcknowledged: false,
    }),
    /acknowledge closing the current semester/i,
  );
});

test("weekly session-date preview makes every proposed week independently reviewable", () => {
  assert.deepEqual(
    buildWeeklyMeetingDates("2026-11-06", "2026-11-27"),
    [
      { date: "2026-11-06", label: "Nov 6", included: true },
      { date: "2026-11-13", label: "Nov 13", included: true },
      { date: "2026-11-20", label: "Nov 20", included: true },
      { date: "2026-11-27", label: "Nov 27", included: true },
    ],
  );
});

test("meeting input removes excluded breaks before persistence", () => {
  assert.deepEqual(parseReplaceMeetingsRequest({
    semesterId: "fall-2026",
    dates: [
      { date: "2026-11-20", label: "Nov 20", included: true },
      { date: "2026-11-27", label: "Thanksgiving break", included: false },
      { date: "2026-12-04", label: "Dec 4", included: true },
    ],
  }), {
    semesterId: "fall-2026",
    dates: [
      { date: "2026-11-20", label: "Nov 20" },
      { date: "2026-12-04", label: "Dec 4" },
    ],
  });
});

test("meeting replacement authorizes the draft and persists only reviewed meetings", async () => {
  const observed: unknown[] = [];
  const command = createReplaceMeetingsCommand(async (_request, semesterId) => {
    observed.push({ authorizedSemesterId: semesterId });
    return {
      replaceMeetings: async (args) => {
        observed.push(args);
        return { data: 2, error: null };
      },
    };
  });

  const result = await command({
    request: new Request("https://example.test"),
    semesterId: "fall-2026",
    dates: [
      { date: "2026-11-20", label: "Nov 20" },
      { date: "2026-12-04", label: "Dec 4" },
    ],
  });

  assert.deepEqual(result, { saved: 2 });
  assert.deepEqual(observed, [
    { authorizedSemesterId: "fall-2026" },
    {
      p_meetings: [
        { date: "2026-11-20", label: "Nov 20" },
        { date: "2026-12-04", label: "Dec 4" },
      ],
      p_semester_id: "fall-2026",
    },
  ]);
});

test("activation authorizes both semesters and reports the atomic transition", async () => {
  const authorized: string[] = [];
  const command = createActivateSemesterCommand(async (_request, semesterId) => {
    authorized.push(semesterId);
    return {
      activateSemester: async () => ({
        data: [{ closed_semester_id: "spring-2026", active_semester_id: "fall-2026", alumni_count: 42 }],
        error: null,
      }),
    };
  });

  const result = await command({
    request: new Request("https://example.test"),
    sourceSemesterId: "spring-2026",
    targetSemesterId: "fall-2026",
    closeAcknowledged: true,
  });

  assert.deepEqual(authorized, ["spring-2026", "fall-2026"]);
  assert.deepEqual(result, {
    closedSemesterId: "spring-2026",
    activeSemesterId: "fall-2026",
    alumniCount: 42,
  });
});

test("transition commands reject malformed RPC results", async () => {
  const command = createActivateSemesterCommand(async () => ({
    activateSemester: async () => ({ data: [], error: null }),
  }));

  await assert.rejects(
    command({
      request: new Request("https://example.test"),
      sourceSemesterId: "spring-2026",
      targetSemesterId: "fall-2026",
      closeAcknowledged: true,
    }),
    SemesterTransitionError,
  );
});

test("semester defaults require a concrete meeting format", () => {
  assert.throws(() => parseCreateSemesterDraftRequest({
    sourceSemesterId: "spring-2026", name: "Fall 2026", startDate: "2026-08-31",
    endDate: "2026-12-11", location: "New York", sessionCadence: "weekly", defaultFormat: "hybrid",
  }), /defaultFormat is invalid/);
});
