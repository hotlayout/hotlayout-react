/**
 * PROGRESS BAR AND RING (schema 9.7.0): geometry and paint. A mirror of the contract's reference
 * implementation (the package does not import the builder's sources). The two copies are held
 * together by the shared case table `contract/fixtures/progress/progress-cases.json`, and
 * `package.test.tsx` checks the words of the `x-style.layout.progress` block against the
 * artifact.
 *
 * The rule, in short:
 *
 *  - FRACTION is `value / max` within 0..1; a max that is not a positive number means no scale,
 *    fraction 0 (not a full bar);
 *  - THICKNESS is a spacing token or an integer 0..128; missing, wrong form, or a token the
 *    theme does not know gives `sm`. Zero means neither track nor fill;
 *  - the TRACK lies UNDER THE WHOLE scale, the fill on top. Track color is `trackColor`, else
 *    `secondary`;
 *  - the FILL is `gradient` if it resolved, otherwise `color`. A gradient runs along the FILLED
 *    part: stop `p` sits at `p x fraction` of the scale. The angle is not read;
 *  - the RING is a circle centered in the content box, the arc INSIDE the circle, starting at
 *    the top, clockwise in any writing direction.
 *
 * TRUST BOUNDARY. The document and the theme come from the network, so nothing here becomes CSS
 * except through `resolve.ts` / `sanitize.ts`: a color is a theme variable, a hexadecimal value
 * or `rgba()` built from numbers; thickness and diameter are finite numbers within bounds; the
 * number of stops is bounded. The module does not import `react`: the entry's server graph reads
 * it.
 */
import type { DataScope } from './data'
import { clampLiteral, colorCss } from './resolve'
import { colorRefByForm, typographyRefByForm } from './rich-text'
import { cssNumber, isRecord, safeColor, safeIdent } from './sanitize'
import { dimension } from './style-box'
import type { Theme } from './theme'
import { declares, isComposedColor, productVar } from './theme'
import type { NodeStyle } from './types'

/* ───────────────────── mirror of `x-style.layout.progress` ───────────────────── */

/**
 * RULES AS DATA: a mirror of the artifact's `x-style.layout.progress` (a test compares them).
 * What the reader executes in the code below is only named here: a divergence from the artifact
 * fails a test instead of being found by eye.
 */
export const PROGRESS_RULES = {
  ratio: { formula: 'value / max', min: 0, max: 1, nonPositiveMax: 0, nonFinite: 0 },
  props: { thickness: 'thickness', trackColor: 'trackColor', gradient: 'gradient', color: 'color' },
  defaultThickness: 'sm',
  defaultTrackColor: 'secondary',
  zeroThickness: 'no-track-no-fill',
  paint: 'track-under-whole-scale-fill-over',
  fill: 'gradient-else-color',
  gradient: { spans: 'filled-part', angle: 'ignored', unresolved: 'use-color' },
  bar: {
    start: 'inline-start',
    mirroredInRtl: true,
    trackRadius: 'pill',
    fillRadius: 'pill',
    radiusClamp: 'half-shorter-side',
    fillClip: 'track',
    gradientLine: 'fill-inline-start-to-fill-inline-end',
    labelGap: 'xs',
    labelTypography: 'caption',
    labelColor: 'muted',
    labelAlign: 'end',
  },
  ring: {
    sizeUnit: 'xl',
    sizes: { sm: 2, md: 3, lg: 4 },
    defaultSize: 'md',
    sizeKeys: { inline: ['width', 'minWidth', 'maxWidth'], block: ['height', 'minHeight', 'maxHeight'] },
    namedSide: 'size-else-natural-within-min-max',
    diameter: 'smaller-named-content-side-else-size',
    unnamedSide: 'equals-diameter',
    placement: 'center',
    strokeAlign: 'inside',
    maxThickness: 'half-diameter',
    start: 'top',
    direction: 'clockwise',
    mirroredInRtl: false,
    cap: 'butt',
    gradientLine: 'sweep-from-start-to-arc-end',
    labelPlacement: 'center',
    labelTypography: 'caption',
    labelColor: 'onSurface',
  },
  widgets: { bar: 'ProgressBar', ring: 'CircularProgress' },
} as const

/**
 * OWN STYLE OF THE RING LABEL (9.17.0, `x-style.layout.progressLabel`). A mirror of the block
 * (without the service keys `widget`, `cases`); a test compares it with the artifact. The
 * `progress` block was not changed by the minor.
 */
