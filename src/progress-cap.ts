/**
 * Round ends of a scale (schema 9.21.0, `cap: 'round'`): the geometry of the ends and the CSS that
 * draws them. A mirror of the contract's reference rule; the shared table
 * (`capCases` of `contract/fixtures/progress/progress-cases.json`) keeps the two copies together,
 * and `package.test.tsx` checks the data against `x-style.layout.progressCap`.
 *
 *  - RING: the ends of the fill arc are half-circles of the thickness and they lie INSIDE the filled
 *    part, so the arc never leaves 0 % or the current value. Their centres stand `thetaC = t / (D - t)`
 *    radians from the edges. A share too small for two ends is a DOT of the thickness at `thetaC`; a
 *    full scale is the whole ring with no ends and no seam; an empty one draws nothing over the track.
 *  - BAR: the radius of the track, the fill and every step is half the thickness, whatever the theme
 *    `pill` says; a non-zero fill is never shorter than the thickness (a dot, not a flat oval) and
 *    never longer than the track.
 *  - A gradient runs along the whole filled part as without the field; an end takes the colour of
 *    the gradient at its own centre.
 *
 * The module does not import `react`: the entry's server graph re-exports it.
 */
import type { ProgressFill, ProgressStop } from './progress'
import { cssNumber, cssPercent, cssPx } from './sanitize'

/** Mirror of `x-style.layout.progressCap`: the field and its only word. */
export const PROGRESS_CAP = { prop: 'cap', words: ['round'] } as const

/** The word as the READER takes it: an unknown one is no field. */
export function readProgressCap(value: unknown): 'round' | undefined {
  return value === 'round' ? 'round' : undefined
}

export interface RingCapGeometry {
  readonly kind: 'none' | 'dot' | 'arc' | 'full'
  /** Radians from an edge of the fill to the centre of its end: half the thickness over the middle radius. */
  readonly capAngle: number
  /** Centre of the start end (or of the dot), degrees from the top clockwise. */
  readonly startDeg: number
  readonly endDeg: number
}

const FULL_TURN = 360
const RADIANS_TO_DEGREES = 180 / Math.PI

export function ringCapGeometry(ratio: number, diameter: number, thickness: number): RingCapGeometry {
  const share = Math.min(Math.max(ratio, 0), 1)
  const stroke = Math.min(thickness, diameter / 2)
  const capAngle = diameter - stroke > 0 ? stroke / (diameter - stroke) : Math.PI
  const capDegrees = capAngle * RADIANS_TO_DEGREES
  if (share <= 0 || stroke <= 0) return { kind: 'none', capAngle, startDeg: 0, endDeg: 0 }
  if (share >= 1) return { kind: 'full', capAngle, startDeg: 0, endDeg: FULL_TURN }
  const sweep = FULL_TURN * share
  if (sweep <= 2 * capDegrees) return { kind: 'dot', capAngle, startDeg: capDegrees, endDeg: capDegrees }
  return { kind: 'arc', capAngle, startDeg: capDegrees, endDeg: sweep - capDegrees }
}

/** Length of the bar fill: a share of the track, a non-zero one not shorter than the thickness, never longer than the track. */
export function barCapFillInline(trackInline: number, thickness: number, ratio: number): number {
  const share = Math.min(Math.max(ratio, 0), 1)
  if (share <= 0) return 0
  return Math.min(trackInline, Math.max(thickness, trackInline * share))
}

/** Radius of every end of the bar: half the thickness, no theme token. */
export function barCapRadius(thickness: number): number {
  return Math.max(0, thickness / 2)
}

/** The same fill length as a CSS length (the track is the percentage's base). */
export function barCapFillCss(ratio: number, thickness: number): string {
  const share = Math.min(Math.max(ratio, 0), 1)
  if (share <= 0) return '0'
  return `min(100%, max(${cssPx(thickness)}, ${cssPercent(share)}))`
}

