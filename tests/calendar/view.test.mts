import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCalendarView} from '../../src/calendar/view.ts';
const semesterId='00000000-0000-4000-8000-000000000001';
test('calendar view binds private busy data to authorized owner, never caller mentor id',async()=>{
  let called=false;
  const response=await handleCalendarView(new Request(`http://localhost/api/calendar/view?semesterId=${semesterId}&mentorSemesterId=other&weekStart=2026-10-04`),{
    authorize:async()=>({role:'mentor',mentorSemesterId:'owned'}),
    read:async input=>{called=true;assert.deepEqual(input,{semesterId,mentorSemesterId:'owned',weekStart:'2026-10-04'});return {busy:[]};}
  });assert.equal(response.status,200);assert.equal(called,true);
});
test('startup and invalid calendar dates cannot read owner busy data',async()=>{
  for(const [role,date,status] of [['startup','2026-10-04',403],['mentor','2026-02-30',400]] as const){
    const response=await handleCalendarView(new Request(`http://localhost/api/calendar/view?semesterId=${semesterId}&weekStart=${date}`),{
      authorize:async()=>({role,mentorSemesterId:'owner'}),read:async()=>{assert.fail('must not read');}
    });assert.equal(response.status,status);
  }
});

test('calendar view normalizes a missing weekly setting to an available non-Google state',async()=>{
  const response=await handleCalendarView(new Request(`http://localhost/api/calendar/view?semesterId=${semesterId}`),{
    authorize:async()=>({role:'mentor',mentorSemesterId:'owner'}),
    read:async()=>({mode:'weekly',syncUnavailable:null,slots:[]})
  });
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{mode:'weekly',syncUnavailable:false,slots:[]});
});

test('calendar view fails closed when synced freshness is unknown',async()=>{
  const response=await handleCalendarView(new Request(`http://localhost/api/calendar/view?semesterId=${semesterId}`),{
    authorize:async()=>({role:'mentor',mentorSemesterId:'owner'}),
    read:async()=>({mode:'synced',syncUnavailable:null,slots:[{startsAt:'2026-10-05T13:00:00Z',endsAt:'2026-10-05T13:30:00Z'}]})
  });
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{mode:'synced',syncUnavailable:true,slots:[{startsAt:'2026-10-05T13:00:00Z',endsAt:'2026-10-05T13:30:00Z'}]});
});
