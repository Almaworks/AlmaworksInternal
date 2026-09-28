import assert from "node:assert/strict";
import test from "node:test";

import { createOutreachEmailHandlers, readOutreachEmailConfiguration, type OutreachEmailRecord, type OutreachEmailStore } from "../../src/outreach-email/server.ts";
import { createOutreachEmailSigner } from "../../src/outreach-email/signing.ts";
import type { OutreachEmailProvider } from "../../src/outreach-email/resend-provider.ts";

const semesterId = "11111111-1111-4111-8111-111111111111";
const opportunityId = "22222222-2222-4222-8222-222222222222";
const signer = createOutreachEmailSigner({ currentKeyId: "test", keys: { test: "test-secret-material-at-least-32-bytes" } });

function request(body: unknown): Request {
  return new Request("http://localhost/api/admin/outreach/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function memoryStore() {
  const messages: OutreachEmailRecord[] = [];
  const store: OutreachEmailStore = {
    async load(_semesterId, targetOpportunityId) {
      return {
        semesterId, semesterName: "Fall 2026", timeZone: "America/New_York", templates: [],
        opportunity: targetOpportunityId ? { companyName: "Acme", contactId: "44444444-4444-4444-8444-444444444444", opportunityId, recipientEmail: "ada@example.test", recipientName: "Ada", semesterName: "Fall 2026" } : null,
        messages: targetOpportunityId ? messages.filter((message) => message.snapshot.opportunityId === targetOpportunityId) : messages,
      };
    },
    async reserve(input) {
      const existing = messages.find((message) => message.snapshot.semesterId === input.snapshot.semesterId && message.clientIdempotencyKey === input.clientIdempotencyKey);
      if (existing) {
        if (existing.requestDigest !== input.requestDigest) throw Object.assign(new Error("conflict"), { code: "23505" });
        return existing;
      }
      const record: OutreachEmailRecord = { ...input, receipts: [], templateId: input.templateId };
      messages.push(record);
      return record;
    },
    async findByIdempotency(targetSemesterId, key) {
      return messages.find((message) => message.snapshot.semesterId === targetSemesterId && message.clientIdempotencyKey === key) ?? null;
    },
    async appendReceipt(messageId, receipt) {
      const message = messages.find((candidate) => candidate.snapshot.messageId === messageId);
      if (!message) throw new Error("missing");
      const previous = message.receipts.at(-1)?.receipt;
      if (receipt.receipt.messageStatus === "submitting" && previous?.messageStatus === "submitting" && Date.parse(receipt.receipt.checkedAt) - Date.parse(previous.checkedAt) < 120_000) throw Object.assign(new Error("in progress"), { code: "23514" });
      message.receipts.push(receipt);
    },
    async saveTemplate() {}, async archiveTemplate() {},
  };
  return { messages, store };
}

function provider(overrides: Partial<OutreachEmailProvider> = {}): OutreachEmailProvider {
  return {
    submit: async () => ({ kind: "accepted", providerId: "email-1" }),
    retrieve: async (providerId) => ({ kind: "found", providerId, providerStatus: "sent" }),
    cancel: async (providerId) => ({ kind: "cancelled", providerId }),
    ...overrides,
  };
}

function handlers(store: OutreachEmailStore, emailProvider = provider(), now = new Date("2026-09-08T12:00:00Z")) {
  return createOutreachEmailHandlers({
    authorize: async () => store,
    configuration: { apiKey: "secret", available: true, sender: "Almaworks <team@example.test>", timeZone: "America/New_York", unavailableReason: null },
    now: () => now,
    provider: emailProvider,
    signer,
  });
}

const submit = { action: "submit_message", semesterId, opportunityId, templateId: null, subject: "Hello", body: "Plain", scheduledAt: null, idempotencyKey: "composer-attempt-1" };

test("submission reserves canonical recipient and a duplicate command does not create or send twice", async () => {
  const memory = memoryStore();
  let submissions = 0;
  const endpoint = handlers(memory.store, provider({ submit: async () => { submissions += 1; return { kind: "accepted", providerId: "email-1" }; } }));
  assert.equal((await endpoint.POST(request(submit))).status, 200);
  assert.equal((await endpoint.POST(request(submit))).status, 200);
  assert.equal(submissions, 1);
  assert.equal(memory.messages.length, 1);
  assert.equal(memory.messages[0]?.snapshot.recipientEmail, "ada@example.test");
  assert.equal(memory.messages[0]?.receipts.at(-1)?.receipt.messageStatus, "accepted");
});

test("an ambiguous result retries only from the persisted signed snapshot within 24 hours", async () => {
  const memory = memoryStore();
  let submissions = 0;
  const endpoint = handlers(memory.store, provider({ submit: async () => ++submissions === 1 ? { kind: "ambiguous", message: "timeout" } : { kind: "accepted", providerId: "email-1" } }));
  await endpoint.POST(request(submit));
  const messageId = memory.messages[0]!.snapshot.messageId;
  const retry = await endpoint.POST(request({ action: "retry_message", semesterId, messageId }));
  assert.equal(retry.status, 200);
  assert.equal(submissions, 2);
  assert.equal(memory.messages[0]?.receipts.at(-1)?.receipt.messageStatus, "accepted");
  const expired = handlers(memory.store, provider(), new Date("2026-09-10T12:00:00Z"));
  assert.equal((await expired.POST(request({ action: "retry_message", semesterId, messageId }))).status, 409);
});

test("cancel verifies snapshot and latest provider receipt before calling provider", async () => {
  const memory = memoryStore();
  await handlers(memory.store).POST(request({ ...submit, scheduledAt: "2026-09-09T12:00:00Z" }));
  const saved = memory.messages[0]!;
  saved.snapshot = { ...saved.snapshot, recipientEmail: "tampered@example.test" };
  let cancelled = 0;
  const endpoint = handlers(memory.store, provider({ cancel: async (providerId) => { cancelled += 1; return { kind: "cancelled", providerId }; } }));
  const result = await endpoint.POST(request({ action: "cancel_message", semesterId, messageId: saved.snapshot.messageId }));
  assert.equal(result.status, 409);
  assert.equal(cancelled, 0);
});

test("missing provider or signing configuration disables submission without reserving a fake send", async () => {
  const memory = memoryStore();
  const endpoint = createOutreachEmailHandlers({
    authorize: async () => memory.store,
    configuration: { apiKey: null, available: false, sender: null, timeZone: "America/New_York", unavailableReason: "Email delivery is not configured." },
    now: () => new Date("2026-09-08T12:00:00Z"), provider: null, signer: null,
  });
  const result = await endpoint.POST(request(submit));
  assert.equal(result.status, 503);
  assert.equal(memory.messages.length, 0);
});

test("terminal accepted and failed submissions replay without provider calls after the retention window", async () => {
  for (const result of [{ kind: "accepted", providerId: "email-1" } as const, { kind: "rejected", message: "invalid sender" } as const]) {
    const memory = memoryStore();
    let submissions = 0;
    await handlers(memory.store, provider({ submit: async () => { submissions += 1; return result; } })).POST(request(submit));
    const replay = handlers(memory.store, provider({ submit: async () => { submissions += 1; return result; } }), new Date("2026-09-10T12:00:00Z"));
    assert.equal((await replay.POST(request(submit))).status, 200);
    assert.equal(submissions, 1);
  }
});

test("a changed contact or unavailable provider does not alter a same-key replay", async () => {
  const memory = memoryStore();
  await handlers(memory.store).POST(request(submit));
  const originalLoad = memory.store.load;
  memory.store.load = async (targetSemester, targetOpportunity) => {
    const loaded = await originalLoad(targetSemester, targetOpportunity);
    if (loaded.opportunity) loaded.opportunity = { ...loaded.opportunity, recipientEmail: "changed@example.test" };
    return loaded;
  };
  const replay = createOutreachEmailHandlers({
    authorize: async () => memory.store,
    configuration: { apiKey: null, available: false, sender: null, timeZone: "UTC", unavailableReason: "not configured" },
    now: () => new Date("2026-09-10T12:00:00Z"), provider: null, signer,
  });
  const response = await replay.POST(request(submit));
  assert.equal(response.status, 200);
  assert.equal(memory.messages[0]?.snapshot.recipientEmail, "ada@example.test");
});

test("a rejected retry cannot turn a prior unknown scheduled submission into a known failure", async () => {
  const memory = memoryStore();
  let attempt = 0;
  const endpoint = handlers(memory.store, provider({ submit: async () => ++attempt === 1 ? { kind: "ambiguous", message: "timeout" } : { kind: "rejected", message: "schedule is now past" } }));
  await endpoint.POST(request({ ...submit, scheduledAt: "2026-09-08T12:01:00Z" }));
  const id = memory.messages[0]!.snapshot.messageId;
  await endpoint.POST(request({ action: "retry_message", semesterId, messageId: id }));
  assert.equal(memory.messages[0]?.receipts.at(-1)?.receipt.messageStatus, "submission_unknown");
});

test("concurrent duplicates acquire one submission claim and call the provider once", async () => {
  const memory = memoryStore();
  let submissions = 0;
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const endpoint = handlers(memory.store, provider({ submit: async () => { submissions += 1; await blocked; return { kind: "accepted", providerId: "email-1" }; } }));
  const first = endpoint.POST(request(submit));
  while (submissions === 0) await new Promise((resolve) => setImmediate(resolve));
  const second = await endpoint.POST(request(submit));
  assert.equal(second.status, 200);
  release();
  assert.equal((await first).status, 200);
  assert.equal(submissions, 1);
});

test("a reservation left before its first claim resumes from the same idempotency key", async () => {
  const memory = memoryStore();
  const append = memory.store.appendReceipt;
  let failClaim = true;
  memory.store.appendReceipt = async (id, receipt) => {
    if (failClaim && receipt.receipt.messageStatus === "submitting") { failClaim = false; throw new Error("store unavailable"); }
    await append(id, receipt);
  };
  let submissions = 0;
  const endpoint = handlers(memory.store, provider({ submit: async () => { submissions += 1; return { kind: "accepted", providerId: "email-1" }; } }));
  assert.equal((await endpoint.POST(request(submit))).status, 500);
  assert.equal((await endpoint.POST(request(submit))).status, 200);
  assert.equal(submissions, 1);
  assert.equal(memory.messages.length, 1);
});

test("a stale claim recovers a provider-call crash with the original snapshot key", async () => {
  const memory = memoryStore();
  let submissions = 0;
  const crashing = handlers(memory.store, provider({ submit: async () => { submissions += 1; throw new Error("process crash"); } }));
  assert.equal((await crashing.POST(request(submit))).status, 500);
  const recovered = handlers(memory.store, provider({ submit: async () => { submissions += 1; return { kind: "accepted", providerId: "email-1" }; } }), new Date("2026-09-08T12:03:00Z"));
  assert.equal((await recovered.POST(request(submit))).status, 200);
  assert.equal(submissions, 2);
  assert.equal(memory.messages[0]?.receipts.at(-1)?.receipt.messageStatus, "accepted");
});

test("a provider acceptance whose receipt failed recovers without changing payload or provider key", async () => {
  const memory = memoryStore();
  const append = memory.store.appendReceipt;
  let failAcceptance = true;
  memory.store.appendReceipt = async (id, receipt) => {
    if (failAcceptance && receipt.receipt.messageStatus === "accepted") { failAcceptance = false; throw new Error("receipt unavailable"); }
    await append(id, receipt);
  };
  const keys: string[] = [];
  const emailProvider = provider({ submit: async (value) => { keys.push(value.idempotencyKey); return { kind: "accepted", providerId: "email-1" }; } });
  assert.equal((await handlers(memory.store, emailProvider).POST(request(submit))).status, 500);
  assert.equal((await handlers(memory.store, emailProvider, new Date("2026-09-08T12:03:00Z")).POST(request(submit))).status, 200);
  assert.deepEqual(keys, [`outreach-email/${memory.messages[0]!.snapshot.messageId}`, `outreach-email/${memory.messages[0]!.snapshot.messageId}`]);
});

test("an expired stale claim is shown as a non-retryable unknown outcome", async () => {
  const memory = memoryStore();
  await handlers(memory.store, provider({ submit: async () => { throw new Error("process crash"); } })).POST(request(submit));
  const endpoint = handlers(memory.store, provider(), new Date("2026-09-09T12:01:00Z"));
  const response = await endpoint.GET(new Request(`http://localhost/api/admin/outreach/email?semesterId=${semesterId}`));
  const result = await response.json() as { data: { messages: Array<{ canRetry: boolean; status: string }> } };
  assert.equal(result.data.messages[0]?.status, "submission_unknown");
  assert.equal(result.data.messages[0]?.canRetry, false);
});

test("refresh maps provider terminal and engagement events without lifecycle regression", async () => {
  for (const [providerStatus, expected] of [["failed", "failed"], ["suppressed", "suppressed"], ["opened", "delivered"], ["clicked", "delivered"], ["delivery_delayed", "sent"]] as const) {
    const memory = memoryStore();
    await handlers(memory.store).POST(request(submit));
    const id = memory.messages[0]!.snapshot.messageId;
    const endpoint = handlers(memory.store, provider({ retrieve: async (providerId) => ({ kind: "found", providerId, providerStatus }) }));
    await endpoint.POST(request({ action: "refresh_message", semesterId, messageId: id }));
    assert.equal(memory.messages[0]?.receipts.at(-1)?.receipt.messageStatus, expected);
  }
  const memory = memoryStore();
  await handlers(memory.store).POST(request(submit));
  const id = memory.messages[0]!.snapshot.messageId;
  await handlers(memory.store, provider({ retrieve: async (providerId) => ({ kind: "found", providerId, providerStatus: "delivered" }) })).POST(request({ action: "refresh_message", semesterId, messageId: id }));
  await handlers(memory.store, provider({ retrieve: async (providerId) => ({ kind: "found", providerId, providerStatus: "sent" }) })).POST(request({ action: "refresh_message", semesterId, messageId: id }));
  assert.equal(memory.messages[0]?.receipts.at(-1)?.receipt.messageStatus, "delivered");
  const deliveryFailure = memoryStore();
  await handlers(deliveryFailure.store).POST(request(submit));
  const failureId = deliveryFailure.messages[0]!.snapshot.messageId;
  await handlers(deliveryFailure.store, provider({ retrieve: async (providerId) => ({ kind: "found", providerId, providerStatus: "delivery_delayed" }) })).POST(request({ action: "refresh_message", semesterId, messageId: failureId }));
  await handlers(deliveryFailure.store, provider({ retrieve: async (providerId) => ({ kind: "found", providerId, providerStatus: "failed" }) })).POST(request({ action: "refresh_message", semesterId, messageId: failureId }));
  assert.equal(deliveryFailure.messages[0]?.receipts.at(-1)?.receipt.messageStatus, "failed");
});

test("missing historical keys fail visibly instead of hiding signed email history", async () => {
  const memory = memoryStore();
  const oldSigner = createOutreachEmailSigner({ currentKeyId: "old", keys: { old: "old-key-material-that-is-at-least-32-bytes" } });
  const runtime = { apiKey: "secret", available: true, sender: "Almaworks <team@example.test>", timeZone: "UTC", unavailableReason: null };
  await createOutreachEmailHandlers({ authorize: async () => memory.store, configuration: runtime, now: () => new Date("2026-09-08T12:00:00Z"), provider: provider(), signer: oldSigner }).POST(request(submit));
  const currentSigner = createOutreachEmailSigner({ currentKeyId: "new", keys: { new: "new-key-material-that-is-at-least-32-bytes" } });
  const endpoint = createOutreachEmailHandlers({ authorize: async () => memory.store, configuration: runtime, now: () => new Date("2026-09-08T12:05:00Z"), provider: provider(), signer: currentSigner });
  const response = await endpoint.GET(new Request(`http://localhost/api/admin/outreach/email?semesterId=${semesterId}`));
  assert.equal(response.status, 409);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "history_integrity_unavailable");
});

test("malformed or weak previous signing-key configuration disables email delivery", () => {
  const base = { RESEND_API_KEY: "secret", OUTREACH_EMAIL_FROM_EMAIL: "team@example.test", OUTREACH_EMAIL_SIGNING_KEY_ID: "current", OUTREACH_EMAIL_SIGNING_KEY: "current-key-material-that-is-at-least-32-bytes" };
  assert.equal(readOutreachEmailConfiguration({ ...base, OUTREACH_EMAIL_PREVIOUS_SIGNING_KEYS: "not-json" }).configuration.available, false);
  assert.equal(readOutreachEmailConfiguration({ ...base, OUTREACH_EMAIL_PREVIOUS_SIGNING_KEYS: JSON.stringify({ old: "weak" }) }).configuration.available, false);
});
