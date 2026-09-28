// Browser-memory read reuse only. Never use this for server authorization.
export function createReadCache<T>(ttlMs: number, now: () => number = Date.now) {
  let owner: string | null = null;
  const entries = new Map<string, { promise: Promise<T>; expiresAt: number }>();
  return {
    clear() { entries.clear(); owner = null; },
    read(identity: string, key: string, load: () => Promise<T>): Promise<T> {
      if (identity !== owner) { entries.clear(); owner = identity; }
      const current = entries.get(key);
      if (current && current.expiresAt > now()) return current.promise;
      // Cap memory even if a user visits many cohort/query combinations.
      if (entries.size >= 32) entries.delete(entries.keys().next().value!);
      const entry = { promise: Promise.resolve().then(load), expiresAt: Infinity };
      entries.set(key, entry);
      entry.promise = entry.promise.then(value => {
        entry.expiresAt = now() + ttlMs;
        return value;
      }, error => {
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
      return entry.promise;
    },
  };
}
