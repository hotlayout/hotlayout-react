/**
 * Fetching for placements: the map and the document a placement names. One request each, no custom
 * headers (see `load.ts` for why), no redirects followed, and a deadline of 20 s from the start of
 * the request to the end of the body.
 *
 * The browser revalidates a cached file with its ETag on its own and hands the page a plain 200, so
 * the package does not set `If-None-Match`: that header would turn the request into a preflighted
 * one. A host that wires its own `fetch` and returns the status 304 gets `notModified`.
 */
import { HotlayoutLoadError } from './load'
import { decodePlacementBody, PLACEMENTS_READ_MAX_BYTES } from './placements'
import type { PlacementDocumentOutcome, PlacementNetworkOutcome } from './placements'
import type { UiDocument } from './types'
import { checkVersion } from './version'

/** The deadline of one request: the map, or the document of a placement. */
export const PLACEMENT_REQUEST_DEADLINE_MS = 20_000

export interface LoadPlacementMapOptions {
  readonly signal?: AbortSignal | undefined
  /** `fetch` to use; defaults to the global one. */
  readonly fetch?: typeof globalThis.fetch | undefined
}

const isAbort = (cause: unknown): boolean => cause instanceof Error && cause.name === 'AbortError'

function abortError(): Error {
  const error = new Error('The placement request was aborted.')
  error.name = 'AbortError'
  return error
}

const TIMED_OUT: unique symbol = Symbol('timed out')

/**
 * Runs `work` with a signal that is aborted by the host's signal or by the deadline. Resolves with
 * `TIMED_OUT` at the deadline even if `work` ignores its signal; rejects with an `AbortError` when the
 * host aborts.
 */
function withinDeadline<T>(work: (signal: AbortSignal) => Promise<T>, hostSignal: AbortSignal | undefined): Promise<T | typeof TIMED_OUT> {
  if (hostSignal?.aborted === true) return Promise.reject(abortError())
  const controller = new AbortController()
  return new Promise<T | typeof TIMED_OUT>((resolve, reject) => {
    const onHostAbort = (): void => {
      finish()
      reject(abortError())
    }
    const timer = setTimeout(() => {
      finish()
      resolve(TIMED_OUT)
    }, PLACEMENT_REQUEST_DEADLINE_MS)
    function finish(): void {
      clearTimeout(timer)
      hostSignal?.removeEventListener('abort', onHostAbort)
      controller.abort()
    }
    hostSignal?.addEventListener('abort', onHostAbort)
    work(controller.signal).then(
      (value) => {
        finish()
        resolve(value)
      },
      (cause: unknown) => {
        finish()
        reject(cause instanceof Error ? cause : new Error(String(cause)))
      },
    )
  })
}


/* A 3xx other than 304 is never followed: the address of a map or a document is the project's storage. */
const isRedirect = (response: Response): boolean => response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400 && response.status !== 304)

const NO_REDIRECTS: RequestInit = { redirect: 'error' }

