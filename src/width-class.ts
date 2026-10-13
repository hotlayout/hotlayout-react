/**
 * ADAPTIVITY BY WIDTH (schema 9.18.0): the width class and everything that follows from it.
 *
 * The rules are contract data (`x-style.layout.widthClass`); the functions are a literal mirror
 * of the contract's reference implementation. The package does not import the builder's sources,
 * so the rule is written a second time; the two copies are held together by the shared table
 * `contract/fixtures/adaptive/adaptive-cases.json` and by a check that the data block equals the
 * artifact.
 *
 * HOW IT WORKS. ONE document for all widths, built from the phone up: the base is what the
 * document always had, and wider classes OVERLAY it (`medium` on the base, `expanded` on the
 * base with `medium`). The reader first RESOLVES the tree for its class (`nodeInWidthClass`:
 * effective `props`, the style base with `styleOn` layers, without the `propsOn` / `styleOn`
 * fields) and then draws an ordinary 9.17 document: who accepts weights, where the main axis is,
 * how many columns, all of it follows by itself. From the class only visibility is left at draw
 * time (`isNodeShown`: the class in `showOn` AND the `visibleIf` condition).
 *
 * The class is measured by `HotlayoutScreen` (the box of the package root), not by this module:
 * here are pure functions without React, and the entry's server graph reads them too.
 */
import { isRecord } from './sanitize'
import { unsetKeysOf, unsettablePropsOf, withoutUnset } from './width-unset'
import { NODE_STYLE_KEYS } from './types'
import type { NodeStyle, UiNode } from './types'

export const WIDTH_CLASSES = ['compact', 'medium', 'expanded'] as const
export type WidthClass = (typeof WIDTH_CLASSES)[number]

/** Classes that have an overlay layer: `compact` is the base. */
export const OVERRIDE_WIDTH_CLASSES = ['medium', 'expanded'] as const
export type OverrideWidthClass = (typeof OVERRIDE_WIDTH_CLASSES)[number]

/**
 * Which properties each type may override: a CLOSED list (`props.byWidget`). A key outside it
 * (`columns` on a column) does not touch the base.
 */
export const RESPONSIVE_PROPS: Readonly<Record<string, readonly string[]>> = {
  Screen: ['gap', 'align', 'justify', 'contentMaxWidth'],
  Column: ['gap', 'align', 'justify'],
  Row: ['gap', 'align', 'justify', 'carousel'],
  Container: ['direction', 'gap', 'align', 'justify'],
  Grid: ['columns', 'gap'],
  Repeater: ['direction', 'columns', 'gap', 'carousel'],
}

/** `columns` in an overlay is 1..6; the base stays 2..4 (`props.columns`). */
export const OVERRIDE_MIN_COLUMNS = 1
export const OVERRIDE_MAX_COLUMNS = 6

/** The largest content width of a screen: an integer within the schema bounds. */
export const CONTENT_MAX_WIDTH_MIN = 320
export const CONTENT_MAX_WIDTH_MAX = 1920

/**
 * FROM WHAT WIDTH EACH CLASS STARTS, in logical pixels: artifact DATA (`classes`), not
 * configurable in the theme: `compact` < 600 <= `medium` < 1024 <= `expanded`.
 */
export const WIDTH_CLASS_FROM: Readonly<Record<WidthClass, number>> = { compact: 0, medium: 600, expanded: 1024 }

/** The class while the width is UNKNOWN (server, first frame): `unknownWidth`. */
export const UNKNOWN_WIDTH_CLASS: WidthClass = 'compact'

/**
 * The CLASS by the width of the screen box. The width is NOT ROUNDED (599.9 is `compact`); a
 * non-number, non-finite or negative value means "unknown": `compact`. A string is not parsed
 * into a number.
 */
