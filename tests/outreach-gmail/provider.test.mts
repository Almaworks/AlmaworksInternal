import assert from "node:assert/strict";
import test from "node:test";

import { sendGmailMessage } from "../../src/outreach-gmail/provider.ts";

const message = {
  senderEmail: "sender@example.test",
  recipientEmail: "recipient@example.test",
  subject: "Mentor match — José",
  body: "Hello, Zoë 👋\nSecond line.",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("sendGmailMessage submits one base64url RFC 2822 plain-text message", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const result = await sendGmailMessage("access-token", message, {
    fetch: async (input, init) => {
      calls.push({ input, init });
      return jsonResponse(200, { id: "message-123", threadId: "thread-456" });
    },
  });

  assert.deepEqual(result, {
    kind: "accepted",
    messageId: "message-123",
    threadId: "thread-456",
  });
  assert.equal(calls.length, 1);
  assert.equal(String(calls[0]?.input), "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(calls[0]?.init?.headers, {
    Authorization: "Bearer access-token",
    "Content-Type": "application/json",
  });
  assert.ok(calls[0]?.init?.signal instanceof AbortSignal);

  const requestBody = JSON.parse(String(calls[0]?.init?.body)) as { raw?: unknown };
  assert.equal(typeof requestBody.raw, "string");
  assert.match(requestBody.raw as string, /^[A-Za-z0-9_-]+$/u);
  assert.doesNotMatch(requestBody.raw as string, /=/u);

  const mime = Buffer.from(requestBody.raw as string, "base64url").toString("utf8");
  assert.match(mime, /^From: sender@example\.test\r\nTo: recipient@example\.test\r\n/u);
  assert.match(mime, /\r\nSubject: =\?UTF-8\?B\?TWVudG9yIG1hdGNoIOKAlCBKb3PDqQ==\?=\r\n/u);
  assert.match(mime, /\r\nMIME-Version: 1\.0\r\nContent-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n/u);
  const encodedBody = mime.split("\r\n\r\n", 2)[1];
  assert.ok(encodedBody);
  assert.equal(Buffer.from(encodedBody.replaceAll("\r\n", ""), "base64").toString("utf8"), message.body);
});

test("sendGmailMessage rejects invalid or injected headers before calling Gmail", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    return jsonResponse(200, { id: "unexpected", threadId: "unexpected" });
  };
  const cases = [
    { ...message, senderEmail: "sender@example.test\r\nBcc: attacker@example.test" },
    { ...message, recipientEmail: "not-an-email" },
    { ...message, subject: "Hello\nBcc: attacker@example.test" },
    { ...message, subject: "" },
  ];

  for (const input of cases) {
    const result = await sendGmailMessage("access-token", input, { fetch: fetchImpl });
    assert.equal(result.kind, "rejected");
  }
  assert.equal(calls, 0);
});

test("sendGmailMessage classifies HTTP rejection without exposing provider details", async () => {
  const secretBody = "provider says access-token and private mailbox details";
  const result = await sendGmailMessage("access-token", message, {
    fetch: async () => new Response(secretBody, { status: 403 }),
  });

  assert.deepEqual(result, {
    kind: "rejected",
    message: "Gmail rejected the send request (HTTP 403).",
  });
  assert.doesNotMatch(JSON.stringify(result), /access-token|private mailbox/u);
});

test("sendGmailMessage treats server failures and malformed successes as uncertain", async () => {
  const serverFailure = await sendGmailMessage("access-token", message, {
    fetch: async () => new Response("private failure", { status: 503 }),
  });
  assert.deepEqual(serverFailure, {
    kind: "uncertain",
    message: "Gmail may have received the send request (HTTP 503). Check the mailbox before trying again.",
  });

  for (const body of [{}, { id: "message-123" }, { id: "", threadId: "thread-456" }]) {
    const malformed = await sendGmailMessage("access-token", message, {
      fetch: async () => jsonResponse(200, body),
    });
    assert.deepEqual(malformed, {
      kind: "uncertain",
      message: "Gmail returned an incomplete send result. Check the mailbox before trying again.",
    });
  }
});

test("sendGmailMessage makes one attempt and treats network or timeout failures as uncertain", async () => {
  let networkCalls = 0;
  const network = await sendGmailMessage("access-token", message, {
    fetch: async () => {
      networkCalls += 1;
      throw new TypeError("access-token leaked in transport error");
    },
  });
  assert.equal(networkCalls, 1);
  assert.deepEqual(network, {
    kind: "uncertain",
    message: "Gmail may have received the send request. Check the mailbox before trying again.",
  });

  let timeoutCalls = 0;
  const timedOut = await sendGmailMessage("access-token", message, {
    timeoutMilliseconds: 1,
    fetch: async (_input, init) => {
      timeoutCalls += 1;
      return await new Promise<Response>((_resolve, reject) => {
        const keeper = setTimeout(() => reject(new Error("test timeout did not abort")), 100);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(keeper);
          reject(new Error("aborted"));
        }, { once: true });
      });
    },
  });
  assert.equal(timeoutCalls, 1);
  assert.deepEqual(timedOut, {
    kind: "uncertain",
    message: "Gmail may have received the send request. Check the mailbox before trying again.",
  });
});

test("labeled links send multipart HTML plus a usable plain-text fallback", async () => {
  let mime = "";
  await sendGmailMessage("access-token", { ...message, body: 'Please fill out this [form](https://example.test/form?a=1&b=2).\n<script>alert(1)</script>' }, {
    fetch: async (_input, init) => {
      mime = Buffer.from(JSON.parse(String(init?.body)).raw, "base64url").toString("utf8");
      return jsonResponse(200, { id: "message-123", threadId: "thread-456" });
    },
  });
  assert.match(mime, /Content-Type: multipart\/alternative/u);
  const sections = mime.split("--almaworks_alternative");
  const plain = Buffer.from(sections[1].split("\r\n\r\n")[1].trim(), "base64").toString("utf8");
  const html = Buffer.from(sections[2].split("\r\n\r\n")[1].trim(), "base64").toString("utf8");
  assert.match(plain, /form \(https:\/\/example.test\/form\?a=1&b=2\)/u);
  assert.match(html, /<a href="https:\/\/example.test\/form\?a=1&amp;b=2">form<\/a>/u);
  assert.doesNotMatch(html, /<script>/u);
});
