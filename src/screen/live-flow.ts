/**
 * The live record of the screen stack (schema 9.27.0, `live-record.ts`): when the host gives new
 * collections, every frame of the stack refreshes the record it holds. The stack, the show number,
 * the cause and the screen events are NOT touched: a refresh is not a show.
 */
import { useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type { DataScope } from '../data'
import { entitySourcesOf, recordOfChain, refreshRecordChain } from '../live-record'
import type { CollectionLookup, EntitySources } from '../live-record'
import { isRecord } from '../sanitize'
import type { ScreenEntry } from '../types'
import type { Flow, Frame } from './flow'

/** A collection by name as the host gave it; an own key only, so `constructor` is not a collection. */
export function lookupIn(collections: unknown): CollectionLookup {
  return (source) => (isRecord(collections) && Object.hasOwn(collections, source) ? collections[source] : undefined)
}

/**
 * The flow after the host gave new collections. Every frame with links looks them up again; a
 * frame whose links did not change is the same object, and when no frame changed the flow itself is
 * the same object (so the reader makes no new state).
 */
export function refreshFlowRecords(flow: Flow, lookup: CollectionLookup, sources: EntitySources, safe: (record: DataScope | undefined) => DataScope | undefined): Flow {
  const stack = flow.stack.map((frame): Frame => {
    if (frame.links === undefined || frame.links.length === 0) return frame
    const links = refreshRecordChain(frame.links, lookup, sources)
    if (links === frame.links) return frame
    const record = safe(recordOfChain(links))
    return record === undefined ? { screenId: frame.screenId, links } : { screenId: frame.screenId, record, links }
  })
  return stack.some((frame, index) => frame !== flow.stack[index]) ? { ...flow, stack } : flow
}

/**
 * Refreshes the records of the stack whenever the host passes other collections. It happens while
 * rendering (the same step as the reset of a flow), so the screen never paints one frame with the
 * old record. Nothing is read from a collection that is not a list, and a collection the document
 * does not name is not searched.
 */
export function useLiveRecords({
  current,
  setFlow,
  collections,
  screens,
  safe,
}: {
  readonly current: Flow
  readonly setFlow: Dispatch<SetStateAction<Flow>>
  readonly collections: unknown
  readonly screens: readonly ScreenEntry[]
  readonly safe: (record: DataScope | undefined) => DataScope | undefined
}): Flow {
  const sources = useMemo(() => entitySourcesOf(screens.map((screen) => screen.root)), [screens])
  const [seen, setSeen] = useState<unknown>(collections)
  if (seen === collections) return current
  setSeen(collections)
  const next = refreshFlowRecords(current, lookupIn(collections), sources, safe)
  if (next === current) return current
  setFlow(next)
  return next
}
