import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Compile real UI modules in memory; only CSS is substituted for this DOM-free render check.
const root = fileURLToPath(new URL("../../", import.meta.url));
const cache = new Map<string, { exports: Record<string, unknown> }>();
function load(filename: string): Record<string, unknown> {
  if (cache.has(filename)) return cache.get(filename)!.exports;
  const loadedModule = { exports: {} as Record<string, unknown> };
  cache.set(filename, loadedModule);
  const nativeRequire = createRequire(filename);
  const requireLocal = (name: string): unknown => {
    if (name.endsWith(".css")) return new Proxy({}, { get: (_target, key) => String(key) });
    if (!name.startsWith(".") && !name.startsWith("@/")) return nativeRequire(name);
    const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
    const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
    if (!resolved) throw new Error(`Cannot resolve ${name}`);
    return load(resolved);
  };
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", compiled)(requireLocal, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const { PeopleView } = load(path.join(root, "app/dashboard/admin/outreach/components/people-view.tsx")) as { PeopleView: typeof import("../../app/dashboard/admin/outreach/components/people-view").PeopleView };
const { QueueView } = load(path.join(root, "app/dashboard/admin/outreach/components/queue-view.tsx")) as { QueueView: typeof import("../../app/dashboard/admin/outreach/components/queue-view").QueueView };
const row = { id: "opportunity", contactId: "person", contactName: "Test Person", contactEmail: null, semesterId: "past", semesterName: "Spring", stage: "not_contacted", ownerProfileId: null, ownerName: null, ownerIsActive: false, nextFollowUpAt: null, snoozedUntil: null, isSilenced: false, latestInboundActivityAt: null, latestOutboundActivityAt: null };
const noop = () => {};

test("past-semester People exposes desktop and mobile selection with an initially disabled submit", () => {
  const markup = renderToStaticMarkup(createElement(PeopleView, { rows: [row], onOpen: noop, sourceSemesterId: "past", activeSemester: { id: "active", name: "Fall", isActive: true }, onViewActive: noop }));
  assert.equal((markup.match(/aria-label="Select Test Person"/g) ?? []).length, 2);
  assert.match(markup, /disabled="">Add to active semester/);
  assert.match(markup, /0 selected/);
});

test("active-semester People does not expose a carry-forward action", () => {
  const markup = renderToStaticMarkup(createElement(PeopleView, { rows: [{ ...row, semesterId: "active" }], onOpen: noop, sourceSemesterId: "active", activeSemester: { id: "active", name: "Fall", isActive: true }, onViewActive: noop }));
  assert.doesNotMatch(markup, /type="checkbox"|Add to active semester/);
});

test("selected state and disabled state reach both responsive checkbox controls", () => {
  const markup = renderToStaticMarkup(createElement(QueueView, { rows: [row], onOpen: noop, selection: { selectedIds: ["person"], onToggle: noop, isDisabled: () => true } }));
  assert.equal((markup.match(/checked=""/g) ?? []).length, 2);
  assert.equal((markup.match(/disabled=""/g) ?? []).length, 2);
  for (const button of markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)) assert.doesNotMatch(button[1], /<input/);
});
