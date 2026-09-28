import assert from 'node:assert/strict';
import test from 'node:test';
import { createReadCache } from '../../src/dashboard/read-cache.ts';

test('read cache coalesces concurrent loads, reuses fresh data and expires', async () => {
  let now = 0; let calls = 0;
  const cache = createReadCache<number>(15, () => now);
  const load = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.read('user-a', 'cohort', load), cache.read('user-a', 'cohort', load)]), [1, 1]);
  assert.equal(await cache.read('user-a', 'cohort', load), 1);
  now = 16;
  assert.equal(await cache.read('user-a', 'cohort', load), 2);
  assert.equal(await cache.read('user-b', 'cohort', load), 3);
});

test('invalidating during an in-flight load cannot repopulate the cache', async () => {
  const cache = createReadCache<number>(15);
  let finish!: (value: number) => void;
  const old = cache.read('a', 'cohort', () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  cache.clear();
  assert.equal(await cache.read('a', 'cohort', async () => 2), 2);
  finish(1);
  assert.equal(await old, 1);
  assert.equal(await cache.read('a', 'cohort', async () => 3), 2);
});

test('errors are not cached and a changed identity discards previous data', async () => {
  const cache = createReadCache<number>(15);
  await assert.rejects(cache.read('a', 'x', async () => { throw new Error('denied'); }), /denied/);
  assert.equal(await cache.read('a', 'x', async () => 1), 1);
  assert.equal(await cache.read('b', 'x', async () => 2), 2);
  assert.equal(await cache.read('a', 'x', async () => 3), 3);
});
