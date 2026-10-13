/**
 * List item (schema 9.17.0): `Text.marker` is a bullet or a number before the text. A mirror of the
 * contract reference implementation (the package imports nothing from the contract repository). The two
 * copies are kept together by the shared case table
 * `contract/fixtures/list-marker/list-marker-cases.json`, and the `x-style.layout.listMarker`
 * block is compared with the artifact for equality.
 *
 *  1. A marker COLUMN at the logical start, a gap, and the text in the remaining width with a
 *     HANGING INDENT; both numbers are fractions of the text's FONT SIZE (`listMarkerGeometry`),
 *     not a measured glyph width;
 *  2. The GLYPH is a "bullet" in the text's font, or a number and a period; digits use the
 *     document's formatting language by the same rule as the `number` format of 9.4.0;
 *  3. The NUMBER is how many VISIBLE items of the group stand up to and including it; the COLUMN
 *     WIDTH follows the group BY DOCUMENT; a group is consecutive siblings, and any other node
 *     (a hidden one too) breaks it;
 *  4. A template item of a data-driven list counts the drawn INSTANCES, not siblings.
 *
 * TRUST BOUNDARY. The marker does not go into a style: the text is a string from `glyph` or an
 * integer formatted by locale; the column width and gap are numbers from the data times the
 * font size. This module does not import `react`.
 */
import { formatBound } from './binding-format'

export const TEXT_MARKERS = ['none', 'bullet', 'number'] as const
export type TextMarker = (typeof TEXT_MARKERS)[number]
export type DrawnTextMarker = Exclude<TextMarker, 'none'>

/** What applies without the field: plain text, exactly what a 9.16 reader drew. */
export const DEFAULT_TEXT_MARKER: TextMarker = 'none'
export const LIST_BULLET_GLYPH = '•'
export const LIST_NUMBER_SUFFIX = '.'

/** Mirror of `x-style.layout.listMarker`. */
export const LIST_MARKER_LAYOUT = {
  field: 'marker',
  values: TEXT_MARKERS,
  default: DEFAULT_TEXT_MARKER,
  unknown: 'no-marker',
  before917: 'plain-text',
  glyph: { bullet: LIST_BULLET_GLYPH },
  number: {
    suffix: LIST_NUMBER_SUFFIX,
    start: 1,
    digits: 'formatting-locale',
    format: 'number-format-9.4',
    missingLocaleData: 'plain-digits',
    group: 'consecutive-siblings-with-number-marker-by-document',
    brokenBy: 'any-other-node',
    counts: 'visible-items',
    columnBy: 'group-size-by-document',
    repeaterTemplate: { group: 'drawn-instances', counts: 'visible-instances', columnBy: 'drawn-instances' },
  },
  unit: 'text-font-size',
  textScale: 'applies',
  column: { bullet: 1, digit: 0.6, suffix: 0.4, min: 1 },
  gap: 0.5,
  placement: 'inline-start',
  mirroredInRtl: true,
  markerAlign: 'column-end',
  overflow: 'visible-toward-start',
  baseline: 'first-line-of-text',
  hangingIndent: 'under-first-line-of-text',
  font: 'text-base-typography',
  color: 'text-color',
  fontStyle: 'normal',
  textDecoration: 'none',
  spans: 'do-not-style-marker',
  textAlign: 'within-text-column',
  maxLines: 'text-only',
  naturalWidth: 'column-plus-gap-plus-text',
  heard: { bullet: 'text-only', number: 'number-then-text' },
} as const

/** A marker as the reader reads it: an unknown word, a non-string and a missing field all give `none`. */
export function readTextMarker(value: unknown): TextMarker {
  return typeof value === 'string' && (TEXT_MARKERS as readonly string[]).includes(value) ? (value as TextMarker) : DEFAULT_TEXT_MARKER
}

/** A node as the rule sees it: the type is not read, only the `marker` prop. */
export interface MarkerNode {
  readonly props?: unknown
}

