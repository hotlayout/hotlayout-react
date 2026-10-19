/**
 * IMAGE POLICY: which address from the document or from the data the reader will load.
 *
 * An image is the only place where a document LEGITIMATELY names an address (`Image.source`,
 * a background image, a list row thumbnail). An address is a request from the host page on
 * behalf of its user: to a foreign host it carries the IP, the time and a `Referer` header. So
 * the rule is short and closed:
 *
 *  - by default only an absolute `https:` address with a public host name (the form of an
 *    `openUrl` link: no IP literal, no `localhost`, no credentials). `http:`, `data:`, `blob:`, `javascript:`,
 *    `vbscript:`, `file:` and relative addresses get a placeholder and a report;
 *  - the host may say its own word through the `resolveImageUrl` prop: narrow to its own list of
 *    hosts, rewrite the address to its proxy, or allow `http://localhost` in development. Its
 *    answer is final: a string means load exactly that, `null` means refuse. The one exception
 *    the host cannot override: `javascript:` and `vbscript:` are never images;
 *  - the theme names no addresses at all.
 *
 * Assets (`assets`) are outside this policy: their addresses come from the host itself.
 */
import { HTTPS_URL_PATTERN } from './action-catalog'
import { cssUrl, isHttpsUrl, MAX_DATA_IMAGE_URL_LENGTH, MAX_IMAGE_URL_LENGTH } from './sanitize'

/**
 * WHERE THE ADDRESS CAME FROM. The 2048 limit is the `maxLength` of a DOCUMENT field
 * (`ImageSource.url`); an address from host DATA is not a document field, and real samples
 * (`data:image/webp` of 7-9 KB) exceed it. Order for data: first the host's word
 * (`resolveImageUrl`); without it, the default rule (`https:`, up to 2048); with the host's word
 * the ceiling is 512 KB. `javascript:`/`vbscript:` are never images, whatever the host says.
 */
export type ImageOrigin = 'document' | 'data'

/** Where an image address is about to be used. */
export interface ImageUrlContext {
  /** `image` — an `<img>` (the `Image` widget, a `ListTile` thumbnail); `background` — a `style.background` image. */
  readonly usage: 'image' | 'background'
  /** Whether the renderer itself would load this address: an absolute `https:` URL. */
  readonly allowedByDefault: boolean
}

/**
 * Host decision about an image address named by the document or by bound data.
 * Return the URL to load (the same one, or your proxy), or `null` to refuse —
 * the image is then drawn as a placeholder.
 */
export type ResolveImageUrl = (url: string, context: ImageUrlContext) => string | null | undefined

export interface ImagePolicy {
  /** Address for `<img src>`, or `undefined` to draw a placeholder. */
  readonly src: (url: unknown, usage: ImageUrlContext['usage'], origin?: ImageOrigin) => string | undefined
  /** `url("...")` for `background-image`, or `undefined`. */
  readonly css: (url: unknown, usage: ImageUrlContext['usage'], origin?: ImageOrigin) => string | undefined
}

const NEVER_AN_IMAGE = /^(?:javascript|vbscript):/i

/** The address as the URL parser reads it: leading C0 controls and spaces stripped, tab / LF / CR removed everywhere. */
function neverAnImage(url: string): boolean {
  // eslint-disable-next-line no-control-regex
  return NEVER_AN_IMAGE.test(url.replace(/^[\u0000-\u0020]+/, '').replace(/[\t\n\r]/g, ''))
}

/**
 * The default rule: the same host form as the `openUrl` address (`x-actions.forms.httpsUrl`) - a host
 * name with a letter top-level label, no credentials, no IP literal, no `localhost`. A host that needs
 * such addresses (development, an intranet) allows them through `resolveImageUrl`.
 */
function publicHttpsImage(url: string): boolean {
  return isHttpsUrl(url) && HTTPS_URL_PATTERN.test(url)
}

/** Why the address was rejected, for the report. The address itself goes into the report truncated. */
export type ImageRefusal = (url: string, reason: string) => void

type ImageVerdict = { readonly kind: 'allowed'; readonly url: string } | { readonly kind: 'refused'; readonly reason: string }

function judge(url: string, usage: ImageUrlContext['usage'], resolve: ResolveImageUrl | undefined, origin: ImageOrigin): ImageVerdict {
  const refuse = (reason: string): ImageVerdict => ({ kind: 'refused', reason })
  // A document literal address is bounded by the schema; an address from data by a ceiling, and without the host's word one over 2048 is not loaded at all.
  const ceiling = origin === 'data' && resolve !== undefined ? MAX_DATA_IMAGE_URL_LENGTH : MAX_IMAGE_URL_LENGTH
  if (url.length > ceiling) return refuse(origin === 'data' && resolve !== undefined ? 'the bound address is longer than the reader accepts' : 'the address is longer than the schema allows')
  if (neverAnImage(url)) return refuse('a script address is never an image')
  const allowedByDefault = publicHttpsImage(url)
  if (resolve === undefined) return allowedByDefault ? { kind: 'allowed', url } : refuse('only absolute https: addresses with a public host name are loaded by default')

  let answer: string | null | undefined
  try {
    answer = resolve(url, { usage, allowedByDefault })
  } catch {
    return refuse('resolveImageUrl threw')
  }
  if (typeof answer !== 'string' || answer === '') return refuse('refused by resolveImageUrl')
  if (answer.length > (origin === 'data' ? MAX_DATA_IMAGE_URL_LENGTH : MAX_IMAGE_URL_LENGTH) || neverAnImage(answer)) return refuse('resolveImageUrl returned an address that is never an image')
  return { kind: 'allowed', url: answer }
}

/** What may be said about an address from host DATA: the scheme and host at most, never the path or query. */
function safeOrigin(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? `${parsed.protocol}//${parsed.hostname.slice(0, 80)}` : parsed.protocol
  } catch {
    return 'unparsable'
  }
}

export function imagePolicy(resolve: ResolveImageUrl | undefined, refused?: ImageRefusal): ImagePolicy {
  const decide = (url: unknown, usage: ImageUrlContext['usage'], origin: ImageOrigin = 'document'): string | undefined => {
    if (typeof url !== 'string' || url === '') return undefined
    const verdict = judge(url, usage, resolve, origin)
    if (verdict.kind === 'allowed') return verdict.url
    refused?.(origin === 'data' ? safeOrigin(url) : url.slice(0, 120), verdict.reason)
    return undefined
  }
  return {
    src: decide,
    css: (url, usage, origin) => {
      const allowed = decide(url, usage, origin)
      return allowed === undefined ? undefined : cssUrl(allowed)
    },
  }
}

/** Default policy: only `https:`, no reports. */
export const DEFAULT_IMAGES: ImagePolicy = imagePolicy(undefined)
