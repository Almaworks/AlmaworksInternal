import assert from "node:assert/strict";
import test from "node:test";
import { calendarSyncState, mergeCalendarSyncSnapshot, requestCalendarSync } from "../../src/calendar/sync-status.ts";
import type { MentorCalendarSettings } from "../../src/calendar/settings-read.ts";
const now=Date.parse("2026-09-19T12:00:00Z");
const stamp=(offset:number)=>new Date(now+offset).toISOString();
const snapshot={lastSuccessAt:stamp(-1000),syncUnavailable:false};

test("queued refresh waits for a newer successful snapshot, then reports fresh",()=>{
  const pending={queuedAt:now,baseline:snapshot.lastSuccessAt};
  assert.equal(calendarSyncState(snapshot,pending,now),"waiting");
  assert.equal(calendarSyncState({...snapshot,lastSuccessAt:stamp(1000)},pending,now+2000),"fresh");
  assert.equal(calendarSyncState({...snapshot,lastSuccessAt:stamp(1000),syncUnavailable:true},pending,now+2000),"waiting");
  assert.equal(calendarSyncState(snapshot,pending,now+360000),"delayed");
});

test("missing, future, stale and failed snapshots are never presented as fresh",()=>{
  for(const lastSuccessAt of [null,"invalid",stamp(-900001),stamp(60000)]){
    assert.equal(calendarSyncState({lastSuccessAt,syncUnavailable:false},null,now),"unavailable");
  }
  assert.equal(calendarSyncState({...snapshot,syncUnavailable:true},null,now),"unavailable");
  assert.equal(calendarSyncState(snapshot,null,now),"fresh");
});

test("a response timestamp permits only small server clock skew",()=>{
  assert.equal(calendarSyncState({lastSuccessAt:stamp(1000),syncUnavailable:false},null,now),"fresh");
  assert.equal(calendarSyncState({lastSuccessAt:stamp(6000),syncUnavailable:false},null,now),"unavailable");
});

test("refresh client sends only semester scope and requires a queued acknowledgement",async()=>{
  await requestCalendarSync({semesterId:"semester",fetch:async(url,init)=>{
    assert.equal(url,"/api/calendar/sync");assert.equal(init?.method,"POST");
    assert.deepEqual(JSON.parse(String(init?.body)),{semesterId:"semester"});assert.ok(init?.signal);
    return Response.json({queued:true},{status:202});
  }});
  for(const result of [{saved:true},{queued:false},null]){
    await assert.rejects(requestCalendarSync({semesterId:"semester",fetch:async()=>Response.json(result)}));
  }
  await assert.rejects(requestCalendarSync({semesterId:"semester",fetch:async()=>Response.json({error:"Reconnect your calendar."},{status:409})}),/Reconnect/);
});

test("a sync refresh updates slots and status without replacing the editor's saved settings",()=>{
  const current:MentorCalendarSettings={...snapshot,mode:"synced",timeZone:"UTC",connectionId:"connection",workingHours:[{weekday:1,startsAt:"09:00",endsAt:"17:00"}],overrides:[],slots:[],from:stamp(0),until:stamp(86400000)};
  const incoming={...current,lastSuccessAt:stamp(1000),slots:[{startsAt:stamp(900000),endsAt:stamp(1800000)}]};
  const merged=mergeCalendarSyncSnapshot(current,incoming);
  assert.equal(merged.workingHours,current.workingHours);
  assert.deepEqual(merged.slots,incoming.slots);
  assert.equal(merged.lastSuccessAt,incoming.lastSuccessAt);
  for(const patch of [{mode:"manual" as const},{timeZone:"America/New_York"},{connectionId:"different"},{workingHours:[]}]){
    assert.throws(()=>mergeCalendarSyncSnapshot(current,{...incoming,...patch}),/changed/);
  }
});