export const RING_LABEL_STYLE = {
  props: { typography: 'labelTypography', color: 'labelColor' },
  defaultTypography: PROGRESS_RULES.ring.labelTypography,
  defaultColor: PROGRESS_RULES.ring.labelColor,
  unknown: 'use-default',
  scalesWithDiameter: false,
  inherits: 'nothing',
  lines: 1,
  wrap: 'none',
  placement: 'center',
  box: 'does-not-size-ring',
  overflow: 'not-clipped-by-ring',
  textScale: 'applies',
  before917: 'default-label-style',
} as const

/**
 * What is NAMED for the ring label: only fields of a shape the reader understands
 * (`typographyRefByForm`, `colorRefByForm`); `undefined` means there is no field or it cannot be
 * read, and the fallback applies. Whether the theme knows the token is decided by whoever has the
 * theme.
 */
export function namedRingLabelStyle(props: Readonly<Record<string, unknown>>): { readonly typography: unknown; readonly color: unknown } {
  const typography = Object.hasOwn(props, RING_LABEL_STYLE.props.typography) ? props[RING_LABEL_STYLE.props.typography] : undefined
  const color = Object.hasOwn(props, RING_LABEL_STYLE.props.color) ? props[RING_LABEL_STYLE.props.color] : undefined
  return { typography: typographyRefByForm(typography) ? typography : undefined, color: colorRefByForm(color) ? color : undefined }
}

export const DEFAULT_PROGRESS_THICKNESS = PROGRESS_RULES.defaultThickness
export const DEFAULT_PROGRESS_TRACK_COLOR = PROGRESS_RULES.defaultTrackColor
export const DEFAULT_PROGRESS_COLOR = 'primary'
export const RING_SIZE_UNIT = PROGRESS_RULES.ring.sizeUnit
export const RING_SIZE_SCALE: Readonly<Record<string, number>> = PROGRESS_RULES.ring.sizes
export const DEFAULT_RING_SIZE = PROGRESS_RULES.ring.defaultSize
/** An integer thickness as a number: the bounds of the schema's `SpacingRef`. */
const MAX_THICKNESS_PX = 128
/** Angles of a custom gradient that the schema knows. The angle is not read, but the shape is. */
const GRADIENT_ANGLES: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315]
/** How many stops a custom gradient has (`MIN_GRADIENT_STOPS`, `MAX_GRADIENT_STOPS`). */
const MIN_GRADIENT_STOPS = 2
const MAX_GRADIENT_STOPS = 8

/* ─────────────────────────────── fraction ─────────────────────────────── */

/**
 * The fill fraction of the scale, 0..1. A max that is not a positive number means there is no
 * scale: there is nothing to divide by, and a "full bar" for a task with target 0 would be a lie
 * about the data. A non-number is 0 too.
 */
export function progressRatio(value: unknown, max: unknown): number {
  if (typeof value !== 'number' || typeof max !== 'number') return 0
  if (!Number.isFinite(value) || !Number.isFinite(max)) return 0
  if (max <= 0) return 0
  return Math.min(Math.max(value / max, 0), 1)
}

/** Fill arc of the ring in degrees: from the top clockwise, in any writing direction. */
export function ringArc(ratio: number): { readonly startDeg: number; readonly sweepDeg: number } {
  return { startDeg: 0, sweepDeg: 360 * Math.min(Math.max(ratio, 0), 1) }
}

/* ───────────────────────────── paint ───────────────────────────── */

/** A gradient stop on the SCALE: `position` is the stop's share within the gradient itself (0..1), as in the document. */
export interface ProgressStop {
  readonly color: string
  readonly position: number
}

export type ProgressFill =
  | { readonly kind: 'color'; readonly color: string }
  | { readonly kind: 'gradient'; readonly stops: readonly ProgressStop[] }

export interface ProgressPaint {
  /** Thickness of the bar / arc in logical pixels BEFORE clamping by the diameter. */
  readonly thickness: number
  /** Track color (a theme variable, hex or rgba). */
  readonly track: string
  readonly fill: ProgressFill
}

/** Thickness: a spacing token or an integer 0..128; anything else is `undefined`. */
function thicknessOf(ref: unknown, theme: Theme): number | undefined {
  if (typeof ref === 'number') return Number.isInteger(ref) && ref >= 0 && ref <= MAX_THICKNESS_PX ? ref : undefined
  const token = safeIdent(ref)
  if (token === undefined || !declares(theme, 'spacing', token)) return undefined
  // The scale's zero ("none") exists in every theme, even if it did not write it down.
  return Object.hasOwn(theme.spacing, token) ? theme.spacing[token] : 0
}

