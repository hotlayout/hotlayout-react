/**
 * TRUST BOUNDARY: everything that comes from the document or the theme and becomes CSS, an
 * address or a table key passes THROUGH THIS FILE.
 *
 * The document and the theme come from the network. The builder checks them with a schema, but
 * the reader does not validate a document fully, and must not: it has to draw a document of a
 * newer minor too. So the "never trusted" rule is held not by a validator but by the shape of
 * every single value at the moment it becomes a style string.
 *
 * THIS IS NOT ESCAPING BUT AN ALLOW-LIST OF SHAPE. Escaping answers "how to insert anything
 * safely"; the question here is different: "is this even a color". `red;position:fixed` is not
 * a color under any escaping, so the answer is `undefined`, and the compatibility policy then
 * applies (`unknownToken`, `tokenWithoutFieldDefault`, `nonNumericLiteral`,
 * `literalOutOfRange`...): the same as for a value the reader simply does not know.
 *
 * WHY THIS MATTERS MORE THAN IT SEEMS. `renderToString` builds the `style` attribute by
 * concatenating `name:value;` and escapes only HTML: a semicolon in a "color" is a new
 * declaration (`position:fixed;inset:0`) on the host page. In a browser without a server the same
 * value cannot leave its property, but `url(...)` in a gradient "color" is a request to a
 * foreign host from every user.
 *
 * PATTERNS AND BOUNDS MIRROR THE ARTIFACTS (`screen-schema.json`, `theme.json`); a test compares
 * them. The reader is deliberately a little wider than the schema where that costs nothing (case
 * of hexadecimal digits, alpha in an own color), and never wider in characters.
 *
 * ONE IMPORT: `action-catalog` (a mirror of the reference implementation, with no imports of
 * its own): the bounds and the key shape of an action parameter live there, and no second copy
 * exists. This file is the bottom of the package; everything else rests on it.
 */
import { ACTION_URL_MAX, isParamKey } from './action-catalog'

/* ───────────────────────────── tables ───────────────────────────── */

/**
 * A table value by OWN key.
 *
 * `TABLE[key]` with a key from the document reads the prototype too: `ALIGN['constructor']` is a
 * function, and so is `FORMATS['toString']`. Every table indexed by a string from the network is
 * read only this way.
 */
export function lookup<T>(table: Readonly<Record<string, T>>, key: unknown): T | undefined {
  if (typeof key !== 'string' && typeof key !== 'number') return undefined
  return Object.hasOwn(table, key) ? table[key] : undefined
}

/** A value from the list, or `fallback`: alignment, `fit`, direction, everything the schema names as an `enum`. */
export function safeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T
export function safeEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined
export function safeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback?: T): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/* ───────────────────────────── names ───────────────────────────── */

/** Pattern of a token name: `x-tokens.namePattern` of the widget schema and `propertyNames` of the theme dictionaries. */
export const TOKEN_NAME_PATTERN = '^[a-z][a-zA-Z0-9]{0,39}$'
const TOKEN_NAME = new RegExp(TOKEN_NAME_PATTERN)

/**
 * A token, role or asset name, or `undefined`.
 *
 * Everything that becomes the NAME of a CSS variable passes here: after `toKebab` only
 * `[a-z0-9-]` remains. A name like `x:1;position:fixed;--y` is not a name, and no variable will
 * exist for it.
 */
export function safeIdent(value: unknown): string | undefined {
  return typeof value === 'string' && TOKEN_NAME.test(value) ? value : undefined
}

/** Part of a CSS variable name: `titleM` -> `title-m`. Not a name gives `invalid`, never the raw string. */
export function varSegment(value: string): string {
  const ident = safeIdent(value)
  return ident === undefined ? 'invalid' : ident.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

/* ───────────────────────────── numbers ───────────────────────────── */

/**
 * A number within the field's bounds, or `undefined` if it is not a number.
 *
 * `typeof 'number'` and finite: the string `"0;position:fixed"`, `NaN` and infinity are not
 * numbers. What to do with a "non-number" is decided by the caller: in a document it is the
 * field's lower bound (`nonNumericLiteral`), in a theme a missing entry (`partialTheme`).
 */
export function safeNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, value))
}