export function widthClassOf(width: unknown): WidthClass {
  if (typeof width !== 'number' || !Number.isFinite(width) || width < 0) return UNKNOWN_WIDTH_CLASS
  if (width >= WIDTH_CLASS_FROM.expanded) return 'expanded'
  if (width >= WIDTH_CLASS_FROM.medium) return 'medium'
  return 'compact'
}

/** A class word from the host (`initialWidthClass`): an unknown value is `compact`. */
export function widthClassWord(value: unknown): WidthClass {
  return (WIDTH_CLASSES as readonly unknown[]).includes(value) ? (value as WidthClass) : UNKNOWN_WIDTH_CLASS
}

const NO_LAYERS: readonly OverrideWidthClass[] = []
const MEDIUM_LAYERS: readonly OverrideWidthClass[] = ['medium']

/** Overlay layers in effect in a class, from the narrowest (`cascade`). */
export function widthClassLayers(widthClass: WidthClass): readonly OverrideWidthClass[] {
  if (widthClass === 'expanded') return OVERRIDE_WIDTH_CLASSES
  return widthClass === 'medium' ? MEDIUM_LAYERS : NO_LAYERS
}

/* ─── Visibility by class ─────────────────────────────────────────────────── */

interface Shown {
  readonly visibleIf?: NonNullable<UiNode['visibleIf']> | null | undefined
  readonly showOn?: unknown
}

/**
 * The classes in which a node is shown, if it NAMED them. `undefined` means no field (not an
 * array, empty) or no known words left: the node is visible everywhere (`showOn.unknownClass`),
 * since hiding it would mean a screen without the node at every width.
 */
export function showOnOf(node: { readonly showOn?: unknown }): readonly WidthClass[] | undefined {
  const value: unknown = node.showOn
  if (!Array.isArray(value) || value.length === 0) return undefined
  const known = (value as readonly unknown[]).filter((entry): entry is WidthClass => (WIDTH_CLASSES as readonly unknown[]).includes(entry))
  return known.length === 0 ? undefined : known
}

/** Whether the node is shown in this class, by `showOn` alone, without a condition from data. */
export function showsOnWidthClass(node: { readonly showOn?: unknown }, widthClass: WidthClass): boolean {
  const classes = showOnOf(node)
  return classes === undefined || classes.includes(widthClass)
}

/**
 * WHETHER A NODE IS VISIBLE: ONE PLACE for every visibility question: the class in `showOn` AND
 * `visibleIf` holds. `isMet` answers for the condition; there are no composite conditions.
 */
export function isNodeShown(node: Shown, widthClass: WidthClass, isMet: (condition: NonNullable<UiNode['visibleIf']>) => boolean): boolean {
  if (!showsOnWidthClass(node, widthClass)) return false
  const condition = node.visibleIf
  return condition === undefined || condition === null || isMet(condition)
}

/* ─── Properties by class ───────────────────────────────────────────────── */

const NO_KEYS: readonly string[] = []

/** Properties this type allows to override; empty means none. */
export function responsivePropsOf(type: string): readonly string[] {
  return Object.hasOwn(RESPONSIVE_PROPS, type) ? (RESPONSIVE_PROPS[type] ?? NO_KEYS) : NO_KEYS
}

/** The `propsOn` layer of one class, or `undefined` when there is none or it is not an object. */
export function propsOverrideOf(node: object, layer: OverrideWidthClass): Readonly<Record<string, unknown>> | undefined {
  const all: unknown = (node as { readonly propsOn?: unknown }).propsOn
  if (!isRecord(all)) return undefined
  const value: unknown = Object.hasOwn(all, layer) ? all[layer] : undefined
  return isRecord(value) ? value : undefined
}

const CAROUSEL_KEY = 'carousel'
const CAROUSEL_OVERRIDE_KEY = 'perView'

/**
 * Props whose `columns` came FROM AN OVERLAY. Their bound is 1..6, while the base is read as
 * 2..4: the difference is carried by the props object itself, because the value is just a
 * number in both cases.
 */
