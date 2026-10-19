/**
 * Smooth change of a value (schema 9.21.0, field `animateChanges`): the rule of WHICH numbers a node
 * leads from the old value to the new one, and WHAT is shown at a moment of the transition. A mirror
 * of the contract's reference rule; the shared table
 * `contract/fixtures/value-transition/value-transition-cases.json` keeps the two copies together,
 * and `package.test.tsx` checks the numbers against the artifact block `x-valueTransition`.
 *
 *   p = min(1, t / duration);  e = 1 - (1 - p)^3;  v = from + (to - from) * e
 *
 * A number in a text moves in steps (whole when both ends are whole, otherwise the cents of the
 * currency or three digits), cut towards the old value; a scale has no step. This file knows
 * nothing about React, nodes in a tree or the DOM: the reading of the data and the frame loop are
 * `render/use-value-transition.ts`.
 */
import { currencyFractionDigits, NUMBER_FORMAT } from './binding-format'
import { isRecord } from './sanitize'

/** Mirror of `x-valueTransition`: the duration (ms) and the digits kept before cutting. */
export const VALUE_TRANSITION = { durationMs: 700, precision: 6 } as const

/** The names of the reasons there is no transition, in the order of `x-valueTransition.whenNoTransition.order`. */
export type NoTransitionReason = 'noField' | 'firstShow' | 'reducedMotion' | 'localeChanged' | 'notANumber' | 'sameValue'

/** Ease-out of the third power: quick start, soft stop. */
export function easeOut(progress: number): number {
  const p = Math.min(1, Math.max(0, progress))
  return 1 - (1 - p) ** 3
}

const CURRENCY_CODE = /^[A-Z]{3}$/

/**
 * The step of a number in a text: both ends whole - whole numbers; otherwise the digits of the
 * currency (`currency`) or three (`number` and no format).
 */
export function stepDigits(from: number, to: number, format: unknown, currency: unknown): number {
  if (Number.isInteger(from) && Number.isInteger(to)) return 0
  if (format === 'currency' && typeof currency === 'string' && CURRENCY_CODE.test(currency)) return currencyFractionDigits(currency)
  return NUMBER_FORMAT.maximumFractionDigits
}

function rounded(value: number, digits: number): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

/**
 * The value shown `t` ms after the transition began. `digits` absent is a scale (no step). From the
 * moment `t >= duration` it is exactly `to`. The step is cut towards `from`; the product is rounded
 * to six digits before cutting, otherwise 0.1 * 30 would give 2.999... and lose a step.
 */
export function transitionValueAt(input: { readonly from: number; readonly to: number; readonly t: number; readonly digits?: number | undefined }): number {
  const { from, to, t, digits } = input
  if (!Number.isFinite(t) || t >= VALUE_TRANSITION.durationMs) return to
  const delta = (to - from) * easeOut(t / VALUE_TRANSITION.durationMs)
  const shown = (() => {
    if (digits === undefined) return from + delta
    const scale = 10 ** digits
    const steps = Math.trunc(rounded(delta * scale, VALUE_TRANSITION.precision))
    return rounded(from + steps / scale, digits + VALUE_TRANSITION.precision)
  })()
  // Two huge numbers from the data can overflow on the way; the new value is then the answer.
  return Number.isFinite(shown) ? shown : to
}

export interface TransitionChange {
  readonly animates: boolean
  readonly shownBefore: boolean
  readonly from: unknown
  readonly to: unknown
  readonly localeChanged?: boolean | undefined
  readonly reducedMotion?: boolean | undefined
}

/** `true`, or the first reason (in the order of the contract) the value becomes the new one at once. */
export function decide(change: TransitionChange): true | NoTransitionReason {
  if (!change.animates) return 'noField'
  if (!change.shownBefore) return 'firstShow'
  if (change.reducedMotion === true) return 'reducedMotion'
  if (change.localeChanged === true) return 'localeChanged'
  const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  if (!finite(change.from) || !finite(change.to)) return 'notANumber'
  if (change.from === change.to) return 'sameValue'
  return true
}

/** One number a node counts through: the data path, how it is written (for the step) and whether it is a scale. */
export interface TransitionTarget {
  readonly path: string
  readonly scale: boolean
  readonly format?: string
  readonly currency?: string
}

/** Formats under which a number of a text is counted through; no format is a number as it is. */
const TEXT_FORMATS: readonly unknown[] = [undefined, 'number', 'currency']

function bindingTarget(value: unknown, scale: boolean): TransitionTarget | undefined {
  if (!isRecord(value) || value.kind !== 'binding' || typeof value.path !== 'string') return undefined
  const format = typeof value.format === 'string' ? value.format : undefined
  if (!scale && !TEXT_FORMATS.includes(format)) return undefined
  const currency = typeof value.currency === 'string' && CURRENCY_CODE.test(value.currency) ? value.currency : undefined
  return { path: value.path, scale, ...(format === undefined ? {} : { format }), ...(currency === undefined ? {} : { currency }) }
}

/** Whether the node asks for the transition: the literal `true` only. */
export function animatesChanges(props: Readonly<Record<string, unknown>>): boolean {
  return props.animateChanges === true
}

/**
 * Which numbers of a node are counted through. A text: the binding `content` and every binding of
 * a template with a number format or none; a scale: `value` and `max`, each by itself.
 */
export function transitionTargets(props: Readonly<Record<string, unknown>>): readonly TransitionTarget[] {
  return animatesChanges(props) ? numberTargets(props) : []
}

/** The numbers of a node that CAN be led, whichever field asks (`animateChanges`, `animateIn`). */
export function numberTargets(props: Readonly<Record<string, unknown>>): readonly TransitionTarget[] {
  const content = props.content
  const fromText =
    isRecord(content) && content.kind === 'template' && isRecord(content.values)
      ? Object.values(content.values).map((entry) => bindingTarget(entry, false))
      : [bindingTarget(content, false)]
  return [bindingTarget(props.value, true), bindingTarget(props.max, true), ...fromText].filter((target): target is TransitionTarget => target !== undefined)
}