/** Stops do not go backwards (`gradientStopOrder: 'non-descending'`); equal positions are ordered. */
function ordered(stops: readonly ProgressStop[]): boolean {
  return stops.every((stop, index) => index === 0 || stop.position >= (stops[index - 1]?.position ?? 0))
}

/**
 * The fill gradient if it resolved; `undefined` if not (the token is not in the theme, stops go
 * backwards, a stop names an unknown color, wrong shape). Then there is NO gradient at all, not
 * "a gradient minus one stop": the fill is the solid `color`.
 */
function gradientStopsOf(ref: unknown, theme: Theme): readonly ProgressStop[] | undefined {
  if (typeof ref === 'string') {
    const token = safeIdent(ref)
    if (token === undefined || !Object.hasOwn(theme.gradient, token)) return undefined
    const stops: ProgressStop[] = []
    for (const stop of theme.gradient[token]?.stops ?? []) {
      const color = safeColor(stop.color)
      if (color === undefined || !Number.isFinite(stop.position)) return undefined
      stops.push({ color, position: stop.position })
    }
    return stops.length > 0 && ordered(stops) ? stops : undefined
  }

  if (!isRecord(ref) || typeof ref.angle !== 'number' || !GRADIENT_ANGLES.includes(ref.angle)) return undefined
  const raw: unknown = ref.stops
  if (!Array.isArray(raw) || raw.length < MIN_GRADIENT_STOPS || raw.length > MAX_GRADIENT_STOPS) return undefined

  const stops: ProgressStop[] = []
  for (const stop of raw as readonly unknown[]) {
    if (!isRecord(stop) || typeof stop.position !== 'number' || !Number.isFinite(stop.position) || stop.position < 0 || stop.position > 1) return undefined
    const color = colorCss(stop.color, theme)
    if (color === undefined || !isComposedColor(color)) return undefined
    stops.push({ color, position: stop.position })
  }
  return ordered(stops) ? stops : undefined
}

/**
 * Paint of the scale: thickness, track color, fill. Each field is read separately: the wrong
 * shape of one does not cancel the rest (`unknownToken` in `color` gives the field default; in a
 * new field there is no field and the default applies).
 */
export function resolveProgressPaint(props: Readonly<Record<string, unknown>>, theme: Theme): ProgressPaint {
  const thickness = thicknessOf(props.thickness, theme) ?? thicknessOf(DEFAULT_PROGRESS_THICKNESS, theme) ?? 0
  const track = colorCss(props.trackColor, theme) ?? productVar('color', DEFAULT_PROGRESS_TRACK_COLOR)

  const stops = gradientStopsOf(props.gradient, theme)
  if (stops !== undefined) return { thickness, track, fill: { kind: 'gradient', stops } }
  return { thickness, track, fill: { kind: 'color', color: colorCss(props.color, theme) ?? productVar('color', DEFAULT_PROGRESS_COLOR) } }
}

/**
 * Gradient stops laid out along the FILLED part: `at` is a share of the whole scale (for the
 * ring, of the full turn from the top clockwise).
 */
export function stopsOnScale(stops: readonly ProgressStop[], ratio: number): readonly { readonly color: string; readonly at: number }[] {
  return stops.map((stop) => ({ color: stop.color, at: stop.position * ratio }))
}

/** `linear-gradient` along the filled part of a bar: from the logical start of the fill to its end. */
export function barGradientCss(stops: readonly ProgressStop[], direction: 'ltr' | 'rtl'): string {
  const list = stops.map((stop) => `${stop.color} ${cssNumber(stop.position * 100)}%`).join(', ')
  return `linear-gradient(${direction === 'rtl' ? 'to left' : 'to right'}, ${list})`
}

/**
 * `conic-gradient` along the arc: stops at `at x 100%` of the circle, the first color extends
 * from the start, the last to the end of the fill, then transparent.
 */
