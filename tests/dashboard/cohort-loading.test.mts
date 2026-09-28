import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

type Controller = {
  currentMembers: { membershipId: string }[];
  loadError: string | null;
  loading: boolean;
  members: { membershipId: string }[];
  ready: boolean;
  reload: () => Promise<boolean>;
  scope: string;
};

type EffectSlot = {
  cleanup?: () => void;
  deps?: readonly unknown[];
  effect?: () => void | (() => void);
  pending: boolean;
};

type DeferredResponse = {
  reject: (cause: unknown) => void;
  resolve: (response: Response) => void;
  url: string;
};

const member = (semesterId: string) => ({
  membershipId: `membership-${semesterId}`,
  profileId: `profile-${semesterId}`,
  name: `Member ${semesterId}`,
  email: `${semesterId}@example.test`,
  role: "mentor",
  status: "active",
  readinessStatus: "ready",
  semesterId,
  semesterName: semesterId,
});

const response = (semesterId: string, currentId = semesterId) => ({
  cohorts: {
    current: { id: currentId, name: currentId },
    previous: null,
    all: [{ id: currentId, name: currentId }, ...(currentId === semesterId ? [] : [{ id: semesterId, name: semesterId }])],
  },
  members: [member(semesterId)],
});

function sameDeps(left: readonly unknown[] | undefined, right: readonly unknown[] | undefined) {
  return left !== undefined && right !== undefined
    && left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
}

function cohortHarness(activeSemesterResult: { data: { id: string } | null; error: { message: string } | null } = { data: null, error: null }) {
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  const memos: { deps?: readonly unknown[]; value: unknown }[] = [];
  const effects: EffectSlot[] = [];
  const requests: DeferredResponse[] = [];
  let stateIndex = 0;
  let refIndex = 0;
  let memoIndex = 0;
  let effectIndex = 0;
  let nextActiveSemesterResult = activeSemesterResult;
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
          return [states[index], (next: unknown) => {
            states[index] = typeof next === "function"
              ? (next as (value: unknown) => unknown)(states[index])
              : next;
          }];
        },
        useRef(initial: unknown) {
          const index = refIndex++;
          return refs[index] ??= { current: initial };
        },
        useMemo(factory: () => unknown, deps?: readonly unknown[]) {
          const index = memoIndex++;
          const prior = memos[index];
          if (!prior || !sameDeps(prior.deps, deps)) memos[index] = { deps, value: factory() };
          return memos[index].value;
        },
        useCallback(callback: unknown, deps?: readonly unknown[]) {
          const index = memoIndex++;
          const prior = memos[index];
          if (!prior || !sameDeps(prior.deps, deps)) memos[index] = { deps, value: callback };
          return memos[index].value;
        },
        useEffect(effect: () => void | (() => void), deps?: readonly unknown[]) {
          const index = effectIndex++;
          const prior = effects[index];
          effects[index] = {
            cleanup: prior?.cleanup,
            deps,
            effect,
            pending: !prior || !sameDeps(prior.deps, deps),
          };
        },
      };
      if (name === "@/utils/supabase/client") return {
        createClient: () => ({
          auth: { getSession: async () => ({ data: { session: { access_token: "cohort-loading-token" } }, error: null }) },
          from: (table: string) => {
            assert.equal(table, "semesters");
            const builder = {
              select: () => builder,
              eq: () => builder,
              maybeSingle: async () => nextActiveSemesterResult,
            };
            return builder;
          },
        }),
      };
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

  const componentModule = load(path.resolve("components/CohortScreenControls.tsx"));
  const renderCohortScreen = componentModule.useCohortScreen as (
    records: readonly unknown[], role: "all", preferredSemesterId?: string, enabled?: boolean,
  ) => Controller;
  (componentModule.invalidateCohortReads as () => void)();

  function render(preferredSemesterId?: string, enabled = true): Controller {
    stateIndex = 0;
    refIndex = 0;
    memoIndex = 0;
    effectIndex = 0;
    return renderCohortScreen([], "all", preferredSemesterId, enabled);
  }

  function commitEffects() {
    for (const slot of effects) {
      if (!slot.pending || !slot.effect) continue;
      slot.cleanup?.();
      const cleanup = slot.effect();
      slot.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      slot.pending = false;
    }
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => await new Promise<Response>((resolve, reject) => {
    requests.push({ url: String(input), resolve, reject });
  })) as typeof fetch;

  return {
    cleanup() {
      for (const effect of effects) effect.cleanup?.();
      globalThis.fetch = originalFetch;
    },
    commitEffects,
    reject(semesterId: string, cause: unknown) {
      const pending = requests.find((request) => request.url.includes(`semesterId=${semesterId}`));
      assert.ok(pending, `No pending request for ${semesterId}`);
      requests.splice(requests.indexOf(pending), 1);
      pending.reject(cause);
    },
    render,
    setActiveSemesterResult(result: { data: { id: string } | null; error: { message: string } | null }) {
      nextActiveSemesterResult = result;
    },
    resolve(semesterId: string, body = response(semesterId)) {
      const pending = requests.find((request) => request.url.includes(`semesterId=${semesterId}`));
      assert.ok(pending, `No pending request for ${semesterId}`);
      requests.splice(requests.indexOf(pending), 1);
      pending.resolve(Response.json(body));
    },
  };
}

