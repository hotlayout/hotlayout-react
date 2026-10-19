/**
 * Grouping of a list from data (schema 9.26.0, `x-repeaterGroup`, `Repeater.groupBy`). A mirror of the
 * contract's reference rule; the shared table `contract/fixtures/repeater-group/repeater-group-cases.json`
 * keeps the two copies together.
 *
 * `children[0]` of a `Repeater` is the template of a record; `children[1]` — only with `groupBy` — is
 * the header of a group. Records that follow one another with the same value under the `groupBy` path
 * of the RECORD form one group, and the header is drawn before each group in the scope of its FIRST
 * record. The groups are formed from the records that are DRAWN (after `where` and `limit`), in the
 * order of the data: the reader never sorts.
 *
 * This file is the rule; the drawing is `render/repeater.tsx`.
 */

export const GROUP_BY_PROP = 'groupBy'

/** The position of the header among the children of a `Repeater`. */
export const GROUP_HEADER_INDEX = 1

export interface RecordGroup {
  /** The number of the first drawn record of the group. */
  readonly start: number
  readonly size: number
}

/** "No value": absent, `null` and the empty string are one value. */
function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Whether two values are the same group: both missing, or the same JSON type and equal without
 * conversion (`1` and `"1"` are two groups). An object or a list is a group of its own.
 */
export function sameGroupValue(left: unknown, right: unknown): boolean {
  if (isMissing(left) || isMissing(right)) return isMissing(left) && isMissing(right)
  if (typeof left === 'object' || typeof right === 'object') return false
  return typeof left === typeof right && left === right
}

/** The groups of the drawn records; `values` are the values under the path, in the order of drawing. */
export function recordGroupsOf(values: readonly unknown[]): readonly RecordGroup[] {
  const groups: { start: number; size: number }[] = []
  values.forEach((value, index) => {
    const last = groups.at(-1)
    if (last !== undefined && sameGroupValue(values[last.start], value)) last.size += 1
    else groups.push({ start: index, size: 1 })
  })
  return groups
}

/** The numbers of the drawn records that have a header in front of them. */
export function groupStartsOf(values: readonly unknown[]): ReadonlySet<number> {
  return new Set(recordGroupsOf(values).map((group) => group.start))
}

/** The grouping path as the reader takes it: a non-empty string; anything else is no grouping. */
export function readGroupBy(props: Readonly<Record<string, unknown>>): string | undefined {
  const value = props[GROUP_BY_PROP]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** `x-repeaterGroup` of the artifact, whole; a test compares the two. */
export const REPEATER_GROUP_RULES = {
  widget: 'Repeater',
  prop: 'groupBy',
  path: 'a path of the record of the collection (the «item» prefix); string, number, boolean or date',
  header: {
    child: 1,
    template: 'children[0] — the record, as before 9.26.0',
    legal: 'only with «groupBy»; «groupBy» only with the header',
    scope: 'the record of the FIRST record of the group over the outer scope (x-dataScope.layers)',
    record: 'a press inside the header carries the record of the first record of the group',
    hidden: 'a header hidden by its condition takes no place; the group is drawn without it',
    numbering: 'not a list item: numbered items count records only',
  },
  group: 'records that follow one another with the same value under the path',
  same: {
    missing: 'absent, null and the empty string are one value',
    types: 'the same JSON type and equal without conversion: 1 and "1" are two groups',
    objects: 'an object or a list is a group of its own',
  },
  order: 'the order of the data — the backend sorts; the same value after another one starts a new group',
  after: ['where', 'limit'],
  empty: 'no records — no groups and no headers',
  gap: 'the «gap» of the Repeater between every two drawn nodes, headers and records alike',
  layout: 'a list in a column only: with «columns» (any width class) or «direction: row» the field is not published',
  olderReader: 'skips the field and draws children[0] only: the records without headers',
  editorCanvas: 'the header above the first record, editable, like the template',
  cases: 'contract/fixtures/repeater-group/repeater-group-cases.json',
} as const
