import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("participant dashboard imports every Next navigation hook it invokes", async () => {
  const source = await readFile(new URL("../../app/dashboard/participant/ParticipantDashboard.tsx", import.meta.url), "utf8");
  const importEnd = source.indexOf('from "next/navigation";');
  const navigationImport = source.slice(source.lastIndexOf("import ", importEnd), importEnd);

  assert.match(navigationImport, /\buseSearchParams\b/u);
});
