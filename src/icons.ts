import { ICON_BODIES, ICON_GRID } from './icon-set'
import { cssSvgDataUrl } from './sanitize'

/**
 * Icon drawings are CONTRACT DATA (`contract/icons.json`, schema 9.3.0); the asset placeholders
 * further down are platform resources.
 *
 * The contract names a TOKEN (`Icon.props.name`: `star`, `gift`, ...) and supplies a drawing for
 * each of the 332 names (`icon-set.ts`, a generated copy). What remains here is HOW the drawing
 * is put on screen: a single-colour SVG mask over a `currentColor` fill. A mask rather than a
 * font glyph, because browsers draw symbols such as a trophy or a gift as COLOURED emoji, which
 * ignore `color`.
 *
 * The `<svg>` root is the set's grid; the body comes from the name; the `fill`, `stroke='none'`
 * and `stroke-width` of individual elements already sit in the body. In the data URI
 * `currentColor` becomes `black`: a mask reads only alpha, and an SVG image has no "current
 * colour" inside it. Only the body from the bundled set ever enters the URL, never a string from
 * the document; the URL itself is assembled by `sanitize.ts`.
 *
 * The result is identical to the contract reference implementation's mask CSS. The package imports nothing from the
 * contract repository, so this is a mirror, compared byte for byte by a package test.
 */
const MASKS = new Map<string, string>()

/**
 * The mask (`mask-image`) for an icon name from the document; `undefined` when the name is not in
 * the set or the value is not a string at all (`unknownIcon`, `unreadableIconValue`), in which
 * case an empty box of the same size remains. Built on demand and cached: a screen usually shows
 * a few icons out of three hundred.
 *
 * Only the set's OWN keys are looked up: `__proto__`, `constructor` and `toString` are not icon
 * names.
 */
export function iconMask(name: unknown): string | undefined {
  if (typeof name !== 'string' || !Object.hasOwn(ICON_BODIES, name)) return undefined
  const cached = MASKS.get(name)
  if (cached !== undefined) return cached
  const body = ICON_BODIES[name]
  if (body === undefined) return undefined
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${ICON_GRID.viewBox}' fill='${ICON_GRID.fill}' stroke='black' stroke-width='${String(ICON_GRID.strokeWidth)}' stroke-linecap='${ICON_GRID.strokeLinecap}' stroke-linejoin='${ICON_GRID.strokeLinejoin}'>${body.replaceAll('currentColor', 'black')}</svg>`
  const mask = cssSvgDataUrl(svg)
  if (mask !== undefined) MASKS.set(name, mask)
  return mask
}

/**
 * Icons that are MIRRORED in right-to-left writing: a mirror of the schema's `x-mirroredIcons`.
 * This is a claim about the token's MEANING ("points in a direction of movement"), so the
 * contract makes it, not this file; the remaining icons are objects and states.
 */
export const MIRRORED_ICONS: readonly string[] = [
  'chevron',
  'arrow-left',
  'arrow-right',
  'arrow-up-left',
  'arrow-up-right',
  'arrow-down-left',
  'arrow-down-right',
  'chevron-left',
  'chevron-right',
  'chevrons-left',
  'chevrons-right',
  'circle-arrow-left',
  'circle-arrow-right',
  'circle-chevron-left',
  'circle-chevron-right',
  'log-in',
  'log-out',
  'undo',
  'redo',
  'undo-2',
  'redo-2',
  'reply',
  'forward',
  'send',
  'external-link',
  'trending-up',
  'trending-down',
  'list',
  'list-checks',
]

/**
 * Asset placeholders. The contract does not deliver real asset files: an asset token is the name
 * of a resource bundled in the app. The host passes its own URLs through the `assets` prop; a
 * token without a URL is drawn as one of these placeholders, so that a missing resource is
 * visible.
 */
export const ASSET_PLACEHOLDERS: Readonly<Record<string, string>> = {
  logo: 'linear-gradient(135deg, #4f46e5 0%, #312e81 100%)',
  banner: 'linear-gradient(135deg, #0369a1 0%, #4f46e5 100%)',
  placeholder: 'repeating-linear-gradient(45deg, #e5e7eb 0, #e5e7eb 8px, #d1d5db 8px, #d1d5db 16px)',
}

/** Placeholder for an asset token the reader does not know (a document of a newer minor version). */
export const UNKNOWN_ASSET_PLACEHOLDER = ASSET_PLACEHOLDERS.placeholder ?? 'none'
