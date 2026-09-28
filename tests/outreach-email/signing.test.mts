import assert from "node:assert/strict";
import test from "node:test";

import { createOutreachEmailSigner } from "../../src/outreach-email/signing.ts";

const keyring = { currentKeyId: "2026-09", keys: { "2026-08": "old-secret-material-at-least-32-bytes", "2026-09": "current-secret-material-at-least-32-bytes" } };

test("snapshot signatures are deterministic, rotate safely, and reject mutation", () => {
  const signer = createOutreachEmailSigner(keyring);
  const snapshot = {
    version: 1 as const, messageId: "m1", semesterId: "s1", opportunityId: "o1", contactId: "c1",
    recipientEmail: "ada@example.test", recipientName: "Ada", sender: "Almaworks <team@example.test>",
    subject: "Hello", body: "Plain text", scheduledAt: null, idempotencyKey: "key", createdAt: "2026-09-08T12:00:00Z",
    idempotencyExpiresAt: "2026-09-09T12:00:00Z",
  };
  const signed = signer.signSnapshot(snapshot);
  assert.deepEqual(signer.verifySnapshot(snapshot, signed), { ok: true, digest: signed.digest });
  assert.equal(signer.verifySnapshot({ ...snapshot, recipientEmail: "mallory@example.test" }, signed).ok, false);
  assert.equal(createOutreachEmailSigner({ currentKeyId: "next", keys: { next: "new-secret-material-at-least-32-bytes", "2026-09": "current-secret-material-at-least-32-bytes" } }).verifySnapshot(snapshot, signed).ok, true);
  assert.equal(signer.verifySnapshot({ ...snapshot, createdAt: "2026-09-08 08:00:00-04", idempotencyExpiresAt: "2026-09-09 08:00:00-04" }, signed).ok, true);
});

test("weak signing key material fails closed", () => {
  assert.throws(() => createOutreachEmailSigner({ currentKeyId: "weak", keys: { weak: "short" } }), /at least 32 bytes/u);
});

test("provider receipts bind provider state to the signed snapshot", () => {
  const signer = createOutreachEmailSigner(keyring);
  const receipt = {
    version: 1 as const, messageId: "m1", semesterId: "s1", snapshotDigest: "abc", providerId: "email-1",
    providerStatus: "sent", messageStatus: "sent", checkedAt: "2026-09-08T12:05:00Z", sentAt: "2026-09-08T12:04:00Z", deliveredAt: null, lastError: null,
  };
  const signed = signer.signReceipt(receipt);
  assert.equal(signer.verifyReceipt(receipt, signed), true);
  assert.equal(signer.verifyReceipt({ ...receipt, providerId: "email-2" }, signed), false);
  assert.equal(signer.verifyReceipt({ ...receipt, snapshotDigest: "other" }, signed), false);
  assert.equal(signer.verifyReceipt({ ...receipt, checkedAt: "2026-09-08 08:05:00-04", sentAt: "2026-09-08T12:04:00.000000+00:00" }, signed), true);
});
