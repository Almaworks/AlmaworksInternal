import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

function dashboardHarness() {
  const states: unknown[] = [];
  const effects: Array<() => void | (() => void)> = [];
  const requests: Array<{ signal: AbortSignal; finish: (response: Response) => void }> = [];
  const require = createRequire(import.meta.url);
  const hooks = {
    useState: (initial: unknown) => {
      const index = states.length;
      states.push(typeof initial === "function" ? initial() : initial);
      return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useRef: (current: unknown) => ({ current }),
    useMemo: (run: () => unknown) => run(),
    useCallback: (callback: unknown) => callback,
    useEffect: (run: () => void | (() => void)) => { effects.push(run); },
    useTransition: () => [false, (run: () => void) => run()],
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../../app/dashboard/participant/ParticipantDashboard.tsx", import.meta.url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  });
  const exports = {} as { default: (props: { expectedRole: string }) => { props: { retry: () => void } } };
  new Function("require", "exports", compiled.outputText)((name: string) => {
    if (name === "react") return hooks;
    if (name === "next/navigation") return { useRouter: () => ({}), usePathname: () => "/dashboard/mentor", useSearchParams: () => new URLSearchParams() };
    if (name === "@/src/auth/authenticated-fetch") return { authenticatedFetch: (_url: string, init: { signal: AbortSignal }) => new Promise<Response>((finish) => { requests.push({ signal: init.signal, finish }); }) };
    if (name === "@/src/dashboard/participant-preview") return { resolveAdminViewTransition: () => ({ loading: false }) };
    if (name.startsWith("@/") || name === "./StartupsDirectory") return {};
    return require(name);
  }, exports);
  const view = exports.default({ expectedRole: "mentor" });
  const cleanups = effects.map((effect) => effect());
  return { states, requests, retry: view.props.retry, unmount: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("participant reads abort on unmount and late responses cannot repopulate private state", async () => {
  const app = dashboardHarness();
  assert.equal(app.requests.length, 1);
  app.unmount();
  assert.equal(app.requests[0].signal.aborted, true);
  app.requests[0].finish(Response.json({ data: { state: "unavailable" } }));
  await settle();
  assert.equal(app.states[1], null, "result remains empty after unmount");
  assert.equal(app.states[2], null, "aborted reads do not show an error");
});

test("a late failure from an older participant refresh cannot replace a newer success", async () => {
  const app = dashboardHarness();
  app.retry();
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[0].signal.aborted, true);
  app.requests[1].finish(Response.json({ data: { state: "unavailable" } }));
  await settle();
  app.requests[0].finish(Response.json({ error: "Stale request failure" }, { status: 500 }));
  await settle();
  assert.deepEqual(app.states[1], { state: "unavailable" });
  assert.equal(app.states[2], null);
  app.unmount();
});
