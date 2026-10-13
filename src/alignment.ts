/**
 * Alignment of children on both axes (schema 9.15.0).
 *
 * The rules are contract data (`x-style.layout.alignment`); the functions are the reference
 * implementation's, verbatim. The package imports nothing from the contract repository, so the rule is
 * written here a second time; the two copies are kept together by the shared case table
 * `contract/fixtures/align/align-cases.json`.
 *
 * Rendering is CSS: `justify-content` and `align-items` on the host's flex container. The
 * functions also give tests, and anyone who needs a value without measuring, the numbers.
 */

import type { CSSProperties } from 'react'

import { lookup } from './sanitize'

export const ALIGN_VALUES = ['start', 'center', 'end'] as const
export type AlignValue = (typeof ALIGN_VALUES)[number]

export const JUSTIFY_VALUES = ['start', 'center', 'end', 'between'] as const
export type JustifyValue = (typeof JUSTIFY_VALUES)[number]

export type MainAxis = 'block' | 'inline'

/** Where free space on the main axis comes from. */
export type MainAxisSpace = 'screen-body' | 'named-height' | 'row-content'

/** What applies on the main axis without the field (and with an unknown word). */
export const DEFAULT_JUSTIFY: JustifyValue = 'start'

/** Cross-axis alignment without the field: depends on the host's main axis. */
export const DEFAULT_CROSS_ALIGN: Readonly<Record<MainAxis, AlignValue>> = { block: 'start', inline: 'center' }

/** The only things that give a column host a height larger than its content. */
export const COLUMN_HEIGHT_SOURCES = ['style.height', 'style.minHeight', 'fill'] as const
export type ColumnHeightSource = (typeof COLUMN_HEIGHT_SOURCES)[number]

interface AlignmentHost {
  readonly type: string
  readonly when?: { readonly prop: string; readonly equals: unknown }
  readonly mainAxis: MainAxis
  readonly space: MainAxisSpace
}

/** Who has both fields (`align`, `justify`) since 9.15.0. `Row` is not listed: its fields are older and have schema defaults. */
export const ALIGNMENT_HOSTS: readonly AlignmentHost[] = [
  { type: 'Screen', mainAxis: 'block', space: 'screen-body' },
  { type: 'Column', mainAxis: 'block', space: 'named-height' },
  { type: 'Container', when: { prop: 'direction', equals: 'column' }, mainAxis: 'block', space: 'named-height' },
  { type: 'Container', when: { prop: 'direction', equals: 'row' }, mainAxis: 'inline', space: 'row-content' },
]

/** Mirror of `x-style.layout.alignment`; equality with the artifact is checked by a test. */
export const ALIGNMENT_LAYOUT = {
  props: { cross: 'align', main: 'justify' },
  hosts: ALIGNMENT_HOSTS,
  cross: {
    block: {
      rule: 'column.naturalWidthAlign',
      places: 'children-that-do-not-stretch',
      stretched: 'full-width-at-any-align',
      withoutProp: DEFAULT_CROSS_ALIGN.block,
    },
    inline: { places: 'every-child', boxHeight: 'style.height-or-fill-else-tallest-child', withoutProp: DEFAULT_CROSS_ALIGN.inline },
    direction: 'logical-start-is-script-start',
    unknownValue: 'as-without-prop',
  },
  main: {
    values: [...JUSTIFY_VALUES],
    withoutProp: DEFAULT_JUSTIFY,
    unknownValue: 'as-without-prop',
    freeSpace: 'main-size-of-content-box-minus-children-minus-gaps',
    noFreeSpace: 'as-start',
    start: 'free-space-after-the-last-child',
    center: 'half-before-the-first-half-after-the-last',
    end: 'free-space-before-the-first-child',
    between: 'equal-parts-between-neighbours',
    betweenSingleChild: 'as-start',
    gap: 'stays-the-smallest-distance',
    rounding: 'none',
    hiddenChild: 'takes-no-part',
    direction: 'inline-start-is-script-start',
    column: {
      heightSources: [...COLUMN_HEIGHT_SOURCES],
      contentHeight: 'no-free-space',
      notSources: ['tightSlots', 'Row', 'Container-row', 'Tab', 'Accordion', 'ChoiceGroup', 'Repeater'],
      weight: 'none',
    },
    row: { sameAs: 'Row.justify', freeSpace: 'content-width-minus-children-minus-gaps' },
  },
  screen: {
    children: 'body-only',
    notPlaced: ['appBar', 'pinned', 'navBar'],
    freeSpace: 'body-area-height-minus-scrolled-length',
    scrolledLength: 'body-padding-plus-content',
    tallerContent: 'scrolls-and-justify-is-not-read',
    modalLayer: 'same-rule-for-the-body-of-the-layer',
    shrunkLayer: 'no-free-space',
  },
  validator: 'silent-without-free-space',
} as const