async function flush() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test("a scope change clears prior members immediately and ignores an older response", async () => {
  const harness = cohortHarness();
  try {
    harness.render("semester-a");
    harness.commitEffects();
    await flush();
    harness.resolve("semester-a");
    await flush();
    let controller = harness.render("semester-a");
    assert.equal(controller.scope, "semester-a");
    assert.equal(controller.ready, true);
    assert.equal(controller.loading, false);
    assert.equal(controller.loadError, null);
    assert.deepEqual(controller.members.map((item) => item.membershipId), ["membership-semester-a"]);

    controller = harness.render("semester-b");
    assert.equal(controller.scope, "semester-b");
    assert.equal(controller.ready, false);
    assert.equal(controller.loading, true);
    assert.equal(controller.loadError, null);
    assert.deepEqual(controller.members, []);
    assert.deepEqual(controller.currentMembers, []);
    harness.commitEffects();
    await flush();
    controller = harness.render("semester-b");
    assert.equal(controller.scope, "semester-b");
    assert.equal(controller.ready, false);
    assert.equal(controller.loading, true);
    assert.deepEqual(controller.members, []);
    assert.deepEqual(controller.currentMembers, []);

    harness.render("semester-c");
    harness.commitEffects();
    await flush();
    harness.resolve("semester-c");
    await flush();
    harness.resolve("semester-b");
    await flush();
    controller = harness.render("semester-c");
    assert.equal(controller.scope, "semester-c");
    assert.equal(controller.ready, true);
    assert.equal(controller.loading, false);
    assert.equal(controller.loadError, null);
    assert.deepEqual(controller.members.map((item) => item.membershipId), ["membership-semester-c"]);
  } finally { harness.cleanup(); }
});

test("a failed scope read exposes an error without retaining prior-scope people", async () => {
  const harness = cohortHarness();
  try {
    harness.render("semester-a");
    harness.commitEffects();
    await flush();
    harness.resolve("semester-a");
    await flush();

    harness.render("semester-b");
    harness.commitEffects();
    await flush();
    harness.reject("semester-b", new Error("Cohort service unavailable"));
    await flush();

    const controller = harness.render("semester-b");
    assert.equal(controller.scope, "semester-b");
    assert.equal(controller.ready, false);
    assert.equal(controller.loading, false);
    assert.equal(controller.loadError, "Cohort service unavailable");
    assert.deepEqual(controller.members, []);
    assert.deepEqual(controller.currentMembers, []);
  } finally { harness.cleanup(); }
});

test("an active-semester lookup failure becomes a load error", async () => {
  const harness = cohortHarness({ data: null, error: { message: "Semester lookup denied" } });
  try {
    harness.render();
    harness.commitEffects();
    await flush();
    const controller = harness.render();
    assert.equal(controller.ready, false);
    assert.equal(controller.loading, false);
    assert.equal(controller.loadError, "Semester lookup denied");
    assert.deepEqual(controller.members, []);
    assert.deepEqual(controller.currentMembers, []);
  } finally { harness.cleanup(); }
});

test("reload retries active-semester discovery after its initial failure", async () => {
  const harness = cohortHarness({ data: null, error: { message: "Semester lookup denied" } });
  try {
    let controller = harness.render();
    harness.commitEffects();
    await flush();
    controller = harness.render();
    assert.equal(controller.loadError, "Semester lookup denied");

    harness.setActiveSemesterResult({ data: { id: "semester-a" }, error: null });
    const retry = controller.reload();
    await flush();
    harness.resolve("semester-a");
    assert.equal(await retry, true);
    controller = harness.render();
    assert.equal(controller.scope, "semester-a");
    assert.equal(controller.ready, true);
    assert.equal(controller.loadError, null);
    assert.deepEqual(controller.members.map((item) => item.membershipId), ["membership-semester-a"]);
  } finally { harness.cleanup(); }
});