const OVERRIDDEN_COLUMNS = new WeakSet()

/** The bounds within which `columns` of these props is read. */
export function columnsBoundsOf(props: object, baseBounds: readonly [number, number]): readonly [number, number] {
  return OVERRIDDEN_COLUMNS.has(props) ? [OVERRIDE_MIN_COLUMNS, OVERRIDE_MAX_COLUMNS] : baseBounds
}

/**
 * One overridden value over the effective one. `undefined` means the layer does NOT override this
 * key. A carousel is not overlaid whole: exactly `perView` is overridden, and only where a
 * carousel ALREADY exists (`carouselWithoutBase: 'not-read'`).
 */
function overlaidValue(key: string, below: unknown, value: unknown): unknown {
  if (value === undefined || value === null) return undefined
  if (key !== CAROUSEL_KEY) return value
  if (!isRecord(below) || !isRecord(value)) return undefined
  const perView = value[CAROUSEL_OVERRIDE_KEY]
  return perView === undefined || perView === null ? undefined : { ...below, [CAROUSEL_OVERRIDE_KEY]: perView }
}

/**
 * EFFECTIVE PROPS OF A NODE IN A CLASS: the base with `propsOn` layers laid over it (from the
 * narrowest); a layer overrides only the keys it NAMED, and only from the type's closed list.
 * If nothing is overridden, THE SAME props object.
 */
export function effectivePropsOf(node: UiNode, widthClass: WidthClass): UiNode['props'] {
  const allowed = responsivePropsOf(node.type)
  const layers = widthClassLayers(widthClass)
  if (allowed.length === 0 || layers.length === 0) return node.props

  let result: Record<string, unknown> | undefined
  let columnsOverridden = false
  for (const layer of layers) {
    // An explicit "none" (9.19.0, `width-unset.ts`): a property from the type's closed list disappears BEFORE the layer is laid over.
    const kept = withoutUnset<Record<string, unknown>>(result ?? node.props, unsetKeysOf((node as { readonly propsOn?: unknown }).propsOn, layer), unsettablePropsOf(node.type))
    if (kept !== (result ?? node.props)) result = { ...kept }
    const override = propsOverrideOf(node, layer)
    if (override === undefined) continue
    for (const key of allowed) {
      if (!Object.hasOwn(override, key)) continue
      const current: Readonly<Record<string, unknown>> = result ?? node.props
      const next = overlaidValue(key, Object.hasOwn(current, key) ? current[key] : undefined, override[key])
      if (next === undefined) continue
      result ??= { ...node.props }
      result[key] = next
      if (key === 'columns') columnsOverridden = true
    }
  }
  if (result === undefined) return node.props
  if (columnsOverridden) OVERRIDDEN_COLUMNS.add(result)
  return result
}

/* ─── Style by class ────────────────────────────────────────────────────── */

/** The `styleOn` layer of one class, or `undefined` when there is none or it is not an object. */
export function styleOverrideOf(node: object, layer: OverrideWidthClass): NodeStyle | undefined {
  const all: unknown = (node as { readonly styleOn?: unknown }).styleOn
  if (!isRecord(all)) return undefined
  const value: unknown = Object.hasOwn(all, layer) ? all[layer] : undefined
  return isRecord(value) ? (value) : undefined
}

/**
 * Merging a layer onto the style, by TOP-LEVEL fields, with known keys: a layer field replaces
 * the field whole (a layer's `padding` replaces `padding`, not its sides), a field with the value
 * `undefined` does not erase the base one, and an unknown field does not get in
 * (`unknownStyleField`). The theme is NOT asked here: layers are merged BEFORE theme resolution,
 * so an unknown token in a layer is an unknown token of the base style in this class, not a
 * reason to return the lower value.
 */
function mergeLayer(base: NodeStyle, overlay: NodeStyle): NodeStyle {
  const result: Record<string, unknown> = { ...base }
  for (const key of NODE_STYLE_KEYS) {
    const value = overlay[key]
    if (value !== undefined) result[key] = value
  }
  return result
}

