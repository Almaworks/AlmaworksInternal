import assert from "node:assert/strict";
import test from "node:test";
import { handleCalendarSettingsCommand } from "../../src/calendar/settings-command.ts";
const semesterId = "00000000-0000-4000-8000-000000000001";
const body = { semesterId, mentorSemesterId:"victim", mode:"weekly",timeZone:"UTC",workingHours:[],connectionId:null };
const request = (value: unknown) => new Request("http://localhost:3000/api/calendar/settings", {method:"POST",body:JSON.stringify(value)});

test("explicit refresh processes the authorized mentor immediately after queuing", async () => {
  const calls: string[] = [];
  const deps = { enabled:true, authorize:async()=>({role:"mentor",mentorSemesterId:"owner"}),
    rpc:async()=>{calls.push("queued");return true;},
    sync:async(scope:{semesterId:string;mentorSemesterId:string})=>{assert.deepEqual(scope,{semesterId,mentorSemesterId:"owner"});calls.push("synced");return true;},
  };
  const response=await handleCalendarSettingsCommand(request({semesterId,mentorSemesterId:"victim"}),"sync",deps);
  assert.equal(response.status,202);
  assert.deepEqual(calls,["queued","synced"]);
});

test("failed immediate refresh reports failure without claiming completion", async () => {
  const deps={enabled:true,authorize:async()=>({role:"mentor",mentorSemesterId:"owner"}),rpc:async()=>true,sync:async()=>false};
  const response=await handleCalendarSettingsCommand(request({semesterId}),"sync",deps);
  assert.equal(response.status,503);
});

test("sync queues only the actual mentor and reports queued, never saved or completed", async () => {
  const response = await handleCalendarSettingsCommand(request({semesterId, mentorSemesterId:"someone-else"}), "sync", {
    enabled:true, authorize:async()=>({role:"mentor",mentorSemesterId:"owner"}),
    rpc:async(name,args)=>{assert.equal(name,"calendar_request_sync");assert.deepEqual(args,{p_semester_id:semesterId,p_mentor_semester_id:"owner"});return true;},
  });
  assert.equal(response.status,202);
  assert.deepEqual(await response.json(),{queued:true});
});

test("sync rejects non-mentors, missing jobs and malformed acknowledgements", async () => {
  const deps={enabled:true,authorize:async()=>({role:"mentor",mentorSemesterId:"owner"}),rpc:async()=>true};
  for(const role of ["startup","admin"]){
    assert.equal((await handleCalendarSettingsCommand(request({semesterId}),"sync",{...deps,authorize:async()=>({role,mentorSemesterId:"owner"}),rpc:async()=>assert.fail()})).status,403);
  }
  for(const result of [false,null,{},"true"]){
    assert.equal((await handleCalendarSettingsCommand(request({semesterId}),"sync",{...deps,rpc:async()=>result})).status,409);
  }
});
test("mentor can save their recurring hours through the owning mentor RPC", async () => {
  const workingHours = [{ weekday: 1, startsAt: "09:00", endsAt: "10:00" }];
  const response = await handleCalendarSettingsCommand(request({ ...body, mentorSemesterId: "victim", workingHours }), "settings", {
    enabled: true, authorize: async () => ({ role: "mentor", mentorSemesterId: "owner" }),
    rpc: async (name, args) => {
      assert.equal(name, "calendar_save_settings");
      assert.deepEqual(args, { p_semester_id: semesterId, p_mentor_semester_id: "owner", p_mode: "weekly", p_time_zone: "UTC", p_connection_id: null, p_working_hours: [{ weekday: 1, starts_at: "09:00", ends_at: "10:00" }] });
      return true;
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { saved: true });
});
test("other mentor availability writes are rejected before any database mutation", async () => {
  for (const kind of ["override", "import"] as const) {
    const response = await handleCalendarSettingsCommand(request(body), kind, { enabled: true, authorize: async () => ({role:"mentor",mentorSemesterId:"owner"}), rpc: async () => { assert.fail("write reached database"); } });
    assert.equal(response.status,403);
  }
});
test("startup and unavailable configuration cannot write mentor Calendar settings", async () => {
  const denied = await handleCalendarSettingsCommand(request(body),"settings",{ enabled:true,authorize:async()=>({role:"startup",mentorSemesterId:null}),rpc:async()=>{assert.fail();} });
  assert.equal(denied.status,403);
  const unavailable = await handleCalendarSettingsCommand(request(body),"settings",{enabled:false,authorize:async()=>{assert.fail();},rpc:async()=>{assert.fail();}});
  assert.equal(unavailable.status,503);
});
