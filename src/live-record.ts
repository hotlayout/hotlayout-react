/**
 * The live record of a page (schema 9.27.0, `x-liveRecord`). A mirror of the contract's reference
 * rule; the groups `entitySourceCases`, `liveRecordCases` and `liveFlowCases` of
 * `contract/fixtures/scope/record-scope-cases.json` keep the two copies together.
 *
 * The record a frame of the stack holds is a CHAIN of links, one per `Repeater` instance the record
 * came from (outer first): the collection the list read, the entity, and the fields of the record.
 * The record of the frame is the overlay of the links (`recordOfChain`) - exactly what the rule of
 * 9.2.0 gave. Whenever the host gives new collections, every frame looks its links up by the key
 * `<item>.id`: first in the collection of the link, then in the other collections of the same
 * entity that the document names. The first record with the key replaces the link whole; a link
 * that is found nowhere keeps the last record it had. Nothing else changes: a refresh is not a show.
 *
 * ZERO IMPORTS beyond the record scope.
 */
import type { RecordScope } from './record-scope'
import { instanceRecord, overlayRecord } from './record-scope'

/** The name of the key field in a record of an entity: `task.id` for `task`. */
export const LIVE_RECORD_KEY_FIELD = 'id'

/** One link: the `Repeater` instance a record came from. */
export interface RecordLink {
  readonly source: string
  readonly item: string
  /** The fields of the record, short names or full paths, as the host gave them. */
  readonly fields: Readonly<Record<string, unknown>>
}

/** The links of a frame, outer first; empty - a frame without a record. */
export type RecordChain = readonly RecordLink[]

/** A collection by name as the list reads it; anything that is not a list holds no records. */
export type CollectionLookup = (source: string) => unknown

/** The collections of every entity, in the order of the document. */
export type EntitySources = ReadonlyMap<string, readonly string[]>

/** The key of a record: a non-empty string or a finite number. Anything else - the record is not live. */
export function liveKeyOf(item: string, fields: Readonly<Record<string, unknown>>): string | number | undefined {
  const key = instanceRecord(item, fields)[`${item}.${LIVE_RECORD_KEY_FIELD}`]
  if (typeof key === 'string') return key.length > 0 ? key : undefined
  if (typeof key === 'number') return Number.isFinite(key) ? key : undefined
  return undefined
}

/** The record of a frame from its chain: the overlay of the links, the inner one stronger. */
export function recordOfChain(chain: RecordChain): RecordScope | undefined {
  let record: RecordScope | undefined
  for (const link of chain) record = overlayRecord(record, instanceRecord(link.item, link.fields))
  return record
}

/** The chain of a node: the links of its frame, and over them the instances the node is drawn in. */
export function chainWith(frame: RecordChain | undefined, instances: RecordChain | undefined): RecordChain {
  if (instances === undefined || instances.length === 0) return frame ?? []
  return frame === undefined || frame.length === 0 ? instances : [...frame, ...instances]
}

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The deepest tree the walk below goes into; the reader draws 32 levels, the walk is more patient. */
const WALK_DEPTH = 64

/**
 * The collections of every entity as the DOCUMENT names them: the `source` of every `Repeater` with
 * that `item`, screens in the order of the document, depth first, each collection once. The reader
 * has no data dictionary; the document is all it knows about which collections carry one entity.
 */
export function entitySourcesOf(roots: readonly unknown[]): EntitySources {
  const found = new Map<string, string[]>()
  const walk = (value: unknown, depth: number): void => {
    if (!isPlainRecord(value) || depth > WALK_DEPTH) return
    if (value.type === 'Repeater' && isPlainRecord(value.props)) {
      const { source, item } = value.props
      if (typeof source === 'string' && source.length > 0 && typeof item === 'string' && item.length > 0) {
        const list = found.get(item) ?? []
        if (!list.includes(source)) list.push(source)
        found.set(item, list)
      }
    }
    if (Array.isArray(value.children)) for (const child of value.children as readonly unknown[]) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)
  return found
}

