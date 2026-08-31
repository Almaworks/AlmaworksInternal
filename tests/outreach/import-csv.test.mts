import assert from "node:assert/strict";
import test from "node:test";

import * as outreachImport from "../../src/outreach/import.ts";

type ParseOutreachCsv = (text: string) => readonly Record<string, string>[];

function parser(): ParseOutreachCsv {
  const candidate = (outreachImport as unknown as { parseOutreachCsv?: ParseOutreachCsv }).parseOutreachCsv;
  if (candidate === undefined) throw new Error("parseOutreachCsv must be implemented");
  return candidate;
}

test("CSV import preserves quoted commas and normalized headers", () => {
  const rows = parser()([
    " Name ,Company,Notes",
    '"Ada Lovelace","Analytical Engines, Inc.","Interested, follow up"',
  ].join("\n"));

  assert.deepEqual(rows, [{
    name: "Ada Lovelace",
    company: "Analytical Engines, Inc.",
    notes: "Interested, follow up",
  }]);
});

test("CSV import rejects files above the review limit instead of truncating", () => {
  const csv = [
    "name,email",
    ...Array.from({ length: 251 }, (_, index) => `Contact ${index},contact${index}@example.com`),
  ].join("\n");

  assert.throws(() => parser()(csv), /250 rows/i);
});
