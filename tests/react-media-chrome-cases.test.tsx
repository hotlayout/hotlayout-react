/**
 * CASE TABLE FOR IMAGE, APP BAR, SCREEN ANATOMY, MODAL LAYER AND STATUS BAR THROUGH THE
 * `@hotlayout/react` PACKAGE: `contract/fixtures/media-chrome/media-chrome-cases.json` (schema 9.9.0).
 *
 * The reference and the builder preview are checked against the same table elsewhere; this file is
 * another reader. The package does not import from `src/`, so the rule is written a second time in it
 * (`media-chrome.ts`), and this table keeps the two copies together. Each group runs twice: the
 * package's pure function and a REAL `HotlayoutScreen` (jsdom computes no layout, so the markup is
 * checked against the structural condition of the rule: what is in which zone, what sticks, whose
 * width).
 *
 * The "reference" groups (`ratioDocumentCases`, `circleCases`, `documentCases`) concern the builder
 * validator and panel; the reader is checked like this: the document is drawn and does not crash,
 * and what it read matches the expectation. NO ROWS ARE SKIPPED.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { UiDocument, UiNode } from '../src/index'
import {
  appBarDrawnActions,
  appBarZones,
  effectiveCornerRadius,
  imageBoxOf,
  imagePaintRect,
  imageRatioCssOf,
  imageRatioOf,
  modalBoxOf,
  MODAL_LAYER_RULES,
  modalPlacementOf,
  SCREEN_ANATOMY,
  screenAppBarOf,
  screenZonesOf,
  statusBarIconsOf,
} from '../src/media-chrome'
import { screenShownEvent } from '../src/screen-shown'
import type { ShownFrame, StackTransition } from '../src/screen-shown'

afterEach(cleanup)

interface Table {
  readonly tokens: { readonly spacing: Record<string, number>; readonly backSide: number; readonly gap: number; readonly actionGap: number }
  readonly ratioCases: readonly { name: string; aspectRatio?: unknown; expect: { width: number; height: number } }[]
  readonly ratioDocumentCases: readonly { name: string; aspectRatio?: unknown; schema: boolean; code: string | null }[]
  readonly imageBoxCases: readonly {
    name: string
    aspectRatio: unknown
    width: number
    style: { height?: number; minHeight?: number; maxHeight?: number }
    expect: { width: number; height: number; byRatio: boolean }
  }[]
  readonly paintCases: readonly { name: string; box: { width: number; height: number }; natural: number; fit?: unknown; expect: { x: number; y: number; width: number; height: number } }[]
  readonly radiusCases: readonly { name: string; box: { width: number; height: number }; radius: number; expect: { radius: number; circle: boolean } }[]
  readonly circleCases: readonly { name: string; side: number; expect: { width: number; height: number; radius: 'pill' | number } }[]
  readonly appBarCases: readonly {
    name: string
    width: number
    showBack: boolean
    actionSides: readonly number[]
    titleNatural: number
    expect: {
      leading: number
      trailing: number
      titleRoom: number
      titleWidth: number
      titleStart: number
      centered: boolean
      truncated: boolean
      actionStarts: readonly number[]
    }
    rtlLeft?: { back: number | null; title: number; actions: readonly number[] }
  }[]
  readonly screenAppBarCases: readonly { name: string; children: readonly string[]; hidden?: readonly boolean[]; expect: number | null; zoneNow?: boolean }[]
  readonly zoneCases: readonly {
    name: string
    height: number
    shrink?: boolean
    appBarHeight?: number
    padding: { top: number; bottom: number }
    gap: number
    bodyContentHeight?: number
    firstPull?: number
    scrollTop?: number
    expect: ReturnType<typeof screenZonesOf>
  }[]
  readonly screenRuleCases: readonly { name: string; rule: string; expect: unknown }[]
  readonly modalCases: readonly { name: string; placement?: unknown; viewport: { width: number; height: number }; contentHeight: number; margin: number; expect: ReturnType<typeof modalBoxOf> }[]
  readonly modalAreaCases: readonly {
    name: string
    frame: { width: number; height: number }
    insets: { top: number; bottom: number }
    contentHeight: number
    margin: number
    area: { x: number; y: number; width: number; height: number }
    expect: { x: number; y: number; width: number; height: number; centerY: number }
  }[]
  readonly placementCases: readonly { name: string; value?: unknown; expect: 'bottom' | 'center' }[]
  readonly statusBarCases: readonly { name: string; value?: unknown; expect: 'light' | 'dark' | null }[]
  readonly documentCases: readonly {
    name: string
    screens: readonly Record<string, unknown>[]
    appBarChildren?: readonly string[] | null
    schema: boolean
    codes: readonly string[]
  }[]
  /** 9.9.0 clarification: layer rules that have no geometry. */
  readonly modalRuleCases: readonly { name: string; rule: string; expect: unknown }[]
  /** 9.9.0 clarification: which app bar actions are drawn. */
  readonly appBarDrawnCases: readonly { name: string; width: number; showBack: boolean; actionSide: number; titleNatural: number; visible: readonly boolean[]; expect: { drawn: readonly boolean[]; titleRoom: number } }[]
  readonly shownCases: readonly { name: string; stack: readonly (ShownFrame & { screenId: string })[]; transition: StackTransition; expect: Record<string, unknown> }[]
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/media-chrome/media-chrome-cases.json', 'utf8')) as Table
const named = <TRow extends { readonly name: string }>(rows: readonly TRow[]): readonly (readonly [string, TRow])[] => rows.map((row) => [row.name, row] as const)

const lit = (value: string): Record<string, unknown> => ({ kind: 'literal', value })
const node = (id: string, type: string, props: Record<string, unknown> = {}, extra: Partial<UiNode> = {}): UiNode => ({ id, type, props, ...extra })
const text = (id: string, value: string): UiNode => node(id, 'Text', { content: lit(value), style: 'bodyM' })
const image = (id: string, props: Record<string, unknown>, style?: Record<string, unknown>): UiNode =>
  node(id, 'Image', { source: { kind: 'url', url: 'https://example.com/a.png' }, alt: 'a', ...props }, style === undefined ? {} : { style })
