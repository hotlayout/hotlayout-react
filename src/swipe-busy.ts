/**
 * "Drag to confirm": the end of the gesture (schema 9.24.0, `x-swipeConfirmBusy`). A mirror of the
 * contract's reference rule; the shared table `contract/fixtures/swipe-confirm/swipe-confirm-cases.json`
 * (groups `busy...`) keeps the two copies together, and `package.test.tsx` checks the numbers
 * against the artifact.
 *
 * Released past the threshold, the action runs at once and the thumb glides to the end and STAYS
 * there, busy. What ends the busy state is the answer to the action: a screen change, the promise
 * of the host, or the time limit when the host returned nothing.
 */

/** Mirror of the numbers of `x-swipeConfirmBusy`, milliseconds. */
export const SWIPE_BUSY = { maxMs: 8000, completeMs: 200, returnMs: 250, turnMs: 800 } as const

/** Who runs the action of the button, as the action catalog says. */
export type SwipeActionRunner = 'reader' | 'host' | 'none' | 'invalid'

/** What the thumb does once the action has run. */
export function swipeAfterReleaseOf(runner: SwipeActionRunner): 'busy' | 'return' {
  return runner === 'none' || runner === 'invalid' ? 'return' : 'busy'
}

export type SwipeBusyEvent = 'fulfilled' | 'rejected' | 'screenChanged' | 'timeout'
export type SwipeHostAnswer = 'promise' | 'none'

/**
 * What a button does when something happens during the busy state. The time limit applies only
 * without a promise: a promise is held until it settles.
 */
export function swipeBusyOutcomeOf(event: SwipeBusyEvent, answer: SwipeHostAnswer): 'return' | 'gone' | 'stay' {
  if (event === 'screenChanged') return 'gone'
  if (event === 'timeout') return answer === 'promise' ? 'stay' : 'return'
  return answer === 'promise' ? 'return' : 'stay'
}

/**
 * The promise of the host, or `undefined`. Anything that is not a thenable (nothing, a number, a
 * record without `then`) is "no promise". The `then` is read once, and a getter that throws is
 * "no promise" too: the answer of the host is not trusted with the render.
 */
export function promiseOf(answer: unknown): PromiseLike<unknown> | undefined {
  if (typeof answer !== 'object' || answer === null) return undefined
  try {
    return typeof (answer as { readonly then?: unknown }).then === 'function' ? (answer as PromiseLike<unknown>) : undefined
  } catch {
    return undefined
  }
}

/** `x-swipeConfirmBusy` of the artifact, whole; a test compares the two. */
export const SWIPE_BUSY_RULES = {
  on: ['Button'],
  when: 'confirm-is-swipe',
  refines: ['x-swipeConfirm.afterAction', 'x-swipeConfirm.release.atOrPastThreshold', 'x-swipeConfirm.motion'],
  release: {
    atOrPastThreshold: 'act-at-once-then-the-thumb-glides-to-the-end-and-stays',
    belowThreshold: 'return-no-action-no-event',
  },
  keyboardAndAssistive: 'act-at-once-then-the-same-as-after-a-swipe',
  completeMs: SWIPE_BUSY.completeMs,
  returnMs: SWIPE_BUSY.returnMs,
  curve: 'ease-out-cubic',
  afterRelease: {
    readerAction: 'busy-the-shown-screen-changes-at-once',
    hostAction: 'busy',
    none: 'return-at-once',
    invalid: 'return-at-once',
  },
  busy: {
    thumb: 'at-the-end',
    glyph: 'replaced-by-the-indicator',
    indicator: 'a-ring-of-three-quarters-turning',
    indicatorSize: 'the-glyph-size',
    indicatorColor: 'the-glyph-color',
    indicatorStroke: 'an-eighth-of-the-glyph-size',
    turnMs: SWIPE_BUSY.turnMs,
    label: 'stays',
    press: 'nothing',
    gesture: 'nothing',
    keyboard: 'nothing',
    semantics: 'button-named-by-the-label-busy',
  },
  ends: {
    promiseFulfilled: 'return',
    promiseRejected: 'return',
    screenChanged: 'gone-with-its-screen',
    noPromiseTimeoutMs: SWIPE_BUSY.maxMs,
    noPromiseTimeout: 'return',
    promiseTimeout: 'none-the-promise-is-held',
  },
  shownAgain: 'a-screen-shown-again-has-the-thumb-at-the-start',
  reducedMotion: 'the-thumb-jumps-the-indicator-stands-still',
  disabled: 'as-before-the-thumb-does-not-move',
  editorPreview: 'busy-for-a-moment-then-the-step-of-the-flow',
  olderReader: 'the-thumb-returns-to-the-start-after-the-action',
  cases: 'contract/fixtures/swipe-confirm/swipe-confirm-cases.json',
} as const
