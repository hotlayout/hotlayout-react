/**
 * The filter of a list from data (`Repeater.where`, schema 9.23.0).
 *
 * A record that does not pass does not exist for the layout: the grid closes up, the carousel
 * counts stops by the records drawn, numbered rows count the records drawn, and `limit` takes the
 * FIRST `limit` records that passed (the filter first, the bound after). The condition is the one
 * of `visibleIf`, evaluated on every record in the scope of THAT record (its fields under the
 * `item` prefix over the outer scope), with one difference: a comparison with no operand passes
 * every record (`wherePasses`).
 */
import { wherePasses } from './conditions'
import { itemScope, withItemScope } from './data'
import type { DataScope } from './data'
import { isRecord } from './sanitize'
import type { VisibilityCondition } from './types'

/** A record that is drawn and where it stood in the collection. */
export interface DrawnRecord {
  readonly record: Readonly<Record<string, unknown>>
  /** The place in the whole collection, for a stable React key. */
  readonly index: number
}

/** The filter as the reader takes it: an object with a path and an operator, or no filter. */
export function listWhereOf(value: unknown): VisibilityCondition | undefined {
  return isRecord(value) && typeof value.path === 'string' && typeof value.op === 'string' ? (value as unknown as VisibilityCondition) : undefined
}

/**
 * The records the list DRAWS, in the order of the collection: those that passed, and of them the
 * first `limit`. The walk stops as soon as `limit` records are found.
 */
export function drawnRecords(
  records: readonly Readonly<Record<string, unknown>>[],
  filter: { readonly outer: DataScope; readonly item: string; readonly where: VisibilityCondition | undefined },
  limit: number,
): readonly DrawnRecord[] {
  const drawn: DrawnRecord[] = []
  for (let index = 0; index < records.length && drawn.length < limit; index += 1) {
    const record = records[index]
    if (record === undefined) continue
    if (filter.where === undefined || wherePasses(filter.where, withItemScope(filter.outer, itemScope(filter.item, record)))) drawn.push({ record, index })
  }
  return drawn
}
