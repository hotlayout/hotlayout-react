/**
 * BAR AND RING CASE TABLE THROUGH THE `@hotlayout/react` PACKAGE:
 * `contract/fixtures/progress/progress-cases.json` (schema 9.7.0).
 *
 * The reference and the builder preview are checked against the same table elsewhere; this file is
 * another reader. The package does not import from `src/`, so the rule is written a second time in it
 * (`progress.ts`), and this table keeps the two copies together.
 *
 * Five groups of rows, each run twice:
 *  1. the package's pure functions (`progressRatio`, `ringGeometry`, `ringArc`, `barGeometry`,
 *     `resolveProgressPaint`), sign for sign;
 *  2. a real `HotlayoutScreen`: the diameter, thickness, gradient and its direction are read from the
 *     markup. The markup comes from server render: jsdom drops `mask` from `style`, and the ring
 *     thickness lives exactly in the mask.
 *
 * NO ROWS ARE SKIPPED, `readerOnly` included.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BUILT_IN_THEME_CONTRACT } from '../src/built-in-theme'
import { HotlayoutScreen } from '../src/index'
import type { ThemeContract, UiDocument, UiNode } from '../src/index'
import { barGeometry, progressRatio, readSegments, resolveCurrentColor, resolveProgressPaint, ringArc, ringGeometry, segmentGeometry, segmentsKindFor, segmentsMinInline, stopsAlongFilled, stopsOnScale } from '../src/progress'
import { resolveTheme } from '../src/theme-resolve'
import type { Theme } from '../src/theme'
import { themeCssVariables } from '../src/theme'

afterEach(cleanup)

interface Gradient {
  readonly angle: number
  readonly stops: readonly { readonly color: string; readonly position: number }[]
}

interface Table {
  readonly theme: { readonly spacing: Record<string, number>; readonly radius: Record<string, number>; readonly color: Record<string, string>; readonly gradient: Record<string, Gradient> }
  readonly ratioCases: readonly { name: string; value: unknown; max: unknown; expect: number }[]
  readonly ringCases: readonly {
    name: string
    props: Record<string, unknown>
    style: Record<string, unknown>
    applied?: { width: boolean; height: boolean }
    expect: { diameter: number; thickness: number; boxInline?: number; boxBlock?: number; freeInline?: number; freeBlock?: number }
  }[]
  readonly arcCases: readonly { name: string; ratio: number; direction: 'ltr' | 'rtl'; expect: { startDeg: number; sweepDeg: number } }[]
  readonly barCases: readonly {
    name: string
    props: Record<string, unknown>
    trackInline: number
    ratio: number
    direction: 'ltr' | 'rtl'
    expect: { trackBlock: number; fillInline: number; trackRadius: number; fillRadius: number; fillFrom: 'left' | 'right' }
  }[]
  readonly paintCases: readonly {
    name: string
    props: Record<string, unknown>
    ratio: number
    expect: { track: Colour; fill: { kind: 'color'; hex: string; opacity: number } | { kind: 'gradient'; stops: readonly (Colour & { at: number })[] } }
  }[]
  /** 9.11.0: bar steps (`ProgressBar.segments`). */
  readonly segmentCases: readonly {
    name: string
    props: Record<string, unknown>
    trackInline: number
    value: unknown
    max: unknown
    direction: 'ltr' | 'rtl'
    readerOnly?: boolean
    expect: { inline: number; starts?: readonly number[]; filled: number; current: number | null; states: string; radius: number; filledInline: number; fillFrom: 'left' | 'right' } | null
  }[]
  /** 9.11.0 clarification: the bar style is decided by the width of the PLACE. */
  readonly segmentPlaceCases: readonly { name: string; props: Record<string, unknown>; placeInline: number; expect: { kind: 'steps' | 'continuous'; ownMinInline: number; inline?: number } }[]
  readonly segmentPaintCases: readonly { name: string; props: Record<string, unknown>; readerOnly?: boolean; expect: { current: Colour | null; unfilled: Colour } }[]
  readonly segmentGradientCases: readonly {
    name: string
    props: Record<string, unknown>
    trackInline: number
    value: number
    max: number
    expect: { lineFrom: number; lineTo: number; stops: readonly { hex: string; at: number }[]; gapsCutOut: boolean }
  }[]
}
interface Colour {
  readonly hex: string
  readonly opacity: number
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/progress/progress-cases.json', 'utf8')) as Table
const named = <TRow extends { readonly name: string }>(rows: readonly TRow[]): readonly (readonly [string, TRow])[] => rows.map((row) => [row.name, row] as const)

/** The table theme: the built-in light one plus three gradients declared for the table. */
const CONTRACT: ThemeContract = (() => {
  const light = BUILT_IN_THEME_CONTRACT.themes.light
  if (light === undefined) throw new Error('there is no built-in theme')
  const theme: Theme = { ...light, spacing: { ...light.spacing, ...TABLE.theme.spacing }, radius: { ...light.radius, ...TABLE.theme.radius }, color: { ...light.color, ...TABLE.theme.color }, gradient: { ...light.gradient, ...TABLE.theme.gradient } }
  return { ...BUILT_IN_THEME_CONTRACT, themes: { light: theme } }
})()
const THEME = resolveTheme(CONTRACT).theme
const VARIABLES = themeCssVariables(THEME)

/** A package CSS colour → a table value (`#rrggbb` + opacity): a theme variable, hex or `rgba()`. */
function colourOf(css: string): Colour {
  const variable = /^var\((--product-color-[a-z0-9-]+)\)$/.exec(css)
  if (variable?.[1] !== undefined) return colourOf(VARIABLES[variable[1]] ?? 'missing')
  const hex = /^#([0-9a-f]{6})$/.exec(css)
  if (hex?.[1] !== undefined) return { hex: css, opacity: 1 }
  const rgba = /^rgba\((\d+), (\d+), (\d+), ([0-9.]+)\)$/.exec(css)
  if (rgba === null) throw new Error(`not a colour: ${css}`)
  const channel = (value: string | undefined): string => Number(value).toString(16).padStart(2, '0')
  return { hex: `#${channel(rgba[1])}${channel(rgba[2])}${channel(rgba[3])}`, opacity: Number(rgba[4]) }
}

describe('bar and ring case table: structure', () => {
  it('the row count equals the reference; names within a group are unique', () => {
    expect(TABLE.ratioCases).toHaveLength(15)
    expect(TABLE.ringCases).toHaveLength(33)
    expect(TABLE.arcCases).toHaveLength(5)
    expect(TABLE.barCases).toHaveLength(12)
    expect(TABLE.paintCases).toHaveLength(21)
    expect(TABLE.segmentCases).toHaveLength(21)
    expect(TABLE.segmentPlaceCases).toHaveLength(6)
    expect(TABLE.segmentPaintCases).toHaveLength(6)
    expect(TABLE.segmentGradientCases).toHaveLength(3)
    for (const group of [TABLE.ratioCases, TABLE.ringCases, TABLE.arcCases, TABLE.barCases, TABLE.paintCases, TABLE.segmentCases, TABLE.segmentPlaceCases, TABLE.segmentPaintCases, TABLE.segmentGradientCases]) {
      expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
    }
  })
})

/* ─────────────────────── package pure functions ─────────────────────── */

const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

/** A table row style → the `ringGeometry` input; fields the reader does not apply are removed (`applied`). */
function ringInput(row: Table['ringCases'][number]): Parameters<typeof ringGeometry>[0] {
  const { style, applied } = row
  const width = applied?.width === false ? undefined : style
  const height = applied?.height === false ? undefined : style
  const paintThickness = resolveProgressPaint(row.props, THEME).thickness
  return {
    size: row.props.size,
    unit: THEME.spacing.xl ?? 0,
    width: num(width?.width),
    minWidth: num(width?.minWidth),
    maxWidth: num(width?.maxWidth),
    height: num(height?.height),
    minHeight: num(height?.minHeight),
    maxHeight: num(height?.maxHeight),
    paddingInline: 2 * (num(style.padding) ?? 0),
    paddingBlock: 2 * (num(style.padding) ?? 0),
    border: num(style.border),
    thickness: paintThickness,
  }
}

describe('bar and ring case table: package pure functions', () => {
  it.each(named(TABLE.ratioCases))('ratio: %s', (_name, row) => {
    expect(progressRatio(row.value, row.max)).toBe(row.expect)
  })

  it.each(named(TABLE.ringCases))('ring: %s', (_name, row) => {
    const geometry = ringGeometry(ringInput(row))
    expect(geometry.diameter).toBe(row.expect.diameter)
    expect(geometry.thickness).toBe(row.expect.thickness)
    if (row.expect.boxInline !== undefined) expect(geometry.boxInline).toBe(row.expect.boxInline)
    if (row.expect.boxBlock !== undefined) expect(geometry.boxBlock).toBe(row.expect.boxBlock)
    // The free space of the content box that is divided equally is what remains after the ring.
    const input = ringInput(row)
    const around = 2 * (input.border ?? 0)
    if (row.expect.freeInline !== undefined) expect(geometry.boxInline - (input.paddingInline ?? 0) - around - geometry.diameter).toBe(row.expect.freeInline)
    if (row.expect.freeBlock !== undefined) expect(geometry.boxBlock - (input.paddingBlock ?? 0) - around - geometry.diameter).toBe(row.expect.freeBlock)
  })

  it.each(named(TABLE.arcCases))('arc: %s', (_name, row) => {
    // The writing direction is not needed by the arc: the function does not take it because the ring is not mirrored.
    expect(ringArc(row.ratio)).toEqual(row.expect)
  })

  it.each(named(TABLE.barCases))('bar: %s', (_name, row) => {
    const pill = THEME.radius.pill ?? 0
    const geometry = barGeometry(row.trackInline, resolveProgressPaint(row.props, THEME).thickness, row.ratio, pill)
    expect(geometry).toEqual({ trackBlock: row.expect.trackBlock, fillInline: row.expect.fillInline, trackRadius: row.expect.trackRadius, fillRadius: row.expect.fillRadius })
    // The fill grows from the logical start: in right-to-left writing, from the right side.
    expect(row.expect.fillFrom).toBe(row.direction === 'rtl' ? 'right' : 'left')
  })

  it.each(named(TABLE.paintCases))('paint: %s', (_name, row) => {
    const paint = resolveProgressPaint(row.props, THEME)
    expect(colourOf(paint.track)).toEqual(row.expect.track)
    if (row.expect.fill.kind === 'color') {
      expect(paint.fill.kind).toBe('color')
      expect(paint.fill.kind === 'color' ? colourOf(paint.fill.color) : undefined).toEqual({ hex: row.expect.fill.hex, opacity: row.expect.fill.opacity })
      return
    }
    expect(paint.fill.kind).toBe('gradient')
    if (paint.fill.kind !== 'gradient') return
    const stops = stopsOnScale(paint.fill.stops, row.ratio).map((stop) => ({ ...colourOf(stop.color), at: stop.at }))
    expect(stops).toHaveLength(row.expect.fill.stops.length)
    stops.forEach((stop, index) => {
      const expected = row.expect.fill.kind === 'gradient' ? row.expect.fill.stops[index] : undefined
      expect(stop.hex).toBe(expected?.hex)
      expect(stop.opacity).toBeCloseTo(expected?.opacity ?? Number.NaN, 6)
      expect(stop.at).toBeCloseTo(expected?.at ?? Number.NaN, 6)
    })
  })
})

/* ─────────────────────── real screen ─────────────────────── */

const SIZE_LABEL_OFF = { labelFormat: 'none' }

function documentOf(child: UiNode, wrap: 'plain' | 'weighted-row' | 'stack-fill'): UiDocument {
  const sibling: UiNode = { id: 'sibling', type: 'Text', props: { content: { kind: 'literal', value: 'sibling' } } }
  const children: UiNode[] =
    wrap === 'plain'
      ? [child]
      : wrap === 'weighted-row'
        ? [{ id: 'row', type: 'Row', props: {}, children: [{ ...child, weight: 1 }, sibling] }]
        : [{ id: 'stack', type: 'Stack', props: {}, children: [{ id: 'base', type: 'Container', props: {}, style: { width: 300, height: 300 } }, { ...child, fill: true }] }]
  return {
    schemaVersion: '9.7.0',
    documentId: 'progress-case',
    name: 'Progress case',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children } }],
  }
}

