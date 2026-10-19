/**
 * Appearance of a value (schema 9.24.0, field `animateIn`): when a node is SHOWN, its value grows
 * from zero to its own. A mirror of the contract's reference rule; the shared table
 * `contract/fixtures/value-transition/value-transition-cases.json` (groups `appear...`) keeps the
 * two copies together, and `package.test.tsx` checks the numbers against the artifact block
 * `x-valueAppear`.
 *
 * It is the transition of `value-transition.ts` from `0`: the same duration, curve and step. This
 * file knows nothing about React or the DOM; the frame loop is `render/use-value-transition.ts`.
 */
import { isRecord } from './sanitize'
import { numberTargets, stepDigits, transitionValueAt } from './value-transition'
import type { TransitionTarget } from './value-transition'

/** Mirror of `x-valueAppear`: where the value grows from, and the key of a literal value of a scale. */
export const VALUE_APPEAR = { from: 0, literalKey: '#value' } as const

/** Whether the node asks for the appearance: the literal `true` only. */
export function animatesIn(props: Readonly<Record<string, unknown>>): boolean {
  return props.animateIn === true
}

/** The reasons there is no appearance, in the order of `x-valueAppear.whenNoAppear.order`. */
export type NoAppearReason = 'noField' | 'reducedMotion' | 'notANumber' | 'zero'

export interface AppearInput {
  readonly animates: boolean
  readonly to: unknown
  readonly reducedMotion?: boolean | undefined
}

/** `true`, or the first reason (in the order of the contract) the value is there at once. */
export function appearDecision(input: AppearInput): true | NoAppearReason {
  if (!input.animates) return 'noField'
  if (input.reducedMotion === true) return 'reducedMotion'
  if (typeof input.to !== 'number' || !Number.isFinite(input.to)) return 'notANumber'
  if (input.to === 0) return 'zero'
  return true
}

/** The value shown `t` ms after the show; `digits` absent is a scale (no step). Ends exactly on `to`. */
export function appearValueAt(input: { readonly to: number; readonly t: number; readonly digits?: number | undefined }): number {
  return transitionValueAt({ from: VALUE_APPEAR.from, to: input.to, t: input.t, digits: input.digits })
}

/** The step of a number in a text during the appearance: that of a transition from zero. */
export function appearDigits(to: number, format: unknown, currency: unknown): number {
  return stepDigits(VALUE_APPEAR.from, to, format, currency)
}

/**
 * Which numbers of a node appear: a text - the numbers that transition (a binding `content`, the
 * bindings of a template with a number format or none); a scale - its VALUE only (the max stands at
 * once), and a literal value too, named `#value`. The shape of the value is read strictly.
 */
export function appearTargets(props: Readonly<Record<string, unknown>>): readonly TransitionTarget[] {
  if (!animatesIn(props)) return []
  const value = props.value
  const literalScale: readonly TransitionTarget[] = isRecord(value) && value.kind === 'literal' ? [{ path: VALUE_APPEAR.literalKey, scale: true }] : []
  const bound = numberTargets(props).filter((target) => !target.scale || (isRecord(value) && value.kind === 'binding' && value.path === target.path))
  return [...literalScale, ...bound]
}

/** `x-valueAppear` of the artifact, whole; a test compares the two. */
export const VALUE_APPEAR_RULES = {
  prop: 'animateIn',
  on: ['Text', 'ProgressBar', 'CircularProgress'],
  value: 'literal true or no field; no field — the value is there at once',
  refines: ['x-valueTransition.whenNoTransition.firstShow'],
  from: VALUE_APPEAR.from,
  durationMs: 700,
  curve: 'the curve of x-valueTransition',
  step: 'the step of x-valueTransition with from = 0: whole when the value is whole, otherwise the digits of the format',
  formatted: 'every value between is written by the same format, plural word and template as the final one',
  text: 'the numbers of x-valueTransition.text.what',
  scale: {
    value: 'grows from 0 — a literal value too',
    max: 'stands at once',
    fill: 'the ratio of the shown value and max, no step: the fill and the arc grow from empty',
    label: 'the numbers of «valueOfMax» and «percent» of the shown value, by the step',
    segments: 'filled steps follow the shown ratio',
  },
  shown: {
    is: 'the moment the node is drawn on a shown screen',
    firstShow: 'the first screen of the flow and every screen pushed on top',
    back: 'a screen shown again by «back» or by a section switch is shown again',
    underModalLayer: 'a screen under a modal layer stays shown: closing the layer is not a show',
    appears: 'a node that appears by a condition, a width class or as a new record of a list',
    sameScreen: 'a change of data on a shown node is not a show',
  },
  stagger: 'none — every node starts at the moment it is shown',
  whenNoAppear: {
    order: ['noField', 'reducedMotion', 'notANumber', 'zero'],
    notANumber: 'no data or not a finite number: the fallback is there at once',
    zero: 'the value is 0: nothing to grow',
    reducedMotion: 'system «reduce motion»: the final value at once',
  },
  withAnimateChanges: 'the appearance runs from 0; a change of data during it or after it leads from the value shown at that moment (x-valueTransition.interrupted)',
  withoutAnimateChanges: 'a change of data during the appearance shows the new value at once and ends it',
  localeChanged: 'ends the appearance: the final value at once',
  semantics: 'the screen reader hears the final value, not the values between',
  editorCanvas: 'not animated — the document is edited there',
  olderReader: 'skips the field — the value is there at once',
  cases: 'contract/fixtures/value-transition/value-transition-cases.json',
} as const
