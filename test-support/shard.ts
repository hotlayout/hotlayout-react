/*
 * Deterministic slicing of a long list of test cases across several test files.
 *
 * The exhaustive hostile-value sweeps walk thousands of (path, value) cases. Run in one file they
 * take minutes on one worker; cut into slices they run in parallel. A slice takes every
 * `total`-th item starting at `shard`, so the slices partition the list exactly: the union is the
 * whole list and no item is in two slices.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'

import { SRC_DIR } from './paths'

/** The items of slice `shard` (1-based) out of `total`. */
export function shardOf<T>(items: readonly T[], shard: number, total: number): T[] {
  if (!Number.isInteger(shard) || !Number.isInteger(total) || shard < 1 || shard > total) throw new RangeError(`shard ${String(shard)} of ${String(total)}`)
  return items.filter((_, index) => index % total === shard - 1)
}

/** Fails unless the slices cover `items` completely, without gaps and without overlaps. */
export function expectPartition(items: readonly unknown[], total: number): void {
  const seen = new Map<unknown, number>()
  let count = 0
  for (let shard = 1; shard <= total; shard += 1) {
    for (const item of shardOf(items, shard, total)) {
      seen.set(item, (seen.get(item) ?? 0) + 1)
      count += 1
    }
  }
  expect(count, 'the slices hold exactly as many items as the list').toBe(items.length)
  expect(seen.size, 'no item is in two slices').toBe(items.length)
  expect(
    items.every((item) => seen.get(item) === 1),
    'every item is in exactly one slice',
  ).toBe(true)
}

/**
 * Fails when a slice has no test file: a slice nobody runs is a hole in the sweep. Files are
 * `<base>.<k>.deep.test.tsx` next to the sources (`dir` is relative to `src/`).
 */
export function expectSliceFiles(dir: string, base: string, total: number): void {
  const missing: string[] = []
  for (let shard = 1; shard <= total; shard += 1) {
    const file = join(SRC_DIR, dir, `${base}.${String(shard)}.deep.test.tsx`)
    if (!existsSync(file)) missing.push(file)
  }
  expect(missing).toEqual([])
}
