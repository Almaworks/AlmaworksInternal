import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeDisplaySlots, displaySlotEdges, type DisplaySlot } from '../../src/calendar/display-slot-runs.ts';

const slot = (start: number, overrides: Partial<DisplaySlot> = {}): DisplaySlot => ({ day: '2026-11-02', start, end: start + 15, kind: 'available', identity: 'available', ...overrides });
test('an unsorted hour becomes one run without mutating input or losing slot targets', () => {
  const input = [slot(45), slot(0), slot(30), slot(15)];
  const original = structuredClone(input);
  const runs = mergeDisplaySlots(input);
  assert.equal(runs.length, 1);
  assert.deepEqual([runs[0]!.start, runs[0]!.end], [0, 60]);
  assert.deepEqual(runs[0]!.slots.map(s => s.start), [0, 15, 30, 45]);
  assert.equal(runs[0]!.slots[0], input[1]);
  assert.deepEqual(input, original);
  const edges = displaySlotEdges(input);
  assert.deepEqual(edges.get(input[1]!), { first: true, last: false });
  assert.deepEqual(edges.get(input[2]!), { first: false, last: false });
  assert.deepEqual(edges.get(input[0]!), { first: false, last: true });
});
test('gaps and overlaps remain separate', () => {
  assert.equal(mergeDisplaySlots([slot(0), slot(30)]).length, 2);
  assert.equal(mergeDisplaySlots([slot(0), slot(10)]).length, 2);
});
test('same booking joins; distinct booking IDs and kinds do not', () => {
  const booking = (start: number, identity: string) => slot(start, { kind: 'booking', identity });
  assert.equal(mergeDisplaySlots([booking(0, 'a'), booking(15, 'a')]).length, 1);
  assert.equal(mergeDisplaySlots([booking(0, 'a'), booking(15, 'b')]).length, 2);
  assert.equal(mergeDisplaySlots([slot(0), booking(15, 'available')]).length, 2);
});
test('day boundaries and changing mentor sets preserve boundaries', () => {
  assert.equal(mergeDisplaySlots([slot(1425), slot(1440, { day: '2026-11-03' })]).length, 2);
  assert.equal(mergeDisplaySlots([slot(0, { identity: 'a' }), slot(15, { identity: 'b' })]).length, 2);
});
test('empty and singleton inputs have correct edges', () => {
  assert.deepEqual(mergeDisplaySlots([]), []);
  const input = slot(0);
  assert.deepEqual(displaySlotEdges([input]).get(input), { first: true, last: true });
});
