/**
 * The steps of a bar (schema 9.11.0) with the fractions of a transition (9.25.0, `x-segmentsTransition`).
 *
 * At rest a step is full or empty. While the value runs a transition the filled steps are a number
 * with a fraction: the steps before it are full, the one it reaches is cut at that share, the rest
 * are empty. A step with a share is its track (or `currentColor`, if it is the current one) with the
 * fill over it, cut at `fill x width` from its logical start; the radius of the step is kept.
 */
import type { CSSProperties, ReactNode } from 'react'

import { barGradientCss, progressRatio, filledSegments } from '../progress'
import type { ProgressGlow } from '../progress-glow'
import type { ProgressPaint } from '../progress'
import { glowingStepOf } from '../progress-glow'
import type { GlowingStep } from '../progress-glow'
import { isRecord } from '../sanitize'
import { segmentCurrentOf, segmentFillsOf, segmentUnitsAt, transitionShareOf } from '../segment-fill'
import type { TextDirection } from '../direction'
import { VALUE_APPEAR } from '../value-appear'
import { GlowLayer } from './glow-layer'
import type { TransitionEnds } from './use-value-transition'

/** The key of the value of a scale in the transitions in progress: its data path, or the literal key. */
function valueKeyOf(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind === 'literal') return VALUE_APPEAR.literalKey
  return value.kind === 'binding' && typeof value.path === 'string' ? value.path : undefined
}

/**
 * How many steps are filled now: a number with a fraction while the value of the bar runs a
 * transition, otherwise the whole steps of the shown ratio (the rule of 9.11).
 */
export function stepUnitsOf(input: { readonly value: unknown; readonly max: number; readonly shownRatio: number; readonly steps: number; readonly ends: ReadonlyMap<string, TransitionEnds> }): number {
  const key = valueKeyOf(input.value)
  const run = key === undefined ? undefined : input.ends.get(key)
  if (run === undefined) return filledSegments(input.shownRatio, input.steps)
  return segmentUnitsAt({ fromRatio: progressRatio(run.from, input.max), toRatio: progressRatio(run.to, input.max), eased: transitionShareOf(run.from, run.to, run.shown), segments: input.steps })
}

export interface StepsLook {
  readonly paint: ProgressPaint
  /** The colour of the current step, if `currentColor` resolved. */
  readonly currentColor: string | undefined
  readonly pill: string
  readonly direction: TextDirection
  /** The gap between steps as a theme variable, and as a length for CSS math. */
  readonly gapMath: string
  /** How many steps are filled, with the fraction. */
  readonly units: number
}

const percent = (share: number): string => `${String(Math.round(share * 1e6) / 1e4)}%`

/** What a step with some fill shows over its base: a solid colour (a whole step) or a layer. */
function stepFill(index: number, fill: number, look: StepsLook): { readonly solid?: string; readonly layer?: ReactNode } {
  const { paint, direction, gapMath, units } = look
  const strip =
    paint.fill.kind === 'gradient' ? (
      <span
        style={{
          position: 'absolute',
          insetBlock: 0,
          insetInlineStart: `calc(-1 * ${String(index)} * (100% + ${gapMath}))`,
          // The line of the gradient runs along the drawn fill: position 1 is the end of the fill of the last step with any fill.
          inlineSize: `calc(${String(units)} * 100% + ${String(Math.ceil(units) - 1)} * ${gapMath})`,
          backgroundImage: barGradientCss(paint.fill.stops, direction),
        }}
      />
    ) : null
  if (fill >= 1) return paint.fill.kind === 'color' ? { solid: paint.fill.color } : { layer: strip }
  const rest = percent(1 - fill)
  const cut: CSSProperties = {
    position: 'absolute',
    inset: 0,
    clipPath: direction === 'rtl' ? `inset(0 0 0 ${rest})` : `inset(0 ${rest} 0 0)`,
    ...(paint.fill.kind === 'color' ? { backgroundColor: paint.fill.color } : {}),
  }
  return {
    layer: (
      <span data-hl-step-fill={String(Math.round(fill * 1e4) / 1e4)} style={cut}>
        {strip}
      </span>
    ),
  }
}

const CELL: CSSProperties = { flex: '1 1 0px', minInlineSize: 0, position: 'relative', overflow: 'hidden' }

/** The steps of the bar: each with its state, its base and the fill over it. */
export function stepCells(look: StepsLook, steps: number): readonly ReactNode[] {
  const fills = segmentFillsOf(look.units, steps)
  const current = segmentCurrentOf(fills)
  return fills.map((fill, index) => {
    const state = fill >= 1 ? 'filled' : index === current ? 'current' : 'unfilled'
    const face = fill > 0 ? stepFill(index, fill, look) : {}
    const base = fill >= 1 ? face.solid : state === 'current' && look.currentColor !== undefined ? look.currentColor : look.paint.track
    return (
      <div key={index} data-hl-step={state} style={{ ...CELL, borderRadius: look.pill, backgroundColor: base }}>
        {face.layer}
      </div>
    )
  })
}

/** The copy of the glow: only the step that glows is painted, the others are empty cells that keep the geometry. */
export function glowCells(look: StepsLook, steps: number): { readonly cells: readonly ReactNode[]; readonly lit: GlowingStep } {
  const fills = segmentFillsOf(look.units, steps)
  const lit = glowingStepOf(fills, look.currentColor !== undefined)
  const cells = fills.map((_fill, index) => {
    const shape: CSSProperties = { ...CELL, borderRadius: look.pill }
    if (lit.kind === 'current' && lit.index === index) return <div key={index} style={{ ...shape, backgroundColor: look.currentColor }} />
    if (lit.kind === 'front' && lit.index === index) {
      const face = stepFill(index, lit.fill, look)
      return (
        <div key={index} style={{ ...shape, ...(face.solid === undefined ? {} : { backgroundColor: face.solid }) }}>
          {face.layer}
        </div>
      )
    }
    return <div key={index} style={shape} />
  })
  return { cells, lit }
}

/** The steps and, with a glow word, the copy that lights one of them (or nothing when no step is lit). */
export function stepsParts(look: StepsLook, steps: number, glow: ProgressGlow | undefined, row: CSSProperties): { readonly cells: readonly ReactNode[]; readonly shine: ReactNode } {
  const cells = stepCells(look, steps)
  if (glow === undefined) return { cells, shine: null }
  const copy = glowCells(look, steps)
  return { cells, shine: copy.lit.kind === 'none' ? null : <GlowLayer glow={glow} row={row}>{copy.cells}</GlowLayer> }
}
