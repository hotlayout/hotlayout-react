/**
 * Motion of a node (schema 9.20.0): an endless drift or breath that never changes the layout.
 *
 * The rules are contract data (`x-motion`); the form of the value is the schema's. This file reads
 * the value strictly (a form the schema would not accept means "the node stands still"), turns it
 * into CSS variables, and carries the style sheet that performs it.
 *
 * HOW IT MOVES. A registered variable holds the phase as an ANGLE; one animation turns it from 0 to
 * 360 degrees at a constant speed (`linear`: the sine is already smooth), and `translate`, `scale` and
 * `filter: opacity()` compute the pose from it with `sin()` / `cos()`:
 *
 *   float:  x = A sin(theta) toward the end of the line, y = -A sin(theta) | -A sin(2 theta)
 *   pulse:  p = (1 - cos(theta)) / 2;  scale = 1 + (S - 1) p;  opacity = 1 + (O - 1) p
 *
 * Separate properties, not `transform`: they compose with the rotation of an overlay in the order
 * the contract names (a shift along the screen axes, a scale about the centre of the box), and none
 * of them touches layout. Before the delay the phase is its initial 0, which is the pose at rest.
 * The server markup carries the same style sheet and no running animation: the first paint is the
 * pose at rest. The system "reduce motion" switches the animation off and the node stands at rest.
 */
import { cssNumber, exactInteger, exactNumber, isRecord } from './sanitize'
import type { Css } from './style'

export const MOTION_AXES = ['vertical', 'horizontal', 'both'] as const
export type MotionAxis = (typeof MOTION_AXES)[number]

/** Mirror of `x-motion.ranges`. */
export const MOTION_RANGES = {
  duration: { min: 400, max: 60000 },
  delay: { min: 1, max: 60000 },
  amplitude: { min: 1, max: 48 },
  scale: { min: 0.5, max: 1.5 },
  opacity: { min: 0, max: 1 },
} as const

export interface FloatMotion {
  readonly kind: 'float'
  readonly axis: MotionAxis
  readonly amplitude: number
  readonly duration: number
  readonly delay: number | undefined
}

export interface PulseMotion {
  readonly kind: 'pulse'
  readonly scale: number
  readonly opacity: number | undefined
  readonly duration: number
  readonly delay: number | undefined
}

export type ReaderMotion = FloatMotion | PulseMotion

/** The marks the style sheet selects by. */
export const MOTION_ATTRIBUTE = 'data-hl-motion'
export const MOTION_FADE_ATTRIBUTE = 'data-hl-motion-fade'

const PHASE = '--hl-motion-phase'
const KEYFRAMES = 'hl-motion-cycle'

/** The variables of one node; the style sheet below reads exactly these (and the phase). */
export const MOTION_VARS = {
  phase: PHASE,
  duration: '--hl-motion-duration',
  delay: '--hl-motion-delay',
  x: '--hl-motion-x',
  y: '--hl-motion-y',
  y2: '--hl-motion-y2',
  mirror: '--hl-motion-mirror',
  scale: '--hl-motion-scale',
  opacity: '--hl-motion-opacity',
} as const

const FLOAT_KEYS: ReadonlySet<string> = new Set(['kind', 'axis', 'amplitude', 'duration', 'delay'])
const PULSE_KEYS: ReadonlySet<string> = new Set(['kind', 'scale', 'opacity', 'duration', 'delay'])

/** The value has no key of another kind or of a later version: the schema is strict, and a node must not move on a guess. */
const hasOnly = (value: Readonly<Record<string, unknown>>, keys: ReadonlySet<string>): boolean => Object.keys(value).every((key) => keys.has(key))

function readTiming(value: Readonly<Record<string, unknown>>): { readonly duration: number; readonly delay: number | undefined } | undefined {
  const duration = exactInteger(value.duration, MOTION_RANGES.duration.min, MOTION_RANGES.duration.max)
  if (duration === undefined) return undefined
  // An absent delay is "no delay"; a delay that is present but not valid spoils the whole value.
  if (value.delay === undefined) return { duration, delay: undefined }
  const delay = exactInteger(value.delay, MOTION_RANGES.delay.min, MOTION_RANGES.delay.max)
  return delay === undefined ? undefined : { duration, delay }
}

/**
 * The motion of a value, or `undefined`: an unknown kind, a missing or out-of-range field, a field
 * of the other kind. The node then stands still (`olderReader`, unknown form).
 */
export function readMotion(value: unknown): ReaderMotion | undefined {
  if (!isRecord(value)) return undefined
  const timing = readTiming(value)
  if (timing === undefined) return undefined
  if (value.kind === 'float') {
    const axis = MOTION_AXES.find((word) => word === value.axis)
    const amplitude = exactInteger(value.amplitude, MOTION_RANGES.amplitude.min, MOTION_RANGES.amplitude.max)
    return axis === undefined || amplitude === undefined || !hasOnly(value, FLOAT_KEYS) ? undefined : { kind: 'float', axis, amplitude, ...timing }
  }
  if (value.kind === 'pulse') {
    const scale = exactNumber(value.scale, MOTION_RANGES.scale.min, MOTION_RANGES.scale.max)
    const opacity = value.opacity === undefined ? undefined : exactNumber(value.opacity, MOTION_RANGES.opacity.min, MOTION_RANGES.opacity.max)
    if (scale === undefined || (value.opacity !== undefined && opacity === undefined) || !hasOnly(value, PULSE_KEYS)) return undefined
    return { kind: 'pulse', scale, opacity, ...timing }
  }
  return undefined
}

