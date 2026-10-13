/**
 * Carousel (schema 9.11.0): the `carousel` field in the `props` of a scrollable row (`Row`) and of
 * a data-driven list laid out as a row (`Repeater`). Sideways scrolling snaps to cards, dots sit
 * below, and the card width can be named relative to the visible area.
 *
 * The rules are contract data (`x-style.layout.carousel`); the functions are the reference
 * implementation's, verbatim. The package imports nothing from the contract repository, so the rule is
 * written here a second time; the two copies are kept together by the shared case table
 * `contract/fixtures/carousel/carousel-cases.json` and by a test that compares the data block
 * with the artifact. Layout, snapping and the gesture are done by CSS and the browser itself
 * (`render/carousel-row.tsx`); this module does the value reading: who the host is, card width,
 * stops, the active stop and the dot count.
 *
 * This module does not import `react`: the server graph of the entry point reads it.
 */
import { isReadableSpacingRef } from './layer-placement'
import type { SpacingRef } from './layer-placement'
import { isRecord } from './sanitize'
import type { UiNode } from './types'

export const CAROUSEL_PROP = 'carousel'
export const CAROUSEL_PER_VIEW_MIN = 1
export const CAROUSEL_PER_VIEW_MAX = 6
export const CAROUSEL_INDICATORS = ['dots', 'none'] as const
export type CarouselIndicator = (typeof CAROUSEL_INDICATORS)[number]
export const DEFAULT_CAROUSEL_PEEK = 'lg'
export const DEFAULT_CAROUSEL_INDICATOR: CarouselIndicator = 'dots'
/** No more dots are drawn: with more than ten stops there are no dots and no room reserved for them. */
export const CAROUSEL_MAX_DOTS = 10
/** An inactive dot is the active dot's colour at this opacity. */
export const CAROUSEL_INACTIVE_DOT_OPACITY = 0.3
/** A card narrower than this means `perView` is not applied and the width is natural. */
export const CAROUSEL_MIN_CARD = 1
/** A stop lying beyond `maxScroll` minus this is `maxScroll` itself. */
export const CAROUSEL_STOP_MERGE = 0.5

/** Mirror of `x-style.layout.carousel` (without the service key `cases`). */
export const CAROUSEL_RULES = {
  prop: CAROUSEL_PROP,
  hosts: [
    { type: 'Row', when: { prop: 'scrollable', equals: true } },
    { type: 'Repeater', when: { prop: 'direction', equals: 'row' } },
  ],
  notHosts: 'tightSlots',
  misplaced: 'ignored',
  unreadable: 'not-a-carousel',
  viewport: 'border-box-minus-border',
  area: 'width-the-place-gives-with-or-without-dots',
  shell: 'same-box-with-or-without-dots',
  padding: 'inside-scroll',
  card: {
    perViewMin: CAROUSEL_PER_VIEW_MIN,
    perViewMax: CAROUSEL_PER_VIEW_MAX,
    width: '(viewport - paddingInlineStart - perView * gap - peek) / perView',
    widthIs: 'box',
    rounding: 'none',
    defaultPeek: DEFAULT_CAROUSEL_PEEK,
    overridesOwnWidth: ['width', 'minWidth', 'maxWidth'],
    minCard: CAROUSEL_MIN_CARD,
    belowMinCard: 'natural-width',
    unreadablePerView: 'natural-width',
    withoutPerView: 'scrollableRow',
  },
  snap: {
    align: 'start',
    line: 'padding-inline-start',
    every: 'card',
    stop: 'card-start-offset',
    maxScroll: 'paddingStart + cards + gaps + paddingEnd - viewport',
    beyondMaxScroll: 'max-scroll',
    stopMerge: CAROUSEL_STOP_MERGE,
    contentFits: 'single-stop',
    endOfScroll: 'always-a-stop',
    mirroredInRtl: true,
  },
  active: { stop: 'nearest', tie: 'earlier', initial: 'first', owner: 'reader', lifetime: 'screen-in-stack', fewerStops: 'clamp', heldBy: 'stack-frame', keyedBy: 'node-and-template-instance-path' },
  indicator: {
    default: DEFAULT_CAROUSEL_INDICATOR,
    unknownWord: DEFAULT_CAROUSEL_INDICATOR,
    count: 'stops',
    singleStop: 'not-drawn',
    maxDots: CAROUSEL_MAX_DOTS,
    aboveMaxDots: 'not-drawn',
    dotsRowWidth: 'count * dotSize + (count - 1) * dotGap',
    dotsRowWiderThanViewport: 'not-drawn',
    notDrawn: 'takes-no-space',
    placement: 'below-viewport-center',
    order: 'reading',
    gap: 'sm',
    dotSize: 'sm',
    dotGap: 'sm',
    dotRadius: 'pill',
    activeColor: 'primary',
    inactiveColor: 'primary',
    inactiveOpacity: CAROUSEL_INACTIVE_DOT_OPACITY,
    interactive: false,
    announced: false,
  },
  gestures: { horizontal: 'carousel', vertical: 'screen', axisLock: 'dominant-axis' },
  nested: 'rejected',
  accessibility: { container: 'list', card: 'list-item', position: 'item-n-of-count', keyboard: 'focusable-scroll-region', reducedMotion: 'no-animated-programmatic-scroll' },
} as const

