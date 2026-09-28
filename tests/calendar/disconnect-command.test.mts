import assert from "node:assert/strict";
import test from "node:test";
import { handleCalendarDisconnect } from "../../src/calendar/disconnect-command.ts";
const semesterId="00000000-0000-4000-8000-000000000001",connectionId="00000000-0000-4000-8000-000000000002";
const request=(body:unknown)=>new Request("https://app.test/api/calendar/disconnect",{method:"POST",body:JSON.stringify(body)});
test("mentor and startup disconnect requests use owner-RLS RPC and return queued, not completed",async()=>{
  for(const role of ["mentor","startup"]){
    const response=await handleCalendarDisconnect(request({semesterId,connectionId,keepManual:true}),{enabled:true,authorize:async(_request,semester)=>{assert.equal(semester,semesterId);return{role};},disconnect:async(id,keep)=>{assert.equal(id,connectionId);assert.equal(keep,role==="mentor");return true;}});
    assert.equal(response.status,202);assert.deepEqual(await response.json(),{queued:true});
  }
});
test("disconnect rejects invalid choices and admin preview before mutation",async()=>{
  const deps={enabled:true,authorize:async()=>({role:"mentor"}),disconnect:async()=>assert.fail()};
  for(const body of [{semesterId,connectionId},{semesterId,connectionId,keepManual:"yes"},{semesterId,connectionId:"invalid",keepManual:false}]){
    assert.equal((await handleCalendarDisconnect(request(body),deps)).status,400);
  }
  assert.equal((await handleCalendarDisconnect(request({semesterId,connectionId,keepManual:false}),{...deps,authorize:async()=>({role:"admin"})})).status,403);
});
test("active writes return retryable conflict and internal errors are redacted",async()=>{
  const deps={enabled:true,authorize:async()=>({role:"mentor"}),disconnect:async()=>false};
  assert.equal((await handleCalendarDisconnect(request({semesterId,connectionId,keepManual:false}),deps)).status,409);
  const failed=await handleCalendarDisconnect(request({semesterId,connectionId,keepManual:false}),{...deps,disconnect:async()=>{throw new Error("private-token");}});
  assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes("private-token"));
});
