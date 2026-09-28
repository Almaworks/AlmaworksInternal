import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "../../app/dashboard/layout.tsx"), "utf8");

test("authorized admins can switch View as roles from the mobile dashboard menu", () => {
  const mobileNavigation = source.match(/<nav className=\{`\$\{mobileNavOpen[\s\S]*?<\/nav>/u)?.[0] ?? "";

  assert.match(mobileNavigation, /\{canManageAdmin && \([\s\S]*?<AdminViewAsControl/u);
  assert.match(mobileNavigation, /onChange=\{handleMobileViewChange\}/u);
  assert.match(source, /function handleMobileViewChange\(next: AdminView\) \{[\s\S]*?setMobileNavOpen\(false\)[\s\S]*?handleViewChange\(next\)/u);
});

test("the Semesters item remains conditioned on Super Admin access", () => {
  assert.match(source, /\.\.\.\(isSuperAdmin \? \[\{ href: '\/dashboard\/admin\/semesters', label: 'Semesters' \}\] : \[\]\)/u);
});

test("the admin sidebar gives access, members, and startups dedicated modules", () => {
  assert.match(source, /href: '\/dashboard\/admin\/access', label: 'Access'/u);
  assert.match(source, /href: '\/dashboard\/admin\/members', label: 'Members'/u);
  assert.match(source, /href: '\/dashboard\/admin\/startups', label: 'Startups'/u);
});