export function ringGradientCss(stops: readonly ProgressStop[], ratio: number): string {
  const on = stopsOnScale(stops, ratio)
  const first = on[0]
  const last = on[on.length - 1]
  if (first === undefined || last === undefined) return 'none'
  const end = `${cssNumber(ratio * 100)}%`
  const list = [
    `${first.color} 0%`,
    ...on.map((stop) => `${stop.color} ${cssNumber(stop.at * 100)}%`),
    `${last.color} ${end}`,
    `transparent ${end}`,
  ]
  return `conic-gradient(from 0deg, ${list.join(', ')})`
}

/* ───────────────────────────── geometry ───────────────────────────── */

/** The size word to draw with: unknown (a newer minor) or missing gives `md`. */
export function ringSizeScaleOf(size: unknown): number {
  return (typeof size === 'string' && Object.hasOwn(RING_SIZE_SCALE, size) ? RING_SIZE_SCALE[size] : undefined) ?? RING_SIZE_SCALE[DEFAULT_RING_SIZE] ?? 3
}

/**
 * Box of a ring node in dp: what the style named and what it consumes inside. Of the six size
 * fields only those the reader APPLIES count: under a row weight the three width fields are not
 * passed, and for a layer that fills the stack, none.
 */
export interface RingBoxInput {
  readonly size: unknown
  /** Value of the `xl` token in the theme being drawn. */
  readonly unit: number
  readonly width?: number | undefined
  readonly minWidth?: number | undefined
  readonly maxWidth?: number | undefined
  readonly height?: number | undefined
  readonly minHeight?: number | undefined
  readonly maxHeight?: number | undefined
  readonly paddingInline?: number | undefined
  readonly paddingBlock?: number | undefined
  readonly border?: number | undefined
  /** Thickness of the arc as the theme resolved it (before clamping). */
  readonly thickness: number
}

export interface RingGeometry {
  readonly diameter: number
  /** Thickness of the arc to draw: at most half the diameter. */
  readonly thickness: number
  readonly boxInline: number
  readonly boxBlock: number
}

/** A size within bounds: ceiling, then floor; with an inverted pair the minimum wins (`sizeOutsideRange`). */
function constrain(size: number, min: number | undefined, max: number | undefined): number {
  const [low, high] = min !== undefined && max !== undefined && min > max ? [min, min] : [min, max]
  const capped = high === undefined ? size : Math.min(size, high)
  return low === undefined ? capped : Math.max(capped, low)
}

function namedSide(size: number | undefined, min: number | undefined, max: number | undefined, natural: number): number | undefined {
  if (size === undefined && min === undefined && max === undefined) return undefined
  return constrain(size ?? natural, min, max)
}

/**
 * RING GEOMETRY. The diameter is the smaller of the named sides of the CONTENT box; with none
 * named, the size word. An unnamed side of the box hugs the ring.
 */
export function ringGeometry(input: RingBoxInput): RingGeometry {
  const paddingInline = input.paddingInline ?? 0
  const paddingBlock = input.paddingBlock ?? 0
  const border = input.border ?? 0
  const bySize = ringSizeScaleOf(input.size) * input.unit

  const boxInline = namedSide(input.width, input.minWidth, input.maxWidth, bySize + paddingInline + 2 * border)
  const boxBlock = namedSide(input.height, input.minHeight, input.maxHeight, bySize + paddingBlock + 2 * border)
  const content = [
    boxInline === undefined ? undefined : Math.max(0, boxInline - paddingInline - 2 * border),
    boxBlock === undefined ? undefined : Math.max(0, boxBlock - paddingBlock - 2 * border),
  ].filter((side): side is number => side !== undefined)
  const diameter = content.length === 0 ? bySize : Math.min(...content)

  return {
    diameter,
    thickness: Math.min(Math.max(0, input.thickness), diameter / 2),
    boxInline: boxInline ?? diameter + paddingInline + 2 * border,
    boxBlock: boxBlock ?? diameter + paddingBlock + 2 * border,
  }
}

/** Radius of the bar fill's end: the `pill` token, clamped to half the shorter side (as CSS reads `border-radius`). */
export function barFillRadius(fillInline: number, thickness: number, pill: number): number {
  return Math.max(0, Math.min(pill, fillInline / 2, thickness / 2))
}

export interface BarGeometry {
  readonly trackBlock: number
  readonly fillInline: number
  readonly trackRadius: number
  readonly fillRadius: number
}

/** Bar geometry: the track over the whole given length, the fill a fraction from the logical start. */
export function barGeometry(trackInline: number, thickness: number, ratio: number, pill: number): BarGeometry {
  const fillInline = trackInline * Math.min(Math.max(ratio, 0), 1)
  return { trackBlock: thickness, fillInline, trackRadius: barFillRadius(trackInline, thickness, pill), fillRadius: barFillRadius(fillInline, thickness, pill) }
}