/** Screen markup from server render, parsed back into the DOM (the `style` attribute stays a verbatim string). */
function markup(document: UiDocument, locale = 'en'): HTMLElement {
  const host = window.document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<HotlayoutScreen document={document} theme={CONTRACT} locale={locale} injectStyles={false} />)
  return host
}

const px = (style: string | null, property: string): number | undefined => {
  // Zero is written without a unit (`cssPx`).
  const found = new RegExp(`(?:^|;)\\s*${property}:\\s*(-?[0-9.]+)(?:px)?(?:;|$)`).exec(style ?? '')
  return found?.[1] === undefined ? undefined : Number(found[1])
}

describe('bar and ring case table: HotlayoutScreen draws the same', () => {
  it.each(named(TABLE.ringCases))('ring: %s', (_name, row) => {
    const applied = row.applied
    const wrap = applied === undefined ? 'plain' : !applied.width && !applied.height ? 'stack-fill' : 'weighted-row'
    const node: UiNode = {
      id: 'ring',
      type: 'CircularProgress',
      props: { value: { kind: 'literal', value: 1 }, max: { kind: 'literal', value: 4 }, color: 'primary', ...SIZE_LABEL_OFF, ...row.props },
      // The table `style.border` is a number (thickness); the document states a border as an object.
      style: Object.fromEntries(Object.entries(row.style).map(([key, value]) => [key, key === 'border' ? { width: value, color: 'border' } : value])),
    }
    const host = markup(documentOf(node, wrap))
    const bar = host.querySelector('[data-hl-node="ring"] [role="progressbar"]')
    expect(bar).not.toBeNull()
    expect(px(bar?.getAttribute('style') ?? null, 'inline-size')).toBe(row.expect.diameter)
    expect(px(bar?.getAttribute('style') ?? null, 'block-size')).toBe(row.expect.diameter)

    // The arc thickness is in the ring mask of both layers (track and fill) when there is something to draw.
    // The centre label (rows like "348") is not an arc: it does not enlarge the ring box and must not be counted among the arcs.
    const arcs = [...(bar?.children ?? [])].filter((child) => !child.hasAttribute('data-hl-ring-label'))
    if (row.expect.thickness <= 0) {
      expect(arcs, 'zero thickness draws nothing').toHaveLength(0)
      return
    }
    expect(arcs).toHaveLength(2)
    for (const arc of arcs) {
      const hole = /calc\(100% - (-?[0-9.]+)px\)/.exec(arc.getAttribute('style') ?? '')
      expect(Number(hole?.[1])).toBe(row.expect.thickness)
    }
  })

  it.each(named(TABLE.barCases))('bar: %s', (_name, row) => {
    const node: UiNode = { id: 'bar', type: 'ProgressBar', props: { value: { kind: 'literal', value: row.ratio * 100 }, max: { kind: 'literal', value: 100 }, color: 'primary', labelFormat: 'none', ...row.props } }
    const host = markup(documentOf(node, 'plain'), row.direction === 'rtl' ? 'ar' : 'en')
    const track = host.querySelector('[data-hl-node="bar"] [role="progressbar"]')
    const fill = track?.firstElementChild
    expect(px(track?.getAttribute('style') ?? null, 'block-size') ?? 0).toBe(row.expect.trackBlock)
    // The fill share is a percentage of the track; the radius of both is the `pill` token, which CSS clamps to half of the shorter side.
    expect(fill?.getAttribute('style')).toContain(`inline-size:${String(row.ratio * 100)}%`)
    for (const element of [track, fill]) expect(element?.getAttribute('style')).toContain('border-radius:var(--product-radius-pill)')
    expect(row.expect.fillFrom).toBe(row.direction === 'rtl' ? 'right' : 'left')
  })

  it('ring: the gradient is a cone along the arc; three stops at 40 % and the start at the top', () => {
    const row = TABLE.paintCases.find((item) => item.name.startsWith('three stops at 40%'))
    if (row === undefined) throw new Error('there is no table row')
    const node: UiNode = { id: 'ring', type: 'CircularProgress', props: { value: { kind: 'literal', value: 40 }, max: { kind: 'literal', value: 100 }, labelFormat: 'none', ...row.props } }
    for (const locale of ['en', 'ar']) {
      const host = markup(documentOf(node, 'plain'), locale)
      const arcs = [...(host.querySelector('[data-hl-node="ring"] [role="progressbar"]')?.children ?? [])]
      // The ring is not mirrored: in Arabic the same cone from the top.
      expect(arcs[1]?.getAttribute('style'), locale).toContain('conic-gradient(from 0deg, #ff0000 0%, #ff0000 0%, #00ff00 20%, #0000ff 40%, #0000ff 40%, transparent 40%)')
      // There is no linear gradient on the arc: the token angle is not read.
      expect(arcs[1]?.getAttribute('style'), locale).not.toContain('linear-gradient')
    }
  })

  it('bar: the gradient lies on the filled part and runs from the logical start', () => {
    const row = TABLE.paintCases.find((item) => item.name.startsWith('gradient token, half of the scale'))
    if (row === undefined) throw new Error('there is no table row')
    const node: UiNode = { id: 'bar', type: 'ProgressBar', props: { value: { kind: 'literal', value: 50 }, max: { kind: 'literal', value: 100 }, labelFormat: 'none', ...row.props } }
    const fillOf = (locale: string): string => markup(documentOf(node, 'plain'), locale).querySelector('[data-hl-node="bar"] [role="progressbar"]')?.firstElementChild?.getAttribute('style') ?? ''
    expect(fillOf('en')).toContain('linear-gradient(to right, #4f46e5 0%, #0369a1 100%)')
    expect(fillOf('ar')).toContain('linear-gradient(to left, #4f46e5 0%, #0369a1 100%)')
    expect(render(<HotlayoutScreen document={documentOf(node, 'plain')} theme={CONTRACT} />).container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50')
  })
})

/* ─────────────────────────── steps (9.11.0) ─────────────────────────── */

/** How much track the host gives: the package measures it in a browser, and jsdom computes no layout, so the measurement is supplied. */
function withTrackWidth<T>(width: number, run: () => T): T {
  const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function measured(this: Element): DOMRect {
    const track = this.getAttribute('role') === 'progressbar'
    return { x: 0, y: 0, top: 0, left: 0, right: track ? width : 0, bottom: 0, width: track ? width : 0, height: 0, toJSON: () => ({}) }
  })
  try {
    return run()
  } finally {
    spy.mockRestore()
  }
}

