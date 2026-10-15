import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import type { ReactElement, ReactNode } from "react";
import ts from "typescript";

type Props = Record<string, unknown> & { children?: ReactNode };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  const element = node as ReactElement<Props>;
  return [element, ...elements(element.props.children)];
}

// Execute the shared mentoring-hours editor and replace only React's lifecycle,
// so completed calendar gestures can be replayed without a browser.
const fixture = { timeZone: "America/New_York", programTimeZone: "America/New_York", semesterStart: "2026-09-01", semesterEnd: "2026-12-20", from: "2026-10-14T00:00:00Z", until: "2026-12-21T00:00:00Z", offered: [], busy: [], bookings: [], mode: "weekly", syncUnavailable: false, lastSuccessAt: null };
function scheduleHarness(saveFailure = false) {
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  const pendingEffects: (() => void)[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let settingsReads = 0; let posts = 0;
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  function load(filename: string): Record<string, unknown> {
    if (cache.has(filename)) return cache.get(filename)!.exports;
    const loaded = { exports: {} as Record<string, unknown> };
    cache.set(filename, loaded);
    const nativeRequire = createRequire(filename);
    function requireLocal(name: string): unknown {
      if (name === "react") return {
        ...nativeRequire("react"),
        useState(initial: unknown) {
          const index = stateIndex++;
          if (!(index in states)) states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
          return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(states[index]) : next; }];
        },
        useRef(initial: unknown) { const index = refIndex++; return refs[index] ??= { current: initial }; },
        useMemo: (factory: () => unknown) => factory(),
        useCallback: (callback: unknown) => callback,
        useEffect(run: () => void | (() => void), deps: unknown[]) {
          const index = effectIndex++;
          const prior = effects[index];
          if (prior && deps.length === prior.deps.length && deps.every((value, dependencyIndex) => Object.is(value, prior.deps[dependencyIndex]))) return;
          pendingEffects.push(() => { prior?.cleanup?.(); effects[index] = { deps, cleanup: run() ?? undefined }; });
        },
      };
      if (name === "@/src/auth/authenticated-fetch") return { authenticatedFetch: async (_url: string, init?: RequestInit) => { if (init?.method === "POST") { posts += 1; return Response.json({ error: "The calendar changed. Your draft was not saved." }, { status: 409 }); } settingsReads += 1; return Response.json(fixture); } };
      if (name === "@/src/calendar/sync-status") return { requestCalendarSync: () => assert.fail("Editing availability must not request a calendar sync") };
      if (name.endsWith(".module.css")) return new Proxy({}, { get: (_target, key) => String(key) });
      if (!name.startsWith(".") && !name.startsWith("@/")) return nativeRequire(name);
      const base = name.startsWith("@/") ? path.resolve(name.slice(2)) : path.resolve(path.dirname(filename), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      assert.ok(resolved, `Cannot resolve ${name}`);
      return load(resolved);
    }
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", compiled)(requireLocal, loaded, loaded.exports);
    return loaded.exports;
  }
  const Settings = load(path.resolve("components/calendar/DatedAvailabilityCalendar.tsx")).DatedAvailabilityCalendar as (props: Props) => ReactElement<Props>;
  return {
    render() { stateIndex = 0; refIndex = 0; effectIndex = 0; return Settings({ semesterId: "test-semester", refreshKey: 0, previewData: saveFailure ? undefined : fixture }); },
    flushEffects() { pendingEffects.splice(0).forEach((run) => run()); },
    settingsReads: () => settingsReads, posts: () => posts,
  };
}

test("date-only gestures and explicit copies retain drafts across week navigation without network reads", () => {
  const harness = scheduleHarness();
  let tree = harness.render(); harness.flushEffects();
  const text = (node: ReactNode): string => typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" && "props" in node ? text((node as ReactElement<Props>).props.children) : "";
  const render = () => { tree = harness.render(); harness.flushEffects(); };
  const button = (name: string) => { const found = elements(tree).find(item => item.type === "button" && text(item) === name); assert.ok(found, name); return found; };
  const click = (name: string) => { (button(name).props.onClick as () => void)(); render(); };
  const cell = elements(tree).find(item => item.type === "button" && item.props["data-date"] === "2026-10-15" && item.props["data-minute"] === 540); assert.ok(cell);
  (cell.props.onPointerDown as (e: unknown) => void)({button:0,preventDefault(){},pointerId:1,currentTarget:{setPointerCapture(){}}});
  render();
  const grid = elements(tree).find(item => typeof item.props.onPointerUp === "function"); assert.ok(grid);
  (grid.props.onPointerUp as () => void)(); render();
  assert.match(text(tree), /1 time slots changed/);
  click("Copy to other dates…");
  const target = elements(tree).find(item => item.type === "button" && item.props["aria-label"] === "Fri, Oct 16: Available for a copy"); assert.ok(target);
  (target.props.onClick as () => void)(); render(); click("Add to 1 date");
  assert.match(text(tree), /2 time slots changed/);
  const next = elements(tree).find(item => item.props["aria-label"] === "Next week"); assert.ok(next);
  (next.props.onClick as () => void)(); render();
  assert.match(text(tree), /2 time slots changed/);
  click("Review & save");
  assert.match(text(tree), /Add: Thu, Oct 15, 9:00 AM–9:15 AM/);
  assert.match(text(tree), /Add: Fri, Oct 16, 9:00 AM–9:15 AM/);
  assert.doesNotMatch(text(tree), /Add: Thu, Oct 22/);
  assert.equal(harness.settingsReads(),0);
  click("Save preview availability");
  assert.match(text(tree), /No unsaved changes/);
});
test("failed atomic save retains the draft and prevents duplicate concurrent submissions", async () => {
 const harness = scheduleHarness(true);
 let tree = harness.render(); harness.flushEffects();
 await new Promise<void>(resolve => setImmediate(resolve));
 tree = harness.render(); harness.flushEffects();
 const text = (node: ReactNode): string => typeof node === "string" || typeof node === "number" ? String(node) : Array.isArray(node) ? node.map(text).join("") : node && typeof node === "object" && "props" in node ? text((node as ReactElement<Props>).props.children) : "";
 const render = () => { tree = harness.render(); harness.flushEffects(); };
 const button = (name: string) => { const found = elements(tree).find(item => item.type === "button" && text(item) === name); assert.ok(found, name); return found; };
 const cell = elements(tree).find(item => item.type === "button" && item.props["data-date"] === "2026-10-15" && item.props["data-minute"] === 540); assert.ok(cell);
 (cell.props.onPointerDown as (e: unknown) => void)({button:0,preventDefault(){},pointerId:1,currentTarget:{setPointerCapture(){}}}); render();
 const grid = elements(tree).find(item => typeof item.props.onPointerUp === "function"); assert.ok(grid);
 (grid.props.onPointerUp as () => void)(); render();
 (button("Keep editing").props.onClick as () => void)(); render();
 (button("Review & save").props.onClick as () => void)(); render();
 const save = button("Save availability").props.onClick as () => void;
 save(); save();
 await new Promise<void>(resolve => setImmediate(resolve)); render();
 assert.equal(harness.posts(),1);
 assert.match(text(tree), /1 time slots changed/);
 assert.match(text(tree), /Your draft was not saved/);
 assert.doesNotMatch(text(tree), /Availability saved for the dates/);
});