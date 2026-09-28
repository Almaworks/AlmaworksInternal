export async function mapWithConcurrency<T, Result>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Concurrency limit must be a positive integer.");
  }

  const results = new Array<Result>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}
