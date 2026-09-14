import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(resolve(import.meta.dirname, "../app/dashboard/layout.tsx"), "utf8");

test("every dashboard navigation label maps to a unique icon", () => {
  const iconMap = source.match(/const navIcons = \{([\s\S]*?)\n  \} as const/u)?.[1] ?? "";
  const entries = [...iconMap.matchAll(/^    (?:'([^']+)'|(\w+)): (\w+),$/gmu)]
    .map(([, quotedLabel, label, icon]) => [quotedLabel ?? label, icon] as const);

  assert.equal(entries.length, 13);
  assert.equal(new Set(entries.map(([, icon]) => icon)).size, entries.length);
});

test("participant navigation assigns a distinct icon to each available tab", () => {
  const participantSource = readFileSync(resolve(import.meta.dirname, "../app/dashboard/participant/ParticipantDashboard.tsx"), "utf8");
  const tabBlock = participantSource.match(/const baseTabs = \[([\s\S]*?)\n\];/u)?.[1] ?? "";
  const icons = [...tabBlock.matchAll(/icon: (\w+)/gu)].map(([, icon]) => icon);

  assert.equal(icons.length, 7);
  assert.equal(new Set(icons).size, icons.length);
});