const iconButton = (id: string, extra: Partial<UiNode> = {}): UiNode => node(id, 'IconButton', { icon: 'info', label: lit(id), variant: 'ghost', size: 'md', action: { type: 'none' } }, extra)
const appBar = (id: string, props: Record<string, unknown> = {}, children: UiNode[] = [], extra: Partial<UiNode> = {}): UiNode => ({ ...node(id, 'AppBar', { title: lit(id), showBack: false, ...props }, extra), children })
const screenRoot = (id: string, children: UiNode[], props: Record<string, unknown> = {}, extra: Partial<UiNode> = {}): UiNode => ({ ...node(id, 'Screen', props, extra), children })
const documentOf = (screens: readonly Record<string, unknown>[], extra: Record<string, unknown> = {}): UiDocument =>
  ({ schemaVersion: '9.11.0', documentId: 'chrome-cases', name: 'cases', initialScreenId: String(screens[0]?.screenId), screens, ...extra }) as unknown as UiDocument
const page = (screenId: string, children: UiNode[], extra: Record<string, unknown> = {}, rootExtra: Partial<UiNode> = {}, rootProps: Record<string, unknown> = {}): Record<string, unknown> => ({
  screenId,
  name: screenId,
  root: screenRoot(`root-${screenId}`, children, rootProps, rootExtra),
  ...extra,
})
const quiet = (): undefined => undefined

describe('case table for image, app bar, anatomy, layer and status bar: structure', () => {
  it('the row count equals the reference; names within a group are unique', () => {
    expect(TABLE.ratioCases).toHaveLength(20)
    expect(TABLE.ratioDocumentCases).toHaveLength(14)
    expect(TABLE.imageBoxCases).toHaveLength(18)
    expect(TABLE.paintCases).toHaveLength(9)
    expect(TABLE.radiusCases).toHaveLength(9)
    expect(TABLE.circleCases).toHaveLength(5)
    expect(TABLE.appBarCases).toHaveLength(15)
    expect(TABLE.screenAppBarCases).toHaveLength(7)
    expect(TABLE.zoneCases).toHaveLength(19)
    expect(TABLE.screenRuleCases).toHaveLength(16)
    expect(TABLE.modalCases).toHaveLength(16)
    expect(TABLE.modalAreaCases).toHaveLength(3)
    expect(TABLE.placementCases).toHaveLength(7)
    expect(TABLE.statusBarCases).toHaveLength(7)
    expect(TABLE.documentCases).toHaveLength(16)
    expect(TABLE.shownCases).toHaveLength(11)
    expect(TABLE.modalRuleCases).toHaveLength(2)
    expect(TABLE.appBarDrawnCases).toHaveLength(7)
    for (const group of [TABLE.ratioCases, TABLE.ratioDocumentCases, TABLE.imageBoxCases, TABLE.paintCases, TABLE.radiusCases, TABLE.circleCases, TABLE.appBarCases, TABLE.screenAppBarCases, TABLE.zoneCases, TABLE.screenRuleCases, TABLE.modalCases, TABLE.modalAreaCases, TABLE.placementCases, TABLE.statusBarCases, TABLE.documentCases, TABLE.shownCases, TABLE.modalRuleCases, TABLE.appBarDrawnCases]) {
      expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
    }
  })
})

/* ─────────────────────────────── image ─────────────────────────────── */

/** `aspect-ratio` from the markup → a number (`16 / 9` or decimal). */
function ratioOfMarkup(img: HTMLElement): number {
  const value = /aspect-ratio:\s*([^;]+)/.exec(img.getAttribute('style') ?? '')?.[1]?.trim() ?? ''
  const parts = value.split('/').map((part) => Number(part.trim()))
  return parts.length === 2 ? (parts[0] ?? 0) / (parts[1] ?? 1) : Number(value)
}

function drawImage(props: Record<string, unknown>, style?: Record<string, unknown>): HTMLElement {
  const view = render(<HotlayoutScreen document={documentOf([page('a', [image('pic', props, style)])])} onReport={quiet} />)
  const img = view.container.querySelector<HTMLElement>('[data-hl-node="pic"]')
  if (img === null) throw new Error('the image is not drawn')
  return img
}

describe('image: ratio', () => {
  it.each(named(TABLE.ratioCases))('function: %s', (_name, row) => {
    expect(imageRatioOf(row.aspectRatio)).toBeCloseTo(row.expect.width / row.expect.height, 9)
  })

  it.each(named(TABLE.ratioCases))('real screen: %s', (_name, row) => {
    const img = drawImage('aspectRatio' in row ? { aspectRatio: row.aspectRatio } : {})
    expect(ratioOfMarkup(img)).toBeCloseTo(row.expect.width / row.expect.height, 6)
    cleanup()
  })

  it.each(named(TABLE.ratioDocumentCases))('validator reference: the reader draws and does not crash: %s', (_name, row) => {
    const img = drawImage('aspectRatio' in row ? { aspectRatio: row.aspectRatio } : {})
    expect(img.tagName).toBe('IMG')
    expect(ratioOfMarkup(img)).toBeCloseTo(imageRatioOf(row.aspectRatio), 6)
  })

  it('imageRatioCssOf: a word stays a word, an own pair becomes a number', () => {
    expect(imageRatioCssOf('4:3')).toBe('4 / 3')
    expect(imageRatioCssOf('21:9')).toBe('16 / 9')
    expect(imageRatioCssOf({ width: 343, height: 120 })).toBe(String(343 / 120))
    expect(imageRatioCssOf({ width: 9, height: 1 })).toBe('8')
  })
})

