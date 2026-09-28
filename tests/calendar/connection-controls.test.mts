import assert from "node:assert/strict";
import test from "node:test";
import { readCalendarConnectionStatus } from "../../src/calendar/connection-status.ts";
import { startCalendarConnection, requestCalendarDisconnect } from "../../src/calendar/connection-client.ts";
import { ALMAWORKS_SUPABASE_URL } from "../../src/calendar/config.ts";
const environment = { url: ALMAWORKS_SUPABASE_URL, anonKey: "public" };
test("disconnect client sends the explicit retention choice and never treats a saved response as completed cleanup",async()=>{
  await requestCalendarDisconnect({semesterId:"semester",connectionId:"connection",keepManual:false,fetch:async(url,init)=>{
    assert.equal(url,"/api/calendar/disconnect");assert.equal(init?.method,"POST");assert.ok(init?.signal);
    assert.deepEqual(JSON.parse(String(init?.body)),{semesterId:"semester",connectionId:"connection",keepManual:false});
    return Response.json({queued:true},{status:202});
  }});
  await assert.rejects(requestCalendarDisconnect({semesterId:"semester",connectionId:"connection",keepManual:true,fetch:async()=>Response.json({saved:true})}));
});
test("status exposes only the authenticated owner's safe connection metadata", async () => {
  const result = await readCalendarConnectionStatus({ enabled: true, environment, profileId: "owner", token: "token", fetch: async input => {
    const request = input instanceof Request ? input : new Request(input);
    assert.equal(new URL(request.url).searchParams.get("profile_id"), "eq.owner");
    assert.equal(request.headers.get("authorization"), "Bearer token");
    return Response.json([{ id: "connection", account_email: "owner@example.test", status: "connected", disconnect_cleanup_incomplete:false, provider_subject: "private-subject" }]);
  } });
  assert.deepEqual(result, { enabled: true, connection: { id: "connection", accountEmail: "owner@example.test", status: "connected", cleanupIncomplete:false } });
});
test("disabled integration does not query undeployed Calendar tables", async () => {
  assert.deepEqual(await readCalendarConnectionStatus({ enabled: false, environment, profileId: "owner", token: "token", fetch: async () => { assert.fail(); } }), { enabled: false, connection: null });
});
test("provider outage retains the deployed availability editor and existing connection", async () => {
  const result = await readCalendarConnectionStatus({ enabled: false, availabilityEnabled: true, environment, profileId: "owner", token: "token", fetch: async () => Response.json([{id:"connection",account_email:"owner@example.test",status:"connected",disconnect_cleanup_incomplete:false}]) });
  assert.equal(result.enabled, false);
  assert.equal(result.availabilityEnabled, true);
  assert.equal(result.connection?.id, "connection");
});

test("disconnect status reports pending cleanup and an explicit incomplete-cleanup warning",async()=>{
  for(const status of ["disconnecting","disconnected"]){
    const result=await readCalendarConnectionStatus({enabled:true,environment,profileId:"owner",token:"token",fetch:async()=>Response.json([{id:"connection",account_email:"owner@example.test",status,disconnect_cleanup_incomplete:true}])});
    assert.equal(result.connection?.status,status);assert.equal(result.connection?.cleanupIncomplete,true);
  }
});
test("connection saves onboarding before navigation and refuses unsafe destinations", async () => {
  const calls: string[] = [];
  const dependencies = { semesterId: "semester", returnTo: "onboarding" as const, beforeConnect: async () => { calls.push("save"); return true; }, fetch: (async () => { calls.push("connect"); return Response.json({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=example" }); }) as typeof fetch };
  assert.match(await startCalendarConnection(dependencies), /^https:\/\/accounts.google.com\//);
  assert.deepEqual(calls, ["save", "connect"]);
  await assert.rejects(startCalendarConnection({ ...dependencies, fetch: async () => Response.json({ authorizationUrl: "https://evil.test/" }) }), /invalid/);
});
test("failed draft save leaves the participant on the current form", async () => {
  await assert.rejects(startCalendarConnection({ semesterId: "semester", returnTo: "onboarding", beforeConnect: async () => false, fetch: async () => { assert.fail(); } }), /Save your onboarding/);
});
