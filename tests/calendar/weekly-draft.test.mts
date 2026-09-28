import assert from "node:assert/strict";
import test from "node:test";
import { applyWeeklyDraftStroke } from "../../src/calendar/weekly-draft.ts";
const key=(day:number,minute:number)=>`${day}:${minute}`;
test("fast forward drag fills every quarter hour and skips a protected midpoint",()=>{
  const result=applyWeeklyDraftStroke({keys:new Set<string>(),day:1,fromMinute:540,toMinute:600,add:true,blocked:new Set([key(1,570)]),key});
  assert.deepEqual([...result],[key(1,540),key(1,555),key(1,585),key(1,600)]);
});
test("reverse removal drag clears every unprotected quarter hour",()=>{
  const keys=new Set([540,555,570,585,600].map(minute=>key(4,minute)));
  const result=applyWeeklyDraftStroke({keys,day:4,fromMinute:600,toMinute:540,add:false,blocked:new Set([key(4,570)]),key});
  assert.deepEqual([...result],[key(4,570)]);
});
