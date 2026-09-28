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
function scheduleHarness() {
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const effects: { deps: unknown[]; cleanup?: () => void }[] = [];
  const pendingEffects: (() => void)[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let settingsReads = 0;
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
      if (name === "@/src/auth/authenticated-fetch") return { authenticatedFetch: async () => { settingsReads += 1; return Response.json({ mode: "weekly", timeZone: "America/New_York", connectionId: null, workingHours: [] }); } };
      if (name === "@/src/calendar/sync-status") return { requestCalendarSync: () => assert.fail("Editing availability must not request a calendar sync") };
      if (name === "./IntegratedAvailabilityCalendar") return { IntegratedAvailabilityCalendar: () => null };
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
  const Settings = load(path.resolve("components/calendar/MentorCalendarSettings.tsx")).MentorCalendarSettings as (props: Props) => ReactElement<Props>;
  return {
    render() { stateIndex = 0; refIndex = 0; effectIndex = 0; return Settings({ semesterId: "test-semester", connectionId: null }); },
    flushEffects() { pendingEffects.splice(0).forEach((run) => run()); },
    settingsReads: () => settingsReads,
  };
}

test("finishing consecutive shared-calendar gestures retains drafts without refreshing settings or expanding booking windows", async () => {
  const harness = scheduleHarness();
  let tree = harness.render();
  harness.flushEffects();
  await new Promise<void>((resolve) => setImmediate(resolve));
  tree = harness.render();
  harness.flushEffects();
  assert.equal(harness.settingsReads(), 1, "the editor reads settings once before changes");
  const originalDateTimeFormat = Intl.DateTimeFormat;
  let formatters = 0;
  Intl.DateTimeFormat = new Proxy(originalDateTimeFormat, {
    construct(target, args) { formatters += 1; return Reflect.construct(target, args); },
  });
  try {
  for (const workingHours of [
    [{ weekday: 1, startsAt: "09:00", endsAt: "10:00" }],
    [{ weekday: 1, startsAt: "09:00", endsAt: "09:30" }],
    [],
  ]) {
      const calendar = elements(tree).find((element) => typeof element.props.onWorkingHoursChange === "function");
      assert.ok(calendar);
      (calendar.props.onWorkingHoursChange as (hours: unknown) => void)(workingHours);
      tree = harness.render();
      harness.flushEffects();
      await new Promise<void>((resolve) => setImmediate(resolve));
      tree = harness.render();
      harness.flushEffects();
      const updated = elements(tree).find((element) => typeof element.props.onWorkingHoursChange === "function");
      assert.deepEqual(updated!.props.workingHours, workingHours);
      assert.ok(elements(tree).some((element) => element.type === "button" && element.props.children === "Save mentoring hours"));
      assert.equal(harness.settingsReads(), 1, "editing availability must not re-read settings");
      assert.equal(formatters, 0, "editing availability must not expand semester booking windows");
  }
  } finally { Intl.DateTimeFormat = originalDateTimeFormat; }
});
