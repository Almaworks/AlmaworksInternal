import test from "node:test";
import assert from "node:assert/strict";
import { resolveCalendarSelection } from "../../src/mentor-booking/startup-calendar.ts";
const startsAt="2026-09-21T14:00:00Z", endsAt="2026-09-21T14:15:00Z";
test("a refresh never silently substitutes another mentor for the chosen participant",()=>{
  const result=resolveCalendarSelection({cells:[{startsAt,endsAt,mentors:[{profileId:"b",name:"Mentor B"}]}],startsAt,profileId:"a",startupNeeds:[],query:""});
  assert.equal(result.selectedMentor,null);assert.equal(result.mentors[0]?.profileId,"b");
});
test("a still-available selection survives refreshed ranking and becomes unavailable when its slot disappears",()=>{
  const input={startsAt,profileId:"b",startupNeeds:[],query:""};
  const result=resolveCalendarSelection({...input,cells:[{startsAt,endsAt,mentors:[{profileId:"a",name:"A"},{profileId:"b",name:"B"}]}]});
  assert.equal(result.selectedMentor?.profileId,"b");
  assert.equal(resolveCalendarSelection({...input,cells:[]}).selectedMentor,null);
});