describe('image: box, picture in it, radius', () => {
  it.each(named(TABLE.imageBoxCases))('function: %s', (_name, row) => {
    const box = imageBoxOf({ aspectRatio: row.aspectRatio, width: row.width, height: row.style.height, minHeight: row.style.minHeight, maxHeight: row.style.maxHeight })
    expect(box.width).toBe(row.expect.width)
    expect(box.height).toBeCloseTo(row.expect.height, 4)
    expect(box.byRatio).toBe(row.expect.byRatio)
  })

  /*
   * CSS computes the layout: the width is the parent's (`inline-size: 100%`), the height is the named
   * `style.height` or "width / ratio" (`aspect-ratio`, which CSS does not apply to a box with two
   * named sizes); the limits clamp both. The markup must carry exactly these conditions and not read
   * the file size.
   */
  it.each(named(TABLE.imageBoxCases))('real screen: %s', (_name, row) => {
    const img = drawImage({ aspectRatio: row.aspectRatio }, row.style)
    const px = (value: number | undefined): string => (value === undefined ? '' : `${String(value)}px`)
    // A named height goes into the box already clamped by the node's own bounds (the minimum wins).
    const named = row.style.height === undefined ? undefined : Math.max(Math.min(row.style.height, row.style.maxHeight ?? Infinity), row.style.minHeight ?? -Infinity)
    expect(img.style.height).toBe(px(named))
    expect(img.style.minHeight).toBe(px(row.style.minHeight))
    // An inverted range: the minimum wins, so the upper bound is raised to the minimum (the node style normalizes the pair); the height is the same.
    const { minHeight, maxHeight } = row.style
    expect(img.style.maxHeight).toBe(px(minHeight !== undefined && maxHeight !== undefined ? Math.max(minHeight, maxHeight) : maxHeight))
    expect(img.style.display).toBe('block')
    expect(ratioOfMarkup(img)).toBeCloseTo(imageRatioOf(row.aspectRatio), 6)
    // The natural size is not read: neither `width`/`height` attributes from the file, nor `naturalWidth` in the markup.
    expect(img.getAttribute('width')).toBeNull()
    expect(img.getAttribute('height')).toBeNull()
  })

  it.each(named(TABLE.paintCases))('function: %s', (_name, row) => {
    const rect = imagePaintRect(row.box, row.natural, row.fit)
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(rect[key], key).toBeCloseTo(row.expect[key], 6)
  })

  it.each(named(TABLE.paintCases))('real screen: %s', (_name, row) => {
    const img = drawImage('fit' in row ? { fit: row.fit } : {})
    // The picture sits in the box centred; an unknown word and a missing field mean `cover`.
    expect(img.style.objectFit).toBe(row.fit === 'contain' ? 'contain' : 'cover')
    expect(img.style.objectPosition).toBe('')
  })

  it.each(named(TABLE.radiusCases))('function: %s', (_name, row) => {
    const radius = effectiveCornerRadius(row.box, row.radius)
    expect(radius).toBe(row.expect.radius)
    expect(row.box.width === row.box.height && radius === row.box.width / 2).toBe(row.expect.circle)
  })

  it.each(named(TABLE.radiusCases))('real screen: clipping by the node radius: %s', (_name, row) => {
    const img = drawImage({}, { width: row.box.width, height: row.box.height, radius: row.radius })
    // The radius sits on the image element itself: the browser clamps it to half of the shorter side.
    expect(img.style.borderRadius).toBe(`${String(row.radius)}px`)
    expect(img.style.width).toBe(`${String(row.box.width)}px`)
    expect(img.style.height).toBe(`${String(row.box.height)}px`)
  })

  it.each(named(TABLE.circleCases))('panel reference: a circle is built by equal sides and a radius: %s', (_name, row) => {
    const img = drawImage({}, { width: row.expect.width, height: row.expect.height, radius: row.expect.radius === 'pill' ? 'pill' : row.expect.radius })
    expect(img.style.width).toBe(img.style.height)
    expect(img.style.borderRadius).toBe(row.expect.radius === 'pill' ? 'var(--product-radius-pill)' : `${String(row.expect.radius)}px`)
  })
})

/* ──────────────────────────────── app bar ──────────────────────────────── */