const STEP_GAP = 'var(--product-space-xs)'
// CSS math gets the theme number with a unit, not a variable (`xs` = 4 in the built-in theme).
const STEP_GAP_PX = 4
const stateOf = (letters: string, index: number): string => (letters[index] === 'f' ? 'filled' : letters[index] === 'c' ? 'current' : 'unfilled')
const segmentNode = (row: { props: Record<string, unknown>; value: unknown; max: unknown }): UiNode => ({
  id: 'bar',
  type: 'ProgressBar',
  props: { value: { kind: 'literal', value: row.value }, max: { kind: 'literal', value: row.max }, color: 'primary', labelFormat: 'none', ...row.props },
})

describe('bar case table: steps, package pure functions', () => {
  it.each(named(TABLE.segmentCases))('steps: %s', (_name, row) => {
    const pill = THEME.radius.pill ?? 0
    const segments = readSegments(row.props.segments)
    const thickness = resolveProgressPaint(row.props, THEME).thickness
    const geometry = segments === undefined ? undefined : segmentGeometry(row.trackInline, thickness, progressRatio(row.value, row.max), segments, THEME.spacing.xs ?? 0, pill)
    if (row.expect === null) {
      // An unreadable step count and a step narrower than a pixel give a solid bar with the same ratio.
      expect(geometry).toBeUndefined()
      return
    }
    expect(geometry).toBeDefined()
    if (geometry === undefined) return
    expect(geometry.segments[0]?.inline).toBeCloseTo(row.expect.inline, 9)
    row.expect.starts?.forEach((start, index) => {
      expect(geometry.segments[index]?.start, `start ${String(index)}`).toBeCloseTo(start, 9)
    })
    expect(geometry.filled).toBe(row.expect.filled)
    expect(geometry.current ?? null).toBe(row.expect.current)
    expect(geometry.segments.map((step) => step.state[0]).join('')).toBe(row.expect.states)
    expect(geometry.radius).toBeCloseTo(row.expect.radius, 9)
    expect(geometry.filledInline).toBeCloseTo(row.expect.filledInline, 9)
    // Right-to-left writing: the same distribution, counted from the right side.
    expect(row.expect.fillFrom).toBe(row.direction === 'rtl' ? 'right' : 'left')
  })

  it.each(named(TABLE.segmentPaintCases))('step paint: %s', (_name, row) => {
    expect(colourOf(resolveProgressPaint(row.props, THEME).track)).toEqual(row.expect.unfilled)
    const current = resolveCurrentColor(row.props, THEME)
    expect(current === undefined ? null : colourOf(current)).toEqual(row.expect.current)
  })

  it.each(named(TABLE.segmentGradientCases))('gradient through steps: %s', (_name, row) => {
    const paint = resolveProgressPaint(row.props, THEME)
    expect(paint.fill.kind).toBe('gradient')
    if (paint.fill.kind !== 'gradient') return
    const segments = readSegments(row.props.segments) ?? 0
    const geometry = segmentGeometry(row.trackInline, paint.thickness, progressRatio(row.value, row.max), segments, THEME.spacing.xs ?? 0, THEME.radius.pill ?? 0)
    expect(geometry?.filledInline).toBeCloseTo(row.expect.lineTo, 9)
    const stops = stopsAlongFilled(paint.fill.stops, geometry?.filledInline ?? 0).map((stop) => ({ hex: colourOf(stop.color).hex, at: stop.at }))
    expect(stops).toHaveLength(row.expect.stops.length)
    stops.forEach((stop, index) => {
      expect(stop.hex).toBe(row.expect.stops[index]?.hex)
      expect(stop.at).toBeCloseTo(row.expect.stops[index]?.at ?? Number.NaN, 9)
    })
    expect(row.expect.lineFrom).toBe(0)
    expect(row.expect.gapsCutOut).toBe(true)
  })
})

