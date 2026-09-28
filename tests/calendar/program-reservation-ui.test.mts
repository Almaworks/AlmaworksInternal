import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../../components/calendar/IntegratedAvailabilityCalendar.tsx", import.meta.url), "utf8");

test("mentor calendar distinguishes Friday Program time with an accessible cohort-timezone legend", () => {
  assert.match(source, /Friday Program reserved time/u);
  assert.match(source, /view\.timeZone/u);
  assert.match(source, /bg-amber-100/u);
});