/** A node as the rule sees it: type, raw props and (for a stack layer) `fill`. */
export interface AlignmentNode {
  readonly type: string
  readonly props?: unknown
  readonly fill?: unknown
}

function propOf(node: AlignmentNode, key: string): unknown {
  const props = node.props
  return typeof props === 'object' && props !== null ? lookup(props as Readonly<Record<string, unknown>>, key) : undefined
}

/**
 * The `when` condition is compared with the prop AFTER the schema default: a `Container` without
 * `direction` is a column (see `PROP_DEFAULTS` in `layout-rules.ts`).
 */
const HOST_DEFAULTS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = { Container: { direction: 'column' } }

function hostOf(node: AlignmentNode): AlignmentHost | undefined {
  return ALIGNMENT_HOSTS.find((host) => {
    if (host.type !== node.type) return false
    if (host.when === undefined) return true
    const defaults = lookup(HOST_DEFAULTS, node.type)
    const value = propOf(node, host.when.prop) ?? (defaults === undefined ? undefined : lookup(defaults, host.when.prop))
    return value === host.when.equals
  })
}

/** Main axis of a 9.15.0 host; `undefined` means the node is not a host. */
export function mainAxisOf(node: AlignmentNode): MainAxis | undefined {
  return hostOf(node)?.mainAxis
}

/** Cross-axis alignment of a host: its `align`, or, without the field (or with an unknown word), what applied before 9.15.0. */
export function crossAlignOf(node: AlignmentNode): AlignValue {
  const value = propOf(node, ALIGNMENT_LAYOUT.props.cross)
  if ((ALIGN_VALUES as readonly unknown[]).includes(value)) return value as AlignValue
  return DEFAULT_CROSS_ALIGN[mainAxisOf(node) ?? 'block']
}

/** Main-axis word: the node's `justify`, or `start` without the field or with an unknown word. */
export function mainJustifyOf(node: AlignmentNode): JustifyValue {
  const value = propOf(node, ALIGNMENT_LAYOUT.props.main)
  return (JUSTIFY_VALUES as readonly unknown[]).includes(value) ? (value as JustifyValue) : DEFAULT_JUSTIFY
}

/** `fill` applies only to a direct child of a stack. */
function effectiveFill(node: AlignmentNode, parent: AlignmentNode | undefined | null): boolean {
  return node.fill === true && parent?.type === 'Stack'
}

/**
 * What gives a column host a height larger than its content; `undefined` means the height follows
 * the content and there is no free space on the main axis. `own` carries the EFFECTIVE
 * `style.height` and `style.minHeight` (state overrides included).
 */
export function columnHeightSourceOf(
  node: AlignmentNode,
  parent: AlignmentNode | undefined | null,
  own: { readonly height: boolean; readonly minHeight: boolean },
): ColumnHeightSource | undefined {
  if (effectiveFill(node, parent)) return 'fill'
  if (own.height) return 'style.height'
  if (own.minHeight) return 'style.minHeight'
  return undefined
}

/** Whether this host's main axis CAN have free space; `undefined` means the node is not a host. */
export function mainAxisSpaceOf(
  node: AlignmentNode,
  parent: AlignmentNode | undefined | null,
  own: { readonly height: boolean; readonly minHeight: boolean },
): boolean | undefined {
  const host = hostOf(node)
  if (host === undefined) return undefined
  return host.space === 'named-height' ? columnHeightSourceOf(node, parent, own) !== undefined : true
}

/** Shift of each of `count` children along the main axis from its `start` position. Nothing is rounded. */
export function mainAxisShifts(free: number, count: number, justify: JustifyValue): number[] {
  const space = Number.isFinite(free) ? Math.max(0, free) : 0
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    if (justify === 'center') return space / 2
    if (justify === 'end') return space
    if (justify === 'between') return count > 1 ? (space * index) / (count - 1) : 0
    return 0
  })
}

/** Offset of a child of size `size` from the START of the cross axis within `available` space. */
export function crossAxisOffset(available: number, size: number, align: AlignValue): number {
  const space = Math.max(0, available - size)
  return align === 'center' ? space / 2 : align === 'end' ? space : 0
}

