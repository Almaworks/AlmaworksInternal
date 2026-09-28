import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

type Effect = { deps: readonly unknown[] | undefined; cleanup?: () => void };
type Request = { signal: AbortSignal | undefined; finish: (response: Response) => void };
type WorkspaceProps = { semesterId: string | null; previewData?: object };

function sameDependencies(previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined) {
  return previous !== undefined && next !== undefined
    && previous.length === next.length
    && previous.every((value, index) => Object.is(value, next[index]));
}

function bookingHarness(initialProps: WorkspaceProps) {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const callbacks: Array<{ deps: readonly unknown[]; value: unknown }> = [];
  const effects: Effect[] = [];
  const requests: Request[] = [];
  const require = createRequire(import.meta.url);
  let hookIndex = 0;
  let refIndex = 0;
  let callbackIndex = 0;
  let effectIndex = 0;
  let pendingEffects: Array<() => void> = [];

  const hooks = {
    useState(initial: unknown) {
      const index = hookIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(states[index]) : next; }];
    },
    useRef(current: unknown) {
      const index = refIndex++;
      refs[index] ??= { current };
      return refs[index];
    },
    useMemo(run: () => unknown) { return run(); },
    useCallback(value: unknown, deps: readonly unknown[]) {
      const index = callbackIndex++;
      const previous = callbacks[index];
      if (!previous || !sameDependencies(previous.deps, deps)) callbacks[index] = { deps, value };
      return callbacks[index].value;
    },
    useEffect(run: () => void | (() => void), deps?: readonly unknown[]) {
      const index = effectIndex++;
      if (index !== 0) return;
      const previous = effects[index];
      if (previous && sameDependencies(previous.deps, deps)) return;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        const cleanup = run();
        effects[index] = { deps, cleanup: cleanup ?? undefined };
      });
    },
    useImperativeHandle() {},
    forwardRef(render: unknown) { return render; },
  };

  const compiled = ts.transpileModule(readFileSync(new URL("../../components/mentor-booking/MentorBookingWorkspace.tsx", import.meta.url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  });
  const exports = {} as { default: (props: WorkspaceProps) => unknown };
  new Function("require", "exports", compiled.outputText)((name: string) => {
    if (name === "react") return hooks;
    if (name === "lucide-react") return { CalendarClock: () => null, Check: () => null };
    if (name === "@/src/auth/authenticated-fetch") {
      return { authenticatedFetch: (_url: string, init?: RequestInit) => new Promise<Response>((finish) => { requests.push({ signal: init?.signal ?? undefined, finish }); }) };
    }
    if (name === "./presentation") {
      return {
        bookingDateTime: () => "",
        formatAvailabilityTimeLabel: () => "",
        isMentorBookingResponse: (value: unknown) => typeof value === "object" && value !== null,
        isCurrentMentorBookingResponse: (semesterId: string, value: { semesterId?: string }) => value.semesterId === semesterId,
      };
    }
    if (name === "./BookingDetailsPanel") return { BookingDetailsPanel: () => null };
    if (name.startsWith("@/") || name === "./StartupAvailabilityBrowser") {
      return new Proxy({}, { get: () => () => null });
    }
    return require(name);
  }, exports);

  function render(props: WorkspaceProps) {
    hookIndex = 0;
    refIndex = 0;
    callbackIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    exports.default(props);
    for (const run of pendingEffects) run();
  }

  render(initialProps);
  return {
    requests,
    states,
    render,
    unmount() { for (const effect of effects) effect.cleanup?.(); },
  };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const workspace = (semesterId: string) => ({ semesterId });

test("a superseded booking read is aborted and its late success cannot replace the active semester", async () => {
  const app = bookingHarness({ semesterId: "fall-2026" });
  assert.equal(app.requests.length, 1);

  app.render({ semesterId: "spring-2027" });
  assert.equal(app.requests.length, 2);
  assert.equal(app.requests[0].signal?.aborted, true);

  app.requests[1].finish(Response.json(workspace("spring-2027")));
  await settle();
  app.requests[0].finish(Response.json(workspace("fall-2026")));
  await settle();

  assert.deepEqual(app.states[0], workspace("spring-2027"));
  assert.equal(app.states[2], null);
  app.unmount();
});

test("an obsolete booking completion does not end loading for the current semester", async () => {
  const app = bookingHarness({ semesterId: "fall-2026" });
  app.render({ semesterId: "spring-2027" });

  app.requests[0].finish(Response.json(workspace("fall-2026")));
  await settle();

  assert.equal(app.states[0], null);
  assert.equal(app.states[1], true);
  assert.equal(app.states[2], null);
  app.requests[1].finish(Response.json(workspace("spring-2027")));
  await settle();
  app.unmount();
});

test("booking reads abort on unmount and late failures cannot surface an error", async () => {
  const app = bookingHarness({ semesterId: "fall-2026" });
  assert.equal(app.requests.length, 1);

  app.unmount();
  assert.equal(app.requests[0].signal?.aborted, true);
  app.requests[0].finish(Response.json({ error: "Late failure" }, { status: 500 }));
  await settle();

  assert.equal(app.states[0], null);
  assert.equal(app.states[2], null);
});
