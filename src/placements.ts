/**
 * Placements: the placement map file, the rule that resolves a name against it, where the reader
 * takes the map from, and what a placement draws.
 *
 * A placement is a NAME the application puts in its code (`home.banner`); which published
 * document stands there is decided in the admin and written to `placements/published.json`. The
 * file comes from the network, so it is untrusted input: its `documentId` becomes a segment of an
 * address, its keys are looked up among OWN keys only, and a broken entry spoils only its own
 * placement.
 *
 * Pure functions, no React: a server component may call them. The shared table
 * `contract/fixtures/placements/placement-cases.json` keeps this file equal to the other readers.
 */

/** The version of the placement contract this reader is written for. */
export const READER_PLACEMENTS_VERSION = '1.1.0'

/* The major is compared as a STRING of digits: a twenty-digit major must never wrap or round to 1. */
const READER_MAJOR = '1'

/**
 * The reader's own limits on a map body, whoever wrote it (`x-placementReading.body`): more bytes
 * than this, or more nested arrays and objects than this anywhere, is a `corrupt` map.
 */
export const PLACEMENTS_READ_MAX_BYTES = 262_144
export const PLACEMENTS_READ_MAX_DEPTH = 32

/** Name of a placement: dot-separated lowercase segments (`home.banner`, `promo.raffle-button`). */
export const PLACEMENT_NAME_PATTERN = /^[a-z][a-z0-9]*(\.[a-z0-9-]+)*$/
export const PLACEMENT_NAME_MAX = 64
/** A document id is a path segment: it can never be `.`, `..` or contain a slash. */
export const PLACEMENT_DOCUMENT_ID_PATTERN = /^(?!\.+$)[A-Za-z0-9._-]{1,64}$/
/** The same form as the entry points of a document. */
export const PLACEMENT_ENTRY_PATTERN = /^[a-z0-9][a-z0-9-]*$/
export const PLACEMENT_ENTRY_MAX = 48

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** Whether a string can be the name of a placement. */
export function isPlacementName(name: string): boolean {
  return name.length <= PLACEMENT_NAME_MAX && PLACEMENT_NAME_PATTERN.test(name)
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function own(object: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined
}

/* ───────────────────────────── reading the map ───────────────────────────── */

/**
 * The map after a tolerant read: `map` — readable (places are parsed lazily, one by one);
 * `corrupt` — not a map at all; `unsupported` — a map of another major version.
 */
export type PlacementMapRead =
  | { readonly kind: 'map'; readonly version: string; readonly places: Readonly<Record<string, unknown>> }
  | { readonly kind: 'corrupt' }
  | { readonly kind: 'unsupported' }

/** Parsed JSON → map. Unknown fields are skipped; limits of count and size are the publisher's, not the reader's. */
export function readPlacementMap(raw: unknown): PlacementMapRead {
  if (!isObject(raw)) return { kind: 'corrupt' }
  const version = own(raw, 'placementsVersion')
  if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) return { kind: 'corrupt' }
  if (version.slice(0, version.indexOf('.')) !== READER_MAJOR) return { kind: 'unsupported' }
  const places = own(raw, 'placements')
  if (!isObject(places)) return { kind: 'corrupt' }
  return { kind: 'map', version, places }
}

/**
 * Whether JSON text nests more than `max` arrays and objects (the root counts as one). Brackets are
 * counted outside strings, BEFORE parsing, so a deep body is refused without asking the parser.
 */
export function jsonNestingExceeds(text: string, max: number): boolean {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (inString) {
      if (escaped) escaped = false
      else if (code === 0x5c) escaped = true
      else if (code === 0x22) inString = false
    } else if (code === 0x22) inString = true
    else if (code === 0x7b || code === 0x5b) {
      depth += 1
      if (depth > max) return true
    } else if (code === 0x7d || code === 0x5d) depth -= 1
  }
  return false
}

/* Every UTF-16 unit is at least one UTF-8 byte, so a long text is refused without encoding it. */
function utf8LengthExceeds(text: string, max: number): boolean {
  return text.length > max || new TextEncoder().encode(text).length > max
}

/**
 * The text of the file → map. Text that is not JSON is `corrupt`, not an exception. One U+FEFF at
 * the start is skipped; more than `PLACEMENTS_READ_MAX_BYTES` UTF-8 bytes or more than
 * `PLACEMENTS_READ_MAX_DEPTH` levels is `corrupt`.
 */
export function readPlacementMapText(text: string): PlacementMapRead {
  if (utf8LengthExceeds(text, PLACEMENTS_READ_MAX_BYTES)) return { kind: 'corrupt' }
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  if (jsonNestingExceeds(body, PLACEMENTS_READ_MAX_DEPTH)) return { kind: 'corrupt' }
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    return { kind: 'corrupt' }
  }
  return readPlacementMap(raw)
}

