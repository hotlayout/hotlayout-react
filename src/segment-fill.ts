/**
 * The steps of a bar fill smoothly (schema 9.25.0, `x-segmentsTransition`). A mirror of the
 * contract's reference rule; the shared table `contract/fixtures/progress/progress-cases.json`
 * (groups `segmentFill...` and `transitionShareCases`) keeps the two copies together.
 *
 * At rest the steps are whole: a step is full or empty. While the value of the bar runs a
 * transition (`animateChanges`, `animateIn`) the number of filled steps is a number WITH A FRACTION
 * that goes from the whole steps of the start to the whole steps of the end along the curve of the
 * value:
 *
 *   units = U(from) + (U(to) - U(from)) * e,   U(r) = filledSegments(r, N)
 *   fill of step i = clamp(units - i, 0, 1)
 *
 * Both ends are pictures at rest, so nothing jumps when the transition ends. This file knows
 * nothing about React or the DOM; drawing is `ProgressBarView` (`render/progress.tsx`).
 */
import { filledSegments } from './progress'

/** How many steps are filled at a moment of a transition: a number with a fraction. */
export function segmentUnitsAt(input: { readonly fromRatio: number; readonly toRatio: number; readonly eased: number; readonly segments: number }): number {
  const from = filledSegments(input.fromRatio, input.segments)
  const to = filledSegments(input.toRatio, input.segments)
  const eased = Math.min(1, Math.max(0, input.eased))
  return from + (to - from) * eased
}

/** The fill of every step, 0..1, from the logical start. */
export function segmentFillsOf(units: number, segments: number): readonly number[] {
  return Array.from({ length: segments }, (_unused, index) => Math.min(1, Math.max(0, units - index)))
}

/** The current step: the first one not filled whole; `undefined` when every step is full. */
export function segmentCurrentOf(fills: readonly number[]): number | undefined {
  const index = fills.findIndex((fill) => fill < 1)
  return index === -1 ? undefined : index
}

/** The length of the gradient line along the filled steps: the drawn fill of the last step with any fill, the gaps included. */
export function segmentFillInline(units: number, stepInline: number, gap: number): number {
  if (units <= 0) return 0
  return units * stepInline + (Math.ceil(units) - 1) * gap
}

/**
 * The share of the transition already shown: `(shown - from) / (to - from)` clamped to 0..1. For a
 * reader that knows the value being shown and not the moment of the curve. Equal ends: it is over.
 */
export function transitionShareOf(from: number, to: number, shown: number): number {
  if (from === to || !Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(shown)) return 1
  return Math.min(1, Math.max(0, (shown - from) / (to - from)))
}

/** `x-segmentsTransition` of the artifact, whole; a test compares the two. */
export const SEGMENTS_TRANSITION_RULES = {
  prop: 'segments',
  on: ['ProgressBar'],
  refines: ['x-style.layout.progressSegments.partial', 'x-valueAppear.scale.segments'],
  atRest: 'whole steps: filled = floor(round(ratio * segments, precision)) — the rule of x-style.layout.progressSegments',
  during: 'while the value of the bar runs a transition (x-valueTransition or x-valueAppear), the filled steps are a number with a fraction',
  units: 'U(fromRatio) + (U(toRatio) - U(fromRatio)) * e, U(r) = filled steps at rest of the ratio r, e = the curve of x-valueTransition at the moment',
  ends: 'both ends are pictures at rest: the bar never jumps when the transition ends',
  sameStep: 'a change inside one step (U equal at both ends) moves nothing',
  stepFill: 'clamp(units - index, 0, 1) of the step, from its logical start',
  partialStep: 'a step with 0 < fill < 1 is drawn as its track or current colour with the fill over it, cut at fill * width, radius of the step kept',
  current: 'the first step whose fill is below 1; none when every step is full',
  gradient: 'along the drawn fill: position 1 is the end of the fill of the last step with any fill; gaps are cut out',
  interrupted: 'a transition that starts from a value shown during another one starts from the whole steps of that value',
  label: 'the label runs by the step of x-valueTransition, as before',
  semantics: 'the screen reader hears the final value',
  reducedMotion: 'no transition: whole steps at once',
  editorCanvas: 'not animated',
  olderReader: 'whole steps follow the shown ratio during the transition',
  cases: 'contract/fixtures/progress/progress-cases.json',
} as const
