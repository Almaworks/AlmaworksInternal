import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as nodeModule from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  ParticipantNotificationReadError,
  createParticipantNotificationReadService,
  participantNotificationReadCacheKey,
  persistParticipantNotificationRead,
  type ParticipantNotificationReadRepository,
} from "../../src/dashboard/participant-notification-read.ts";

type ResolveResult = { shortCircuit?: boolean; url: string };
type NextResolve = (specifier: string, context: unknown) => ResolveResult;
type RegisterHooks = (hooks: {
  resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => ResolveResult;
}) => void;

const registerHooks = (nodeModule as unknown as { registerHooks: RegisterHooks }).registerHooks;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return { shortCircuit: true, url: pathToFileURL(resolve("node_modules/next/server.js")).href };
    }
    return nextResolve(specifier, context);
  },
});

function repository(overrides: Partial<ParticipantNotificationReadRepository> = {}): ParticipantNotificationReadRepository {
  return {
    loadContext: async () => ({
      activeSemester: { id: "fall", name: "Fall 2026" },
      memberships: [{ id: "member", semesterId: "fall", profileId: "person", role: "mentor", status: "active" }],
    }),
    recordRead: async () => undefined,
    ...overrides,
  };
}

test("records a trimmed notification key for the caller's active participant semester", async () => {
  const writes: unknown[] = [];
  const service = createParticipantNotificationReadService(repository({
    recordRead: async (receipt) => { writes.push(receipt); },
  }));

  assert.deepEqual(await service.record("person", {
    semesterId: "fall",
    notificationKey: " session-session-1-confirmed ",
  }), { notificationKey: "session-session-1-confirmed" });
  assert.deepEqual(writes, [{
    profileId: "person",
    semesterId: "fall",
    notificationKey: "session-session-1-confirmed",
  }]);
});

test("repeated reads remain successful", async () => {
  const receipts = new Set<string>();
  const service = createParticipantNotificationReadService(repository({
    recordRead: async ({ profileId, semesterId, notificationKey }) => {
      receipts.add(`${profileId}:${semesterId}:${notificationKey}`);
    },
  }));
  const payload = { semesterId: "fall", notificationKey: "session-session-1-confirmed" };

  await service.record("person", payload);
  await service.record("person", payload);

  assert.deepEqual([...receipts], ["person:fall:session-session-1-confirmed"]);
});

test("client cache keys isolate notification reads by participant and semester", () => {
  assert.notEqual(
    participantNotificationReadCacheKey("person-a", "fall", "activation-profile"),
    participantNotificationReadCacheKey("person-b", "fall", "activation-profile"),
  );
  assert.notEqual(
    participantNotificationReadCacheKey("person-a", "fall", "activation-profile"),
    participantNotificationReadCacheKey("person-a", "spring", "activation-profile"),
  );
});

test("rejects missing or blank receipt fields before loading participant context", async () => {
  let loads = 0;
  const service = createParticipantNotificationReadService(repository({
    loadContext: async () => { loads += 1; return { activeSemester: null, memberships: [] }; },
  }));

  for (const payload of [{ semesterId: "fall" }, { semesterId: "fall", notificationKey: "  " }, null]) {
    await assert.rejects(
      service.record("person", payload),
      (error: unknown) => error instanceof ParticipantNotificationReadError && error.status === 422,
    );
  }
  assert.equal(loads, 0);
});

test("rejects notification keys longer than the receipt schema permits", async () => {
  const service = createParticipantNotificationReadService(repository());

  await assert.rejects(
    service.record("person", { semesterId: "fall", notificationKey: "x".repeat(257) }),
    (error: unknown) => error instanceof ParticipantNotificationReadError && error.status === 422,
  );
});

test("rejects a semester outside the caller's active participant context", async () => {
  let wrote = false;
  const service = createParticipantNotificationReadService(repository({
    recordRead: async () => { wrote = true; },
  }));

  await assert.rejects(
    service.record("person", { semesterId: "spring", notificationKey: "activation-profile" }),
    (error: unknown) => error instanceof ParticipantNotificationReadError && error.status === 403,
  );
  assert.equal(wrote, false);
});

test("rejects receipt writes for a membership status that RLS does not permit to insert", async () => {
  let wrote = false;
  const service = createParticipantNotificationReadService(repository({
    loadContext: async () => ({
      activeSemester: { id: "fall", name: "Fall 2026" },
      memberships: [{ id: "member", semesterId: "fall", profileId: "person", role: "mentor", status: "invited" }],
    }),
    recordRead: async () => { wrote = true; },
  }));

  await assert.rejects(
    service.record("person", { semesterId: "fall", notificationKey: "activation-profile" }),
    (error: unknown) => error instanceof ParticipantNotificationReadError && error.status === 403,
  );
  assert.equal(wrote, false);
});

test("client persistence falls back safely when an error response is HTML", async () => {
  await assert.rejects(
    persistParticipantNotificationRead(
      async () => new Response("<html>missing</html>", { status: 404, headers: { "content-type": "text/html" } }),
      { semesterId: "fall", notificationKey: "activation-profile" },
    ),
    /Notification read status could not be saved\./u,
  );
});

test("client persistence surfaces the route's JSON error", async () => {
  await assert.rejects(
    persistParticipantNotificationRead(
      async () => Response.json({ error: "Receipt access denied." }, { status: 403 }),
      { semesterId: "fall", notificationKey: "activation-profile" },
    ),
    /Receipt access denied\./u,
  );
});

test("client persistence rejects a 200 HTML response instead of treating it as saved", async () => {
  await assert.rejects(
    persistParticipantNotificationRead(
      async () => new Response("<html>sign in</html>", { status: 200, headers: { "content-type": "text/html" } }),
      { semesterId: "fall", notificationKey: "activation-profile" },
    ),
    /Notification read status could not be saved\./u,
  );
});

test("client persistence requires the confirmed key to match the requested key", async () => {
  await assert.rejects(
    persistParticipantNotificationRead(
      async () => Response.json({ data: { notificationKey: "activation-availability" } }),
      { semesterId: "fall", notificationKey: "activation-profile" },
    ),
    /Notification read status could not be saved\./u,
  );
});

test("Next route uses authenticated RLS access and an ignore-duplicates upsert", async () => {
  const source = await readFile("app/api/participant-notifications/read/route.ts", "utf8");

  assert.match(source, /requireAuthenticatedUserWithRls/u);
  assert.match(source, /participant_notification_reads/u);
  assert.match(source, /ignoreDuplicates:\s*true/u);
  assert.match(source, /onConflict:\s*["']profile_id,semester_id,notification_key["']/u);
  assert.doesNotMatch(source, /service.role|SERVICE_ROLE/u);
});

test("Next route returns JSON for authentication failures", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    const { POST } = await import("../../app/api/participant-notifications/read/route.ts");
    const response = await POST(new Request("https://almaworks.test/api/participant-notifications/read", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ semesterId: "fall", notificationKey: "activation-profile" }),
    }));

    assert.equal(response.status, 500);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/u);
    assert.deepEqual(await response.json(), { error: "Missing Supabase server environment variables." });
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