/**
 * Body bytes → text: `null` when the body is over the limit or is not strict UTF-8 (no U+FFFD
 * replacement: `c0 af` must not become anything). A leading BOM stays in the text;
 * `readPlacementMapText` skips it.
 */
export function decodePlacementBody(bytes: Uint8Array): string | null {
  if (bytes.length > PLACEMENTS_READ_MAX_BYTES) return null
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return null
  }
}

/** The bytes of a map body → map: the size, UTF-8, BOM and depth rules, then `readPlacementMapText`. */
export function readPlacementMapBytes(bytes: Uint8Array): PlacementMapRead {
  const text = decodePlacementBody(bytes)
  return text === null ? { kind: 'corrupt' } : readPlacementMapText(text)
}

type PlaceRead =
  | { readonly kind: 'document'; readonly documentId: string; readonly entry: string | null }
  | { readonly kind: 'empty' }
  | { readonly kind: 'unreadable' }

/** One entry of the map. `entry: null` is the same as no entry; an empty placement ignores its entry. */
function readPlace(value: unknown): PlaceRead {
  if (!isObject(value) || !Object.hasOwn(value, 'documentId')) return { kind: 'unreadable' }
  const documentId = value.documentId
  if (documentId === null) return { kind: 'empty' }
  if (typeof documentId !== 'string' || !PLACEMENT_DOCUMENT_ID_PATTERN.test(documentId)) return { kind: 'unreadable' }
  const entry = own(value, 'entry')
  if (entry === undefined || entry === null) return { kind: 'document', documentId, entry: null }
  if (typeof entry !== 'string' || entry.length > PLACEMENT_ENTRY_MAX || !PLACEMENT_ENTRY_PATTERN.test(entry)) return { kind: 'unreadable' }
  return { kind: 'document', documentId, entry }
}

export type PlacementStatus = 'document' | 'empty' | 'unknown' | 'unreadable'

/** What stands in a placement. One shape for every status. */
export interface PlacementResolution {
  readonly status: PlacementStatus
  readonly documentId: string | null
  readonly entry: string | null
}

const NOTHING = { documentId: null, entry: null } as const

/**
 * What stands in the placement `name`. The ORDER of the checks is part of the rule: a map that
 * could not be read makes every name `unreadable`; a name of the wrong form is `unknown`; only
 * then the own key is looked up (`constructor` is a placement only when the map has it).
 */
export function resolvePlacement(map: PlacementMapRead, name: string): PlacementResolution {
  if (map.kind !== 'map') return { status: 'unreadable', ...NOTHING }
  if (!isPlacementName(name) || !Object.hasOwn(map.places, name)) return { status: 'unknown', ...NOTHING }
  const place = readPlace(map.places[name])
  if (place.kind === 'document') return { status: 'document', documentId: place.documentId, entry: place.entry }
  return { status: place.kind, ...NOTHING }
}

/* ───────────────────────────── where the map comes from ───────────────────────────── */

/** What the network answered. */
export type PlacementNetworkOutcome =
  /** 200 with a body that passed the body rules (size, UTF-8). */
  | { readonly kind: 'map'; readonly text: string }
  /** 200 whose body is over the reader's size limit or is not UTF-8. */
  | { readonly kind: 'corrupt' }
  /** 304: the file is the last known one. */
  | { readonly kind: 'notModified' }
  /** 404: the project has not published placements. */
  | { readonly kind: 'notFound' }
  /** A broken connection, the deadline, a redirect, 5xx, 403: no answer. */
  | { readonly kind: 'offline' }

export interface PlacementSourceInput {
  readonly network: PlacementNetworkOutcome
  /** The text kept from the last good network answer. */
  readonly lastKnown?: string | undefined
  /** The copy the host ships with the app. */
  readonly bundled?: string | undefined
}

/**
 * Why the map is what it is. "The network is silent" (`offline`) is not "the map is broken"
 * (`corrupt`, `unsupported`) and not "never published" (`notPublished`): the host shows and the
 * support looks for different things.
 */
export type PlacementSourceStatus = 'fresh' | 'offline' | 'corrupt' | 'unsupported' | 'notPublished'

export interface PlacementSourceDecision {
  /** Whose map was taken; `none` — no map could be read. */
  readonly source: 'network' | 'lastKnown' | 'bundled' | 'none'
  readonly status: PlacementSourceStatus
  /** Whether to keep the network text as the new last known one: a fresh readable map only. */
  readonly remember: boolean
  readonly map: PlacementMapRead
}

/* Without any map: never published — every placement is `unknown` (the server told the truth); otherwise `unreadable`. */
const NO_MAP_PUBLISHED: PlacementMapRead = { kind: 'map', version: READER_PLACEMENTS_VERSION, places: {} }
const NO_MAP_READ: PlacementMapRead = { kind: 'corrupt' }

