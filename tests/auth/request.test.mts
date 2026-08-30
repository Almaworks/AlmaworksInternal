import assert from "node:assert/strict";
import test from "node:test";

import { readBearerToken } from "../../src/auth/request.ts";

test("bearer parser accepts a trimmed case-insensitive scheme", () => {
  assert.equal(readBearerToken("Bearer abc.def"), "abc.def");
  assert.equal(readBearerToken("bearer   token-value  "), "token-value");
});

test("bearer parser rejects missing and malformed credentials", () => {
  assert.equal(readBearerToken(null), null);
  assert.equal(readBearerToken("Basic abc"), null);
  assert.equal(readBearerToken("Bearer"), null);
  assert.equal(readBearerToken("Bearer one two"), null);
});
