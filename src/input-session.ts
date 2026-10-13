/**
 * The reader's session for input fields (schema 9.13.0, `rules.write.to`): what the person has
 * written during the run. It is the layer between the screen record and the host data
 * (`DATA_LAYER_ORDER`: record, session, host, data); conditions and bindings of this and later
 * screens read it, so `visibleIf` and an echo text on the same screen update under the finger
 * whatever the host does with `onWrite`.
 *
 * In this package the host supplies the session and its own scope together with the data (the
 * `data` prop), so the reader's session lies ON TOP of them and must yield when the host itself
 * changed the value at the same path (substituted another, normalised what was typed). So an
 * entry carries a BASE, the value in `data` at the moment of writing; as soon as that changes,
 * the session entry is dropped FOR GOOD (by event, not by comparison at render time: an
 * "A, B, A" sequence must not resurrect a dropped entry).
 *
 * No React and no DOM in this file.
 */
import type { DataScope } from './data'
import { valueAt } from './data'

export interface SessionEntry {
  readonly value: string | boolean | number
  /** The value in `data` at this path at the moment of writing. */
  readonly base: unknown
}

export type SessionEntries = ReadonlyMap<string, SessionEntry>

export const NO_SESSION: SessionEntries = new Map()

/** Write a value; the base is what `data` currently says at the path. */
export function writeSession(entries: SessionEntries, path: string, value: string | boolean | number, data: DataScope): SessionEntries {
  const next = new Map(entries)
  next.set(path, { value, base: valueAt(data, path) })
  return next
}

/** Drop entries whose base changed in `data` (the host substituted its own). If nothing was dropped, the same object is returned. */
export function pruneSession(entries: SessionEntries, data: DataScope): SessionEntries {
  let next: Map<string, SessionEntry> | undefined
  for (const [path, entry] of entries) {
    if (Object.is(valueAt(data, path), entry.base)) continue
    next ??= new Map(entries)
    next.delete(path)
  }
  return next ?? entries
}

/** The session as a flat path map, i.e. a data scope layer. An empty session gives `undefined` (no layer). */
export function sessionScope(entries: SessionEntries): DataScope | undefined {
  if (entries.size === 0) return undefined
  const scope: Record<string, unknown> = {}
  for (const [path, entry] of entries) scope[path] = entry.value
  return Object.freeze(scope)
}