describe('app bar: three zones', () => {
  it.each(named(TABLE.appBarCases))('function: %s', (_name, row) => {
    const zones = appBarZones({ width: row.width, showBack: row.showBack, backSide: TABLE.tokens.backSide, actionSides: row.actionSides, gap: TABLE.tokens.gap, actionGap: TABLE.tokens.actionGap, titleNatural: row.titleNatural })
    for (const key of ['leading', 'trailing', 'titleRoom', 'titleWidth', 'titleStart'] as const) expect(zones[key], key).toBeCloseTo(row.expect[key], 6)
    expect(zones.centered).toBe(row.expect.centered)
    expect(zones.truncated).toBe(row.expect.truncated)
    expect(zones.actionStarts.map((start) => Math.round(start * 1e6) / 1e6)).toEqual([...row.expect.actionStarts])
  })

  it.each(named(TABLE.appBarCases.filter((row) => row.rtlLeft !== undefined)))('right to left: offsets from the left edge: %s', (_name, row) => {
    const left = row.rtlLeft
    if (left === undefined) return
    if (row.showBack) expect(row.width - 0 - TABLE.tokens.backSide).toBeCloseTo(left.back!, 6)
    expect(row.width - row.expect.titleStart - row.expect.titleWidth).toBeCloseTo(left.title, 6)
    expect(row.expect.actionStarts.map((start, index) => row.width - start - (row.actionSides[index] ?? 0))).toEqual([...left.actions])
  })

  it.each(named(TABLE.appBarCases))('real screen: %s', (_name, row) => {
    const actions = row.actionSides.map((_side, index) => iconButton(`act-${String(index)}`))
    const bar = appBar('bar', { showBack: row.showBack }, actions)
    const view = render(<HotlayoutScreen document={documentOf([page('a', [bar, text('t', 'body')])])} onReport={quiet} />)
    const header = view.container.querySelector<HTMLElement>('header')!
    const [leading, title, trailing] = [...header.children] as HTMLElement[]
    // Three zones in reading order; the grid gives the side columns equal shares, so the title is in the CENTRE of the APP BAR.
    expect(header.style.gridTemplateColumns).toBe('minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr)')
    expect(leading?.getAttribute('data-hl-zone')).toBe('leading')
    expect(title?.getAttribute('data-hl-zone')).toBe('title')
    expect(trailing?.getAttribute('data-hl-zone')).toBe('trailing')
    // The arrow exists only with `showBack`; the `sm` gap only goes into a zone with content.
    expect(leading?.querySelectorAll('button')).toHaveLength(row.showBack ? 1 : 0)
    expect(leading?.style.paddingInlineEnd).toBe(row.showBack ? 'var(--product-space-sm)' : '')
    // Actions are icon buttons in document order; the gap between them is `xs`.
    expect(trailing?.querySelectorAll('[data-hl-type="IconButton"]')).toHaveLength(row.actionSides.length)
    expect(trailing?.style.paddingInlineStart).toBe(row.actionSides.length > 0 ? 'var(--product-space-sm)' : '')
    expect(trailing?.style.gap).toBe('var(--product-space-xs)')
    // There is no counterweight.
    expect(header.children).toHaveLength(3)
    expect(trailing?.children).toHaveLength(row.actionSides.length)
    expect(leading?.children).toHaveLength(row.showBack ? 1 : 0)
    expect(title?.style.textAlign).toBe('center')
  })

  it('an action hidden by a condition takes no space: the app bar zone is computed from the visible ones', () => {
    const hidden = iconButton('gone', { visibleIf: { path: 'x.never', op: 'isTrue' } as never })
    const view = render(<HotlayoutScreen document={documentOf([page('a', [appBar('bar', { showBack: true }, [hidden, iconButton('kept')])])])} onReport={quiet} />)
    const trailing = view.container.querySelector<HTMLElement>('[data-hl-zone="trailing"]')!
    expect(trailing.querySelectorAll('[data-hl-type="IconButton"]')).toHaveLength(1)
    cleanup()
    const alone = render(<HotlayoutScreen document={documentOf([page('a', [appBar('bar', { showBack: true }, [hidden])])])} onReport={quiet} />)
    // All actions are hidden: the zone is empty and has no gap.
    expect(alone.container.querySelector<HTMLElement>('[data-hl-zone="trailing"]')!.style.paddingInlineStart).toBe('')
  })

  /*
   * The reader draws at most two actions: the first two VISIBLE ones in document order. The title
   * space is computed from those that are drawn.
   */
  it.each(named(TABLE.appBarDrawnCases))('function: %s', (_name, row) => {
    const drawn = appBarDrawnActions(row.visible)
    expect([...drawn]).toEqual([...row.expect.drawn])
    const zones = appBarZones({ width: row.width, showBack: row.showBack, backSide: TABLE.tokens.backSide, actionSides: drawn.filter(Boolean).map(() => row.actionSide), gap: TABLE.tokens.gap, actionGap: TABLE.tokens.actionGap, titleNatural: row.titleNatural })
    expect(zones.titleRoom).toBeCloseTo(row.expect.titleRoom, 6)
  })

  it.each(named(TABLE.appBarDrawnCases))('real screen: %s', (_name, row) => {
    const actions = row.visible.map((visible, index) => iconButton(`act-${String(index)}`, visible ? {} : { visibleIf: { path: 'x.never', op: 'isTrue' } as never }))
    const view = render(<HotlayoutScreen document={documentOf([page('a', [appBar('bar', { showBack: row.showBack }, actions)])])} onReport={quiet} />)
    const drawnIds = [...view.container.querySelectorAll('[data-hl-zone="trailing"] [data-hl-type="IconButton"]')].map((button) => button.getAttribute('data-hl-node'))
    expect(drawnIds).toEqual(row.expect.drawn.flatMap((drawn, index) => (drawn ? [`act-${String(index)}`] : [])))
  })

  it('the app bar does not draw a child of another type (appBarChildren)', () => {
    const view = render(<HotlayoutScreen document={documentOf([page('a', [appBar('bar', {}, [iconButton('act'), text('stray', 'stray text')])])])} onReport={quiet} />)
    expect(view.container.querySelectorAll('[data-hl-type="IconButton"]')).toHaveLength(1)
    expect(view.container.textContent).not.toContain('stray text')
  })

  it('right to left the grid follows the root direction: the leading zone is the first column, actions the last', () => {
    const view = render(<HotlayoutScreen document={documentOf([page('a', [appBar('bar', { showBack: true }, [iconButton('first'), iconButton('second')])])])} dir="rtl" onReport={quiet} />)
    expect(view.container.firstElementChild?.getAttribute('dir')).toBe('rtl')
    const trailing = view.container.querySelector<HTMLElement>('[data-hl-zone="trailing"]')!
    // The first document action is first in reading order, i.e. first in the DOM: the grid in RTL puts it further right.
    expect([...trailing.querySelectorAll('[data-hl-type="IconButton"]')].map((button) => button.getAttribute('data-hl-node'))).toEqual(['first', 'second'])
    expect(view.container.querySelector<HTMLElement>('[data-hl-zone="leading"]')!.style.justifySelf).toBe('start')
  })
})

/* ─────────────────────────── screen anatomy ─────────────────────────── */

