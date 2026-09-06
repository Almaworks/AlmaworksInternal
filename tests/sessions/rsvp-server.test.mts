import assert from "node:assert/strict";
import test from "node:test";

import {
  SessionRsvpServiceError,
  createSessionRsvpService,
  type EligibleSessionRsvp,
  type SessionRsvpRepository,
} from "../../src/sessions/rsvp-server.ts";

function eligible(overrides: Partial<EligibleSessionRsvp> = {}): EligibleSessionRsvp {
  return {
    semesterId: "semester-1",
    sessionId: "session-1",
    semesterMembershipId: "membership-1",
    meetingDate: "2026-09-04",
    startsAt: "15:30:00",
    timezone: "America/New_York",
    status: "confirmed",
    ...overrides,
  };
}

function repository(record: EligibleSessionRsvp | null): SessionRsvpRepository & {
  writes: Array<{ semesterId: string; sessionId: string; semesterMembershipId: string; response: "attending" | "not_attending" }>;
} {
  const writes: Array<{ semesterId: string; sessionId: string; semesterMembershipId: string; response: "attending" | "not_attending" }> = [];
  return {
    writes,
    loadEligibleSession: async () => record,
    saveOwnResponse: async (input) => { writes.push(input); },
  };
}

test("stores an attending response using only server-resolved ownership fields", async () => {
  const store = repository(eligible());
  const service = createSessionRsvpService(store, () => "2026-09-04T19:00:00.000Z");

  await service.respond("profile-1", { sessionId: "session-1", response: "attending" });

  assert.deepEqual(store.writes, [{
    semesterId: "semester-1",
    sessionId: "session-1",
    semesterMembershipId: "membership-1",
    response: "attending",
  }]);
});

test("accepts not attending as the other explicit RSVP response", async () => {
  const store = repository(eligible());
  const service = createSessionRsvpService(store, () => "2026-09-04T19:00:00.000Z");

  await service.respond("profile-1", { sessionId: "session-1", response: "not_attending" });

  assert.equal(store.writes[0]?.response, "not_attending");
});

test("rejects malformed response values before loading a session", async () => {
  let loads = 0;
  const store: SessionRsvpRepository = {
    loadEligibleSession: async () => { loads += 1; return eligible(); },
    saveOwnResponse: async () => undefined,
  };
  const service = createSessionRsvpService(store);

  await assert.rejects(
    service.respond("profile-1", { sessionId: "session-1", response: "maybe" as "attending" }),
    (cause: unknown) => cause instanceof SessionRsvpServiceError && cause.code === "validation",
  );
  assert.equal(loads, 0);
});

test("hides sessions that are not assigned to the authenticated profile", async () => {
  const service = createSessionRsvpService(repository(null));
  await assert.rejects(
    service.respond("profile-1", { sessionId: "session-1", response: "attending" }),
    (cause: unknown) => cause instanceof SessionRsvpServiceError && cause.code === "not_found",
  );
});

test("locks RSVP changes at the exact session start and for cancelled sessions", async () => {
  const atStart = createSessionRsvpService(repository(eligible()), () => "2026-09-04T19:30:00.000Z");
  await assert.rejects(
    atStart.respond("profile-1", { sessionId: "session-1", response: "attending" }),
    (cause: unknown) => cause instanceof SessionRsvpServiceError && cause.code === "locked",
  );

  const cancelled = createSessionRsvpService(repository(eligible({ status: "cancelled" })), () => "2026-09-04T18:00:00.000Z");
  await assert.rejects(
    cancelled.respond("profile-1", { sessionId: "session-1", response: "attending" }),
    (cause: unknown) => cause instanceof SessionRsvpServiceError && cause.code === "locked",
  );
});