/** Reads at most `limit + 1` bytes; `null` when the body is longer than `limit` (reading stops there). */
async function readBounded(response: Response, limit: number): Promise<Uint8Array | null> {
  const body = response.body as ReadableStream<Uint8Array> | null | undefined
  if (body === null || body === undefined || typeof body.getReader !== 'function') {
    const whole = new Uint8Array(await response.arrayBuffer())
    return whole.length > limit ? null : whole
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      void reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function fetchMap(url: string, request: typeof globalThis.fetch, signal: AbortSignal): Promise<PlacementNetworkOutcome> {
  let response: Response
  try {
    response = await request(url, { ...NO_REDIRECTS, signal })
  } catch (cause) {
    if (signal.aborted) throw cause
    return { kind: 'offline' }
  }
  if (isRedirect(response)) return { kind: 'offline' }
  if (response.status === 304) return { kind: 'notModified' }
  if (response.status === 404) return { kind: 'notFound' }
  if (!response.ok) return { kind: 'offline' }
  let bytes: Uint8Array | null
  try {
    bytes = await readBounded(response, PLACEMENTS_READ_MAX_BYTES)
  } catch (cause) {
    if (signal.aborted) throw cause
    return { kind: 'offline' }
  }
  const text = bytes === null ? null : decodePlacementBody(bytes)
  return text === null ? { kind: 'corrupt' } : { kind: 'map', text }
}

/**
 * Never throws except for an abort by the caller: every other failure is `offline` (a broken
 * connection, a redirect, the deadline, 5xx, 403), and a 200 whose body is over the reader's size
 * limit or is not UTF-8 is `corrupt`.
 */
export async function loadPlacementMap(url: string, options: LoadPlacementMapOptions = {}): Promise<PlacementNetworkOutcome> {
  const request = options.fetch ?? globalThis.fetch
  try {
    const outcome = await withinDeadline((signal) => fetchMap(url, request, signal), options.signal)
    return outcome === TIMED_OUT ? { kind: 'offline' } : outcome
  } catch (cause) {
    if (options.signal?.aborted === true || isAbort(cause)) throw cause
    return { kind: 'offline' }
  }
}

/* ───────────────────────────── the document of a placement ───────────────────────────── */

/** A document and the text it was parsed from, when the package fetched it itself. */
export interface LoadedPlacementDocument {
  readonly document: unknown
  /** The body text: two reads of the same file compare equal without walking the document. */
  readonly text?: string | undefined
}

export interface PlacementDocumentRead {
  readonly outcome: PlacementDocumentOutcome
  /** Present when `outcome.kind` is `ok`. */
  readonly document?: UiDocument
  readonly text?: string | undefined
}

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The default way to get a placement's document: a 404 rejects with a `HotlayoutLoadError` of status
 * 404; a redirect, any other status and a body that is not JSON reject with another one.
 */
export async function fetchPlacementDocument(url: string, request: typeof globalThis.fetch, signal: AbortSignal): Promise<LoadedPlacementDocument> {
  const response = await request(url, { ...NO_REDIRECTS, signal })
  if (isRedirect(response) || !response.ok) throw new HotlayoutLoadError(`The layout document at ${url} answered ${String(response.status)}.`, url, response.status)
  const text = await response.text()
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    throw new HotlayoutLoadError(`The layout document at ${url} is not JSON.`, url, response.status)
  }
  return { document, text }
}

/**
 * Reads the document a placement points at, within the deadline. 404 is `missing` (it was
 * unpublished or never existed); everything else that stops the document from being drawn — no
 * network, a redirect, the deadline, a value that is not a document, a schema major this build cannot
 * read — is `unreadable`.
 */
export async function readPlacementDocument(load: (signal: AbortSignal) => Promise<LoadedPlacementDocument>, signal: AbortSignal): Promise<PlacementDocumentRead> {
  let loaded: LoadedPlacementDocument | typeof TIMED_OUT
  try {
    loaded = await withinDeadline(load, signal)
  } catch (cause) {
    if (signal.aborted) throw cause
    return { outcome: cause instanceof HotlayoutLoadError && cause.status === 404 ? { kind: 'missing' } : { kind: 'unreadable' } }
  }
  if (loaded === TIMED_OUT) return { outcome: { kind: 'unreadable' } }
  const document = loaded.document
  if (!isObject(document) || typeof document.schemaVersion !== 'string' || !Array.isArray(document.screens)) return { outcome: { kind: 'unreadable' } }
  if (checkVersion(document.schemaVersion).kind === 'incompatible') return { outcome: { kind: 'unreadable' } }
  const points: unknown = document.entryPoints
  const entryPoints = isObject(points) ? Object.keys(points) : []
  return { outcome: { kind: 'ok', entryPoints }, document: document as unknown as UiDocument, text: loaded.text }
}
