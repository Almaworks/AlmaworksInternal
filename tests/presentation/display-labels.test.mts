import assert from "node:assert/strict";
import test from "node:test";

import { formatEnumLabel, formatTimeZoneLabel } from "../../src/presentation/display-labels.ts";

test("formats persisted enum values into readable labels while preserving known acronyms", () => {
  assert.equal(formatEnumLabel("mvp"), "MVP");
  assert.equal(formatEnumLabel("conversation_scheduled"), "Conversation Scheduled");
  assert.equal(formatEnumLabel("in_person"), "In Person");
});

test("formats IANA timezone labels without exposing identifier underscores", () => {
  assert.equal(formatTimeZoneLabel("America/New_York"), "America/New York");
  assert.equal(formatTimeZoneLabel("Etc/GMT+5"), "Etc/GMT+5");
});