type HostNode = Pick<UiNode, 'type' | 'props'>

/**
 * State key of a carousel: the node together with the chain of template-instance indices from the
 * root (empty when the node is not inside a data-driven list). Two instances of one node give two
 * keys; the same node in the same instance gives one. The string's shape is the reader's
 * business: only equality matters.
 */
export function carouselStateKey(nodeId: string, instancePath: readonly number[]): string {
  return instancePath.length === 0 ? JSON.stringify([nodeId]) : JSON.stringify([nodeId, ...instancePath])
}

/**
 * Whether a node can be a carousel: a `Row` with `scrollable: true`, or a `Repeater` with
 * `direction: 'row'` and NO `columns` (the tight slot of a grid is not a host).
 */
export function isCarouselHost(node: HostNode | undefined | null): boolean {
  if (node === undefined || node === null) return false
  const props = node.props
  if (node.type === 'Row') return props.scrollable === true
  return node.type === 'Repeater' && props.direction === 'row' && props.columns === undefined
}

export interface ReaderCarousel {
  readonly perView: number | undefined
  readonly peek: SpacingRef | undefined
  readonly indicator: CarouselIndicator
}

/**
 * The `carousel` field as the reader sees it. `undefined` means the value is not an object: it is
 * not a carousel and the row scrolls as it did in 9.10. An unreadable PART loses only itself:
 * a `perView` that is not an integer 1..6 leaves the width natural; a `peek` that is not a
 * spacing reference falls back to the default; only `none` turns the dots off for `indicator`.
 * An unknown key is skipped.
 */
export function readCarousel(value: unknown): ReaderCarousel | undefined {
  if (!isRecord(value)) return undefined
  const perView = Object.hasOwn(value, 'perView') ? value.perView : undefined
  const peek = Object.hasOwn(value, 'peek') ? value.peek : undefined
  const indicator = Object.hasOwn(value, 'indicator') ? value.indicator : undefined
  return {
    perView: typeof perView === 'number' && Number.isInteger(perView) && perView >= CAROUSEL_PER_VIEW_MIN && perView <= CAROUSEL_PER_VIEW_MAX ? perView : undefined,
    peek: isReadableSpacingRef(peek) ? peek : undefined,
    indicator: (CAROUSEL_INDICATORS as readonly unknown[]).includes(indicator) ? (indicator as CarouselIndicator) : DEFAULT_CAROUSEL_INDICATOR,
  }
}

/** A node's carousel: the field is read only on a host (`carouselOutsideHost: 'ignore'`). */
export function carouselOf(node: HostNode | undefined | null): ReaderCarousel | undefined {
  if (node === undefined || node === null || !isCarouselHost(node)) return undefined
  return Object.hasOwn(node.props, CAROUSEL_PROP) ? readCarousel(node.props[CAROUSEL_PROP]) : undefined
}

export interface CarouselCardInput {
  readonly viewport: number
  readonly paddingStart: number
  readonly gap: number
  readonly peek: number
  readonly perView: number
}

/**
 * Card width from `perView`: `(viewport - paddingStart - perView * gap - peek) / perView`,
 * WITHOUT rounding; the end padding is not part of the formula. `undefined` means the result is
 * narrower than 1, so `perView` is not applied and the width is natural.
 */
