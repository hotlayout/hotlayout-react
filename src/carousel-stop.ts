/**
 * The carousel tells the active stop (schema 9.32.0, `x-carouselStop`): the optional `carousel.stopPath`
 * names a NUMBER data path. A person's swipe, once the scroll has settled on a stop, writes the stop
 * number there (the very write an input field makes: the session of the reader and the host at the same
 * moment, under `writablePaths`); the carousel stands on the stop the value names when it is shown, and
 * moves to it when the number changes.
 *
 * The rules are contract data (the `x-carouselStop` block, mirrored whole below; a test compares it with
 * the artifact) and the functions are the reference ones, verbatim. The gestures, timers and scrolling
 * are done by `render/carousel-row.tsx`. The shared rows are the `stop...` groups of
 * `contract/fixtures/carousel/carousel-cases.json`.
 *
 * This module does not import `react`: the server graph of the entry point reads it.
 */
import { carouselOf } from './carousel'
import { readInputNumber } from './input-number'
import { isRecord, MAX_DATA_PATH_LENGTH } from './sanitize'
import type { UiNode } from './types'
import { holdsWritten } from './write-action'

/** The field inside the `carousel` object. */
export const CAROUSEL_STOP_KEY = 'stopPath'
/** The longest path: the common bound of a data path. */
export const CAROUSEL_STOP_PATH_MAX = MAX_DATA_PATH_LENGTH
/** Quiet time of a scroll after which it counts as settled when the browser sends no `scrollend`. */
export const CAROUSEL_SETTLE_MS = 150

/** Mirror of the `x-carouselStop` block. */
export const CAROUSEL_STOP_RULES = {
  refines: ['x-style.layout.carousel.active'],
  prop: 'carousel.stopPath',
  path: {
    is: 'a-literal-of-the-document-never-read-from-data',
    maxLength: CAROUSEL_STOP_PATH_MAX,
    type: 'number',
    typeMatch: 'exactly-number-checked-by-the-builder-against-the-data-contract',
    unreadable: 'no-path-the-carousel-writes-nothing-and-starts-at-the-first-stop',
    misplaced: 'x-style.layout.carousel.misplaced',
  },
  value: {
    is: 'the-index-of-the-active-snap-stop-from-0',
    counts: 'stops-of-x-style.layout.carousel.snap-not-cards',
    written: 'an-integer-number',
  },
  write: {
    when: 'a-person-moved-the-carousel-and-the-scroll-settled-on-a-stop-after-snapping',
    notWhen: ['during-the-gesture', 'the-reader-moved-it-the-show-or-following-the-value', 'no-gesture-at-all'],
    sameValue: 'not-written-again-x-actions.write.sameValue.equality',
    mechanism: 'the-write-of-an-input-x-style.layout.inputs.rules.write',
    to: 'session-of-the-reader-and-the-host-at-the-same-moment',
    gate: 'the-writable-paths-of-the-host-like-every-input',
    host: { onWrite: 'path-and-the-number', onAction: 'not-called' },
    track: 'none',
  },
  read: {
    layers: 'x-dataScope.layers-with-the-data-scope-of-the-node',
    number: 'a-number-with-an-integer-value-1-and-1.0-alike',
    notANumber: 'the-first-stop',
    fraction: 'the-first-stop',
    outOfRange: 'clamped-to-the-first-or-the-last-stop',
    atShow: 'the-carousel-starts-at-the-stop-the-value-names-once-the-stops-are-laid-out-without-animation',
    onChange: 'the-carousel-moves-to-the-stop-the-new-value-names',
    change: 'a-change-of-the-number-the-value-names-not-a-comparison-at-draw-time',
    refusedWrite: 'the-carousel-stays-where-the-person-left-it',
    duringGesture: 'the-gesture-wins-the-change-is-not-applied',
    reducedMotion: 'x-style.layout.carousel.accessibility.reducedMotion',
    fewerStops: 'x-style.layout.carousel.active.fewerStops',
  },
  state: 'x-style.layout.carousel.active.heldBy-unchanged-the-field-tells-the-data-where-the-state-is',
  ownDots: 'nodes-with-styleWhen-on-the-same-path-and-setValue-of-a-number-no-new-widget',
  insideRepeater: 'not-published-every-row-would-write-the-same-path',
  builder: 'the-preview-writes-and-follows-the-canvas-of-the-editor-neither',
  olderReader: 'skips-the-field-the-carousel-scrolls-nothing-is-written-and-it-starts-at-the-first-stop',
  cases: 'contract/fixtures/carousel/carousel-cases.json',
} as const

/**
 * The path as the reader sees it: the node is a carousel and the field is a non-empty string within the
 * bound. Anything else (not a string, empty, too long, not a carousel) means there is no path: the
 * carousel scrolls as without the field and writes nothing.
 */
export function carouselStopPathOf(node: Pick<UiNode, 'type' | 'props'> | undefined | null): string | undefined {
  if (node === undefined || node === null || carouselOf(node) === undefined) return undefined
  const raw: unknown = node.props.carousel
  if (!isRecord(raw) || !Object.hasOwn(raw, CAROUSEL_STOP_KEY)) return undefined
  const path = raw[CAROUSEL_STOP_KEY]
  return typeof path === 'string' && path !== '' && path.length <= CAROUSEL_STOP_PATH_MAX ? path : undefined
}

/** The stop number a value names: a number with an integer value (`1` and `1.0` alike); otherwise none. */
export function carouselStopNumberOf(value: unknown): number | undefined {
  const number = readInputNumber(value)
  return number !== undefined && Number.isInteger(number) ? number : undefined
}

/** The stop to show for a value: its number clamped to `[0, stopCount - 1]`; no number means the first. */
export function carouselShownStop(value: unknown, stopCount: number): number {
  const last = Math.max(0, Math.floor(Number.isFinite(stopCount) ? stopCount : 1) - 1)
  const number = carouselStopNumberOf(value)
  return number === undefined ? 0 : Math.min(last, Math.max(0, number))
}

export interface CarouselStopFollowInput {
  /** The value under the path when the carousel looked last. */
  readonly previous: unknown
  readonly next: unknown
  readonly stopCount: number
  /** The stop the carousel stands on now. */
  readonly active: number
}

/**
 * Where to go when the value changed. The event is a change of the NUMBER, not a comparison of what is
 * shown with the data at draw time: a write the host refused leaves the carousel where the person put it.
 * `undefined` means nowhere.
 */
export function carouselStopFollow(input: CarouselStopFollowInput): number | undefined {
  if (carouselStopNumberOf(input.previous) === carouselStopNumberOf(input.next)) return undefined
  const target = carouselShownStop(input.next, input.stopCount)
  return target === input.active ? undefined : target
}

export interface CarouselStopWriteInput {
  /** The stop the scroll settled on. */
  readonly settled: number
  /** Whether a person moved the scroll, not the reader. */
  readonly byPerson: boolean
  /** The value under the path now. */
  readonly current: unknown
}

/** What to write when the scroll settled: the stop number, only after a person's move and only if it is not already there. */
export function carouselStopWrite(input: CarouselStopWriteInput): number | undefined {
  if (!input.byPerson || !Number.isInteger(input.settled) || input.settled < 0) return undefined
  return holdsWritten(input.current, input.settled) ? undefined : input.settled
}
