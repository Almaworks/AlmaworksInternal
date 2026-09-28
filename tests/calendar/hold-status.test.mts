import test from "node:test";
import assert from "node:assert/strict";
import { readCalendarHoldStatuses } from "../../src/calendar/hold-status.ts";
import { ALMAWORKS_SUPABASE_URL } from "../../src/calendar/config.ts";
const input={environment:{url:ALMAWORKS_SUPABASE_URL,anonKey:"public"},token:"participant",semesterId:"semester",requestIds:["placed","conflict","pending","missing"]};
test("hold status uses participant bearer and returns safe status without private connection identifiers",async()=>{
  const result=await readCalendarHoldStatuses({...input,fetch:async(req)=>{
    const request=req as Request;
    assert.equal(request.headers.get("authorization"),"Bearer participant");
    assert.deepEqual(await request.json(),{p_semester_id:"semester",p_request_ids:input.requestIds});
    return Response.json([
      {request_id:"placed",desired_state:"present",applied_state:"present",last_error:null,connection_id:"private"},
      {request_id:"conflict",desired_state:"present",applied_state:"unknown",last_error:"conflict"},
      {request_id:"pending",desired_state:"absent",applied_state:"present",last_error:null},
    ]);
  }});
  assert.deepEqual(result,{placed:"placed",conflict:"conflict",pending:"removing",missing:"not_recorded"});
});
test("unreadable or foreign status rows never report successful placement",async()=>{
  for(const value of [Response.json({}, {status:503}),Response.json([{request_id:"other",desired_state:"present",applied_state:"present",last_error:null}])]){
    assert.deepEqual(await readCalendarHoldStatuses({...input,fetch:async()=>value}),Object.fromEntries(input.requestIds.map(id=>[id,"unavailable"])));
  }
});
test("empty requests and wrong project do not issue requests",async()=>{
  const fetcher:typeof fetch=async()=>{assert.fail("Unexpected request");};
  assert.deepEqual(await readCalendarHoldStatuses({...input,requestIds:[],fetch:fetcher}),{});
  await assert.rejects(readCalendarHoldStatuses({...input,environment:{...input.environment,url:"https://other.supabase.co"},fetch:fetcher}));
});
