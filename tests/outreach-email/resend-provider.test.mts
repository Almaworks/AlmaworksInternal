import assert from "node:assert/strict";
import test from "node:test";

import { createResendProvider } from "../../src/outreach-email/resend-provider.ts";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("submission sends one plain-text recipient with native scheduling and stable provider idempotency", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const provider = createResendProvider({ apiKey: "secret", fetch: async (input, init) => {
    calls.push({ input, init });
    return response(200, { id: "email-1" });
  } });
  const result = await provider.submit({
    body: "Plain text", idempotencyKey: "outreach-email/message-1", recipientEmail: "ada@example.test",
    scheduledAt: "2026-09-09T13:00:00.000Z", sender: "Almaworks <team@example.test>", subject: "Hello",
  });
  assert.deepEqual(result, { kind: "accepted", providerId: "email-1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.init?.headers instanceof Headers ? calls[0].init.headers.get("Idempotency-Key") : (calls[0]?.init?.headers as Record<string, string>)["Idempotency-Key"], "outreach-email/message-1");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { from: "Almaworks <team@example.test>", to: ["ada@example.test"], subject: "Hello", text: "Plain text", scheduled_at: "2026-09-09T13:00:00.000Z" });
});

test("provider distinguishes definitive rejection, idempotency conflict, and ambiguous outcomes", async () => {
  const submit = { body: "Body", idempotencyKey: "key", recipientEmail: "ada@example.test", scheduledAt: null, sender: "team@example.test", subject: "Hi" };
  const rejected = createResendProvider({ apiKey: "secret", fetch: async () => response(422, { message: "Invalid from" }) });
  assert.deepEqual(await rejected.submit(submit), { kind: "rejected", message: "Invalid from" });
  const conflict = createResendProvider({ apiKey: "secret", fetch: async () => response(409, { message: "Concurrent request" }) });
  assert.deepEqual(await conflict.submit(submit), { kind: "ambiguous", message: "Concurrent request" });
  const timeout = createResendProvider({ apiKey: "secret", fetch: async () => { throw new TypeError("network failed"); } });
  assert.deepEqual(await timeout.submit(submit), { kind: "ambiguous", message: "The provider result is unknown." });
});

test("retrieve and cancel use the stored provider identifier", async () => {
  const paths: string[] = [];
  const provider = createResendProvider({ apiKey: "secret", fetch: async (input) => {
    paths.push(String(input));
    return paths.length === 1
      ? response(200, { id: "email-1", last_event: "delivered" })
      : response(200, { id: "email-1", object: "email" });
  } });
  assert.deepEqual(await provider.retrieve("email-1"), { kind: "found", providerId: "email-1", providerStatus: "delivered" });
  assert.deepEqual(await provider.cancel("email-1"), { kind: "cancelled", providerId: "email-1" });
  assert.deepEqual(paths, ["https://api.resend.com/emails/email-1", "https://api.resend.com/emails/email-1/cancel"]);
});

test("a timed-out provider call and mismatched cancellation identifier stay ambiguous", async () => {
  const timedOut = createResendProvider({ apiKey: "secret", timeoutMilliseconds: 1, fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
    const keeper = setTimeout(() => reject(new Error("test timeout")), 50);
    init?.signal?.addEventListener("abort", () => { clearTimeout(keeper); reject(new Error("aborted")); });
  }) });
  assert.deepEqual(await timedOut.submit({ body: "Body", idempotencyKey: "key", recipientEmail: "ada@example.test", scheduledAt: null, sender: "team@example.test", subject: "Hi" }), { kind: "ambiguous", message: "The provider result is unknown." });
  const mismatch = createResendProvider({ apiKey: "secret", fetch: async () => response(200, { id: "email-other", object: "email" }) });
  assert.deepEqual(await mismatch.cancel("email-1"), { kind: "ambiguous", message: "The provider returned a different email identifier." });
});
