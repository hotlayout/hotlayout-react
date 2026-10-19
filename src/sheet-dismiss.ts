/**
 * Closing a sheet by a drag down (schema 9.26.0, `x-sheetDismiss`) and `dismissible: false` on a
 * screen entry. A mirror of the contract's reference rule; the shared table
 * `contract/fixtures/sheet-dismiss/sheet-dismiss-cases.json` keeps the two copies together.
 *
 * A modal screen shown as a sheet from the bottom follows the finger down. It starts when the move
 * is past the touch slop and more down than sideways, outside a handle only while the body of the
 * sheet is scrolled to its top. On release: a fling up returns, a fling down dismisses, otherwise
 * the share of the height decides. The close is the same `navigate.back` as a tap on the scrim.
 * `dismissible: false` takes the drag, the scrim and Esc away.
 *
 * This file is the rule; the gesture is `screen/use-sheet-drag.ts`.
 */
import { TOUCH_SLOP } from './long-press'

export const DISMISSIBLE_PROP = 'dismissible'

/** The share of the height that, once dragged, dismisses the sheet. */
export const SHEET_DISMISS_SHARE = 0.3
/** A fling down at least this fast (logical pixels per second) dismisses; up at least this fast returns. */
export const SHEET_FLING_VELOCITY = 700
/** The velocity is taken over the last this many milliseconds of the move. */
export const SHEET_VELOCITY_WINDOW_MS = 100
/** The way back of a sheet that was not dragged far enough. */
export const SHEET_RETURN = { durationMs: 250, curve: [0.2, 0, 0, 1] } as const
/** The way down of a dismissed sheet; the event of the show comes after it. */
export const SHEET_EXIT = { durationMs: 200, curve: [0.4, 0, 1, 1] } as const

/** Whether a person may dismiss the layer (by a drag, the scrim or Esc): everywhere except `dismissible: false`. */
export function isDismissible(entry: { readonly dismissible?: unknown }): boolean {
  return entry.dismissible !== false
}

export type SheetDragOutcome = 'dismiss' | 'return'

export interface SheetDragInput {
  readonly sheetHeight: number
  /** How far the sheet was dragged down (negative — up; a sheet never goes above its place). */
  readonly dragged: number
  /** The velocity at the release; down is positive. */
  readonly velocity: number
}

/** What a released sheet does. */
export function sheetDragOutcome(input: SheetDragInput): SheetDragOutcome {
  if (input.velocity <= -SHEET_FLING_VELOCITY) return 'return'
  if (input.velocity >= SHEET_FLING_VELOCITY) return 'dismiss'
  if (input.sheetHeight <= 0) return 'return'
  return input.dragged >= input.sheetHeight * SHEET_DISMISS_SHARE ? 'dismiss' : 'return'
}

export interface SheetDragStartInput {
  /** The layer is a sheet from the bottom, not a centred window. */
  readonly sheet: boolean
  readonly dismissible: boolean
  /** How far the body is scrolled from its top; 0 is at the top. */
  readonly scrolled: number
  /** The move of the finger, down is positive. */
  readonly dy: number
  readonly dx: number
  /** The finger lies on a handle of the sheet. */
  readonly onHandle: boolean
}

/** Whether a move drags the sheet instead of scrolling its body. */
export function sheetDragStarts(input: SheetDragStartInput): boolean {
  if (!input.sheet || !input.dismissible) return false
  if (input.dy <= TOUCH_SLOP || Math.abs(input.dx) >= input.dy) return false
  return input.onHandle || input.scrolled <= 0
}

/** `x-sheetDismiss` of the artifact, whole; a test compares the two. */
export const SHEET_DISMISS_RULES = {
  layer: 'a modal screen shown as a sheet from the bottom (x-style.layout.modalLayer, x-style.layout.wideModal); a centred window has no drag',
  grab: 'the handle drawn by the document or any point of the sheet',
  starts: 'the finger moves down past the touch slop of «x-longPress» and more down than sideways',
  contentScrolled: 'when the body of the sheet is scrolled away from its top, a drag outside the handle scrolls the body; the sheet moves only once the body is at its top',
  follows: 'the sheet follows the finger down; it never goes above its place',
  release: {
    dismissShare: 0.3,
    of: 'the height of the sheet',
    flingVelocity: 700,
    velocityUnit: 'logical pixels per second, down positive',
    velocityWindowMs: 100,
    order: ['a fling up returns', 'a fling down dismisses', 'otherwise the share of the height'],
  },
  returns: {
    durationMs: 250,
    curve: [0.2, 0, 0, 1],
  },
  exits: {
    durationMs: 200,
    curve: [0.4, 0, 1, 1],
  },
  dismiss: 'navigate.back — one step of the stack, the «screen shown» event with reason «back» after the sheet has left',
  scrim: 'the scrim fades with the share of the sheet that is still visible',
  dismissible: {
    field: 'dismissible',
    on: 'the screen entry of a modal screen',
    value: '«false» — no drag, no tap on the scrim, no Esc',
    systemBack: 'stays with the host',
    actionsInside: '«navigate.back» inside the layer still closes it',
    onPage: 'not read; the validator rejects it',
    withoutField: 'dismissed as x-style.layout.modalLayer.dismiss and this block say',
  },
  reducedMotion: 'the sheet still follows the finger; the return and the exit are instant',
  keyboard: 'Esc as x-style.layout.modalLayer.dismiss',
  editorCanvas: 'nothing; the preview drags with the mouse too',
  olderReader: 'no drag; «dismissible: false» is not read — the scrim and Esc still dismiss',
  cases: 'contract/fixtures/sheet-dismiss/sheet-dismiss-cases.json',
} as const
