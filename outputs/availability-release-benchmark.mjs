import { performance } from 'node:perf_hooks';
import { buildCalendarSelectionBatch } from '../src/mentor-booking/calendar-selection.ts';
import { availabilityKeysFromBlocks, availabilityBlocksFromKeys } from '../src/mentor-booking/availability-painter.ts';

const times = Array.from({ length: 4 }, (_, index) => `09:${String(index * 15).padStart(2, '0')}`);
const blocks = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, times]));
const Original = Intl.DateTimeFormat;
let constructors = 0;
Intl.DateTimeFormat = new Proxy(Original, { construct(target, args) { constructors++; return Reflect.construct(target, args); } });
const before = performance.now();
const batch = buildCalendarSelectionBatch({ selectedBlocks: blocks, rangeStart: '2026-09-01', rangeEnd: '2026-12-31', timeZone: 'America/New_York', existingWindows: [] });
const expansionMs = performance.now() - before;
Intl.DateTimeFormat = Original;
const keys = availabilityKeysFromBlocks(blocks);
const after = performance.now();
for (let i = 0; i < 1000; i++) availabilityBlocksFromKeys(keys);
console.log(JSON.stringify({ fixture: '7 days, 9am-10am, September-December 2026', oldUnusedExpansionMs: expansionMs, generatedWindows: batch.slots.length, formatterConstructions: constructors, selectionSnapshotMeanMs: (performance.now() - after) / 1000, note: 'Node CPU benchmark, not authenticated browser latency' }, null, 2));
