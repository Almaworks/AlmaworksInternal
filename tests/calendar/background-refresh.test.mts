import assert from "node:assert/strict";
import test from "node:test";
import { createBackgroundRefresh } from "../../src/calendar/background-refresh.ts";
function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(done=>{resolve=done;}); return {promise,resolve}; }
test("background refresh coalesces requests and stops when editing a booking", async()=>{
  const pending=deferred<number>(); let reads=0,allowed=true; const applied:number[]=[];
  const refresh=createBackgroundRefresh({ canRefresh:()=>allowed, load:async()=>{reads++;return pending.promise;}, apply:value=>applied.push(value), failed:()=>assert.fail() });
  const first=refresh.tick(); await refresh.tick(); assert.equal(reads,1);
  allowed=false; pending.resolve(1); await first; assert.deepEqual(applied,[]);
  await refresh.tick(); assert.equal(reads,1);
});
test("cancellation discards even a transport that ignores abort",async()=>{
  const pending=deferred<number>();const applied:number[]=[];let signal:AbortSignal|undefined;
  const refresh=createBackgroundRefresh({canRefresh:()=>true,load:async(value)=>{signal=value;return pending.promise;},apply:value=>applied.push(value),failed:()=>assert.fail()});
  const running=refresh.tick();refresh.cancel();assert.equal(signal?.aborted,true);pending.resolve(1);await running;assert.deepEqual(applied,[]);
});
test("failed refresh preserves the caller's data and can recover",async()=>{
  let fail=true,errors=0;const applied:number[]=[];
  const refresh=createBackgroundRefresh({canRefresh:()=>true,load:async()=>{if(fail)throw new Error("network");return 2;},apply:value=>applied.push(value),failed:()=>{errors++;}});
  await refresh.tick();assert.equal(errors,1);assert.deepEqual(applied,[]);
  fail=false;await refresh.tick();assert.deepEqual(applied,[2]);refresh.dispose();await refresh.tick();assert.deepEqual(applied,[2]);
});