/** The marker a node draws; `undefined` means plain text. An own property, not the prototype chain. */
export function listMarkerOf(node: MarkerNode | undefined | null): DrawnTextMarker | undefined {
  if (node === undefined || node === null) return undefined
  const props = typeof node.props === 'object' && node.props !== null ? (node.props as Readonly<Record<string, unknown>>) : {}
  const marker = readTextMarker(Object.hasOwn(props, LIST_MARKER_LAYOUT.field) ? props[LIST_MARKER_LAYOUT.field] : undefined)
  return marker === 'none' ? undefined : marker
}

/** Whether this parent's children are TEMPLATE INSTANCES (a data-driven list): a numbered item inside it counts drawn records. */
export function numbersByInstance(parent: { readonly type: string } | undefined | null): boolean {
  return parent?.type === 'Repeater'
}

/** Bounds of the numbered-item group around `index`: `[first, last]` in document order. */
function numberRun(siblings: readonly MarkerNode[], index: number): readonly [number, number] | undefined {
  if (listMarkerOf(siblings[index]) !== 'number') return undefined
  let first = index
  while (first > 0 && listMarkerOf(siblings[first - 1]) === 'number') first -= 1
  let last = index
  while (last < siblings.length - 1 && listMarkerOf(siblings[last + 1]) === 'number') last += 1
  return [first, last]
}

/** How many items the group has by document; the column width derives from it. `undefined` means not a numbered item. */
export function listMarkerGroupSize(siblings: readonly MarkerNode[], index: number): number | undefined {
  const run = numberRun(siblings, index)
  return run === undefined ? undefined : run[1] - run[0] + 1
}

/** An item's number: how many visible items of its group stand up to and including it. `undefined` means not a numbered item. */
export function listNumberOf<T extends MarkerNode>(siblings: readonly T[], index: number, isVisible: (node: T) => boolean): number | undefined {
  const run = numberRun(siblings, index)
  if (run === undefined) return undefined
  let number = 0
  for (let at = run[0]; at < index; at += 1) {
    const sibling = siblings[at]
    if (sibling !== undefined && isVisible(sibling)) number += 1
  }
  return number + 1
}

/** Numbers of the instances of a data-driven list's template: a hidden instance has none, and the next visible one does not skip over it. */
export function listInstanceNumbers(templateVisible: readonly boolean[]): readonly (number | undefined)[] {
  let drawn = 0
  return templateVisible.map((visible) => {
    if (!visible) return undefined
    drawn += 1
    return drawn
  })
}

function digitsOf(groupSize: number): number {
  return String(Math.max(1, Math.trunc(groupSize))).length
}

export interface ListMarkerGeometry {
  readonly column: number
  readonly gap: number
  readonly indent: number
}

/** Item geometry: `fontSize` is the font size of the node's base text style; `groupSize` is the number of items in the group (for a number). */
export function listMarkerGeometry(marker: DrawnTextMarker, fontSize: number, groupSize = 1): ListMarkerGeometry {
  const { column, gap } = LIST_MARKER_LAYOUT
  const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 0
  const em = marker === 'bullet' ? column.bullet : Math.max(column.min, digitsOf(groupSize) * column.digit + column.suffix)
  // Round the product of font-size fractions to six decimals: 0.6 * 3 + 0.4 must not give 2.2000000000000006.
  const width = Math.round(em * size * 1e6) / 1e6
  const between = Math.round(gap * size * 1e6) / 1e6
  return { column: width, gap: between, indent: Math.round((width + between) * 1e6) / 1e6 }
}

/**
 * The marker text. Digits follow the `number` format rule (9.4.0); a language without platform
 * data gets plain digits. `fallbackLocale` is the language of the shown text, used when the
 * engine rejects the formatting locale.
 */
export function listMarkerText(marker: DrawnTextMarker, number: number, formattingLocale: string | undefined, fallbackLocale?: string): string {
  if (marker === 'bullet') return LIST_BULLET_GLYPH
  const digits = formatBound(number, 'number', formattingLocale, undefined, fallbackLocale) ?? String(number)
  return `${digits}${LIST_NUMBER_SUFFIX}`
}
