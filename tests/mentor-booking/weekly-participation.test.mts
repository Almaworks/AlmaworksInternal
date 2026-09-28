import assert from "node:assert/strict";
import test from "node:test";
import { weeklyParticipation } from "../../src/mentor-booking/weekly-participation.ts";
const now = new Date("2026-09-28T12:00:00Z");
const week = {startDate:"2026-09-27",endDate:"2026-10-03"};
const roster = [{startupSemesterId:"a",name:"A"},{startupSemesterId:"b",name:"B"}];
const request = {startupSemesterId:"a",status:"accepted" as const,startsAt:"2026-09-30T14:00:00Z",endsAt:"2026-09-30T15:00:00Z"};
test("includes unbooked startups and ignores bookings in other weeks",()=>{
 const rows=weeklyParticipation(roster,[request,{...request,startupSemesterId:"b",startsAt:"2026-10-10T12:00:00Z"}],week,"America/New_York",now);
 assert.deepEqual(rows.map(r=>r.status),["confirmed","not_requested"]);
});
test("uses program-local dates and never implies attendance",()=>{
 assert.equal(weeklyParticipation(roster,[{...request,startsAt:"2026-09-28T00:30:00Z",endsAt:"2026-09-28T01:00:00Z"}],week,"America/New_York",now)[0].status,"meeting_passed");
 assert.equal(weeklyParticipation(roster,[{...request,startsAt:"2026-09-27T00:30:00Z"}],week,"America/New_York",now)[0].status,"not_requested");
});
test("pending is not confirmed; terminal and elapsed requests require rebooking",()=>{
 for(const status of ["cancelled","declined"] as const) assert.equal(weeklyParticipation(roster,[{...request,status}],week,"UTC",now)[0].status,"needs_rebooking");
 assert.equal(weeklyParticipation(roster,[{...request,status:"pending"}],week,"UTC",now)[0].status,"awaiting_mentor");
 assert.equal(weeklyParticipation(roster,[{...request,status:"pending",endsAt:"2026-09-28T11:00:00Z"}],week,"UTC",now)[0].status,"needs_rebooking");
});
