import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { decryptRefreshToken, encryptRefreshToken } from "../../src/calendar/token-crypto.ts";

test("refresh tokens round trip with distinct authenticated ciphertext", () => {
  const key = randomBytes(32);
  const context = { profileId: "profile-a", connectionId: "connection-a" };
  const first = encryptRefreshToken("refresh-secret", key, context);
  const second = encryptRefreshToken("refresh-secret", key, context);
  assert.notDeepEqual(first, second);
  assert.equal(decryptRefreshToken(first, key, context), "refresh-secret");
  assert.equal(JSON.stringify(first).includes("refresh-secret"), false);
});

test("wrong record context, key, or tampered ciphertext never decrypts", () => {
  const key = randomBytes(32);
  const context = { profileId: "profile-a", connectionId: "connection-a" };
  const encrypted = encryptRefreshToken("refresh-secret", key, context);
  assert.throws(() => decryptRefreshToken(encrypted, key, { ...context, connectionId: "connection-b" }));
  assert.throws(() => decryptRefreshToken(encrypted, randomBytes(32), context));
  assert.throws(() => decryptRefreshToken({ ...encrypted, ciphertext: encrypted.ciphertext.slice(0, -2) + "AA" }, key, context));
});
