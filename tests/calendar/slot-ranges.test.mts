import test from "node:test";
import assert from "node:assert/strict";
import {readCalendarSlotRanges} from "../../src/calendar/slot-ranges.ts";
test("slot ranges preserve endpoints and align internal boundaries without gaps",async()=>{
  const from="2026-09-19T20:51:12.345Z",until="2026-09-26T20:51:12.345Z";
  const result=await readCalendarSlotRanges(from,until,async(a,b)=>[{a,b}]);
  assert.ok(result.length<=2);assert.equal(result[0]!.a,from);assert.equal(result.at(-1)!.b,until);
  result.forEach((range,index)=>{assert.ok(Date.parse(range.b)-Date.parse(range.a)<=604800000);if(index){assert.equal(result[index-1]!.b,range.a);assert.equal(Date.parse(range.a)%900000,0);}});
});
test("one failed range rejects the complete projection",async()=>{
  await assert.rejects(readCalendarSlotRanges("2026-09-19T00:00:00Z","2026-10-10T00:00:00Z",async from=>{if(from.includes("24T"))throw new Error("timeout");return [from];}),/timeout/);
});