describe('bar case table: the width of the PLACE decides the step style', () => {
  it.each(named(TABLE.segmentPlaceCases))('function: %s', (_name, row) => {
    const segments = readSegments(row.props.segments)
    if (segments === undefined) throw new Error('the table row has an unreadable step count')
    const gap = THEME.spacing.xs ?? 0
    expect(segmentsMinInline(segments, gap)).toBe(row.expect.ownMinInline)
    expect(segmentsKindFor(row.placeInline, segments, gap)).toBe(row.expect.kind)
    // A place that the own minimum width would raise does not change the style: a measurement does not change what it measures.
    expect(segmentsKindFor(Math.max(row.placeInline, row.expect.ownMinInline), segments, gap)).toBe(row.expect.kind)
    if (row.expect.kind === 'steps') expect((row.placeInline - (segments - 1) * gap) / segments).toBe(row.expect.inline)
  })

  it.each(named(TABLE.segmentPlaceCases))('real screen: %s', (_name, row) => {
    const segments = readSegments(row.props.segments) ?? 0
    const node = segmentNode({ props: row.props, value: 1, max: 4 })
    // The track width in a browser is the place width but not less than the own minimum, the same in both styles.
    const width = Math.max(row.placeInline, row.expect.ownMinInline)
    const view = withTrackWidth(width, () => render(<HotlayoutScreen document={documentOf(node, 'plain')} theme={CONTRACT} />))
    const track = view.container.querySelector<HTMLElement>('[data-hl-node="bar"] [role="progressbar"]')!
    expect(track.querySelectorAll('[data-hl-step]')).toHaveLength(row.expect.kind === 'steps' ? segments : 0)
    // The solid replacement keeps the same minimum width as the steps: `(N − 1) × gap`.
    if (row.expect.kind === 'continuous') expect(track.style.minInlineSize).toBe(`calc(${String((segments - 1) * STEP_GAP_PX)}px)`)
  })
})