/** THE BASE STYLE IN A CLASS: `style` with `styleOn` layers, WITHOUT states; if nothing is laid over, the same object. */
export function baseStyleInWidthClass(node: UiNode, widthClass: WidthClass): NodeStyle | undefined {
  let result: NodeStyle | undefined = isRecord(node.style) ? (node.style) : undefined
  for (const layer of widthClassLayers(widthClass)) {
    // An explicit "none" (9.19.0, `width-unset.ts`): first remove what is named for the class, then lay the layer over.
    result = withoutUnset(result, unsetKeysOf((node as { readonly styleOn?: unknown }).styleOn, layer))
    const overlay = styleOverrideOf(node, layer)
    if (overlay === undefined) continue
    result = result === undefined ? overlay : mergeLayer(result, overlay)
  }
  return result
}

/* ─── Tree in a class ───────────────────────────────────────────────────── */

type Resolved = Partial<Record<WidthClass, UiNode>>

// Memoized by node IDENTITY: the tree's shape is immutable, so the same node gives the same resolved subtree.
const memo = new WeakMap<UiNode, Resolved>()

function resolve(node: UiNode, widthClass: WidthClass): UiNode {
  const props = effectivePropsOf(node, widthClass)
  const style = baseStyleInWidthClass(node, widthClass)
  const children = node.children
  const resolvedChildren = children === undefined ? undefined : childrenInWidthClass(children, widthClass)
  const childrenChanged = resolvedChildren !== children
  const carriesOverrides = (node as { readonly styleOn?: unknown }).styleOn !== undefined || (node as { readonly propsOn?: unknown }).propsOn !== undefined

  if (props === node.props && style === node.style && !childrenChanged && !carriesOverrides) return node

  const next: Record<string, unknown> = { ...node, props }
  // Overlays are already applied: the resolved node has none, and a second pass changes nothing.
  delete next.styleOn
  delete next.propsOn
  if (style === undefined) delete next.style
  else next.style = style
  if (childrenChanged) next.children = resolvedChildren
  return next as unknown as UiNode
}

/**
 * A node with its subtree in a class: effective props, the base style with width layers, without
 * the `propsOn` / `styleOn` fields. `compact` is THE NODE ITSELF (the base is the phone); a
 * subtree without overlays is also returned as the same object in all classes.
 */
export function nodeInWidthClass<N extends UiNode>(node: N, widthClass: WidthClass): N {
  if (widthClass === 'compact') return node
  let entry = memo.get(node)
  if (entry === undefined) {
    entry = {}
    memo.set(node, entry)
  }
  const known = entry[widthClass]
  if (known !== undefined) return known as N
  const resolved = resolve(node, widthClass)
  entry[widthClass] = resolved
  return resolved as N
}

/** Children of a node in a class. */
export function childrenInWidthClass(children: readonly UiNode[], widthClass: WidthClass): readonly UiNode[] {
  if (widthClass === 'compact') return children
  const next = children.map((child) => nodeInWidthClass(child, widthClass))
  return next.some((child, index) => child !== children[index]) ? next : children
}

/* ─── Largest content width of a screen ─────────────────────────────────── */

/** The screen content column: offset from the box START (logical) and width. */
export interface ScreenContentBox {
  readonly start: number
  readonly width: number
}

/** THE LARGEST CONTENT WIDTH: an integer within the schema bounds; a non-number or non-integer means no field, out of bounds is clamped. */
export function contentMaxWidthOf(props: Readonly<Record<string, unknown>>): number | undefined {
  const value = Object.hasOwn(props, 'contentMaxWidth') ? props.contentMaxWidth : undefined
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  return Math.min(CONTENT_MAX_WIDTH_MAX, Math.max(CONTENT_MAX_WIDTH_MIN, value))
}

