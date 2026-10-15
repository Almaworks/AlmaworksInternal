import assert from 'node:assert/strict';
import test from 'node:test';
import { localSlot, offeredSlots, copyDateState, stageAvailability, type EditorSnapshot } from '../../src/calendar/availability-editor.ts';

const snapshot: EditorSnapshot = { timeZone:'America/New_York',programTimeZone:'America/New_York',semesterStart:'2026-09-01',semesterEnd:'2026-12-20',from:'2026-10-14T00:00:00Z',until:'2026-12-21T00:00:00Z',offered:[{startsAt:'2026-10-15T15:00:00Z',endsAt:'2026-10-15T16:00:00Z'},{startsAt:'2026-10-22T15:00:00Z',endsAt:'2026-10-22T16:00:00Z'}],busy:[],bookings:[],syncUnavailable:false,mode:'weekly',lastSuccessAt:null };
test('dated edits and copies do not change another week or the original snapshot',()=>{
 const saved=offeredSlots(snapshot.offered),draft=new Map<string,boolean>();
 const slot=localSlot('2026-10-16',660,snapshot.timeZone)!;
 stageAvailability(draft,saved,slot.startsAt,true);
 assert.equal(draft.size,1);assert.equal(saved.has(slot.startsAt),false);
 assert.equal(copyDateState(snapshot,draft,'2026-10-23',660,720).kind,'available');
 stageAvailability(draft,saved,slot.startsAt,false);assert.equal(draft.size,0);
});
test('source and all fully offered dates are already set; partial coverage is distinct',()=>{
 assert.equal(copyDateState(snapshot,new Map(),'2026-10-15',660,720).kind,'set');
 assert.equal(copyDateState(snapshot,new Map(),'2026-10-22',660,720).kind,'set');
 assert.equal(copyDateState(snapshot,new Map(),'2026-10-22',645,720).kind,'blocked');
 assert.equal(copyDateState(snapshot,new Map(),'2026-10-23',660,720).kind,'available');
});
test('wall-clock copies preserve the local time across DST and refuse gaps/folds',()=>{
 assert.equal(localSlot('2026-10-29',660,snapshot.timeZone)?.startsAt,'2026-10-29T15:00:00.000Z');
 assert.equal(localSlot('2026-11-05',660,snapshot.timeZone)?.startsAt,'2026-11-05T16:00:00.000Z');
 assert.equal(localSlot('2026-03-08',150,snapshot.timeZone),null);
 assert.equal(localSlot('2026-11-01',90,snapshot.timeZone),null);
});
test('copy checks protect bookings, busy times, program reservations and boundaries',()=>{
 const slot=localSlot('2026-10-16',660,snapshot.timeZone)!;
 for(const key of ['bookings','busy'] as const) assert.equal(copyDateState({...snapshot,[key]:[slot]},new Map(),'2026-10-16',660,675).kind,'blocked');
 assert.equal(copyDateState(snapshot,new Map(),'2026-10-16',900,915).kind,'blocked');
 assert.equal(copyDateState(snapshot,new Map(),'2026-12-21',660,675).kind,'blocked');
 assert.equal(copyDateState(snapshot,new Map(),'2026-10-13',660,675).kind,'blocked');
});