describe('screen anatomy: the app bar zone and the body', () => {
  it.each(named(TABLE.screenAppBarCases))('function: %s', (_name, row) => {
    const children = row.children.map((type) => ({ type }))
    const found = screenAppBarOf(children)
    expect(found === undefined ? null : children.indexOf(found)).toBe(row.expect)
  })

  it.each(named(TABLE.screenAppBarCases))('real screen: %s', (_name, row) => {
    const children = row.children.map((type, index) => {
      const extra: Partial<UiNode> = row.hidden?.[index] === true ? { visibleIf: { path: 'x.never', op: 'isTrue' } as never } : {}
      return type === 'AppBar' ? appBar(`c${String(index)}`, {}, [], extra) : node(`c${String(index)}`, type, type === 'Text' ? { content: lit(`t${String(index)}`), style: 'bodyM' } : {}, extra)
    })
    const view = render(<HotlayoutScreen document={documentOf([page('a', children)])} scroll="screen" onReport={quiet} />)
    const zone = view.container.querySelector('[data-hl-zone="appBar"]')
    const hasZone = row.expect !== null && (row.zoneNow ?? true)
    expect(zone !== null).toBe(hasZone)
    // An app bar that is not first by the document is an ordinary body child.
    const barsInBody = view.container.querySelectorAll('[data-hl-zone="body"] header')
    const allBars = row.children.filter((type, index) => type === 'AppBar' && row.hidden?.[index] !== true).length
    expect(barsInBody.length + (hasZone ? 1 : 0)).toBe(allBars)
  })

  it.each(named(TABLE.zoneCases))('function: %s', (_name, row) => {
    const result = screenZonesOf({ height: row.height, shrink: row.shrink, appBarHeight: row.appBarHeight, padding: row.padding, gap: row.gap, bodyContentHeight: row.bodyContentHeight, firstPull: row.firstPull, scrollTop: row.scrollTop })
    // These rows have no bottom zone (it has its own table, `bottom-zone-cases.json`): the other numbers are by equality.
    const { bottom, ...rest } = result
    expect(bottom).toBeNull()
    expect(rest).toEqual(row.expect)
  })

  /*
   * Markup: the app bar is a zone outside scrolling, the body is the only scroll, the root padding is
   * divided (the app bar gets the top and sides; the body gets the sides, the bottom and the screen
   * gap instead of the top; with no app bar the body gets all four, inside the scroll).
   */
  it.each(named(TABLE.zoneCases))('real screen: %s', (_name, row) => {
    const style = { padding: { top: row.padding.top, bottom: row.padding.bottom, start: 0, end: 0 } }
    const children: UiNode[] = [...(row.appBarHeight === undefined ? [] : [appBar('bar')]), ...(row.bodyContentHeight === undefined ? [] : [text('t', 'body')])]
    const view = render(
      <HotlayoutScreen document={documentOf([page('a', children, {}, { style })])} scroll="screen" onReport={quiet} />,
    )
    const root = view.container.querySelector<HTMLElement>('[data-hl-type="Screen"]')!
    const bar = root.querySelector<HTMLElement>(':scope > [data-hl-zone="appBar"]')
    const body = root.querySelector<HTMLElement>(':scope > [data-hl-zone="body"]')!
    expect(bar !== null).toBe(row.expect.appBar !== null)
    // Only the body scrolls, and only vertically; the app bar is outside scrolling.
    expect(body.style.overflowY).toBe('auto')
    expect(body.style.overflowX).toBe('hidden')
    expect(bar?.style.overflowY ?? '').toBe('')
    if (bar !== null) expect(bar.style.flex).toBe('0 0 auto')
    // The root padding is taken off the root and lies on the body content (inside the scroll).
    expect(root.style.padding).toBe('')
    expect(root.style.paddingBlockStart).toBe('')
    const content = body.firstElementChild as HTMLElement
    expect(content.style.paddingBlockEnd).not.toBe('')
    if (bar !== null) {
      expect(bar.style.paddingBlockStart).not.toBe('')
      // Under the app bar the body top padding is the screen GAP, not the root padding (and an empty body has none).
      expect(content.style.paddingBlockStart).toBe(row.bodyContentHeight === undefined ? '' : 'var(--product-space-sm)')
    } else {
      expect(content.style.paddingBlockStart).not.toBe('')
    }
    // A modal layer as tall as its content: the root and body shrink instead of stretching.
    expect(root.style.minBlockSize).toBe('0px')
  })

  it.each(named(TABLE.screenRuleCases))('data rule: %s', (_name, row) => {
    const value = row.rule.split('.').reduce<unknown>((place, key) => (place as Record<string, unknown>)[key], SCREEN_ANATOMY)
    expect(value).toBe(row.expect)
  })

  it.each(named(TABLE.modalRuleCases))('layer rule: %s', (_name, row) => {
    expect(MODAL_LAYER_RULES[row.rule as keyof typeof MODAL_LAYER_RULES]).toBe(row.expect)
  })

  it('the background does not scroll: a root with a background carries it, scrolling is inside', () => {
    const root: Partial<UiNode> = { style: { background: { kind: 'color', color: 'primary' } } } as never
    const view = render(<HotlayoutScreen document={documentOf([page('a', [appBar('bar'), text('t', 'body')], {}, root)])} scroll="screen" onReport={quiet} />)
    const screenRootEl = view.container.querySelector<HTMLElement>('[data-hl-type="Screen"]')!
    expect(screenRootEl.style.backgroundColor).not.toBe('')
    // Scrolling is on the body, not the root: the background lies under all zones.
    expect(screenRootEl.style.overflowY).toBe('')
    expect(screenRootEl.querySelector<HTMLElement>('[data-hl-zone="body"]')!.style.overflowY).toBe('auto')
    expect(screenRootEl.querySelector<HTMLElement>('[data-hl-zone="body"]')!.style.backgroundColor).toBe('')
  })
})

