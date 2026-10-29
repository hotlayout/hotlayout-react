/**
 * A node fading in and out when its `visibleIf` changes (schema 9.33.0, `visibilityTransition:
 * 'fade'`, `x-visibilityFade`). A mirror of the contract's reference rule; the shared rows are the
 * groups of `contract/fixtures/visibility-fade/visibility-fade-cases.json`, and the block below is
 * compared with the artifact key `x-visibilityFade`.
 *
 * Every node follows its own timeline, with no pairing: a leaving node stays in the layout and
 * fades for `out`, then leaves it; an appearing node waits `out` out of the layout, then enters it
 * transparent and fades in for `in`. An interrupted change goes to the new goal from the current
 * opacity. The clock comes from the caller. No React in this file: the server graph of the entry
 * reads it too.
 */

export const VISIBILITY_TRANSITION_KEY = 'visibilityTransition'

/** Fade out: milliseconds and the cubic Bezier (x1, y1, x2, y2). */
export const VISIBILITY_FADE_OUT = { durationMs: 120, curve: [0.4, 0, 1, 1] } as const
/** Fade in. */
export const VISIBILITY_FADE_IN = { durationMs: 160, curve: [0, 0, 0.2, 1] } as const

/** `x-visibilityFade` of the artifact, whole; a test compares the two. */
export const VISIBILITY_FADE_RULES = {
  field: VISIBILITY_TRANSITION_KEY,
  words: ['fade'],
  value: '«fade» — the node fades when its «visibleIf» changes on the shown screen; no field — it appears and disappears at once',
  out: { ...VISIBILITY_FADE_OUT, when: 'the condition of a shown node stops holding', layout: 'the node keeps its place while it fades and leaves the layout when it ends' },
  in: { ...VISIBILITY_FADE_IN, delayMs: VISIBILITY_FADE_OUT.durationMs, when: 'the condition of a hidden node starts to hold', layout: 'the node waits «delayMs» out of the layout, then enters it with opacity 0 and fades in' },
  pair:
    'no pairing: every node follows its own timeline; two neighbours with mutually exclusive conditions are both invisible at «delayMs» and the layout changes once, at that moment',
  interrupted:
    'a change during a transition goes to the new goal from the current opacity, the duration scaled by the distance (out × opacity, in × (1 − opacity)); a node still waiting out of the layout stays hidden',
  interaction: 'a leaving node catches no press and leaves the accessibility tree at once; an entering node is a control from the moment it enters the layout',
  notTransition: ['the first show of the screen', 'going back to a screen', 'a change of the language or of the width class («showOn»)', 'reduced motion', 'the editor canvas'],
  scope: 'the box of the node with its subtree; the zones of the screen (app bar, pinned block, navigation bar) and the drawn navigation items follow the condition at once',
  notRead: 'a node without «visibleIf», the first child of the screen root that is an AppBar, a pinned node, a NavBar and a NavItem',
  olderReader: 'at once',
  cases: 'contract/fixtures/visibility-fade/visibility-fade-cases.json',
} as const

/** The field as the reader reads it: only the word `fade`, anything else is no field. */
export function visibilityTransitionOf(node: { readonly visibilityTransition?: unknown } | undefined | null): 'fade' | undefined {
  return node?.visibilityTransition === 'fade' ? 'fade' : undefined
}

/**
 * Phases of a node with the field: `shown` (in the layout, opacity 1), `leaving` (in the layout,
 * fading, no presses, not heard), `hidden` (out), `waiting` (out, waits for the neighbours to
 * fade), `entering` (in the layout, fading in, a control).
 */
export type VisibilityFadePhase = 'shown' | 'leaving' | 'hidden' | 'waiting' | 'entering'

export interface VisibilityFadeState {
  readonly phase: VisibilityFadePhase
  /** The moment the phase began, milliseconds (the caller's clock). */
  readonly since: number
  /** The opacity at the start of the phase (`leaving`, `entering`; an interruption starts from the current one). */
  readonly from: number
}

export interface VisibilityFadeFrame {
  readonly phase: VisibilityFadePhase
  readonly inLayout: boolean
  readonly opacity: number
  readonly interactive: boolean
}