/** The same for an integer: a fraction is rounded down BEFORE clamping (`columns: 2.7` is 2). */
export function safeInteger(value: unknown, min: number, max: number): number | undefined {
  const number = safeNumber(value, min, max)
  return number === undefined ? undefined : Math.min(max, Math.max(min, Math.floor(number)))
}

/**
 * Number -> CSS text. The only place a number becomes a style string. NO rounding: a fractional
 * gradient stop position must give the same percentage in every reader. The exception is
 * exponent notation (`1e-7`), which CSS does not understand: such a number is written as a
 * decimal fraction.
 */
export function cssNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const text = String(Object.is(value, -0) ? 0 : value)
  return /e/i.test(text) ? value.toFixed(12).replace(/\.?0+$/, '') || '0' : text
}

/** Logical pixels: `0` without a unit, anything else `Npx`. */
export function cssPx(value: number): string {
  const text = cssNumber(value)
  return text === '0' ? '0' : `${text}px`
}

/**
 * App bar sticky offset (`stickyOffset`, the HOST'S decision, not the document's): a number is
 * logical pixels; a string is a length (`56px`, `3.5rem`, `10vh`, `0`) or a host CSS variable
 * (`var(--site-header-height)`). Anything else (`calc(`, a semicolon, `url(`) gives
 * `undefined`: the value becomes `top` and must not bring in a second declaration.
 */
export function safeStickyOffset(value: unknown): string | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? cssPx(value) : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text === '0') return '0'
  if (/^-?(?:\d{1,5}|\d{1,5}\.\d{1,4})(?:px|rem|em|vh|dvh|svh|lvh|vw)$/.test(text)) return text
  if (/^var\(--[a-zA-Z][a-zA-Z0-9-]{0,63}\)$/.test(text)) return text
  return undefined
}

/** Upper bound of the safe area inset the host may name: the largest real one (the bottom bar of a tablet or foldable phone) is a few dozen points. */
export const SAFE_INSET_MAX = 200

/** CSS value of the platform's bottom safe area inset (`env(...)`); written only here. */
const SAFE_INSET_ENV = 'env(safe-area-inset-bottom, 0px)'

/**
 * Bottom safe area inset (`safeAreaBottom`, the HOST'S decision, not the document's): `'env'` and
 * a missing prop give `env(safe-area-inset-bottom)`; a number is logical pixels the host computed
 * itself (`0` switches it off). Anything else (a string, `NaN`, negative, infinite, an object)
 * gives zero: the value goes into `padding`, and a string with a semicolon would bring in a
 * second declaration. A number is clamped to {@link SAFE_INSET_MAX}.
 */
export function safeBottomInset(value: unknown): string {
  if (value === undefined || value === 'env') return SAFE_INSET_ENV
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0px'
  return cssPx(Math.min(SAFE_INSET_MAX, value))
}

/** Fraction 0..1 -> percent. */
export function cssPercent(ratio: number): string {
  return `${cssNumber(Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0)) * 100)}%`
}

/**
 * BOUNDS OF THEME NUMBERS: a mirror of `minimum` / `maximum` from the theme schema (`theme.json`,
 * `x-schema.$defs`). The same numbers as for own document values: a theme cannot say more than a
 * document.
 */
export const THEME_BOUNDS = {
  spacing: [0, 128],
  radius: [0, 256],
  fontSize: [8, 96],
  fontWeight: [100, 900],
  lineHeight: [0.8, 3],
  letterSpacing: [-2, 8],
  shadowOffset: [-64, 64],
  shadowBlur: [0, 128],
  shadowSpread: [-64, 64],
  opacity: [0, 1],
  gradientPosition: [0, 1],
} as const satisfies Readonly<Record<string, readonly [number, number]>>

/** Bounds of integer `props` fields: a mirror of `screen-schema.json`. */
export const PROP_BOUNDS = {
  gridColumns: [2, 4],
  repeaterLimit: [1, 50],
  textMaxLines: [1, 20],
  weight: [1, 4],
} as const satisfies Readonly<Record<string, readonly [number, number]>>