describe('a screen without its own height: the host decides (screenRuleCases "withoutOwnHeight")', () => {
  const root: Partial<UiNode> = { style: { background: { kind: 'color', color: 'primary' }, padding: { top: 'md', bottom: 'md', start: 'md', end: 'md' } } } as never
  const draw = (extra: Record<string, unknown> = {}): HTMLElement => {
    const view = render(<HotlayoutScreen document={documentOf([page('a', [appBar('bar'), text('t', 'body')], {}, root)])} onReport={quiet} {...extra} />)
    return view.container.querySelector<HTMLElement>('[data-hl-type="Screen"]')!
  }

  it('by default the block grows, the page scrolls, the app bar sticks and puts the root background under itself', () => {
    const rootEl = draw()
    const bar = rootEl.querySelector<HTMLElement>('[data-hl-zone="appBar"]')!
    expect(bar.style.position).toBe('sticky')
    expect(bar.style.insetBlockStart).toBe('0px')
    // The root background lies on a BACKING at the root size, not on the zone itself: the same declaration as on the root.
    expect(bar.style.backgroundColor).toBe('')
    expect(bar.style.backgroundImage).toBe('')
    const backdrop = bar.querySelector<HTMLElement>('[data-hl-backdrop] > div')!
    expect(backdrop.style.backgroundColor).toBe(rootEl.style.backgroundColor)
    expect(backdrop.style.backgroundColor).not.toBe('')
    // There is no own scrolling anywhere: neither on the root nor on the body.
    for (const element of [rootEl, ...rootEl.querySelectorAll<HTMLElement>('[data-hl-zone]')]) expect(element.style.overflowY, element.getAttribute('data-hl-zone') ?? 'root').toBe('')
    // The padding is divided here too: the root does not carry it.
    expect(rootEl.style.padding).toBe('')
  })

  it('a root without a background gives a transparent zone', () => {
    const view = render(<HotlayoutScreen document={documentOf([page('a', [appBar('bar'), text('t', 'body')])])} onReport={quiet} />)
    const bar = view.container.querySelector<HTMLElement>('[data-hl-zone="appBar"]')!
    expect(bar.style.position).toBe('sticky')
    expect(bar.style.backgroundColor).toBe('')
    expect(bar.style.backgroundImage).toBe('')
  })

  it('chrome="static": the app bar stays the top row and scrolls with the page', () => {
    const bar = draw({ chrome: 'static' }).querySelector<HTMLElement>('[data-hl-zone="appBar"]')!
    expect(bar.style.position).toBe('')
    expect(bar.style.backgroundColor).toBe('')
  })

  it('stickyOffset: a number is pixels, a string is a length or a host variable; anything else is ignored', () => {
    expect(draw({ stickyOffset: 56 }).querySelector<HTMLElement>('[data-hl-zone="appBar"]')!.style.insetBlockStart).toBe('56px')
    cleanup()
    expect(draw({ stickyOffset: '3.5rem' }).querySelector<HTMLElement>('[data-hl-zone="appBar"]')!.style.insetBlockStart).toBe('3.5rem')
    cleanup()
    expect(draw({ stickyOffset: 'var(--site-header)' }).querySelector<HTMLElement>('[data-hl-zone="appBar"]')!.style.insetBlockStart).toBe('var(--site-header)')
    cleanup()
    for (const bad of ['0;position:fixed', 'url(x)', 'calc(1px + 2px)', {}, NaN, null]) {
      expect(draw({ stickyOffset: bad }).querySelector<HTMLElement>('[data-hl-zone="appBar"]')!.style.insetBlockStart, JSON.stringify(bad)).toBe('0px')
      cleanup()
    }
  })

  it('scroll="screen": zones apply literally, the app bar stays, the body scrolls; chrome and stickyOffset do not apply', () => {
    const rootEl = draw({ scroll: 'screen', chrome: 'sticky', stickyOffset: 56 })
    const bar = rootEl.querySelector<HTMLElement>('[data-hl-zone="appBar"]')!
    expect(bar.style.position).toBe('')
    expect(bar.style.flex).toBe('0 0 auto')
    expect(rootEl.querySelector<HTMLElement>('[data-hl-zone="body"]')!.style.overflowY).toBe('auto')
  })
})

/* ───────────────────────────── modal layer ───────────────────────────── */

function modalDocument(placement: Record<string, unknown>, extraModal: UiNode[] = [text('m', 'window text')], rootExtra: Partial<UiNode> = {}): UiDocument {
  const go = node('go', 'Button', { label: lit('open'), variant: 'primary', fullWidth: false, action: { type: 'navigate', params: { screenId: 'layer' } } })
  return documentOf([page('a', [go]), page('layer', extraModal, { presentation: 'modal', ...placement }, rootExtra)])
}

