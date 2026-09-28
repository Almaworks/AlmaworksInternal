import assert from "node:assert/strict";
import test from "node:test";
import { runCalendarDisconnectBatch, type CalendarDisconnectRepository } from "../../src/calendar/disconnect-worker.ts";
test("local disconnect finalization needs no provider token or Google revocation",async()=>{
  const minimal={connectionId:"connection",leaseToken:"lease",credentialGeneration:4};
  let available=true;
  const result=await runCalendarDisconnectBatch({repository:{lease:async()=>available?(available=false,minimal):null,finish:async input=>{assert.deepEqual(input,minimal);return true;}}});
  assert.deepEqual(result,{applied:1,failed:0,superseded:0});
});
const job={connectionId:"connection",leaseToken:"lease",credentialGeneration:4};
function fixture(){
  const acknowledgements:Parameters<CalendarDisconnectRepository["finish"]>[0][]=[];
  let available=true;
  const repository:CalendarDisconnectRepository={lease:async()=>{if(!available)return null;available=false;return job;},finish:async input=>{acknowledgements.push(input);return true;}};
  return{repository,acknowledgements};
}
test("stale disconnect acknowledgements remain superseded",async()=>{
  const stale=fixture();stale.repository.finish=async()=>false;
  assert.deepEqual(await runCalendarDisconnectBatch(stale),{applied:0,failed:0,superseded:1});
});
test("disconnect database failures propagate and invalid batch limits do no work",async()=>{
  const state=fixture();state.repository.finish=async()=>{throw new Error("storage unavailable");};
  await assert.rejects(runCalendarDisconnectBatch(state),/storage unavailable/);
  await assert.rejects(runCalendarDisconnectBatch({...fixture(),limit:0}),/batch limit/);
});