/** How many own names a theme may add to the core in one dictionary: `x-tokens.maxCustomPerDictionary`. */
export const MAX_CUSTOM_TOKENS = 64

/* ───────────────────────────── color ───────────────────────────── */

/**
 * Pattern of a THEME color (`theme.json`): `#rrggbb` or `#rrggbbaa`. A document's own color is
 * narrower by the schema (`#rrggbb`); the reader accepts both forms in both places and ignores
 * the case of the digits: they are the same hexadecimal digits and no other character.
 */
export const COLOR_VALUE_PATTERN = '^#[0-9a-f]{6}(?:[0-9a-f]{2})?$'
const COLOR_VALUE = new RegExp(COLOR_VALUE_PATTERN, 'i')

/** A color `#rrggbb[aa]` in lowercase, or `undefined`: `red`, `url(...)`, `var(...)`, a string with `;`. */
export function safeColor(value: unknown): string | undefined {
  return typeof value === 'string' && COLOR_VALUE.test(value) ? value.toLowerCase() : undefined
}

/** Channels and alpha of a validated color. Alpha comes LAST (`colorAlpha: 'rrggbbaa-alpha-last'`). */
export function hexChannels(color: string): { readonly rgb: readonly [number, number, number]; readonly alpha: number } {
  const safe = safeColor(color) ?? '#000000'
  const channel = (offset: number): number => Number.parseInt(safe.slice(offset, offset + 2), 16)
  return { rgb: [channel(1), channel(3), channel(5)], alpha: safe.length > 7 ? channel(7) / 255 : 1 }
}

/** `rgba(...)` from a validated color and an opacity 0..1; not a color gives `undefined`. */
export function safeRgba(color: unknown, opacity: unknown): string | undefined {
  const safe = safeColor(color)
  if (safe === undefined) return undefined
  const { rgb, alpha } = hexChannels(safe)
  return `rgba(${String(rgb[0])}, ${String(rgb[1])}, ${String(rgb[2])}, ${cssNumber(alpha * (safeNumber(opacity, 0, 1) ?? 0))})`
}

/* ───────────────────────────── font family ───────────────────────────── */

/** The longest font family name the reader takes on. */
export const MAX_FONT_FAMILY_LENGTH = 100

/** Characters a font family name is made of: letters and digits of any script, space, and `. _ ' & + -`. */
const FONT_FAMILY_NAME = /^[\p{L}\p{N} ._'&+-]+$/u

/**
 * A font family name -> a `font-family` element, or `undefined`.
 *
 * An allow-list of characters, not escaping: a font name is words ("Inter", "O'Reilly Sans",
 * "Noto Sans Arabic"), and quotes, semicolons, parentheses or line breaks have no business in
 * it. (An unclosed CSS string ends at a line break, and everything after it is a declaration
 * again.) A CSS identifier (`Inter`, `system-ui`) goes without quotes, since keywords must not
 * be quoted; the rest go in single quotes with the apostrophe escaped.
 */
export function safeFontFamily(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FONT_FAMILY_LENGTH) return undefined
  if (!FONT_FAMILY_NAME.test(value) || value.trim() !== value) return undefined
  if (/^-?[A-Za-z][A-Za-z0-9-]*$/.test(value)) return value
  return `'${value.replaceAll("'", "\\'")}'`
}

/* ───────────────────────────── address ───────────────────────────── */

/** The longest image address: `ImageSource.url.maxLength` of the schema. */
export const MAX_IMAGE_URL_LENGTH = 2048

/** Ceiling of an image address FROM host DATA when the host gave its own word (`resolveImageUrl`): 512 KB. */
export const MAX_DATA_IMAGE_URL_LENGTH = 512 * 1024

/**
 * An image address the reader takes WITHOUT a host decision: absolute `https:`.
 *
 * This is a builder rule (the widget props schema), which the schema artifact does not carry:
 * there `url` is just a string. `http:` is a plaintext request from the host page; `data:`,
 * `blob:`, `javascript:`, `vbscript:` and `file:` can never be an image from a document. The
 * address is parsed by `URL`: a prefix comparison would let `https:\\evil` and leading
 * whitespace through.
 */