/* ───────────────────── steps (9.11.0, `ProgressBar.segments`) ───────────────────── */

/** Smallest and largest number of steps (`segments`): the schema bounds. */
export const PROGRESS_SEGMENTS_MIN = 2
export const PROGRESS_SEGMENTS_MAX = 12
/** A step narrower than this is not a step: the bar is solid. */
export const PROGRESS_SEGMENT_MIN_INLINE = 1
/** How many decimals the product `ratio x segments` keeps before `floor` (`0.3 / 0.4 x 4` in double precision is `2.9999999999999996`). */
export const PROGRESS_SEGMENT_PRECISION = 6
/** Gap between steps is a spacing token (`x-style.layout.progressSegments.gap`). */
export const PROGRESS_SEGMENT_GAP = 'xs'

/** Mirror of `x-style.layout.progressSegments` (without the service keys `widget`, `cases`). */
export const PROGRESS_SEGMENT_RULES = {
  prop: 'segments',
  currentProp: 'currentColor',
  min: PROGRESS_SEGMENTS_MIN,
  max: PROGRESS_SEGMENTS_MAX,
  gap: PROGRESS_SEGMENT_GAP,
  width: '(track - (segments - 1) * gap) / segments',
  rounding: 'none',
  start: 'index * (width + gap)',
  filled: 'floor(round(ratio * segments, precision))',
  precision: PROGRESS_SEGMENT_PRECISION,
  partial: 'never',
  current: 'first-unfilled',
  currentWhenAllFilled: 'none',
  currentWithoutColor: 'as-unfilled',
  unfilled: 'track-color',
  trackUnderGaps: false,
  radius: 'pill',
  radiusClamp: 'half-shorter-side',
  gradient: 'along-filled-steps-gaps-cut-out',
  mirroredInRtl: true,
  semantics: 'one-scale',
  unreadable: 'continuous-bar',
  minSegment: PROGRESS_SEGMENT_MIN_INLINE,
  belowMinSegment: 'continuous-bar',
  kindDecidedBy: 'width-the-place-gives',
  minInlineSize: 'gaps',
  minInlineSizeFormula: '(segments - 1) * gap',
  minInlineSizeInBothKinds: true,
} as const

/**
 * SMALLEST OWN WIDTH of a bar with `segments`, the same in both views: the gaps between steps.
 * The solid replacement bar keeps it too.
 */
export function segmentsMinInline(segments: number, gap: number): number {
  return Math.max(0, (segments - 1) * gap)
}

export type SegmentsKind = 'steps' | 'continuous'

/**
 * BAR VIEW BY THE WIDTH OF ITS PLACE, the width the parent gives it. A step narrower than
 * `minSegment` makes the bar solid, but the place's width does not change with that, so the
 * decision is stable (a measurement must not change what it measures).
 */
export function segmentsKindFor(placeInline: number, segments: number, gap: number): SegmentsKind {
  const inline = (placeInline - (segments - 1) * gap) / segments
  return Number.isFinite(inline) && inline >= PROGRESS_SEGMENT_MIN_INLINE ? 'steps' : 'continuous'
}

/** Number of steps: an integer 2..12; anything else (1, 13, 2.5, `"6"`) is `undefined`, a solid bar with the same fraction. */
export function readSegments(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= PROGRESS_SEGMENTS_MIN && value <= PROGRESS_SEGMENTS_MAX ? value : undefined
}

/** How many steps are filled: `floor(round(ratio x N, 6))`; a step is wholly filled or not at all. */
export function filledSegments(ratio: number, segments: number): number {
  const scale = 10 ** PROGRESS_SEGMENT_PRECISION
  const units = Math.round(Math.min(Math.max(ratio, 0), 1) * segments * scale) / scale
  return Math.min(segments, Math.max(0, Math.floor(units)))
}

export type SegmentState = 'filled' | 'current' | 'unfilled'

export interface SegmentBox {
  readonly start: number
  readonly inline: number
  readonly state: SegmentState
}

export interface SegmentGeometry {
  readonly segments: readonly SegmentBox[]
  readonly filled: number
  readonly current: number | undefined
  readonly radius: number
  /** Length of "all filled steps together with the gaps between them", the gradient line. */
  readonly filledInline: number
}

