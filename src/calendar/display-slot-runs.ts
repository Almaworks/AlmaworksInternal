/** Display metadata only: callers retain every original slot and its action. */
export interface DisplaySlot {
  day: string;
  start: number;
  end: number;
  kind: 'available' | 'booking';
  /** Booking identity, or the available mentor set / visual state. */
  identity: string;
}

/** Exact adjacency only; never joins gaps, overlaps, days, kinds or identities. */
export function mergeDisplaySlots<T extends DisplaySlot>(slots: readonly T[]): { day: string; start: number; end: number; slots: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const slot of slots) {
    const key = JSON.stringify([slot.day, slot.kind, slot.identity]);
    const group = groups.get(key) ?? [];
    group.push(slot);
    groups.set(key, group);
  }
  const runs: { day: string; start: number; end: number; slots: T[] }[] = [];
  for (const group of groups.values()) {
    let run: typeof runs[number] | undefined;
    for (const slot of [...group].sort((a, b) => a.start - b.start || a.end - b.end)) {
      if (run && run.end === slot.start) {
        run.end = slot.end;
        run.slots.push(slot);
      } else {
        run = { day: slot.day, start: slot.start, end: slot.end, slots: [slot] };
        runs.push(run);
      }
    }
  }
  return runs.sort((a, b) => a.day.localeCompare(b.day) || a.start - b.start);
}

/** Original slot -> its outer edges; internal hit targets stay intact. */
export function displaySlotEdges<T extends DisplaySlot>(slots: readonly T[]): Map<T, { first: boolean; last: boolean }> {
  return new Map(mergeDisplaySlots(slots).flatMap(run => run.slots.map((slot, index) => [slot, { first: index === 0, last: index === run.slots.length - 1 }] as const)));
}
