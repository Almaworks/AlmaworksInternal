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

// Execute the real workspace and its selection utilities; replace only React's
// lifecycle so a completed calendar gesture can be replayed without a browser.
function workspaceHarness() {
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  let stateIndex = 0;
  let refIndex = 0;
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
        useEffect: () => {},
      };
      if (name === "@/src/auth/authenticated-fetch") return { authenticatedFetch: () => assert.fail("Editing availability must not make a request") };
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
  const Workspace = load(path.resolve("components/mentor-booking/MentorBookingWorkspace.tsx")).default as (props: Props) => ReactElement<Props>;
  const previewData = {
    semesterId: "test-semester", semesterStartDate: "2026-09-01", semesterEndDate: "2026-12-31",
    timeZone: "America/New_York", viewer: { role: "mentor", profileId: "mentor", mentorSemesterId: "mentor-semester" },
    windows: [], history: [], availability: [],
  };
  return { render() { stateIndex = 0; refIndex = 0; return Workspace({ semesterId: previewData.semesterId, previewData }); } };
}

test("finishing consecutive availability gestures never expands semester booking windows", () => {
  const harness = workspaceHarness();
  let tree = harness.render();
  const original = Intl.DateTimeFormat;
  let formatters = 0;
  Intl.DateTimeFormat = new Proxy(original, {
    construct(target, args) {
      formatters += 1;
      assert.ok(formatters <= 100, "A gesture triggered expensive semester timezone expansion");
      return Reflect.construct(target, args);
    },
  });
  try {
    for (const monday of [["09:00", "09:15", "09:30", "09:45"], ["09:00", "09:15"], []]) {
      const calendar = elements(tree).find((element) => typeof element.props.onBlocks === "function");
      assert.ok(calendar);
      (calendar.props.onBlocks as (blocks: unknown) => void)({ monday, tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });
      formatters = 0;
      tree = harness.render();
      const updated = elements(tree).find((element) => typeof element.props.onBlocks === "function");
      assert.deepEqual((updated!.props.selectedBlocks as { monday: string[] }).monday, monday);
      assert.ok(elements(tree).some((element) => element.type === "button" && element.props.children === "Save weekly availability"));
    }
  } finally { Intl.DateTimeFormat = original; }
});
