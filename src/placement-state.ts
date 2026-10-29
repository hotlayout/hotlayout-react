/**
 * One pass of the placement reader: map from the network (or its fallbacks), the name resolved
 * against it, the document read, the showing decided. No React here, so a test or a server can
 * run it without a component.
 */
import { fetchPlacementDocument, loadPlacementMap, readPlacementDocument } from './placement-load'
import type { PlacementDocumentRead } from './placement-load'
import { nextPlacementBoundary, placementDocumentIds, resolvePlacementAt } from './placement-schedule'
import { pickPlacementMap, placementShowing } from './placements'
import type { PlacementMapRead, PlacementReport, PlacementSourceStatus } from './placements'
import type { UiDocument } from './types'

/**
 * Where the last known map text is kept between runs. `key` is the address of the map: keep the
 * texts of different addresses apart, or one project's map would be served for another. A store
 * given to one placement of one project may ignore it.
 */
export interface PlacementMapStore {
  read(key: string): string | undefined
  write(text: string, key: string): void
}

export interface PlacementSettings {
  /** Address of the published map (`placements/published.json` of the project). Readable without a token. */
  readonly mapUrl: string
  /** Address of the published document with this id. Only an id of the contract form is ever passed. */
  readonly documentUrl: (documentId: string) => string
  /** The map shipped with the app, as the text of the file. Used when the network and the last known map give nothing. */
  readonly bundledMap?: string | undefined
  /** Keeps the last good map. Default: `localStorage`, guarded. `false` keeps nothing. */
  readonly lastKnown?: PlacementMapStore | false | undefined
  /** `fetch` to use for the map and the default document loader. */
  readonly fetch?: typeof globalThis.fetch | undefined
  /**
   * Your own way to get a document by id (a cache, an API). Defaults to a plain request to
   * `documentUrl(id)`. Reject with a `HotlayoutLoadError` of status 404 for a document that is gone,
   * and drop it from your cache then. The same 20 s deadline applies; a value that is not a document
   * is `documentUnreadable`.
   */
  readonly loadDocument?: ((documentId: string, signal: AbortSignal) => Promise<UiDocument>) | undefined
  /**
   * The clock the schedule of the placement is read against: milliseconds since the epoch.
   * Default `Date.now` (the device clock, no network). Pass your own to pin or shift time in tests.
   */
  readonly clock?: (() => number) | undefined
}

/** What a placement is doing now. */
export type PlacementState =
  /** Nothing has been read yet (also what a server render sees). */
  | { readonly status: 'loading' }
  /** A document stands here. `report` is `entryMissing` when the named entry point is gone and the first screen is shown. */
  | {
      readonly status: 'document'
      readonly document: UiDocument
      readonly documentId: string
      readonly entry: string | null
      readonly mapStatus: PlacementSourceStatus
      readonly report: 'entryMissing' | null
    }
  /** Nothing is drawn; `report` says why. */
  | { readonly status: 'nothing'; readonly report: PlacementReport; readonly mapStatus: PlacementSourceStatus }

export const LOADING: PlacementState = { status: 'loading' }

const STORAGE_PREFIX = 'hotlayout.placements:'

/** The default store: `localStorage` under the map address, every access guarded (private windows, blocked storage). */
export const browserMapStore: PlacementMapStore = {
  read(key) {
    try {
      return globalThis.localStorage.getItem(`${STORAGE_PREFIX}${key}`) ?? undefined
    } catch {
      return undefined
    }
  },
  write(text, key) {
    try {
      globalThis.localStorage.setItem(`${STORAGE_PREFIX}${key}`, text)
    } catch {
      // No storage: the next run falls back to the bundled map.
    }
  },
}

function storeOf(settings: PlacementSettings): PlacementMapStore | undefined {
  if (settings.lastKnown === false) return undefined
  return settings.lastKnown ?? browserMapStore
}

/*
 * The text a document was parsed from, when the package fetched it: two reads of the same file
 * compare by this string, never by walking (or stringifying) the document.
 */
const documentTexts = new WeakMap<object, string>()

/** Whether two documents are the same file: the same object, or parsed from the same text. */
export function sameDocument(a: UiDocument, b: UiDocument): boolean {
  if (a === b) return true
  const textA = documentTexts.get(a)
  return textA !== undefined && textA === documentTexts.get(b)
}

function abortError(): Error {
  const error = new Error('The placement read was aborted.')
  error.name = 'AbortError'
  return error
}

/** The map a read settled on, kept so the clock alone can re-decide the placement without the network. */
export interface HeldMap {
  readonly map: PlacementMapRead
  readonly status: PlacementSourceStatus
}

/** A settled placement and the instant at which the clock may change it (`null`: never). */
export interface PlacementRun {
  readonly state: PlacementState
  readonly boundary: number | null
}

