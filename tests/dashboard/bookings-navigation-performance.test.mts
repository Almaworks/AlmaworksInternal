import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("participant sidebar links open the owned bookings tab without the generic redirect", async () => {
  const source = await readFile(new URL("../../app/dashboard/layout.tsx", import.meta.url), "utf8");
  assert.match(source, /href: '\/dashboard\/mentor\?tab=bookings', label: 'Bookings'/u);
  assert.match(source, /href: '\/dashboard\/startup\?tab=bookings', label: 'Bookings'/u);
});

test("generic booking redirects reuse the verified proxy identity before the page mounts", async () => {
  const source = await readFile(new URL("../../proxy.ts", import.meta.url), "utf8");
  assert.match(source, /pathname === '\/dashboard\/bookings' && \(profile\.role === 'mentor' \|\| profile\.role === 'startup'\)/u);
  assert.match(source, /destination\.searchParams\.set\('tab', 'bookings'\)/u);
});
