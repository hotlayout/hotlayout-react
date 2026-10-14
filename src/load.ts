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

/** Thrown when a published file could not be loaded, is not a JSON object, or is not the kind of file that was asked for. */
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

async function loadJson(url: string, what: string, options: LoadOptions): Promise<{ readonly file: JsonFile; readonly status: number }> {
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
    // A 200 that is not JSON is most often the HTML page a server gives for an address it does not know.
    const type = contentTypeOf(response)
    throw new HotlayoutLoadError(`The ${what} at ${url} is not JSON: the server answered ${String(response.status)}${type === '' ? '' : ` with ${type}`}. Check the address.`, url, response.status)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HotlayoutLoadError(`The ${what} at ${url} is not a JSON object.`, url, response.status)
  }
  return { file: parsed as JsonFile, status: response.status }
}

/** The content type the server named, short enough for a message; a test double may have no headers at all. */
function contentTypeOf(response: Response): string {
  const headers = response.headers as Headers | undefined
  return (headers?.get('content-type') ?? '').slice(0, 80)
}

type JsonFile = Readonly<Record<string, unknown>>

/** The fields without which a file is not a layout document at all. */
const looksLikeDocument = (file: JsonFile): boolean => typeof file.schemaVersion === 'string' && Array.isArray(file.screens)

/** The fields without which a file is not a theme contract at all. */
const looksLikeTheme = (file: JsonFile): boolean => typeof file.themeContractVersion === 'string' && typeof file.themes === 'object' && file.themes !== null && !Array.isArray(file.themes)

/**
 * Fetches a published layout document. Only its KIND is checked: the file has a
 * `schemaVersion` and a list of `screens`, so a theme or an unrelated JSON file
 * at the address is an error here and not an empty screen later. The content is
 * NOT validated: pass the result to `checkDocumentVersion` or straight to
 * `HotlayoutScreen`, which refuses a document of an incompatible schema major
 * on its own.
 */
export async function loadDocument(url: string, options: LoadOptions = {}): Promise<UiDocument> {
  const { file, status } = await loadJson(url, 'layout document', options)
  if (looksLikeDocument(file)) return file as unknown as UiDocument
  if (looksLikeTheme(file)) throw new HotlayoutLoadError(`The file at ${url} is a theme, not a layout document: the two addresses may be swapped.`, url, status)
  throw new HotlayoutLoadError(`The file at ${url} is not a layout document: it has no \`schemaVersion\` or no list of \`screens\`.`, url, status)
}

/**
 * Fetches a published theme contract (`theme/published.json`). Only its KIND is
 * checked, as for a document: the file has a `themeContractVersion` and
 * `themes`. An unreadable theme is not an error for the renderer — it falls
 * back to the built-in one — so you may also choose to swallow a
 * `HotlayoutLoadError` here.
 */
export async function loadTheme(url: string, options: LoadOptions = {}): Promise<ThemeContract> {
  const { file, status } = await loadJson(url, 'theme', options)
  if (looksLikeTheme(file)) return file as unknown as ThemeContract
  if (looksLikeDocument(file)) throw new HotlayoutLoadError(`The file at ${url} is a layout document, not a theme: the two addresses may be swapped.`, url, status)
  throw new HotlayoutLoadError(`The file at ${url} is not a theme: it has no \`themeContractVersion\` or no \`themes\`.`, url, status)
}