/** The motion of a node: any node except the root `Screen`. */
export function motionOfNode(node: { readonly type: string; readonly motion?: unknown }): ReaderMotion | undefined {
  return node.type === 'Screen' ? undefined : readMotion(node.motion)
}

const ms = (value: number): string => `${cssNumber(value)}ms`
/** A length with its unit even when it is zero: a bare `0` next to a length inside `calc()` is invalid. */
const px = (value: number): string => `${cssNumber(value)}px`

/** The variables of one moving node; every number passed `readMotion`, so only numbers get into the style. */
export function motionVars(motion: ReaderMotion, rtl: boolean): Css {
  const vars: Css = { [MOTION_VARS.duration]: ms(motion.duration), [MOTION_VARS.delay]: ms(motion.delay ?? 0) }
  if (motion.kind === 'pulse') {
    vars[MOTION_VARS.scale] = cssNumber(motion.scale)
    vars[MOTION_VARS.opacity] = cssNumber(motion.opacity ?? 1)
    return vars
  }
  const amplitude = px(motion.amplitude)
  const none = px(0)
  vars[MOTION_VARS.x] = motion.axis === 'vertical' ? none : amplitude
  vars[MOTION_VARS.y] = motion.axis === 'vertical' ? amplitude : none
  vars[MOTION_VARS.y2] = motion.axis === 'both' ? amplitude : none
  // Horizontal goes toward the END of the line: the sign flips in right-to-left writing, vertical does not.
  vars[MOTION_VARS.mirror] = rtl ? '-1' : '1'
  return vars
}

/** The marks of a moving node: the kind, and (for a pulse that changes opacity) the fade. */
export function motionMarks(motion: ReaderMotion): Readonly<Record<string, string>> {
  return motion.kind === 'pulse' && motion.opacity !== undefined ? { [MOTION_ATTRIBUTE]: 'pulse', [MOTION_FADE_ATTRIBUTE]: '' } : { [MOTION_ATTRIBUTE]: motion.kind }
}

const phase = `var(${PHASE})`

/** The expressions that turn the phase into a pose. Exported so a test evaluates exactly what ships. */
export const MOTION_EXPRESSIONS = {
  translate: `calc(var(${MOTION_VARS.x}) * var(${MOTION_VARS.mirror}) * sin(${phase})) calc(-1 * (var(${MOTION_VARS.y}) * sin(${phase}) + var(${MOTION_VARS.y2}) * sin(2 * ${phase})))`,
  scale: `calc(1 + (var(${MOTION_VARS.scale}) - 1) * (1 - cos(${phase})) / 2)`,
  opacity: `opacity(calc(1 + (var(${MOTION_VARS.opacity}) - 1) * (1 - cos(${phase})) / 2))`,
} as const

/**
 * The style sheet of motion, prefixed by `scope` (the package root). Its specificity is above the
 * reset (`all: unset`), which would otherwise cancel the animation.
 */
export function motionCss(scope: string): readonly string[] {
  const moving = `${scope} [${MOTION_ATTRIBUTE}]`
  return [
    // Registered so the animation turns the phase smoothly. In a shadow tree `@property` does not apply, so `registerMotionPhase` does the same from code.
    `@property ${PHASE}{syntax:"<angle>";inherits:false;initial-value:0deg}`,
    `@keyframes ${KEYFRAMES}{from{${PHASE}:0deg}to{${PHASE}:360deg}}`,
    `${moving}{animation:${KEYFRAMES} var(${MOTION_VARS.duration}) linear var(${MOTION_VARS.delay}) infinite}`,
    `${moving}[${MOTION_ATTRIBUTE}="float"]{translate:${MOTION_EXPRESSIONS.translate}}`,
    `${moving}[${MOTION_ATTRIBUTE}="pulse"]{scale:${MOTION_EXPRESSIONS.scale}}`,
    `${scope} [${MOTION_FADE_ATTRIBUTE}]{filter:${MOTION_EXPRESSIONS.opacity}}`,
    // The system "reduce motion": the node stands exactly where it stands without the field.
    `@media (prefers-reduced-motion:reduce){${moving}{animation:none;translate:none;scale:none;filter:none}}`,
  ]
}

let registered = false

/**
 * Registers the phase variable for the whole document (it also covers shadow trees, unlike
 * `@property`). Once per page; a second registration, or a browser without `CSS.registerProperty`,
 * is harmless: the node then stands at rest.
 */
export function registerMotionPhase(): void {
  if (registered) return
  registered = true
  const css = (globalThis as { CSS?: { registerProperty?: (definition: object) => void } }).CSS
  try {
    css?.registerProperty?.({ name: PHASE, syntax: '<angle>', inherits: false, initialValue: '0deg' })
  } catch {
    // Already registered by the style sheet's `@property` or by another copy of the package: the same definition.
  }
}
