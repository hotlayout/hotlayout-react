/**
 * Placement schedule (placement map 1.1.0): a place may name documents that stand in it for a
 * window of time. The reader looks at the device clock itself, so a banner appears on time and
 * without a network, and asks `nextPlacementBoundary` when the answer may change next.
 *
 * Pure functions, no React: a server component may call them. The shared table
 * `contract/fixtures/placements/placement-cases.json` (`scheduleCases`) keeps this file equal to
 * the other readers.
 *
 * Tolerant reading of a schedule:
 *  - `schedule` that is not an array (`null` included) is no schedule;
 *  - an item with `documentId: null` is a pause: the place is `empty` for its window and its
 *    `entry` is not read at all;
 *  - a broken item (not an object, no or malformed `documentId`, malformed `entry`, an instant
 *    of another form, `until` not after `from`) is skipped whole: it shows nothing and gives no
 *    boundary, and the place does not become `unreadable` because of it;
 *  - a broken permanent content is `unreadable` whatever the schedule says;
 *  - when windows overlap, the one that started LATER wins; at an equal `from`, the earlier one
 *    in the array.
 */
import {
  PLACEMENT_DOCUMENT_ID_PATTERN,
  PLACEMENT_ENTRY_MAX,
  PLACEMENT_ENTRY_PATTERN,
  resolvePlacement,
} from './placements'
import type { PlacementMapRead, PlacementResolution } from './placements'

/**
 * An instant is `YYYY-MM-DDTHH:MM:SSZ`: UTC, whole seconds, years 2000 to 2099, a real date only.
 * The pattern is checked first, then the milliseconds are computed from its parts, so a date the
 * calendar does not have is never carried over to the next month.
 */
export const PLACEMENT_INSTANT_PATTERN = /^(?:20\d{2}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|02-(?:0[1-9]|1\d|2[0-8]))|20(?:[02468][048]|[13579][26])-02-29)T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/

/** The longest delay a timer may be given; a longer wait is cut and counted again at its end. */
export const PLACEMENT_MAX_TIMER_MS = 2 ** 31 - 1

/** Milliseconds since the epoch for an instant of the contract form; `null` for anything else. */
export function placementInstantMs(value: unknown): number | null {
  if (typeof value !== 'string' || !PLACEMENT_INSTANT_PATTERN.test(value)) return null
  const [year, month, day, hour, minute, second] = value.split(/[-T:Z]/).map(Number) as [number, number, number, number, number, number]
  return Date.UTC(year, month - 1, day, hour, minute, second)
}

/** A window of the schedule after a tolerant read. Instants are milliseconds since the epoch. */
interface ScheduledRead {
  /** `null` is a pause: the place is empty for the window. */
  readonly documentId: string | null
  readonly entry: string | null
  readonly from: number
  readonly until: number
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function own(object: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined
}

/** The entry of a window: `null` for none, `undefined` for a malformed one. */
function readEntry(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value.length > PLACEMENT_ENTRY_MAX || !PLACEMENT_ENTRY_PATTERN.test(value)) return undefined
  return value
}

/** One window; `null` when it is broken and must be skipped. */
function readScheduled(value: unknown): ScheduledRead | null {
  if (!isObject(value) || !Object.hasOwn(value, 'documentId')) return null
  const documentId = value.documentId
  if (documentId !== null && (typeof documentId !== 'string' || !PLACEMENT_DOCUMENT_ID_PATTERN.test(documentId))) return null
  // A pause never reads its entry, not even a broken one.
  const entry = documentId === null ? null : readEntry(own(value, 'entry'))
  const from = placementInstantMs(own(value, 'from'))
  const until = placementInstantMs(own(value, 'until'))
  if (entry === undefined || from === null || until === null || until <= from) return null
  return { documentId, entry, from, until }
}

/** The windows of a place entry that can be read, in the order of the array. */
function readSchedule(place: unknown): readonly ScheduledRead[] {
  if (!isObject(place)) return []
  const schedule = own(place, 'schedule')
  if (!Array.isArray(schedule)) return []
  const read: ScheduledRead[] = []
  for (const item of schedule as readonly unknown[]) {
    const one = readScheduled(item)
    if (one !== null) read.push(one)
  }
  return read
}

/** The windows of the place `name`, or `undefined` when the place has no readable permanent content. */
function scheduleOf(map: PlacementMapRead, name: string): readonly ScheduledRead[] | undefined {
  const base = resolvePlacement(map, name)
  if (map.kind !== 'map' || base.status === 'unknown' || base.status === 'unreadable') return undefined
  return readSchedule(map.places[name])
}

function activeWindow(schedule: readonly ScheduledRead[], nowMs: number): ScheduledRead | null {
  let winner: ScheduledRead | null = null
  for (const item of schedule) {
    if (item.from > nowMs || nowMs >= item.until) continue
    if (winner === null || item.from > winner.from) winner = item
  }
  return winner
}

/**
 * What stands in the place `name` at the instant `nowMs`: the window that lasts (`from` included,
 * `until` excluded), otherwise the permanent content. Without a schedule it is `resolvePlacement`.
 */
export function resolvePlacementAt(map: PlacementMapRead, name: string, nowMs: number): PlacementResolution {
  const base = resolvePlacement(map, name)
  const schedule = scheduleOf(map, name)
  if (schedule === undefined) return base
  const active = activeWindow(schedule, nowMs)
  if (active === null) return base
  if (active.documentId === null) return { status: 'empty', documentId: null, entry: null }
  return { status: 'document', documentId: active.documentId, entry: active.entry }
}

/**
 * The earliest instant after `nowMs` at which `resolvePlacementAt` MAY give another answer: the
 * smallest `from` or `until` of a readable window that is later than `nowMs`. `null` means the
 * schedule will change nothing any more (or the place has none). At a boundary the answer may turn
 * out the same, for instance when another window holds the place; that is no change for the host.
 */
export function nextPlacementBoundary(map: PlacementMapRead, name: string, nowMs: number): number | null {
  const schedule = scheduleOf(map, name)
  if (schedule === undefined) return null
  let next: number | null = null
  for (const item of schedule) {
    for (const edge of [item.from, item.until]) if (edge > nowMs && (next === null || edge < next)) next = edge
  }
  return next
}

/** Ids of the documents the place `name` can show: its permanent content and every readable window. */
export function placementDocumentIds(map: PlacementMapRead, name: string): readonly string[] {
  const ids = new Set<string>()
  const base = resolvePlacement(map, name)
  if (base.documentId !== null) ids.add(base.documentId)
  for (const item of scheduleOf(map, name) ?? []) if (item.documentId !== null) ids.add(item.documentId)
  return [...ids]
}