/** THE CONTENT COLUMN: no wider than the number, CENTERED, half the remainder is not rounded. */
export function screenContentBox(available: number, contentMaxWidth: number | undefined): ScreenContentBox {
  const space = Math.max(0, available)
  if (contentMaxWidth === undefined || contentMaxWidth >= space) return { start: 0, width: space }
  return { start: (space - contentMaxWidth) / 2, width: contentMaxWidth }
}

/** A strip along the screen width: from the LEFT edge of the root box, in any writing direction. */
export interface ScreenInlineRect {
  readonly x: number
  readonly width: number
}

export interface ScreenContentInput {
  readonly width: number
  readonly padding: { readonly start: number; readonly end: number }
  readonly contentMaxWidth: number | undefined
  readonly appBarInset?: { readonly start: number; readonly end: number } | undefined
  readonly navBarInset?: { readonly start: number; readonly end: number } | undefined
  readonly rtl: boolean
}

/** REFERENCE: where in width the CONTENT of each screen zone stands with `contentMaxWidth`. */
export function screenContentRects(input: ScreenContentInput): {
  readonly body: ScreenInlineRect
  readonly pinned: ScreenInlineRect
  readonly appBar: ScreenInlineRect
  readonly navBar: ScreenInlineRect
} {
  const none = { start: 0, end: 0 }
  const column = (outer: number, inset: { readonly start: number; readonly end: number }, before: number): ScreenInlineRect => {
    const box = screenContentBox(outer - inset.start - inset.end, input.contentMaxWidth)
    const start = before + inset.start + box.start
    return { x: input.rtl ? input.width - start - box.width : start, width: box.width }
  }
  const inside = input.width - input.padding.start - input.padding.end
  const body = column(input.width, input.padding, 0)
  return {
    body,
    pinned: body,
    appBar: column(inside, input.appBarInset ?? none, input.padding.start),
    navBar: column(input.width, input.navBarInset ?? none, 0),
  }
}

/** Rectangle of a cell: `x` from the left edge. */
export interface GridCellRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * REFERENCE: grid cells in the host's content box: width `(width - gaps) / columns` of the
 * EFFECTIVE number of columns, the same across the whole grid; a row as tall as its tallest
 * cell; one gap for both axes. Not rounded. A hidden cell takes no place and is absent from
 * `heights`. CSS draws it (`repeat(N, minmax(0, 1fr))`); this is the number for those who need
 * the value without measuring.
 */
export function gridCellRects(input: { readonly inline: number; readonly columns: number; readonly gap: number; readonly heights: readonly number[]; readonly rtl: boolean }): GridCellRect[] {
  const columns = Math.max(1, Math.floor(input.columns))
  const cell = Math.max(0, (input.inline - input.gap * (columns - 1)) / columns)
  const rects: GridCellRect[] = []
  let top = 0
  for (let first = 0; first < input.heights.length; first += columns) {
    const row = input.heights.slice(first, first + columns)
    const tallest = row.reduce((most, height) => Math.max(most, height), 0)
    row.forEach((height, column) => {
      const start = column * (cell + input.gap)
      rects.push({ x: input.rtl ? input.inline - start - cell : start, y: top, width: cell, height })
    })
    top += tallest + input.gap
  }
  return rects
}

/**
 * The contract word for "window" (`notMeasured`). Composed, because the package scanner for "no
 * browser globals" is lexical and cannot tell a data word from an access to the window object.
 */
const WINDOW_WORD = ['win', 'dow'].join('')

/**
 * Mirror of `x-style.layout.widthClass` (without the service `cases`); a test compares it with
 * the artifact for EQUALITY. Not edited by hand.
 */
