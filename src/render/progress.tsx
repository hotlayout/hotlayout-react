/** The progress scale: the bar (`ProgressBar`, with steps) and the ring (`CircularProgress`). */
import { useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { readBindableNumber } from '../data'
import type { DataScope } from '../data'
import { PROGRESS_SEGMENT_GAP, RING_LABEL_STYLE, barGradientCss, filledSegments, namedRingLabelStyle, progressRatio, readSegments, resolveCurrentColor, resolveProgressPaint, ringGeometry, ringGradientCss, ringInputOf, segmentsKindFor } from '../progress'
import { colorCss, typographyCss } from '../resolve'
import { DirectionContext } from '../runtime'
import { cssPercent, cssPx } from '../sanitize'
import { typographyToCss } from '../style'
import { productVar } from '../theme'
import { useData, useTheme } from './contexts'
import { COLUMN } from './flex-words'
import { mathToken } from './prop-tokens'
import type { WidgetProps } from './widget-props'

function progressOf(props: Readonly<Record<string, unknown>>, scope: DataScope): { value: number; max: number; ratio: number } {
  const value = readBindableNumber(props.value, scope) ?? 0
  const max = readBindableNumber(props.max, scope) ?? 100
  return { value, max, ratio: progressRatio(value, max) }
}

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
export function ProgressBarView({ props, css, mark }: WidgetProps): ReactNode {
  const theme = useTheme()
  const direction = useContext(DirectionContext)
  const progress = progressOf(props, useData())
  const paint = resolveProgressPaint(props, theme)
  const label = progressLabel(props.labelFormat ?? 'valueOfMax', progress)
  const pill = productVar('radius', 'pill')

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

  let bar: ReactNode
  if (steps === undefined) {
    bar = (
      <div
        ref={track}
        {...scale}
        style={{
          inlineSize: '100%',
          // The solid bar that replaces the steps keeps the same minimum width as the steps: `(N - 1) x gap`.
          ...(segments === undefined ? {} : { minInlineSize: `calc(${String(segments - 1)} * ${mathToken(PROGRESS_SEGMENT_GAP, theme)})` }),
          blockSize: cssPx(paint.thickness),
          borderRadius: pill,
          overflow: 'hidden',
          backgroundColor: paint.track,
        }}
      >
        <div
          style={{
            inlineSize: cssPercent(progress.ratio),
            blockSize: '100%',
            borderRadius: pill,
            ...(paint.fill.kind === 'gradient' ? { backgroundImage: barGradientCss(paint.fill.stops, direction) } : { backgroundColor: paint.fill.color }),
          }}
        />
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
     * in a step is what it would be in a solid fill.
     */
    const filled = filledSegments(progress.ratio, steps)
    const currentColor = resolveCurrentColor(props, theme)
    const gap = productVar('spacing', PROGRESS_SEGMENT_GAP)
    const gapMath = mathToken(PROGRESS_SEGMENT_GAP, theme)
    bar = (
      <div ref={track} {...scale} style={{ display: 'flex', inlineSize: '100%', blockSize: cssPx(paint.thickness), gap }}>
        {Array.from({ length: steps }, (_unused, index) => {
          const state = index < filled ? 'filled' : index === filled ? 'current' : 'unfilled'
          const solid = state === 'filled' ? (paint.fill.kind === 'color' ? paint.fill.color : undefined) : state === 'current' && currentColor !== undefined ? currentColor : paint.track
          return (
            <div key={index} data-hl-step={state} style={{ flex: '1 1 0px', minInlineSize: 0, position: 'relative', overflow: 'hidden', borderRadius: pill, backgroundColor: solid }}>
              {state === 'filled' && paint.fill.kind === 'gradient' ? (
                <span
                  style={{
                    position: 'absolute',
                    insetBlock: 0,
                    insetInlineStart: `calc(-1 * ${String(index)} * (100% + ${gapMath}))`,
                    inlineSize: `calc(${String(filled)} * 100% + ${String(filled - 1)} * ${gapMath})`,
                    backgroundImage: barGradientCss(paint.fill.stops, direction),
                  }}
                />
              ) : null}
            </div>
          )
        })}
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
          {label}
        </span>
      )}
    </div>
  )
}

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
export function CircularProgressView({ props, css, own, dropped, mark }: WidgetProps): ReactNode {
  const theme = useTheme()
  const scope = useData()
  const progress = progressOf(props, scope)
  const paint = resolveProgressPaint(props, theme)
  const label = progressLabel(props.labelFormat ?? 'none', progress)
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
  const sweep = cssPercent(progress.ratio)

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
            <div style={{ ...arc, backgroundColor: paint.track }} />
            {progress.ratio <= 0 ? null : (
              <div
                style={{
                  ...arc,
                  background:
                    paint.fill.kind === 'gradient'
                      ? ringGradientCss(paint.fill.stops, progress.ratio)
                      : `conic-gradient(from 0deg, ${paint.fill.color} ${sweep}, transparent ${sweep})`,
                }}
              />
            )}
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
}
