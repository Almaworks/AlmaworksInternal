import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

import { selectBookingDeepLink } from "../../src/mentor-booking/booking-deep-link.ts";

type Element = { type: unknown; props: Record<string, unknown> };
type Semester = { id: string; name: string; is_active: boolean };

async function renderBookings(rows: Semester[]) {
  const states: unknown[] = [];
  const effects: Array<() => void> = [];
  let cursor = 0;
  const hooks = {
    Suspense: "suspense",
    useMemo: (run: () => unknown) => run(),
    useState: (initial: unknown) => {
      const index = cursor++;
      if (index >= states.length) states[index] = initial;
      return [states[index], (value: unknown) => { states[index] = value; }];
    },
    useEffect: (effect: () => void) => { effects.push(effect); },
  };
  const query = {
    select: () => query,
    order: () => query,
    then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null }),
  };
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync(new URL("../../app/dashboard/bookings/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  });
  const exports = {} as { default: () => Element };
  new Function("require", "exports", compiled.outputText)((name: string) => {
    if (name === "react") return hooks;
    if (name === "next/navigation") return { useSearchParams: () => new URLSearchParams() };
    if (name === "@/utils/supabase/client") return { createClient: () => ({ from: () => query }) };
    if (name === "@/components/DataLoading") return { DataLoading: "loading" };
    if (name === "@/components/mentor-booking/MentorBookingWorkspace") return { default: "booking-workspace" };
    if (name === "@/src/mentor-booking/booking-deep-link") return { selectBookingDeepLink };
    return require(name);
  }, exports);
  const content = exports.default().props.children as Element;
  const render = content.type as () => Element;
  const initial = render();
  effects.forEach((effect) => effect());
  await new Promise<void>((resolve) => setImmediate(resolve));
  cursor = 0;
  return { initial, ready: render() };
}

function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

const current = { id: "current", name: "Current", is_active: true };
const previous = { id: "previous", name: "Previous", is_active: false };

test("Booking picker disables inactive semesters rejected by the API", async () => {
  const { ready } = await renderBookings([previous, current]);
  const option = elements(ready).find((element) => element.type === "option" && element.props.value === previous.id);
  assert.equal(option?.props.disabled, true);
  const workspace = elements(ready).find((element) => element.props.semesterId === current.id);
  assert.ok(workspace, "active semester remains loadable");
});

test("Booking bootstrap never falls back to an inactive semester", async () => {
  const { ready } = await renderBookings([previous]);
  assert.equal(elements(ready).some((element) => element.props.semesterId === previous.id), false);
  assert.match(JSON.stringify(ready), /No active semester/);
});

test("Booking semester lookup keeps the initial loading gate", async () => {
  const { initial } = await renderBookings([current]);
  assert.ok(elements(initial).some((element) => element.props.label === "Loading booking semesters..."));
  assert.equal(elements(initial).some((element) => element.props.semesterId === current.id), false);
});