export interface AlignedChild {
  readonly width: number
  readonly height: number
  /** A stretched column child: its width is the host's content width. Not read in a row. */
  readonly stretch?: boolean | undefined
}

export interface AlignedBoxInput {
  readonly axis: MainAxis
  readonly inline: number
  readonly block?: number | undefined
  readonly minBlock?: number | undefined
  readonly gap: number
  readonly align: AlignValue
  readonly justify: JustifyValue
  readonly rtl: boolean
  readonly children: readonly AlignedChild[]
}

export interface AlignedRect {
  /** From the LEFT edge of the content box, in either writing direction. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Where a host's children sit in its content box. A child larger than the box keeps its size. */
export function alignedChildRects(input: AlignedBoxInput): { readonly block: number; readonly free: number; readonly rects: AlignedRect[] } {
  const { axis, inline, gap, align, justify, rtl, children } = input
  const gaps = gap * Math.max(0, children.length - 1)
  const fromLeft = (start: number, width: number): number => (rtl ? inline - start - width : start)
  if (axis === 'block') {
    const content = children.reduce((sum, child) => sum + child.height, 0) + gaps
    const block = input.block ?? Math.max(input.minBlock ?? 0, content)
    const free = Math.max(0, block - content)
    const shifts = mainAxisShifts(free, children.length, justify)
    let cursor = 0
    const rects = children.map((child, index) => {
      const width = child.stretch === true ? inline : Math.min(child.width, inline)
      const y = cursor + (shifts[index] ?? 0)
      cursor += child.height + gap
      return { x: fromLeft(crossAxisOffset(inline, width, align), width), y, width, height: child.height }
    })
    return { block, free, rects }
  }
  const content = children.reduce((sum, child) => sum + child.width, 0) + gaps
  const tallest = children.reduce((most, child) => Math.max(most, child.height), 0)
  const block = input.block ?? tallest
  const free = Math.max(0, inline - content)
  const shifts = mainAxisShifts(free, children.length, justify)
  let cursor = 0
  const rects = children.map((child, index) => {
    const start = cursor + (shifts[index] ?? 0)
    cursor += child.width + gap
    return { x: fromLeft(start, child.width), y: crossAxisOffset(block, child.height, align), width: child.width, height: child.height }
  })
  return { block, free, rects }
}

/** Free space of the screen body: the body area's height minus the length of what scrolls inside it. */
export function screenBodyFreeSpace(zones: { readonly body: { readonly height: number }; readonly contentHeight: number }): number {
  return Math.max(0, zones.body.height - zones.contentHeight)
}

/** CSS words for the axes: `justify` becomes `justify-content`, `align` becomes `align-items`. Taken from the lists only, never from a word in the document. */
export const JUSTIFY_CSS: Readonly<Record<JustifyValue, string>> = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' }
export const ALIGN_CSS: Readonly<Record<AlignValue, string>> = { start: 'flex-start', center: 'center', end: 'flex-end' }

/** Variable through which a host with free space passes its gap to the stylesheet (`styles.ts`). */
export const FREE_GAP_VAR = '--hl-gap'

/** Marker of a host whose free space is shared by auto margins rather than by `justify-content`. */
export const FREE_ATTRIBUTE = 'data-hl-free'

/**
 * Main axis without negative free space (`noFreeSpace: 'as-start'`).
 *
 * A bare `justify-content: center | flex-end` distributes NEGATIVE free space on overflow: the
 * start of the content ends up beyond the box edge, and nothing can scroll to it. The `safe`
 * keyword cures this, but not in every Safari 16, so `center` and `end` are implemented by the
 * stylesheet: an empty pseudo-element before (and after) the children with an auto margin. An
 * auto margin is never negative, so with no room it is zero and the children sit as with
 * `start`. The `gap` between the pseudo-element and the first child is cancelled by a negative
 * margin (variable `--hl-gap`), so the minimum distance between children is unchanged. `between`
 * and `start` stay `justify-content` words: without room they sit at the start anyway.
 */
export function justifyLayout(word: JustifyValue, axis: MainAxis, gap: string): { readonly style: CSSProperties; readonly attrs: Readonly<Record<string, string>> } {
  if (word === 'center' || word === 'end') {
    return { style: { justifyContent: 'flex-start', [FREE_GAP_VAR]: gap } as CSSProperties, attrs: { [FREE_ATTRIBUTE]: `${word}-${axis}` } }
  }
  return { style: { justifyContent: JUSTIFY_CSS[word] }, attrs: {} }
}
