import assert from "node:assert/strict";
import test from "node:test";
import { calendarSchedulerPlan, installCalendarScheduler } from "../../scripts/calendar-scheduler.mjs";

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://layjdjfvxkowxidwuvbs.supabase.co",
  CALENDAR_APP_ORIGIN: "https://almaworks.example",
  CALENDAR_AVAILABILITY_ENABLED: "true",
  SUPABASE_ACCESS_TOKEN: "dummy-management-credential",
};

test("scheduler rejects an unverified project or non-production destination before network access", async () => {
  for (const patch of [
    { NEXT_PUBLIC_SUPABASE_URL: "https://another.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_URL: undefined },
    { CALENDAR_APP_ORIGIN: "http://localhost:3000" },
    { CALENDAR_APP_ORIGIN: "https://user:pass@almaworks.example" },
    { CALENDAR_APP_ORIGIN: "https://almaworks.example/path" },
    { CALENDAR_AVAILABILITY_ENABLED: "false" },
  ]) {
    await assert.rejects(installCalendarScheduler({ env: { ...env, ...patch }, fetch: async () => assert.fail("must not contact network") }));
  }
});

test("Supabase worker target is pinned to the allowed project without a deployed frontend",()=>{
  const plan=calendarSchedulerPlan({...env,CALENDAR_APP_ORIGIN:'http://localhost:3000',CALENDAR_WORKER_TARGET:'supabase'});
  assert.equal(plan.origin,'https://layjdjfvxkowxidwuvbs.supabase.co');
  assert.ok(plan.command.includes('/functions/v1/calendar-worker'));
  assert.ok(!plan.command.includes('localhost'));
});
test("default plan makes no requests and contains no management or worker secrets", async () => {
  const result = await installCalendarScheduler({ env, fetch: async () => assert.fail("dry run must be offline") });
  assert.equal(result.applied, false);
  assert.equal(result.schedule, "*/5 * * * *");
  assert.equal(result.projectRef, "layjdjfvxkowxidwuvbs");
  assert.ok(!JSON.stringify(result).includes(env.SUPABASE_ACCESS_TOKEN));
  const plan = calendarSchedulerPlan(env);
  assert.ok(plan.command.includes("vault.decrypted_secrets"));
  assert.ok(plan.command.includes("almaworks_calendar_cron_secret"));
  assert.ok(plan.command.includes("timeout_milliseconds := 240000"));
});

test("failed prerequisite check prevents scheduler writes", async () => {
  let calls = 0;
  await assert.rejects(installCalendarScheduler({ env, apply: true, fetch: async () => {
    calls++;
    return Response.json([{ ready: false }]);
  } }), /prerequisites/);
  assert.equal(calls, 1);
});

test("installation uses only the allowed management endpoint and verifies the stored job", async () => {
  const calls: { query: string; read_only: boolean; parameters?: unknown[] }[] = [];
  const result = await installCalendarScheduler({ env, apply: true, fetch: async (url, init) => {
    assert.ok(init);
    assert.equal(url, "https://api.supabase.com/v1/projects/layjdjfvxkowxidwuvbs/database/query");
    assert.equal(init.redirect, "error");
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${env.SUPABASE_ACCESS_TOKEN}`);
    assert.ok(init.signal);
    calls.push(JSON.parse(String(init.body)));
    if (calls.length <= 2) return Response.json([{ ready: true }]);
    if (calls.length === 3) return Response.json([{ job_id: 42 }]);
    return Response.json([{ job_id: 42, active: true, matches: true }]);
  } });
  assert.equal(result.applied, true);
  assert.equal(result.jobId, 42);
  assert.deepEqual(calls.map(call => call.read_only), [true, false, false, false]);
  assert.ok(calls[2].query.includes("cron.schedule"));
  assert.ok(!JSON.stringify(calls).includes(env.SUPABASE_ACCESS_TOKEN));
});

test("missing Vault readiness and conflicting job both stop installation", async () => {
  for (const failureAt of [2, 3]) {
    let calls = 0;
    await assert.rejects(installCalendarScheduler({ env, apply: true, fetch: async () => {
      calls++;
      if (calls === failureAt) return Response.json(failureAt === 2 ? [{ ready: false }] : []);
      return Response.json([{ ready: true }]);
    } }));
    assert.equal(calls, failureAt);
  }
});

test("unknown installation outcome is not retried or reported as success, and provider errors are redacted", async () => {
  for (const failure of ["network", "http", "verification"]) {
    let calls = 0;
    await assert.rejects(installCalendarScheduler({ env, apply: true, fetch: async () => {
      calls++;
      if (calls <= 2) return Response.json([{ ready: true }]);
      if (failure === "network") throw new Error("dummy-management-credential");
      if (failure === "http") return new Response("dummy-management-credential", { status: 500 });
      if (calls === 3) return Response.json([{ job_id: 42 }]);
      return Response.json([{ job_id: 42, active: false, matches: false }]);
    } }), (error: Error) => {
      assert.ok(!error.message.includes("dummy-management-credential"));
      return true;
    });
    assert.equal(calls, failure === "verification" ? 4 : 3);
  }
});

