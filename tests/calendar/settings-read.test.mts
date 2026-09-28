import assert from "node:assert/strict";
import test from "node:test";
import { readMentorCalendarSettings } from "../../src/calendar/settings-read.ts";
import { ALMAWORKS_SUPABASE_URL } from "../../src/calendar/config.ts";
const input={environment:{url:ALMAWORKS_SUPABASE_URL,anonKey:"public"},token:"owner-token",semesterId:"semester",mentorSemesterId:"mentor",programTimeZone:"UTC"};
test("read binds all rows and slot projection to the authorized mentor and semester",async()=>{
  const calls:string[]=[];
  const result=await readMentorCalendarSettings({...input,fetch:async request=>{
    const req=request as Request;const url=new URL(req.url);calls.push(url.pathname);
    assert.equal(req.headers.get("authorization"),"Bearer owner-token");
    if(url.pathname.includes("/rpc/")){const body=await req.json();assert.equal(body.p_mentor_semester_id,"mentor");assert.equal(body.p_semester_id,"semester");return Response.json([]);}
    assert.equal(url.searchParams.get("semester_id"),"eq.semester");assert.equal(url.searchParams.get("mentor_semester_id"),"eq.mentor");
    if(url.pathname.endsWith("mentor_calendar_settings"))return Response.json([{mode:"synced",time_zone:"America/New_York",connection_id:"connection",last_success_at:null,sync_unavailable:true}]);
    if(url.pathname.endsWith("mentor_weekly_availability"))return Response.json([{weekday:1,starts_at:"09:00:00",ends_at:"17:00:00"}]);
    return Response.json([]);
  }});
  assert.equal(calls.filter(path=>!path.includes("/rpc/")).length,3);assert.ok(calls.length>=4 && calls.length<=5);assert.equal(result.mode,"synced");assert.equal(result.syncUnavailable,true);assert.deepEqual(result.workingHours,[{weekday:1,startsAt:"09:00",endsAt:"17:00"}]);
});
test("empty settings preserves the existing weekly schedule mode without inventing hours",async()=>{
  const result=await readMentorCalendarSettings({...input,fetch:async()=>Response.json([])});
  assert.equal(result.mode,"weekly");assert.equal(result.timeZone,"UTC");assert.deepEqual(result.workingHours,[]);
});
test("wrong project and failed reads never turn into empty availability",async()=>{
  await assert.rejects(readMentorCalendarSettings({...input,environment:{...input.environment,url:"https://other.supabase.co"},fetch:async()=>{assert.fail();}}));
  await assert.rejects(readMentorCalendarSettings({...input,fetch:async()=>Response.json({private:"secret"},{status:500})}),error=>error instanceof Error&&!error.message.includes("secret"));
});
test("invalid time zones and reversed slots fail safely instead of crashing the editor",async()=>{
  for(const malformed of ["zone","slot"]){
    await assert.rejects(readMentorCalendarSettings({...input,fetch:async request=>{
      const path=new URL((request as Request).url).pathname;
      if(path.endsWith("mentor_calendar_settings"))return Response.json([{mode:"weekly",time_zone:malformed==="zone"?"Invalid/Zone":"UTC",connection_id:null,last_success_at:null,sync_unavailable:false}]);
      if(path.includes("/rpc/")&&malformed==="slot")return Response.json([{starts_at:"2026-09-21T10:00:00Z",ends_at:"2026-09-21T09:00:00Z"}]);
      return Response.json([]);
    }}),/could not be loaded/);
  }
});

