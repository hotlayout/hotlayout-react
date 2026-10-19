/**
 * The pressed look of a pressable node (schema 9.25.0, `x-pressFeedback`, node field
 * `pressFeedback: 'none'`). A mirror of the contract's reference rule; the shared table
 * `contract/fixtures/press-feedback/press-feedback-cases.json` keeps the two copies together.
 *
 * The node that PERFORMS the action of a press (the innermost control under the finger) answers the
 * finger: a card or a list row scales to 0.97, a button to 0.96, an icon button, a ghost button and
 * a navigation item fade to 0.7. Down takes 80 ms, back 160 ms with a slight overshoot. A press
 * shorter than the way down still reaches the pose. The keyboard gets no feedback; under the system
 * "reduce motion" every kind only fades.
 *
 * This file is the rule and the style sheet; the pointer handling is `render/use-press-feedback.ts`.
 */
import type { UiNode } from './types'

export const PRESS_FEEDBACK_WORDS = ['none'] as const

export type PressFeedbackKind = 'card' | 'button' | 'fade'

/** Whether the node said "no feedback". */
export function pressFeedbackOff(node: Pick<UiNode, 'pressFeedback'>): boolean {
  return node.pressFeedback === 'none'
}

/** The kind of feedback of a node that performs the action of a press; `undefined` — none. */
export function pressFeedbackKindOf(node: UiNode, state: { readonly disabled: boolean; readonly swipe: boolean }): PressFeedbackKind | undefined {
  if (pressFeedbackOff(node) || state.disabled || state.swipe) return undefined
  if (node.type === 'IconButton' || node.type === 'NavItem') return 'fade'
  if (node.type === 'Button') return (node.props as { readonly variant?: unknown } | undefined)?.variant === 'ghost' ? 'fade' : 'button'
  return 'card'
}

/** The scale and the opacity of the pressed pose of every kind. */
export const PRESS_FEEDBACK_POSE = {
  card: { scale: 0.97, opacity: 1 },
  button: { scale: 0.96, opacity: 1 },
  fade: { scale: 1, opacity: 0.7 },
} as const satisfies Record<PressFeedbackKind, { readonly scale: number; readonly opacity: number }>

/** The way down: milliseconds and the cubic Bezier `x1, y1, x2, y2`. */
export const PRESS_DOWN = { durationMs: 80, curve: [0.2, 0, 0, 1] } as const
/** The way back: slower, and the curve passes 1 once. */
export const PRESS_UP = { durationMs: 160, curve: [0.34, 1.56, 0.64, 1] } as const

/** The attribute that marks a node that gives feedback (its value is the kind), and the one that marks it pressed. */
export const PRESS_FEEDBACK_ATTRIBUTE = 'data-hl-feedback'
export const PRESS_PRESSED_ATTRIBUTE = 'data-hl-pressed'

const bezier = (curve: readonly number[]): string => `cubic-bezier(${curve.join(',')})`

/**
 * The style sheet of the feedback, prefixed by `scope` (the package root). Scale is the individual
 * `transform` property, so it multiplies with the `scale` of the node's motion and the `rotate` of
 * a layer instead of replacing them; the fade is `filter: opacity()`, so the node's own `opacity`
 * stays. Only the node pressed itself answers: an ancestor of a pressed control is not marked.
 */
export function pressFeedbackCss(scope: string): readonly string[] {
  const node = `${scope} [${PRESS_FEEDBACK_ATTRIBUTE}]`
  const pressed = `${node}[${PRESS_PRESSED_ATTRIBUTE}]`
  const { card, button, fade } = PRESS_FEEDBACK_POSE
  return [
    `${node}{transition:transform ${String(PRESS_UP.durationMs)}ms ${bezier(PRESS_UP.curve)},filter ${String(PRESS_UP.durationMs)}ms ${bezier(PRESS_UP.curve)}}`,
    `${pressed}{transition-duration:${String(PRESS_DOWN.durationMs)}ms;transition-timing-function:${bezier(PRESS_DOWN.curve)}}`,
    `${pressed}[${PRESS_FEEDBACK_ATTRIBUTE}="card"]{transform:scale(${String(card.scale)})}`,
    `${pressed}[${PRESS_FEEDBACK_ATTRIBUTE}="button"]{transform:scale(${String(button.scale)})}`,
    `${pressed}[${PRESS_FEEDBACK_ATTRIBUTE}="fade"]{filter:opacity(${String(fade.opacity)})}`,
    // The system "reduce motion": every kind only fades, with no scale.
    `@media (prefers-reduced-motion:reduce){${pressed}{transform:none;filter:opacity(${String(fade.opacity)})}}`,
  ]
}

/** `x-pressFeedback` of the artifact, whole; a test compares the two. */
export const PRESS_FEEDBACK_RULES = {
  field: 'pressFeedback',
  words: PRESS_FEEDBACK_WORDS,
  value: '«none» — no feedback on this node; no field — the feedback below',
  who: 'the node that performs the action of the press (the innermost control under the finger); its pressable ancestors give no feedback',
  kinds: {
    card: 'a pressable container, a list row, an option and any other node that acts on press',
    button: 'a Button that is not «ghost»',
    fade: 'an IconButton, a ghost Button and a NavItem',
  },
  pose: PRESS_FEEDBACK_POSE,
  origin: 'the centre of the box of the node',
  down: { ...PRESS_DOWN, when: 'the finger or the pointer goes down on the node' },
  up: { ...PRESS_UP, when: 'the finger is lifted, leaves the node or the press is cancelled', overshoot: 'the curve passes 1 once: the node grows a little over its size and settles' },
  shortPress: 'a press shorter than «down» still reaches the pressed pose before it returns',
  keyboard: 'no feedback: Enter and Space act at once',
  disabled: 'no feedback',
  swipeConfirm: 'no feedback: the gesture has its own',
  reducedMotion: 'opacity only: every kind fades to 0.7, no scale',
  layout: 'none: the scale is painting only, neighbours do not move',
  composes: 'with node motion and the rotation of a layer: the press scale multiplies them',
  editorCanvas: 'none — the node is selected there',
  olderReader: 'no feedback',
  cases: 'contract/fixtures/press-feedback/press-feedback-cases.json',
} as const
