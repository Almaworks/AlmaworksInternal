import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("participant workspace gates span the shell and center their message", () => {
  assert.match(read("app/dashboard/participant/ParticipantDashboard.tsx"), /styles\.gateWorkspace/u);
  const styles = read("app/design-preview/participant-dashboard/participant-dashboard.module.css");
  assert.match(styles, /\.gateWorkspace \{ grid-column:1 \/ -1;/u);
  assert.match(styles, /\.gateContent \{[^}]*place-items:center;/u);
  assert.match(styles, /\.gateContent \.emptyState \{[^}]*display:flex; flex-direction:column; align-items:center;/u);
});
