import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("participant dashboard derives its active module from URL changes and writes in-dashboard navigation back to the URL", async () => {
  const source = await readFile(new URL("../../app/dashboard/participant/ParticipantDashboard.tsx", import.meta.url), "utf8");

  assert.match(source, /function resolveParticipantTab\(/u);
  assert.match(source, /const requestedTab = useMemo\(\(\) => resolveParticipantTab\(searchParams\.get\("tab"\), expectedRole\)/u);
  assert.match(source, /useEffect\(\(\) => \{ setTab\(requestedTab\); \}, \[requestedTab\]\)/u);
  assert.match(source, /window\.history\.pushState\(null, "", participantTabDestination\(pathname, searchParams, next\)\)/u);
});