function fallbackFrom(input: PlacementSourceInput, status: PlacementSourceStatus): PlacementSourceDecision {
  const last = input.lastKnown === undefined ? undefined : readPlacementMapText(input.lastKnown)
  if (last?.kind === 'map') return { source: 'lastKnown', status, remember: false, map: last }
  const bundled = input.bundled === undefined ? undefined : readPlacementMapText(input.bundled)
  if (bundled?.kind === 'map') return { source: 'bundled', status, remember: false, map: bundled }
  return { source: 'none', status, remember: false, map: status === 'notPublished' ? NO_MAP_PUBLISHED : NO_MAP_READ }
}

/** Which map to use. The fallbacks go in the same order for every reason: last known, then bundled. */
export function pickPlacementMap(input: PlacementSourceInput): PlacementSourceDecision {
  const { network } = input
  if (network.kind === 'corrupt') return fallbackFrom(input, 'corrupt')
  if (network.kind === 'map') {
    const read = readPlacementMapText(network.text)
    if (read.kind === 'map') return { source: 'network', status: 'fresh', remember: true, map: read }
    return fallbackFrom(input, read.kind)
  }
  if (network.kind === 'notModified') {
    const last = input.lastKnown === undefined ? undefined : readPlacementMapText(input.lastKnown)
    if (last?.kind === 'map') return { source: 'lastKnown', status: 'fresh', remember: false, map: last }
    // 304 without a readable last known map is the same as no answer.
    return fallbackFrom({ ...input, lastKnown: undefined }, 'offline')
  }
  return fallbackFrom(input, network.kind === 'notFound' ? 'notPublished' : 'offline')
}

/* ───────────────────────────── what the placement draws ───────────────────────────── */

/** How reading the placement's document ended — AFTER the document reader's own fallbacks. */
export type PlacementDocumentOutcome =
  | { readonly kind: 'ok'; readonly entryPoints: readonly string[] }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unreadable' }

/** Why a placement draws nothing — or draws from the first screen. What the host is told. */
export type PlacementReport = 'empty' | 'unknown' | 'unreadable' | 'documentMissing' | 'documentUnreadable' | 'entryMissing'

export interface PlacementShowing {
  readonly show: 'document' | 'nothing'
  /** The entry point to start from; `null` — the initial screen of the document. */
  readonly entry: string | null
  /** What to tell the host; `null` — nothing. */
  readonly report: PlacementReport | null
}

/**
 * What the placement draws. An entry point the document does not have starts at the initial
 * screen (names outlive documents) and the host hears `entryMissing`: someone has to fix the setup.
 */
export function placementShowing(resolution: PlacementResolution, document?: PlacementDocumentOutcome): PlacementShowing {
  if (resolution.status !== 'document') return { show: 'nothing', entry: null, report: resolution.status }
  if (document === undefined || document.kind === 'unreadable') return { show: 'nothing', entry: null, report: 'documentUnreadable' }
  if (document.kind === 'missing') return { show: 'nothing', entry: null, report: 'documentMissing' }
  if (resolution.entry === null) return { show: 'document', entry: null, report: null }
  if (document.entryPoints.includes(resolution.entry)) return { show: 'document', entry: resolution.entry, report: null }
  return { show: 'document', entry: null, report: 'entryMissing' }
}

/* ───────────────────────────── what the host hears ───────────────────────────── */

/** A settled state of a placement, as far as the host is concerned. */
export type PlacementSettled =
  | {
      readonly status: 'document'
      readonly documentId: string
      readonly entry: string | null
      readonly report: 'entryMissing' | null
      readonly mapStatus: PlacementSourceStatus
    }
  | { readonly status: 'nothing'; readonly report: PlacementReport; readonly mapStatus: PlacementSourceStatus }

/** What the host is told. One shape for both states; `nothing` has no document and no entry. */
export interface PlacementEvent {
  readonly status: 'document' | 'nothing'
  readonly report: PlacementReport | null
  readonly mapStatus: PlacementSourceStatus
  readonly documentId: string | null
  readonly entry: string | null
}

function eventOf(state: PlacementSettled): PlacementEvent {
  if (state.status === 'nothing') return { status: 'nothing', report: state.report, mapStatus: state.mapStatus, documentId: null, entry: null }
  return { status: 'document', report: state.report, mapStatus: state.mapStatus, documentId: state.documentId, entry: state.entry }
}

/**
 * The event for a change of state, or `null` when nothing the host can see changed. The first
 * settled state is told, and so is a document shown again (`status: 'document'`, `report: null`):
 * a host that collapsed its frame must hear when to open it. New content of the same document is
 * not a change of the placement.
 */
export function placementEvent(previous: PlacementSettled | null, next: PlacementSettled): PlacementEvent | null {
  const event = eventOf(next)
  if (previous === null) return event
  const before = eventOf(previous)
  const same = before.status === event.status && before.report === event.report && before.mapStatus === event.mapStatus && before.documentId === event.documentId && before.entry === event.entry
  return same ? null : event
}