export const nowOf = (settings: PlacementSettings): number => {
  const value = (settings.clock ?? Date.now)()
  return Number.isFinite(value) ? value : Date.now()
}

/** Reads the map: the network, then the fallbacks. An aborted run writes nothing to the store. */
export async function readPlacementMapOnce(settings: PlacementSettings, signal: AbortSignal): Promise<HeldMap> {
  const store = storeOf(settings)
  const { mapUrl } = settings
  const network = await loadPlacementMap(mapUrl, { signal, fetch: settings.fetch })
  if (signal.aborted) throw abortError()
  const decision = pickPlacementMap({ network, lastKnown: store?.read(mapUrl), bundled: settings.bundledMap })
  if (decision.remember && network.kind === 'map') store?.write(network.text, mapUrl)
  return { map: decision.map, status: decision.status }
}

/*
 * Documents read so far by one mounted placement, per map address and id. A window of the schedule opens with no network
 * needed only if its document is already here: the reading pass loads the documents of every window
 * ahead of time, and a failed read falls back on the last good copy. A 404 drops the copy.
 */
export type PlacementDocumentCache = Map<string, PlacementDocumentRead>
const DOCUMENT_CACHE_MAX = 64

async function readDocumentOnce(documentId: string, settings: PlacementSettings, signal: AbortSignal, cache: PlacementDocumentCache | undefined): Promise<PlacementDocumentRead> {
  const hostLoader = settings.loadDocument
  const read = await readPlacementDocument(
    (requestSignal) =>
      hostLoader === undefined
        ? fetchPlacementDocument(settings.documentUrl(documentId), settings.fetch ?? globalThis.fetch, requestSignal)
        : hostLoader(documentId, requestSignal).then((document: unknown) => ({ document })),
    signal,
  )
  if (cache === undefined) return read
  const key = `${settings.mapUrl}\u0000${documentId}`
  if (read.outcome.kind === 'ok') {
    cache.delete(key)
    cache.set(key, read)
    const oldest = cache.keys().next()
    if (cache.size > DOCUMENT_CACHE_MAX && oldest.done !== true) cache.delete(oldest.value)
  } else if (read.outcome.kind === 'missing') {
    cache.delete(key)
  } else {
    return cache.get(key) ?? read
  }
  return read
}

/** Loads the documents of every window of the place in the background, so a boundary needs no network. */
function prefetchDocuments(name: string, settings: PlacementSettings, held: HeldMap, signal: AbortSignal, cache: PlacementDocumentCache | undefined): void {
  if (cache === undefined) return
  for (const id of placementDocumentIds(held.map, name)) {
    if (!cache.has(`${settings.mapUrl}\u0000${id}`)) readDocumentOnce(id, settings, signal, cache).catch(() => undefined)
  }
}

/** Decides the placement `name` on a map already read, at the moment the clock shows. */
export async function decidePlacement(name: string, settings: PlacementSettings, held: HeldMap, signal: AbortSignal, cache?: PlacementDocumentCache): Promise<PlacementRun> {
  const nowMs = nowOf(settings)
  const boundary = nextPlacementBoundary(held.map, name, nowMs)
  const resolution = resolvePlacementAt(held.map, name, nowMs)
  if (resolution.status !== 'document' || resolution.documentId === null) {
    const showing = placementShowing(resolution)
    return { state: { status: 'nothing', report: showing.report ?? 'unreadable', mapStatus: held.status }, boundary }
  }
  const documentId = resolution.documentId
  const read = await readDocumentOnce(documentId, settings, signal, cache)
  const showing = placementShowing(resolution, read.outcome)
  if (showing.show === 'document' && read.document !== undefined) {
    if (read.text !== undefined) documentTexts.set(read.document, read.text)
    const state: PlacementState = { status: 'document', document: read.document, documentId, entry: showing.entry, mapStatus: held.status, report: showing.report === 'entryMissing' ? 'entryMissing' : null }
    return { state, boundary }
  }
  return { state: { status: 'nothing', report: showing.report ?? 'documentUnreadable', mapStatus: held.status }, boundary }
}

/** The whole pass: read the map, then decide at the moment the clock shows. */
export async function runPlacement(name: string, settings: PlacementSettings, signal: AbortSignal, cache?: PlacementDocumentCache): Promise<PlacementRun & { readonly held: HeldMap }> {
  const held = await readPlacementMapOnce(settings, signal)
  const run = await decidePlacement(name, settings, held, signal, cache)
  prefetchDocuments(name, settings, held, signal, cache)
  return { ...run, held }
}

/**
 * A rejected abort is the only thing that escapes; every other failure becomes a state. An aborted
 * run (a newer one started, the component went away) writes nothing to the store.
 */
export async function computePlacement(name: string, settings: PlacementSettings, signal: AbortSignal): Promise<PlacementState> {
  return (await runPlacement(name, settings, signal)).state
}