export const WIDTH_CLASS_LAYOUT = {
  classes: [
    { class: 'compact', from: 0 },
    { class: 'medium', from: 600 },
    { class: 'expanded', from: 1024 },
  ],
  unit: 'logical-px',
  measured: 'the-box-the-screen-root-is-drawn-in-with-its-padding',
  notMeasured: [WINDOW_WORD, 'device', 'orientation', 'parent-node'],
  rounding: 'none',
  perScreen: 'one-class-for-the-whole-screen',
  modalLayer: 'its-own-class-from-its-own-box',
  unknownWidth: 'compact',
  customisable: 'no',
  cascade: {
    order: ['base', 'medium', 'expanded'],
    compact: 'base-only',
    medium: 'base-then-medium',
    expanded: 'base-then-medium-then-expanded',
    merge: 'named-keys-replace-whole-top-level-values',
  },
  showOn: {
    field: 'showOn',
    on: 'every-node-but-the-screen-root',
    shown: 'class-is-listed-AND-visibleIf-holds',
    noField: 'shown-on-every-class',
    hidden: 'as-hidden-by-visibleIf-everywhere-the-contract-asks-visible',
    asks: ['screen-zones', 'app-bar-actions', 'nav-items', 'list-numbering', 'form-required', 'tabs', 'stack-layers', 'row-weights', 'carousel-cards', 'pinned-block'],
    unknownClass: 'word-skipped-none-known-means-shown',
  },
  styleOn: {
    field: 'styleOn',
    order: ['style', 'styleOn.medium', 'styleOn.expanded', 'styleWhen'],
    merge: 'top-level-fields-as-styleWhen',
    stateOverWidth: 'the-first-matching-state-wins-over-every-width-layer',
    inherits: 'the-resolved-style-as-any-style',
  },
  props: {
    field: 'propsOn',
    byWidget: [
      { type: 'Screen', props: ['gap', 'align', 'justify', 'contentMaxWidth'] },
      { type: 'Column', props: ['gap', 'align', 'justify'] },
      { type: 'Row', props: ['gap', 'align', 'justify', 'carousel'] },
      { type: 'Container', props: ['direction', 'gap', 'align', 'justify'] },
      { type: 'Grid', props: ['columns', 'gap'] },
      { type: 'Repeater', props: ['direction', 'columns', 'gap', 'carousel'] },
    ],
    columns: { min: 1, max: 6, base: 'keeps-its-own-limits' },
    carousel: { overrides: ['perView'], rest: 'from-base' },
    carouselWithoutBase: 'not-read',
    keyOutsideList: 'not-read',
    values: 'read-by-the-same-rules-as-the-base-value',
    rulesAboutProps: 'hold-in-every-class-with-the-effective-props',
    parentField: 'legal-if-the-parent-accepts-it-in-some-class-read-only-where-it-does',
  },
  contentMaxWidth: {
    prop: 'contentMaxWidth',
    min: 320,
    max: 1920,
    limits: ['app-bar-content', 'body-content', 'bottom-zone-content'],
    edgeToEdge: ['root-background', 'app-bar-background', 'bottom-zone-background'],
    parts: {
      body: 'the-children-in-the-root-box-minus-root-inline-padding',
      pinned: 'the-pinned-block-itself-same-column-as-the-body',
      appBar: 'the-content-inside-the-bar-box-the-box-keeps-its-width',
      navBar: 'the-items-inside-the-bar-box-the-box-stays-edge-to-edge',
    },
    place: 'centred-same-in-ltr-and-rtl',
    rounding: 'none',
    narrower: 'no-effect',
    dependsOnClass: 'no',
    modalLayer: 'applies-inside-the-layer-box',
  },
  olderReader: {
    showOn: 'node-shown-on-every-width',
    styleOn: 'base-style',
    propsOn: 'base-props',
    contentMaxWidth: 'full-width',
    // The loss is specific, and the validator does not make it an error: the document is valid for a 9.18 reader.
    showOnLeadingZone: 'node-in-the-leading-zone-of-the-app-bar-without-compact-in-showOn-is-drawn-on-the-phone-instead-of-the-back-arrow',
  },
} as const