describe('modal layer: sheet and window', () => {
  it.each(named(TABLE.placementCases))('function: %s', (_name, row) => {
    expect(modalPlacementOf('value' in row ? row.value : undefined)).toBe(row.expect)
  })

  it.each(named(TABLE.placementCases))('real screen: %s', (_name, row) => {
    const view = render(<HotlayoutScreen document={modalDocument('value' in row ? { modalPlacement: row.value } : {})} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const layer = view.container.querySelector<HTMLElement>('[data-hl-presentation="modal"]')!
    expect(layer.getAttribute('data-hl-placement')).toBe(row.expect)
  })

  it.each(named(TABLE.modalCases))('function: %s', (_name, row) => {
    const box = modalBoxOf({ placement: row.placement, viewport: row.viewport, contentHeight: row.contentHeight, margin: row.margin })
    expect(box).toEqual(row.expect)
  })

  /*
   * CSS computes the layout: a sheet spans the whole area width and is pressed to the bottom; a window
   * is the area minus the `xl` padding on each side, no wider than 400, centred on both axes. The
   * markup must carry exactly these conditions.
   */
  it.each(named(TABLE.modalCases))('real screen: %s', (_name, row) => {
    const view = render(<HotlayoutScreen document={modalDocument(row.placement === undefined ? {} : { modalPlacement: row.placement })} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const layer = view.container.querySelector<HTMLElement>('[data-hl-presentation="modal"]')!
    const sheet = layer.querySelector<HTMLElement>('[role="dialog"]')!
    // Alignment lies on the layer AREA: for a growing block this is its visible part.
    const area = layer.querySelector<HTMLElement>('[data-hl-layer-area]')!
    if (modalPlacementOf(row.placement) === 'center') {
      expect(area.style.alignItems).toBe('center')
      expect(area.style.justifyContent).toBe('center')
      expect(area.style.padding).toBe('var(--product-space-xl)')
      expect(sheet.style.maxInlineSize).toBe('400px')
      expect(sheet.style.inlineSize).toBe('100%')
    } else {
      expect(area.style.justifyContent).toBe('flex-end')
      expect(area.style.padding).toBe('')
      expect(sheet.style.maxInlineSize).toBe('')
    }
    // Height by content, not taller than available; the BODY scrolls, not the sheet itself.
    expect(sheet.style.maxBlockSize).toBe('100%')
    expect(sheet.style.overflowY).toBe('')
  })

  it.each(named(TABLE.modalAreaCases))('the area is the one the host gave the screen: %s', (_name, row) => {
    // The host placed the reader in an area between strips; the window is centred in IT.
    const area = { x: 0, y: row.insets.top, width: row.frame.width, height: row.frame.height - row.insets.top - row.insets.bottom }
    expect(area).toEqual(row.area)
    const box = modalBoxOf({ placement: 'center', viewport: area, contentHeight: row.contentHeight, margin: row.margin })
    expect({ x: box.x, y: area.y + box.y, width: box.width, height: box.height, centerY: area.y + box.y + box.height / 2 }).toEqual(row.expect)
    // The package adds no safe area: the layer takes the WHOLE root the host gave (`inset: 0`) and has no own insets from the edges.
    const view = render(<HotlayoutScreen document={modalDocument({ modalPlacement: 'center' })} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const layer = view.container.querySelector<HTMLElement>('[data-hl-presentation="modal"]')!
    expect(layer.style.inset).toBe('0px')
    expect(layer.style.position).toBe('absolute')
    const scrim = layer.querySelector<HTMLElement>('[data-hl-scrim]')!
    expect(scrim.style.inset).toBe('0px')
    expect(scrim.style.backgroundColor).toBe('rgba(0, 0, 0, 0.45)')
  })

  /*
   * Every stack layer is its own stacking context, and the layer area in a block that grows with
   * the page is the block's VISIBLE part: a sticky area as tall as `min(window, block)` inside the root,
   * WITHOUT `position: fixed` (the root clips content, which is the trust boundary). In
   * `scroll="screen"` it is the whole block.
   */
  it('every stack layer is its own stacking context; the scrim covers the whole block', () => {
    const view = render(<HotlayoutScreen document={modalDocument({ modalPlacement: 'center' }, [text('m', 'x')])} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    for (const layer of view.container.querySelectorAll<HTMLElement>('[data-hl-screen]')) expect(layer.style.isolation, layer.getAttribute('data-hl-presentation') ?? '').toBe('isolate')
    expect(view.container.querySelector<HTMLElement>('[data-hl-scrim]')!.style.inset).toBe('0px')
  })

  it('scroll="page": the layer area is sticky, no taller than the window and the block, and without position: fixed', () => {
    const view = render(<HotlayoutScreen document={modalDocument({ modalPlacement: 'center' }, [text('m', 'x')])} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const area = view.container.querySelector<HTMLElement>('[data-hl-layer-area]')!
    expect(area.getAttribute('data-hl-layer-area')).toBe('visible')
    expect(area.style.position).toBe('sticky')
    expect(area.style.insetBlockStart).toBe('0px')
    // Without measurement (server, first frame) it is `min(window, block)`; a measurement substitutes a more precise height of the visible part.
    expect(area.style.blockSize).toBe('var(--hl-visible-h, min(100dvh, 100%))')
    expect(view.container.innerHTML).not.toMatch(/position:\s*fixed/)
    // The package root clips and keeps content inside: this is not weakened.
    const rootEl = view.container.firstElementChild as HTMLElement
    expect(rootEl.style.overflow).toBe('clip')
    expect(rootEl.style.contain).toBe('layout paint')
  })

  it('scroll="screen": the layer area is the whole block', () => {
    const view = render(<HotlayoutScreen document={modalDocument({ modalPlacement: 'bottom' }, [text('m', 'x')])} scroll="screen" onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const area = view.container.querySelector<HTMLElement>('[data-hl-layer-area]')!
    expect(area.getAttribute('data-hl-layer-area')).toBe('block')
    expect(area.style.position).toBe('absolute')
    expect(area.style.inset).toBe('0px')
  })

  it('the layer has no built-in look: no background, radius or shadow (modalLayerLook)', () => {
    for (const placement of [{}, { modalPlacement: 'center' }]) {
      const view = render(<HotlayoutScreen document={modalDocument(placement)} onReport={quiet} />)
      fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
      const sheet = view.container.querySelector<HTMLElement>('[role="dialog"]')!
      for (const key of ['backgroundColor', 'backgroundImage', 'borderRadius', 'boxShadow'] as const) expect(sheet.style[key], key).toBe('')
      cleanup()
    }
  })

  it('the layer look is the screen root style: the root background shows, a root without a background is transparent', () => {
    const view = render(<HotlayoutScreen document={modalDocument({}, [text('m', 'x')], { style: { background: { kind: 'color', color: 'primary' }, radius: 'md' } } as never)} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const rootEl = view.container.querySelector<HTMLElement>('[data-hl-presentation="modal"] [data-hl-type="Screen"]')!
    expect(rootEl.style.backgroundColor).not.toBe('')
    expect(rootEl.style.borderRadius).not.toBe('')
    // The root radius clips the moving body (`overflow: clip` does not cut the root own shadow).
    expect(rootEl.style.overflow).toBe('clip')
  })

  it('the layer app bar stays, the layer BODY scrolls (modalOverflow)', () => {
    const view = render(<HotlayoutScreen document={modalDocument({ modalPlacement: 'center' }, [appBar('layer-bar'), text('m', 'x')])} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const rootEl = view.container.querySelector<HTMLElement>('[data-hl-presentation="modal"] [data-hl-type="Screen"]')!
    expect(rootEl.style.flex).toBe('0 1 auto')
    expect(rootEl.querySelector<HTMLElement>(':scope > [data-hl-zone="appBar"]')).not.toBeNull()
    const body = rootEl.querySelector<HTMLElement>(':scope > [data-hl-zone="body"]')!
    expect(body.style.overflowY).toBe('auto')
    expect(body.style.flex).toBe('0 1 auto')
    expect(body.style.minBlockSize).toBe('0px')
  })

  it('a touch outside, Esc and the system "back" are navigate.back (modalDismiss)', () => {
    const calls: string[] = []
    const view = render(<HotlayoutScreen document={modalDocument({ modalPlacement: 'center' })} onNavigate={(event) => (calls.push(event.kind), undefined)} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    fireEvent.click(view.container.querySelector('[data-hl-scrim]')!)
    expect(view.container.querySelector('[data-hl-presentation="modal"]')).toBeNull()
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    fireEvent.keyDown(view.container.querySelector('[role="dialog"]')!, { key: 'Escape' })
    expect(view.container.querySelector('[data-hl-presentation="modal"]')).toBeNull()
    expect(calls).toEqual(['push', 'back', 'push', 'back'])
  })

  it('a window is a modal layer: it inherits the record of the screen under it, focus is in the layer, what is below is inert (the same dialog)', () => {
    const view = render(<HotlayoutScreen document={modalDocument({ modalPlacement: 'center' })} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const dialog = view.container.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('layer')
    expect(view.container.querySelector('[data-hl-presentation="page"]')?.hasAttribute('inert')).toBe(true)
  })

  it('the package does not change a layer height depending on another layer content: a sheet without the field is the same as `bottom`', () => {
    const a = render(<HotlayoutScreen document={modalDocument({})} onReport={quiet} />)
    fireEvent.click(a.container.querySelector('[data-hl-node="go"]')!)
    const noField = a.container.querySelector<HTMLElement>('[data-hl-presentation="modal"]')!.getAttribute('style')
    cleanup()
    const b = render(<HotlayoutScreen document={modalDocument({ modalPlacement: 'bottom' })} onReport={quiet} />)
    fireEvent.click(b.container.querySelector('[data-hl-node="go"]')!)
    expect(b.container.querySelector<HTMLElement>('[data-hl-presentation="modal"]')!.getAttribute('style')).toBe(noField)
  })
})

/* ───────────────────────────── status bar ───────────────────────────── */

describe('status bar: a request, not an action', () => {
  it.each(named(TABLE.statusBarCases))('function: %s', (_name, row) => {
    expect(statusBarIconsOf('value' in row ? row.value : undefined) ?? null).toBe(row.expect)
  })

  it.each(named(TABLE.statusBarCases))('real screen: the request goes in onScreenChange only when named: %s', (_name, row) => {
    const events: Record<string, unknown>[] = []
    render(<HotlayoutScreen document={documentOf([page('a', [text('t', 'x')], 'value' in row ? { statusBarIcons: row.value } : {})])} onScreenChange={(event) => events.push({ ...event })} onReport={quiet} />)
    expect(events).toHaveLength(1)
    expect('statusBarIcons' in (events[0] ?? {})).toBe(row.expect !== null)
    if (row.expect !== null) expect(events[0]?.statusBarIcons).toBe(row.expect)
  })

  it('the reader touches nothing system-level: no <meta name="theme-color"> and no change outside the root', () => {
    const before = document.head.innerHTML
    const view = render(<HotlayoutScreen document={documentOf([page('a', [text('t', 'x')], { statusBarIcons: 'light' })])} onReport={quiet} />)
    expect(document.head.innerHTML).toBe(before)
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull()
    expect(renderToStaticMarkup(<HotlayoutScreen document={documentOf([page('a', [text('t', 'x')], { statusBarIcons: 'light' })])} />)).not.toContain('theme-color')
    view.unmount()
  })
})

/* ────────────────────────────── documents ────────────────────────────── */

describe('table documents: validator reference; the reader draws what it read', () => {
  it.each(named(TABLE.documentCases))('%s', (_name, row) => {
    const screens = row.screens.map((entry) => {
      const { id, ...rest } = entry
      const children: UiNode[] = [text(`t-${String(id)}`, `text of ${String(id)}`)]
      if (entry.id === 'a' && row.appBarChildren !== undefined) {
        const kids = (row.appBarChildren ?? []).map((type, index) => (type === 'IconButton' ? iconButton(`ib${String(index)}`) : type === 'Text' ? text(`tx${String(index)}`, 'stray') : node(`bt${String(index)}`, type, { label: lit('b'), variant: 'primary', fullWidth: false, action: { type: 'none' } })))
        children.unshift(appBar('bar', {}, kids))
      }
      return page(String(id), children, rest)
    })
    const errors: unknown[] = []
    const view = render(<HotlayoutScreen document={documentOf(screens)} onReport={(report) => (report.kind === 'render-error' ? errors.push(report) : undefined)} />)
    expect(errors).toEqual([])
    // What is drawn: the first screen is always a page (even if the document named it modal).
    expect(view.container.querySelector('[data-hl-presentation="page"]')).not.toBeNull()
  })
})

/* ──────────────────────────── show event ──────────────────────────── */

describe('show event: optional fields key for key', () => {
  it.each(named(TABLE.shownCases))('function: %s', (_name, row) => {
    const event = screenShownEvent({ documentId: 'd', entry: null }, row.stack, row.transition)
    expect(event).toEqual(row.expect)
    // The event cannot have an extra key, even with the value undefined.
    expect(Object.keys(event ?? {}).sort()).toEqual(Object.keys(row.expect).sort())
  })

  it('real screen: a window is shown and closed, the events are key for key', () => {
    const events: Record<string, unknown>[] = []
    const doc = documentOf([page('a', [node('go', 'Button', { label: lit('open'), variant: 'primary', fullWidth: false, action: { type: 'navigate', params: { screenId: 'done' } } })], { statusBarIcons: 'light' }), page('done', [text('t', 'x')], { presentation: 'modal', modalPlacement: 'center' })], { documentId: 'd' })
    const view = render(<HotlayoutScreen document={doc} onScreenChange={(event) => events.push({ ...event })} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    fireEvent.click(view.container.querySelector('[data-hl-scrim]')!)
    expect(events.map((event) => Object.keys(event).sort())).toEqual([
      ['cause', 'depth', 'documentId', 'entry', 'name', 'presentation', 'record', 'screenId', 'statusBarIcons'],
      ['cause', 'depth', 'documentId', 'entry', 'modalPlacement', 'name', 'presentation', 'record', 'screenId'],
      ['cause', 'depth', 'documentId', 'entry', 'name', 'presentation', 'record', 'screenId', 'statusBarIcons'],
    ])
    expect(events[1]).toMatchObject({ presentation: 'modal', modalPlacement: 'center', cause: 'forward', depth: 2 })
    expect(events[2]).toMatchObject({ screenId: 'a', cause: 'back', statusBarIcons: 'light' })
  })
})