/**
 * The colour of the gradient at `position` (0..1 along the filled part). The stops are colours the
 * reader composed itself (a theme variable, hex, `rgba()`), so they may be mixed only by the engine:
 * `color-mix` takes any of the three.
 */
export function gradientColorAt(stops: readonly ProgressStop[], position: number): string | undefined {
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (first === undefined || last === undefined) return undefined
  if (position <= first.position) return first.color
  if (position >= last.position) return last.color
  for (let index = 1; index < stops.length; index += 1) {
    const right = stops[index]
    const left = stops[index - 1]
    if (right === undefined || left === undefined || position > right.position) continue
    const span = right.position - left.position
    const share = span <= 0 ? 1 : (position - left.position) / span
    return `color-mix(in srgb, ${left.color} ${cssNumber((1 - share) * 100)}%, ${right.color})`
  }
  return last.color
}

const degrees = (value: number): string => `${cssNumber(value)}deg`

export interface RingCapEnd {
  readonly key: 'start' | 'end' | 'dot'
  /** Centre of the end from the top clockwise, degrees. */
  readonly angle: number
  readonly color: string
}

export interface RingCapPaint {
  /** `background` of the fill element: square-ended arc between the centres, nothing outside it. */
  readonly background: string | undefined
  readonly ends: readonly RingCapEnd[]
}

/** The `background` and the ends of a ring fill with round ends. `diameter` and `thickness` are the geometry already clamped. */
export function ringCapPaint(input: { readonly ratio: number; readonly diameter: number; readonly thickness: number; readonly fill: ProgressFill }): RingCapPaint {
  const cap = ringCapGeometry(input.ratio, input.diameter, input.thickness)
  if (cap.kind === 'none') return { background: undefined, ends: [] }
  const sweep = FULL_TURN * Math.min(Math.max(input.ratio, 0), 1)
  const stops = input.fill.kind === 'gradient' ? input.fill.stops : undefined
  const colorAt = (angle: number): string => {
    if (input.fill.kind === 'color') return input.fill.color
    return gradientColorAt(input.fill.stops, sweep > 0 ? angle / sweep : 0) ?? input.fill.stops[0]?.color ?? 'transparent'
  }
  const start = cap.kind === 'full' ? 0 : cap.startDeg
  const finish = cap.kind === 'full' ? FULL_TURN : cap.endDeg
  const ends: RingCapEnd[] =
    cap.kind === 'full' ? [] : cap.kind === 'dot' ? [{ key: 'dot', angle: start, color: colorAt(start) }] : [{ key: 'start', angle: start, color: colorAt(start) }, { key: 'end', angle: finish, color: colorAt(finish) }]
  if (cap.kind === 'dot') return { background: undefined, ends }
  const inner = (stops ?? [])
    .map((stop) => stop.position * sweep)
    .filter((angle) => angle > start && angle < finish)
    .map((angle) => `${colorAt(angle)} ${degrees(angle)}`)
  const body = [`${colorAt(start)} ${degrees(start)}`, ...inner, `${colorAt(finish)} ${degrees(finish)}`].join(', ')
  const list = cap.kind === 'full' ? body : `transparent 0deg ${degrees(start)}, ${body}, transparent ${degrees(finish)} ${degrees(FULL_TURN)}`
  return { background: `conic-gradient(from 0deg, ${list})`, ends }
}

/** Where an end stands inside the square of the ring, from its centre: a physical offset (the ring is not mirrored in RTL). */
export function ringCapPosition(angle: number, diameter: number, thickness: number): { readonly left: string; readonly top: string } {
  const stroke = Math.min(thickness, diameter / 2)
  const radius = (diameter - stroke) / 2
  const radians = (angle * Math.PI) / 180
  return { left: `calc(50% + ${cssNumber(radius * Math.sin(radians))}px)`, top: `calc(50% - ${cssNumber(radius * Math.cos(radians))}px)` }
}