/** Where to look for a link: its own collection first, then the other collections of the entity. */
export function searchOrderOf(link: RecordLink, sources: EntitySources): readonly string[] {
  return [link.source, ...(sources.get(link.item) ?? []).filter((source) => source !== link.source)]
}

/** The record of a link in the collections as they are now; `undefined` - not live, or found nowhere. */
export function findLiveRecord(link: RecordLink, collections: CollectionLookup, sources: EntitySources): Readonly<Record<string, unknown>> | undefined {
  const key = liveKeyOf(link.item, link.fields)
  if (key === undefined) return undefined
  for (const source of searchOrderOf(link, sources)) {
    const listed = collections(source)
    if (!Array.isArray(listed)) continue
    for (const candidate of listed as readonly unknown[]) {
      if (isPlainRecord(candidate) && liveKeyOf(link.item, candidate) === key) return candidate
    }
  }
  return undefined
}

/** The same record: the same paths with the same values (a short name and a full path are one field, `null` - none). */
function sameRecord(item: string, a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean {
  if (a === b) return true
  const left = instanceRecord(item, a)
  const right = instanceRecord(item, b)
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every((key) => Object.hasOwn(right, key) && Object.is(left[key], right[key]))
}

/**
 * The chain of a frame once the host has given new collections. A link that is found takes the new
 * record whole; one that is not found keeps the last one. Nothing changed - the same object, so the
 * reader does not make a new frame of the stack.
 */
export function refreshRecordChain(chain: RecordChain, collections: CollectionLookup, sources: EntitySources): RecordChain {
  const next = chain.map((link) => {
    const found = findLiveRecord(link, collections, sources)
    return found === undefined || sameRecord(link.item, found, link.fields) ? link : { source: link.source, item: link.item, fields: found }
  })
  return next.some((link, index) => link !== chain[index]) ? next : chain
}

/** `x-liveRecord` of the artifact, whole; a test compares the two. */
export const LIVE_RECORD_RULES = {
  appliesTo: 'every record a frame of the stack holds (x-dataScope): opened from a list row, inherited by a modal layer, carried by «carryRecord»',
  field: 'none: no document field turns it on, and no document changes its meaning while the data stays the same',
  chain: 'the record of a frame is the overlay of the records of the Repeater instances it came from, outer first; every instance remembers its collection («Repeater.source»), its entity («Repeater.item») and its fields',
  key: {
    path: '<item>.id',
    field: 'id',
    types: 'a non-empty string or a finite number; any other value or no field — the instance is not live and keeps the fields the screen was opened with',
    compare: 'the same JSON type and equal without conversion: 7 and "7" are two records',
  },
  when: 'whenever the reader is given new collections; every frame of the stack, not only the top one',
  search: {
    order: ['source', 'entity'],
    source: 'the collection the list read, under «Repeater.source», as the host gives it now: not filtered by «where», not bounded by «limit»',
    entity: 'then every other collection the document names for the same entity: the «source» of every Repeater with the same «item», screens in document order, depth first, each collection once',
    duplicates: 'the first record with the key in the order of the collection',
    notAList: 'a collection that is absent or not a list holds no records',
  },
  found: 'the instance takes the found record whole: a field the new record lacks is gone from that instance',
  notFound: 'the instance keeps the last record it had: it neither empties nor goes back to the record of the navigation',
  notAShow: 'the stack, the screen-shown event, analytics and the show cause do not change; the screen keeps its scroll, carousels and inputs',
  layers: 'unchanged: record, session, host, data',
  valueTransition: 'a bound value that changed animates as any changed value does («animateChanges»)',
  handed: 'actions on the screen carry the refreshed record to the host',
  olderReader: 'keeps the record the screen was opened with until the screen leaves the stack',
  editorPreview: 'the preview refreshes the record when the data scenario or the data dictionary changes',
  cases: 'contract/fixtures/scope/record-scope-cases.json (liveRecordCases, liveFlowCases)',
} as const