/** The state of rest: how a node stands at the first show and after any change made "at once". */
export function visibilityFadeRest(shown: boolean, now = 0): VisibilityFadeState {
  return { phase: shown ? 'shown' : 'hidden', since: now, from: shown ? 1 : 0 }
}

/** The cubic Bezier through (0,0) and (1,1): y for x, by bisection on the curve parameter. */
export function cubicBezierAt(curve: readonly [number, number, number, number], x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const [x1, y1, x2, y2] = curve
  const coord = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3
  let lo = 0
  let hi = 1
  let t = x
  for (let i = 0; i < 40; i += 1) {
    const value = coord(t, x1, x2) - x
    if (Math.abs(value) < 1e-9) break
    if (value > 0) hi = t
    else lo = t
    t = (lo + hi) / 2
  }
  return coord(t, y1, y2)
}

const leavingSpan = (state: VisibilityFadeState): number => VISIBILITY_FADE_OUT.durationMs * state.from
const enteringSpan = (state: VisibilityFadeState): number => VISIBILITY_FADE_IN.durationMs * (1 - state.from)

/** The moment the current phase ends by itself; `undefined` for a phase of rest. */
export function visibilityFadeEndsAt(state: VisibilityFadeState): number | undefined {
  switch (state.phase) {
    case 'leaving':
      return state.since + leavingSpan(state)
    case 'waiting':
      return state.since + VISIBILITY_FADE_OUT.durationMs
    case 'entering':
      return state.since + enteringSpan(state)
    default:
      return undefined
  }
}

/** The state at `now`: phases that ended pass on (`leaving → hidden`, `waiting → entering → shown`). */
export function visibilityFadeSettle(state: VisibilityFadeState, now: number): VisibilityFadeState {
  let current = state
  for (;;) {
    const end = visibilityFadeEndsAt(current)
    if (end === undefined || now < end) return current
    if (current.phase === 'leaving') current = { phase: 'hidden', since: end, from: 0 }
    else if (current.phase === 'waiting') current = { phase: 'entering', since: end, from: 0 }
    else current = { phase: 'shown', since: end, from: 1 }
  }
}

/** The frame at `now`: the phase, whether the node is in the layout, its opacity and whether it is a control. */
export function visibilityFadeAt(state: VisibilityFadeState, now: number): VisibilityFadeFrame {
  const settled = visibilityFadeSettle(state, now)
  switch (settled.phase) {
    case 'shown':
      return { phase: 'shown', inLayout: true, opacity: 1, interactive: true }
    case 'hidden':
      return { phase: 'hidden', inLayout: false, opacity: 0, interactive: false }
    case 'waiting':
      return { phase: 'waiting', inLayout: false, opacity: 0, interactive: false }
    case 'leaving': {
      const span = leavingSpan(settled)
      const p = span <= 0 ? 1 : (now - settled.since) / span
      return { phase: 'leaving', inLayout: true, opacity: settled.from * (1 - cubicBezierAt(VISIBILITY_FADE_OUT.curve, p)), interactive: false }
    }
    case 'entering': {
      const span = enteringSpan(settled)
      const p = span <= 0 ? 1 : (now - settled.since) / span
      return { phase: 'entering', inLayout: true, opacity: settled.from + (1 - settled.from) * cubicBezierAt(VISIBILITY_FADE_IN.curve, p), interactive: true }
    }
  }
}

/** The condition of the node became `shown` at `now`. `animate: false` — the change is "at once": the state of rest of the new goal. */
export function visibilityFadeChange(state: VisibilityFadeState, shown: boolean, now: number, animate: boolean): VisibilityFadeState {
  if (!animate) return visibilityFadeRest(shown, now)
  const settled = visibilityFadeSettle(state, now)
  const opacity = visibilityFadeAt(settled, now).opacity
  if (shown) {
    if (settled.phase === 'hidden') return { phase: 'waiting', since: now, from: 0 }
    if (settled.phase === 'leaving') return { phase: 'entering', since: now, from: opacity }
    return settled
  }
  if (settled.phase === 'shown' || settled.phase === 'entering') return { phase: 'leaving', since: now, from: opacity }
  if (settled.phase === 'waiting') return visibilityFadeRest(false, now)
  return settled
}
