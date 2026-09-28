/** Applies an inclusive 15-minute drag stroke without crossing protected cells. */
export function applyWeeklyDraftStroke(input: { keys: ReadonlySet<string>; day: number; fromMinute: number; toMinute: number; add: boolean; blocked: ReadonlySet<string>; key: (day: number, minute: number) => string }) {
  const next = new Set(input.keys);
  const start = Math.min(input.fromMinute, input.toMinute), end = Math.max(input.fromMinute, input.toMinute);
  for (let minute = start; minute <= end; minute += 15) {
    const key = input.key(input.day, minute);
    if (input.blocked.has(key)) continue;
    if (input.add) next.add(key); else next.delete(key);
  }
  return next;
}