/**
 * Step geometry: width `(track - (N - 1) x gap) / N` WITHOUT rounding, step `i` starts at
 * `i x (width + gap)` from the logical start; the radius is `pill`, clamped to half the shorter
 * side. `undefined` means a step narrower than 1: a solid bar is drawn.
 */
export function segmentGeometry(trackInline: number, thickness: number, ratio: number, segments: number, gap: number, pill: number): SegmentGeometry | undefined {
  const inline = (trackInline - (segments - 1) * gap) / segments
  if (!Number.isFinite(inline) || inline < PROGRESS_SEGMENT_MIN_INLINE) return undefined
  const filled = filledSegments(ratio, segments)
  const current = filled < segments ? filled : undefined
  return {
    segments: Array.from({ length: segments }, (_, index) => ({
      start: index * (inline + gap),
      inline,
      state: index < filled ? 'filled' : index === current ? 'current' : 'unfilled',
    })),
    filled,
    current,
    radius: barFillRadius(inline, thickness, pill),
    filledInline: filled === 0 ? 0 : filled * inline + (filled - 1) * gap,
  }
}

/** Paint of the current step: `currentColor` if the field exists and resolved; otherwise `undefined`, as an unfilled step. */
export function resolveCurrentColor(props: Readonly<Record<string, unknown>>, theme: Theme): string | undefined {
  return colorCss(props.currentColor, theme)
}

/** Gradient stops on the LINE of filled steps: `at` is the distance from the start of the first step. */
export function stopsAlongFilled(stops: readonly ProgressStop[], filledInline: number): readonly { readonly color: string; readonly at: number }[] {
  return stops.map((stop) => ({ color: stop.color, at: stop.position * filledInline }))
}

/* ───────────────────── ring input from the node box ───────────────────── */

function spacingPx(ref: unknown, theme: Theme): number | undefined {
  if (typeof ref === 'number') return clampLiteral(ref, 'spacing')
  const token = safeIdent(ref)
  if (token === undefined || !declares(theme, 'spacing', token)) return undefined
  return Object.hasOwn(theme.spacing, token) ? theme.spacing[token] : 0
}

/** Padding along an axis: one value applies to both sides, per-side values are named (the rest are zero). */
function paddingAlong(padding: unknown, sides: readonly [string, string], theme: Theme): number {
  if (padding === undefined || padding === null) return 0
  if (!isRecord(padding)) return 2 * (spacingPx(padding, theme) ?? 0)
  return (spacingPx(padding[sides[0]], theme) ?? 0) + (spacingPx(padding[sides[1]], theme) ?? 0)
}

/** Thickness of the node border: a border without a resolved color does not exist, and takes no room. */
function borderWidthOf(border: unknown, theme: Theme): number {
  if (!isRecord(border) || border.width === undefined || colorCss(border.color, theme) === undefined) return 0
  return clampLiteral(border.width, 'borderWidth')
}

/**
 * Input of `ringGeometry` for a node: sizes come from the node's OWN style, but only those the
 * reader applies (`dropped` lists fields taken away by the parent: a row weight or a stack
 * layer); padding and border come from the node's style.
 *
 * The size is read from the style, not from the ready CSS box: the box has service
 * `min-width: 0` and other layout values that are not the ring's size.
 */
export function ringInputOf(
  props: Readonly<Record<string, unknown>>,
  style: NodeStyle | undefined,
  dropped: readonly string[],
  scope: DataScope,
  thickness: number,
  theme: Theme,
): RingBoxInput {
  const own: NodeStyle = isRecord(style) ? style : {}
  const size = (key: 'width' | 'minWidth' | 'maxWidth' | 'height' | 'minHeight' | 'maxHeight'): number | undefined => (dropped.includes(key) ? undefined : dimension(own[key], scope))
  return {
    size: props.size,
    unit: Object.hasOwn(theme.spacing, RING_SIZE_UNIT) ? (theme.spacing[RING_SIZE_UNIT] ?? 0) : 0,
    width: size('width'),
    minWidth: size('minWidth'),
    maxWidth: size('maxWidth'),
    height: size('height'),
    minHeight: size('minHeight'),
    maxHeight: size('maxHeight'),
    paddingInline: paddingAlong(own.padding, ['start', 'end'], theme),
    paddingBlock: paddingAlong(own.padding, ['top', 'bottom'], theme),
    border: borderWidthOf(own.border, theme),
    thickness,
  }
}
