/** The progress scale: the bar (`ProgressBar`, with steps) and the ring (`CircularProgress`). */
import { useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { readBindableNumber } from '../data'
import type { DataScope } from '../data'
import { PROGRESS_SEGMENT_GAP, RING_LABEL_STYLE, barGradientCss, namedRingLabelStyle, progressRatio, readSegments, resolveCurrentColor, resolveProgressPaint, ringGeometry, ringGradientCss, ringInputOf, segmentsKindFor } from '../progress'
import { readProgressGlow } from '../progress-glow'
import { barCapFillCss, barCapRadius, readProgressCap, ringCapPaint, ringCapPosition } from '../progress-cap'
import { colorCss, typographyCss } from '../resolve'
import { DirectionContext } from '../runtime'
import { cssPercent, cssPx } from '../sanitize'
import { typographyToCss } from '../style'
import { productVar } from '../theme'
import { useData, useTheme } from './contexts'
import { GlowLayer } from './glow-layer'
import { stepsParts, stepUnitsOf } from './progress-steps'
import type { StepsLook } from './progress-steps'
import { useValueTransition } from './use-value-transition'
import { heldLines } from './value-hold'
import type { Shown } from './use-value-transition'
import { COLUMN } from './flex-words'
import { mathToken } from './prop-tokens'
import type { WidgetProps } from './widget-props'
import { screenPart } from './screen-part'

function progressOf(props: Readonly<Record<string, unknown>>, scope: DataScope, literal?: number): { value: number; max: number; ratio: number } {
  // A literal value that is being shown growing (`animateIn`) is passed by the hook, not read from the data.
  const value = literal ?? readBindableNumber(props.value, scope) ?? 0
  const max = readBindableNumber(props.max, scope) ?? 100
  return { value, max, ratio: progressRatio(value, max) }
}

/**
 * What a scale reads: the REAL numbers (for the screen reader: it hears the final value, not the
 * ones between), the SHOWN share (the fill grows smoothly while `animateChanges` leads it) and the
 * label (stepped numbers, the shown share).
 */
function shownProgress(
  props: Readonly<Record<string, unknown>>,
  scope: DataScope,
  data: Shown,
  labelFormat: unknown,
): {
  progress: { value: number; max: number; ratio: number }
  shown: { ratio: number; ends: Shown['ends'] }
  label: string | undefined
  /** The label of the final value while the value moves (it holds the place, `x-valueLayout`); `undefined` at rest. */
  finalLabel: string | undefined
} {
  const progress = progressOf(props, scope)
  const smooth = progressOf(props, data.smooth, data.literal?.smooth)
  const stepped = progressOf(props, data.stepped, data.literal?.stepped)
  const label = progressLabel(labelFormat, { value: stepped.value, max: stepped.max, ratio: smooth.ratio })
  return { progress, shown: { ratio: smooth.ratio, ends: data.ends }, label, finalLabel: data.moving ? progressLabel(labelFormat, progress) : undefined }
}

/** The label: `percent` is the shown share, `valueOfMax` the stepped numbers (whole when both ends are whole). */
function progressLabel(format: unknown, progress: { value: number; max: number; ratio: number }): string | undefined {
  if (format === 'percent') return `${String(Math.round(progress.ratio * 100))}%`
  if (format === 'valueOfMax') return `${String(progress.value)} / ${String(progress.max)}`
  return undefined
}

/** The bar and ring label is data of `x-style.layout.progress`: the gap before the bar label and the font of both. */
const PROGRESS_LABEL = { typography: 'caption', gap: 'xs' } as const

/**
 * The progress bar (schema 9.7.0, `x-style.layout.progress`).
 *
 * The track lies UNDER THE WHOLE scale and the fill on top; both have the `pill` radius, which CSS
 * itself clamps to half of the smaller side, and the track clips the fill. The thickness is
 * `thickness` (`sm` without it), the track colour is `trackColor` (`secondary` without it), the fill
 * is `gradient` if it resolved and otherwise `color` (the field default is `primary`). The fill grows
 * from the LOGICAL row start, so in right-to-left writing it (and the gradient) starts on the right;
 * the gradient lies along the fill itself, not along the whole track.
 *
 * Since schema 9.0.0 a state (`styleWhen`) does NOT recolour the fill: states change only `style`,
 * while the colour of a part lives in `props`. A label IS present by default, unlike the ring: `caption`
 * in the `muted` colour, an `xs` gap away, pushed to the end of the row.
 */
export const ProgressBarView = screenPart(function ProgressBarView({ props, css, mark }: WidgetProps): ReactNode {
  const theme = useTheme()
  const direction = useContext(DirectionContext)
  const scope = useData()
  const { progress, shown, label, finalLabel } = shownProgress(props, scope, useValueTransition(props), props.labelFormat ?? 'valueOfMax')
  const paint = resolveProgressPaint(props, theme)
  // Round ends (9.21.0): half the thickness for the track, the fill and every step; the theme `pill` is not read.
  const round = readProgressCap(props.cap) === 'round'
  const pill = round ? cssPx(barCapRadius(paint.thickness)) : productVar('radius', 'pill')

  /*
   * STEPS (schema 9.11.0, `x-style.layout.progressSegments`): the scale cut into equal steps.
   * `segments` is an integer 2…12; otherwise (and when a step would be narrower than 1) the bar is
   * solid with the same share. The server and jsdom do not know the track width, so "narrower than
   * 1" is checked by measuring in the browser; without a measurement the steps are drawn.
   */
  const segments = readSegments(props.segments)
  const track = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState<number | undefined>(undefined)
  const stepGap = theme.spacing[PROGRESS_SEGMENT_GAP] ?? 0
  useEffect(() => {
    const element = track.current
    if (segments === undefined || element === null) return undefined
    /*
     * THE WIDTH OF THE PLACE DECIDES THE KIND (`kindDecidedBy`). The minimum own width of the track
     * is the same in both kinds: the gaps between steps (the solid replacement keeps it too, see
     * `minInlineSize` below), so the measurement does not change what it measures. A zero width means
     * "unknown" (a hidden ancestor): the previous decision stays and is not reset back to steps.
     */
    const update = (): void => {
      const width = element.getBoundingClientRect().width
      if (width > 0) setTrackWidth(width)
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(element)
    return () => {
      observer?.disconnect()
    }
  }, [segments])
  const steps = segments !== undefined && (trackWidth === undefined || segmentsKindFor(trackWidth, segments, stepGap) === 'steps') ? segments : undefined

  const scale = {
    role: 'progressbar',
    'aria-valuemin': 0,
    'aria-valuemax': progress.max,
    'aria-valuenow': progress.value,
  } as const

  // The glow (9.25.0): a blurred copy of the fill under the scale. The scale is then positioned, so it paints over the copy.
  const glow = readProgressGlow(props.glow)
  const lift: CSSProperties = glow === undefined ? {} : { position: 'relative' }
  let shine: ReactNode = null

  let bar: ReactNode
  if (steps === undefined) {
    const fillCss: CSSProperties = {
      inlineSize: round ? barCapFillCss(shown.ratio, paint.thickness) : cssPercent(shown.ratio),
      blockSize: '100%',
      borderRadius: pill,
      ...(paint.fill.kind === 'gradient' ? { backgroundImage: barGradientCss(paint.fill.stops, direction) } : { backgroundColor: paint.fill.color }),
    }
    if (glow !== undefined && shown.ratio > 0) {
      shine = (
        <GlowLayer glow={glow}>
          <div style={fillCss} />
        </GlowLayer>
      )
    }
    bar = (
      <div
        ref={track}
        {...scale}
        data-hl-cap={round ? 'round' : undefined}
        style={{
          inlineSize: '100%',
          // The solid bar that replaces the steps keeps the same minimum width as the steps: `(N - 1) x gap`.
          ...(segments === undefined ? {} : { minInlineSize: `calc(${String(segments - 1)} * ${mathToken(PROGRESS_SEGMENT_GAP, theme)})` }),
          blockSize: cssPx(paint.thickness),
          borderRadius: pill,
          overflow: 'hidden',
          backgroundColor: paint.track,
          ...lift,
        }}
      >
        <div style={fillCss} />
      </div>
    )
  } else {
    /*
     * ONE scale for the screen reader (`segmentsSemantics`): `role="progressbar"` on the whole
     * track, with the steps as drawing. There is NO track UNDER THE GAPS: each step has its own
     * colour (a filled one is `gradient` or `color`, an unfilled one the track colour, the current
     * one `currentColor` if it resolved), and the gap shows the background. The `pill` radius is
     * clamped to half of the smaller side by CSS itself.
     *
     * The gradient runs as a LINE through the filled steps: in each filled step it is a strip as
     * long as all the filled steps together with the gaps, shifted by the step number, so the colour
     * in a step is what it would be in a solid fill. While the value runs a transition (9.25.0) the
     * number of filled steps has a fraction and the step it reaches is cut at that share.
     */
    const gap = productVar('spacing', PROGRESS_SEGMENT_GAP)
    const look: StepsLook = {
      paint,
      currentColor: resolveCurrentColor(props, theme),
      pill,
      direction,
      gapMath: mathToken(PROGRESS_SEGMENT_GAP, theme),
      units: stepUnitsOf({ value: props.value, max: progress.max, shownRatio: shown.ratio, steps, ends: shown.ends }),
    }
    const parts = stepsParts(look, steps, glow, { gap, blockSize: cssPx(paint.thickness) })
    shine = parts.shine
    bar = (
      <div ref={track} {...scale} data-hl-cap={round ? 'round' : undefined} style={{ display: 'flex', inlineSize: '100%', blockSize: cssPx(paint.thickness), gap, ...lift }}>
        {parts.cells}
      </div>
    )
  }
  if (shine !== null) {
    bar = (
      <div style={{ position: 'relative', inlineSize: '100%' }}>
        {shine}
        {bar}
      </div>
    )
  }

  return (
    <div {...mark} style={{ ...COLUMN, gap: productVar('spacing', PROGRESS_LABEL.gap), ...css }}>
      {bar}
      {label === undefined ? null : (
        <span
          style={{
            display: 'block',
            ...typographyToCss(typographyCss(PROGRESS_LABEL.typography, theme)),
            color: productVar('color', 'muted'),
            textAlign: 'end',
          }}
        >
          {/* While the value moves the label takes the place of the final one (`x-valueLayout.scale.barLabel`). */}
          {finalLabel === undefined ? label : heldLines(finalLabel, label)}
        </span>
      )}
    </div>
  )
})

/**
 * The ring is the same scale bent into an arc (schema 9.7.0).
 *
 *  - The DIAMETER is given by the node box: `style.width` / `height` and their limits, and without
 *    them the `size` word (2 / 3 / 4 steps of `xl`). It is the smaller of the named sides of the
 *    CONTENT box; a size given by the parent (a row weight, a stack layer) does not name a diameter,
 *    so the box is read here as already built;
 *  - the ring stands in the CENTRE of the box, and the unnamed side hugs it;
 *  - the arc lies INSIDE the circle: the outer diameter equals the diameter. The thickness is at
 *    most half the diameter;
 *  - the track lies under the whole circle and the fill on top; both are one conic gradient under
 *    the ring mask, starting at the top and running clockwise; it is NOT mirrored in right-to-left
 *    writing, and the ends are flat;
 *  - the gradient lies along the filled arc (`conic-gradient`).
 *
 * The centre label is OFF by default (`labelFormat: 'none'`): the centre of the ring belongs to the
 * DOCUMENT through `Stack`. The ring size does not affect the label.
 */
export const CircularProgressView = screenPart(function CircularProgressView({ props, css, own, dropped, mark }: WidgetProps): ReactNode {
  const theme = useTheme()
  const scope = useData()
  const { progress, shown, label } = shownProgress(props, scope, useValueTransition(props), props.labelFormat ?? 'none')
  const paint = resolveProgressPaint(props, theme)
  /*
   * THE LABEL STYLE (schema 9.17.0): a named one counts only for fields of a shape the reader
   * understands and only with a token the theme knows; otherwise the fallback applies ENTIRELY (a
   * font from an unknown token does not fall back to `caption` piecemeal). The label does not grow
   * with the diameter, inherits nothing from the node and does not change the ring box.
   */
  const named = namedRingLabelStyle(props)
  const labelTypography = named.typography !== undefined && typographyCss(named.typography, theme) !== undefined ? named.typography : RING_LABEL_STYLE.defaultTypography
  const labelColor = named.color === undefined ? undefined : colorCss(named.color, theme)
  const geometry = ringGeometry(ringInputOf(props, own, dropped, scope, paint.thickness, theme))
  const { diameter, thickness } = geometry
  const hole = `calc(100% - ${cssPx(thickness)})`
  const ring = `radial-gradient(farthest-side, transparent ${hole}, black ${hole})`
  const arc: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    mask: ring,
    WebkitMask: ring,
  }
  const sweep = cssPercent(shown.ratio)
  // Round ends (9.21.0): the arc between the centres of the ends and two half-circles of the thickness (one dot for a tiny share).
  const capped = readProgressCap(props.cap) === 'round' ? ringCapPaint({ ratio: shown.ratio, diameter, thickness, fill: paint.fill }) : undefined

  /*
   * The fill of the arc: with round ends the arc between the centres of the ends and two dots, otherwise
   * one conic gradient. It is drawn twice with the glow (9.25.0): the copy under the track, blurred on
   * its WRAPPER (the mask cuts the middle out before a filter on the same element would act).
   */
  let fillArc: ReactNode = null
  if (capped !== undefined) {
    if (capped.background !== undefined || capped.ends.length > 0) {
      fillArc = (
        <div data-hl-cap="round" style={{ ...arc, ...(capped.background === undefined ? {} : { background: capped.background }) }}>
          {capped.ends.map((end) => {
            const place = ringCapPosition(end.angle, diameter, thickness)
            return (
              <span
                key={end.key}
                data-hl-cap-end={end.key}
                style={{ position: 'absolute', left: place.left, top: place.top, inlineSize: cssPx(thickness), blockSize: cssPx(thickness), transform: 'translate(-50%, -50%)', borderRadius: '50%', background: end.color }}
              />
            )
          })}
        </div>
      )
    }
  } else if (shown.ratio > 0) {
    fillArc = (
      <div
        style={{
          ...arc,
          background:
            paint.fill.kind === 'gradient'
              ? ringGradientCss(paint.fill.stops, shown.ratio)
              : `conic-gradient(from 0deg, ${paint.fill.color} ${sweep}, transparent ${sweep})`,
        }}
      />
    )
  }
  const glow = readProgressGlow(props.glow)

  return (
    <div {...mark} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', ...css }}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.max}
        aria-valuenow={progress.value}
        style={{ position: 'relative', display: 'flex', flex: 'none', inlineSize: cssPx(diameter), blockSize: cssPx(diameter) }}
      >
        {thickness <= 0 ? null : (
          <>
            {glow !== undefined && fillArc !== null ? <GlowLayer glow={glow}>{fillArc}</GlowLayer> : null}
            <div style={{ ...arc, backgroundColor: paint.track }} />
            {fillArc}
          </>
        )}
        {label === undefined ? null : (
          <span
            data-hl-ring-label=""
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              // A single line centred in the circle; one wider than the inner diameter is neither clipped nor wrapped (`overflow`, `wrap`).
              whiteSpace: 'pre',
              ...typographyToCss(typographyCss(labelTypography, theme)),
              color: labelColor ?? productVar('color', RING_LABEL_STYLE.defaultColor),
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  )
})
