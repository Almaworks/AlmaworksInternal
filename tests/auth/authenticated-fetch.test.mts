import assert from "node:assert/strict";
import test from "node:test";

test("authenticated fetch attaches the live session bearer token to assignment GET and POST requests", async () => {
  const subject = await import("../../src/auth/authenticated-fetch.ts").catch(() => null);
  assert.ok(subject, "the shared authenticated fetch boundary must exist");

  const requests: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
  const authenticatedFetch = subject.createAuthenticatedFetch(
    () => ({
      auth: {
        getSession: async () => ({
          data: { session: { access_token: "live-session-token" } },
          error: null,
        }),
      },
    }),
    async (input, init) => {
      requests.push({ input, init });
      return new Response(null, { status: 204 });
    },
  );

  await authenticatedFetch("/api/admin/assignments/candidates?semesterId=semester", {
    signal: new AbortController().signal,
  });
  await authenticatedFetch("/api/admin/assignments/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "retry-1" },
    body: "{}",
  });

  assert.equal(requests.length, 2);
  for (const request of requests) {
    const headers = new Headers(request.init?.headers);
    assert.equal(headers.get("authorization"), "Bearer live-session-token");
  }
  assert.equal(new Headers(requests[1]?.init?.headers).get("content-type"), "application/json");
  assert.equal(new Headers(requests[1]?.init?.headers).get("idempotency-key"), "retry-1");
});

test("authenticated fetch sends no request without a session and exposes no auth detail", async () => {
  const subject = await import("../../src/auth/authenticated-fetch.ts").catch(() => null);
  assert.ok(subject, "the shared authenticated fetch boundary must exist");

  let requestCount = 0;
  const authenticatedFetch = subject.createAuthenticatedFetch(
    () => ({
      auth: {
        getSession: async () => ({
          data: { session: null },
          error: { message: "refresh failed for leaked-token-value" },
        }),
      },
    }),
    async () => {
      requestCount += 1;
      return new Response(null, { status: 204 });
    },
  );

  await assert.rejects(
    authenticatedFetch("/api/admin/assignments/candidates"),
    (error: unknown) => error instanceof Error
      && error.message === "Your session has expired. Sign out and sign in again."
      && !error.message.includes("leaked-token-value"),
  );
  assert.equal(requestCount, 0);
});

test("authenticated fetch does not send a request if its caller aborts while the session loads", async () => {
  const subject = await import("../../src/auth/authenticated-fetch.ts");
  const controller = new AbortController();
  let finishSession: ((value: { data: { session: { access_token: string } }; error: null }) => void) | undefined;
  let requestCount = 0;
  const authenticatedFetch = subject.createAuthenticatedFetch(
    () => ({ auth: { getSession: () => new Promise((resolve) => { finishSession = resolve; }) } }),
    async () => { requestCount += 1; return new Response(null, { status: 204 }); },
  );

  const pending = authenticatedFetch("/api/mentor-booking", { signal: controller.signal });
  controller.abort();
  finishSession?.({ data: { session: { access_token: "old-token" } }, error: null });
  await assert.rejects(pending, (error: unknown) => error instanceof Error && error.name === "AbortError");
  assert.equal(requestCount, 0);
});