describe('bar case table: steps, HotlayoutScreen draws the same', () => {
  it.each(named(TABLE.segmentCases))('steps: %s', (_name, row) => {
    const document = documentOf(segmentNode(row), 'plain')
    const view = withTrackWidth(row.trackInline, () => render(<HotlayoutScreen document={document} theme={CONTRACT} locale={row.direction === 'rtl' ? 'ar' : 'en'} />))
    const track = view.container.querySelector<HTMLElement>('[data-hl-node="bar"] [role="progressbar"]')!
    const steps = [...track.querySelectorAll<HTMLElement>('[data-hl-step]')]
    if (row.expect === null) {
      expect(steps, 'solid bar: there are no steps').toHaveLength(0)
      // The same share as a solid bar.
      expect(track.firstElementChild?.getAttribute('style')).toContain(`inline-size: ${String(progressRatio(row.value, row.max) * 100)}%`)
      return
    }
    const expected = row.expect
    expect(steps).toHaveLength(expected.states.length)
    expect(steps.map((step) => step.getAttribute('data-hl-step'))).toEqual(expected.states.split('').map((_letter, index) => stateOf(expected.states, index)))
    // ONE scale for a screen reader: a single element with a value and a limit, the steps have no role.
    expect(view.container.querySelectorAll('[role="progressbar"]')).toHaveLength(1)
    expect(track.getAttribute('aria-valuemax')).toBe(String(row.max))
    expect(track.querySelectorAll('[role]')).toHaveLength(0)
    // The gap is the `xs` token; there is no track UNDER the gaps: neither a background nor a border on the track itself.
    expect(track.style.gap).toBe(STEP_GAP)
    expect(track.style.backgroundColor).toBe('')
    expect(track.style.overflow).toBe('')
    // All steps have one width (a share of the free space), without rounding; the radius is the `pill` token.
    for (const step of steps) {
      expect(step.style.flex).toBe('1 1 0px')
      expect(step.style.borderRadius).toBe('var(--product-radius-pill)')
    }
    expect(track.getAttribute('dir') ?? view.container.firstElementChild?.getAttribute('dir')).toBe(row.direction)
  })

  it.each(named(TABLE.segmentPaintCases))('step paint: %s', (_name, row) => {
    const row2 = { props: row.props, value: 3, max: 6 }
    const view = render(<HotlayoutScreen document={documentOf(segmentNode(row2), 'plain')} theme={CONTRACT} />)
    const steps = [...view.container.querySelectorAll<HTMLElement>('[data-hl-step]')]
    const filled = steps.filter((step) => step.getAttribute('data-hl-step') === 'filled')
    const unfilled = steps.filter((step) => step.getAttribute('data-hl-step') === 'unfilled')
    const current = steps.find((step) => step.getAttribute('data-hl-step') === 'current')
    expect(filled).toHaveLength(3)
    for (const step of filled) expect(colourOf(step.style.backgroundColor)).toEqual({ hex: '#4f46e5', opacity: 1 })
    for (const step of unfilled) expect(colourOf(step.style.backgroundColor), 'an unfilled step has the track colour').toEqual(row.expect.unfilled)
    // The current one is `currentColor` if the field exists and resolved, otherwise as unfilled.
    expect(colourOf(current?.style.backgroundColor ?? '')).toEqual(row.expect.current ?? row.expect.unfilled)
  })

  it.each(named(TABLE.segmentGradientCases))('gradient through steps: %s', (_name, row) => {
    for (const locale of ['en', 'ar']) {
      const host = markup(documentOf(segmentNode(row), 'plain'), locale)
      const filled = [...host.querySelectorAll('[data-hl-step="filled"]')]
      const count = Math.floor(Math.round((row.value / row.max) * (readSegments(row.props.segments) ?? 0) * 1e6) / 1e6)
      expect(filled).toHaveLength(count)
      filled.forEach((step, index) => {
        // The colour through a step is what it would be in a solid fill: in each filled step, a bar as long as all filled steps, shifted by its own number.
        const strip = step.firstElementChild?.getAttribute('style') ?? ''
        expect(strip, locale).toContain(`inset-inline-start:calc(-1 * ${String(index)} * (100% + ${String(STEP_GAP_PX)}px))`)
        expect(strip, locale).toContain(`inline-size:calc(${String(count)} * 100% + ${String(count - 1)} * ${String(STEP_GAP_PX)}px)`)
        expect(strip, locale).toContain(locale === 'ar' ? 'linear-gradient(to left,' : 'linear-gradient(to right,')
        expect(step.getAttribute('style')).not.toContain('background-color')
      })
    }
  })

  it('a step end does not run into its neighbour: two screens of the same document give the same steps (server and browser)', () => {
    const row = TABLE.segmentCases[0]
    if (row === undefined) throw new Error('there is no table row')
    const server = markup(documentOf(segmentNode(row), 'plain')).querySelectorAll('[data-hl-step]').length
    const client = render(<HotlayoutScreen document={documentOf(segmentNode(row), 'plain')} theme={CONTRACT} />).container.querySelectorAll('[data-hl-step]').length
    expect(client).toBe(server)
  })
})