export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_IMAGE_URL_LENGTH) return false
  // Whitespace, control characters and backslash: `URL` "fixes" them, and the validated address would no longer be the one in the document.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return false
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname !== ''
  } catch {
    return false
  }
}

/**
 * A validated address -> `url("...")`.
 *
 * Only what the image policy has already allowed arrives here; escaping is the second lock, not
 * the first: `"`, `\` and everything outside printable ASCII becomes a CSS hexadecimal escape,
 * so the string never ends before its quote.
 */
export function cssUrl(url: string): string {
  let escaped = ''
  for (const char of url) {
    const code = char.codePointAt(0) ?? 0
    escaped += code < 0x20 || code > 0x7e || char === '"' || char === '\\' || char === "'" || char === '(' || char === ')' ? `\\${code.toString(16)} ` : char
  }
  return `url("${escaped}")`
}

/**
 * A built-in drawing -> `url("data:image/svg+xml,...")` for `mask-image`.
 *
 * Accepts ONLY ready markup from the bundled icon set, not a document string: `<` and `>` are
 * encoded, and a quote, backslash or line break must not appear in the markup, otherwise
 * `undefined`, so the address never ends before its own quote.
 */
export function cssSvgDataUrl(svg: string): string | undefined {
  if (/["\\\r\n]/.test(svg)) return undefined
  return `url("data:image/svg+xml,${svg.replaceAll('<', '%3C').replaceAll('>', '%3E')}")`
}

/* ───────────────────────────── data path ───────────────────────────── */

/** Segments that neither a write path nor a parameter key may be: the road to the prototype in `set(state, path, value)`. */
export const FORBIDDEN_SEGMENTS: readonly string[] = ['__proto__', 'constructor', 'prototype']

/** The longest write path. */
export const MAX_DATA_PATH_LENGTH = 128

const PATH_SEGMENT = /^[A-Za-z_][A-Za-z0-9_-]*$/

/**
 * A data path in dictionary form: identifiers separated by dots (`item.selectedId`).
 *
 * Checked where a path LEAVES the package, in `onWrite`. Reading by path needs no check: it is
 * an own key of a flat map (`Object.hasOwn`).
 */
export function safeDataPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_DATA_PATH_LENGTH) return undefined
  const segments = value.split('.')
  for (const segment of segments) {
    if (!PATH_SEGMENT.test(segment) || FORBIDDEN_SEGMENTS.includes(segment)) return undefined
  }
  return value
}

/** Whether a path has a forbidden segment; the question for paths the host allowed itself (`writablePaths`). */
export function hasForbiddenSegment(path: string): boolean {
  return path.split('.').some((segment) => FORBIDDEN_SEGMENTS.includes(segment))
}

/** The longest action parameter key: `ButtonAction.params.propertyNames` of the schema. */
export const MAX_PARAM_KEY_LENGTH = 32

/**
 * Action parameters: only own identifier keys and STRING values, as in the schema
 * (`additionalProperties: string`). A nested object in a parameter that the host puts into a
 * request to its backend (`{ id: { $ne: null } }`) is a classic injection; `constructor` is the
 * same road to the prototype as `__proto__`.
 *
 * Returns a clean map WITHOUT the prototype's inherited names (an ordinary literal into which
 * forbidden keys are never written) and the list of rejected keys.
 */
export function safeParams(value: unknown): { readonly params: Readonly<Record<string, string>> | undefined; readonly dropped: readonly string[] } {
  if (value === undefined || value === null) return { params: undefined, dropped: [] }
  if (!isRecord(value)) return { params: undefined, dropped: ['(params is not an object)'] }
  const params: Record<string, string> = {}
  const dropped: string[] = []
  for (const key of Object.keys(value)) {
    const entry = value[key]
    // Only a string under a key of the schema's shape and not longer than the bound; it is neither converted to text nor truncated.
    if (!isParamKey(key) || typeof entry !== 'string' || entry.length > ACTION_URL_MAX) {
      dropped.push(key.slice(0, MAX_PARAM_KEY_LENGTH))
      continue
    }
    params[key] = entry
  }
  return { params, dropped }
}