export function carouselCardWidth(input: CarouselCardInput): number | undefined {
  const width = (input.viewport - input.paddingStart - input.perView * input.gap - input.peek) / input.perView
  return Number.isFinite(width) && width >= CAROUSEL_MIN_CARD ? width : undefined
}

/** A length for `calc()`: empty and zero both become `0px`. */
function lengthCss(value: string | undefined): string {
  return value === undefined || value === '' || value === '0' ? '0px' : value
}

/**
 * The same formula as a CSS expression. A child's percentage resolves against the scroll
 * container's CONTENT box, so the end padding is added back:
 * `calc((100% + paddingEnd - peek - perView * gap) / perView)`. The inputs are ready-made lengths
 * (`var(--product-space-lg)`, `16px`); a test substitutes numbers and compares the result with
 * `carouselCardWidth`.
 */
export function carouselCardCss(perView: number, gapCss: string, peekCss: string, paddingEndCss: string): string {
  return `calc((100% + ${lengthCss(paddingEndCss)} - ${lengthCss(peekCss)} - ${String(perView)} * ${lengthCss(gapCss)}) / ${String(perView)})`
}

export interface CarouselStopsInput {
  readonly viewport: number
  readonly paddingStart: number
  readonly paddingEnd: number
  readonly gap: number
  /** Outer card widths: box plus `margin`. */
  readonly cards: readonly number[]
}

export interface CarouselStops {
  readonly stops: readonly number[]
  readonly maxScroll: number
  readonly stopOfCard: readonly number[]
}

/** Carousel stops: the start of each card; the end of the scroll is ALWAYS a stop; when the content fits there is one stop, `0`. */
export function carouselStops(input: CarouselStopsInput): CarouselStops {
  const starts: number[] = []
  let cursor = 0
  input.cards.forEach((card, index) => {
    starts.push(cursor)
    cursor += card + (index < input.cards.length - 1 ? input.gap : 0)
  })
  const content = input.paddingStart + cursor + input.paddingEnd
  const maxScroll = Math.max(0, content - input.viewport)

  const stops: number[] = []
  const stopOfCard: number[] = []
  for (const start of starts) {
    if (maxScroll > 0 && start < maxScroll - CAROUSEL_STOP_MERGE) {
      stops.push(start)
      stopOfCard.push(stops.length - 1)
    } else {
      const end = maxScroll
      if (stops.length === 0 || stops[stops.length - 1] !== end) stops.push(end)
      stopOfCard.push(stops.length - 1)
    }
  }
  if (stops.length === 0) stops.push(0)
  const last = stops[stops.length - 1] ?? 0
  if (maxScroll > 0 && last < maxScroll - CAROUSEL_STOP_MERGE) stops.push(maxScroll)
  return { stops, maxScroll, stopOfCard }
}

/** The active stop: the one nearest to the offset; on a tie the earlier one; an offset out of range gives the outermost stop. */
export function activeCarouselStop(stops: readonly number[], offset: number): number {
  const at = Number.isFinite(offset) ? Math.max(0, offset) : 0
  let best = 0
  let distance = Number.POSITIVE_INFINITY
  stops.forEach((stop, index) => {
    const away = Math.abs(stop - at)
    if (away < distance) {
      best = index
      distance = away
    }
  })
  return best
}

export interface CarouselDotsRoom {
  readonly viewport: number
  readonly dotSize: number
  readonly dotGap: number
}

/** Width of a row of `count` dots: `count * dotSize + (count - 1) * dotGap`. */
export function carouselDotsRowWidth(count: number, dotSize: number, dotGap: number): number {
  return count > 0 ? count * dotSize + (count - 1) * dotGap : 0
}

/**
 * How many dots: one per STOP; none for a single stop, more than ten, `indicator: none`, or a
 * row that does not fit the visible area.
 */
export function carouselDotCount(indicator: CarouselIndicator, stopCount: number, room: CarouselDotsRoom): number {
  if (indicator !== 'dots') return 0
  if (!(stopCount > 1 && stopCount <= CAROUSEL_MAX_DOTS)) return 0
  return carouselDotsRowWidth(stopCount, room.dotSize, room.dotGap) <= room.viewport ? stopCount : 0
}

/** Height the node adds for the dots: the gap plus a dot when dots are drawn; otherwise nothing. */
export function carouselIndicatorBlock(dotCount: number, gap: number, dotSize: number): number {
  return dotCount > 0 ? gap + dotSize : 0
}
