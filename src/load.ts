/**
 * Loaders: SEPARATE from the renderer and optional.
 *
 * The package does not impose a network layer: `HotlayoutScreen` draws what it is given, and
 * where that came from is the host's business (its own client, a request cache, server
 * rendering). These two functions serve the simplest case, "there is a URL of a published
 * file", and carry exactly one piece of knowledge: do NOT add custom request headers.
 */
import type { ThemeContract } from './theme'
import type { UiDocument } from './types'

export interface LoadOptions {
  /** Cancels the request. */
  readonly signal?: AbortSignal | undefined
  /** `fetch` to use — for tests, Node without a global `fetch`, or a wrapped client. Defaults to the global one. */
  readonly fetch?: typeof globalThis.fetch | undefined
  /**
   * Appends a unique query parameter so that no intermediate cache can answer.
   * This is how to bypass a cache in a browser: a `Cache-Control` REQUEST
   * header would turn the request into a preflighted one, and a bucket that
   * does not allow that header makes the request fail as `Failed to fetch`.
   */
  readonly bypassCache?: boolean | undefined
}

/** Thrown when a published file could not be loaded or is not a JSON object. */
export class HotlayoutLoadError extends Error {
  /** HTTP status, when the server answered at all. */
  readonly status: number | undefined
  readonly url: string

  constructor(message: string, url: string, status?: number) {
    super(message)
    this.name = 'HotlayoutLoadError'
    this.url = url
    this.status = status
  }
}

function withCacheBypass(url: string): string {
  const stamp = `_req=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  const hash = url.indexOf('#')
  const base = hash === -1 ? url : url.slice(0, hash)
  const fragment = hash === -1 ? '' : url.slice(hash)
  return `${base}${base.includes('?') ? '&' : '?'}${stamp}${fragment}`
}

async function loadJson(url: string, what: string, options: LoadOptions): Promise<Readonly<Record<string, unknown>>> {
  const request = options.fetch ?? globalThis.fetch
  let response: Response
  try {
    /*
     * NO custom headers: any of them (`Cache-Control`, `Authorization` for a public file) makes
     * the request "non-simple", and the browser sends a preflight first. A published document and
     * theme are publicly readable.
     */
    response = await request(options.bypassCache === true ? withCacheBypass(url) : url, options.signal === undefined ? {} : { signal: options.signal })
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') throw cause
    throw new HotlayoutLoadError(
      `The ${what} could not be fetched from ${url}. In a browser this is either no network or CORS: if curl gets 200 for the same URL, check the allowed origins of the storage.`,
      url,
    )
  }
  if (!response.ok) throw new HotlayoutLoadError(`The ${what} at ${url} answered ${String(response.status)}.`, url, response.status)

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new HotlayoutLoadError(`The ${what} at ${url} is not JSON.`, url, response.status)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HotlayoutLoadError(`The ${what} at ${url} is not a JSON object.`, url, response.status)
  }
  return parsed as Readonly<Record<string, unknown>>
}

/**
 * Fetches a published layout document. The result is NOT validated: pass it to
 * `checkDocumentVersion` or straight to `HotlayoutScreen`, which refuses a
 * document of an incompatible schema major on its own.
 */
export async function loadDocument(url: string, options: LoadOptions = {}): Promise<UiDocument> {
  return (await loadJson(url, 'layout document', options)) as unknown as UiDocument
}

/**
 * Fetches a published theme contract (`theme/published.json`). An unreadable
 * theme is not an error for the renderer — it falls back to the built-in one —
 * so you may also choose to swallow a `HotlayoutLoadError` here.
 */
export async function loadTheme(url: string, options: LoadOptions = {}): Promise<ThemeContract> {
  return (await loadJson(url, 'theme', options)) as unknown as ThemeContract
}
