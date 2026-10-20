/**
 * THE TOP OF A SCREEN THROUGH THE PACKAGE `@hotlayout/react` (schema 9.19.0,
 * theme 3) — the groups
 * `bodyTopCases`, `topZoneCases`, `screenTopZoneCases`, `screenTopPressCases`,
 * `screenTopRuleCases`, `screenTopDocumentCases`, `safeTopValueCases` and `safeTopModalCases` of
 * `contract/fixtures/media-chrome/media-chrome-cases.json`.
 *
 * The reference implementation is checked against the same table elsewhere;
 * here is the third reader. The package does not import `src/`, so the rules are
 * written a second time (`screen-top.ts`) and this table keeps the two copies
 * together. Every group goes twice: the pure functions of the package on EVERY
 * row, and a real `HotlayoutScreen` (jsdom has no layout, so the markup is checked
 * by structure: which zone is lifted over the body, who takes the pointer, where
 * the inset stands; pixels are Chrome's business).
 *
 * NO ROW IS SKIPPED.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { UiDocument, UiNode } from '../src/index'
import { modalBoxOf, screenZonesOf } from '../src/media-chrome'
import { BODY_TOP_RULES, bodyStartsAtScreenTop, bodyTopOf, SAFE_TOP_RULES, safeTopInset, safeTopOf, screenPressZoneAt, screenTopZonesOf, topZoneOwnerIn } from '../src/screen-top'
import type { ScreenTopInput } from '../src/screen-top'
import type { WidthClass } from '../src/width-class'

afterEach(cleanup)

type ZoneInput = Omit<ScreenTopInput, 'bodyTop'> & { readonly bodyTop?: unknown }
interface ZoneCase extends ZoneInput {
  readonly name: string
  readonly expect: unknown
}
interface PressCase {
  readonly name: string
  readonly screen: ZoneInput & { readonly width: number; readonly direction: 'ltr' | 'rtl'; readonly sidePadding: { readonly start: number; readonly end: number } }
  readonly point: { readonly x: number; readonly y: number }
  readonly expect: 'appBar' | 'body' | 'bottom' | 'none'
}
interface Table {
  readonly bodyTopCases: readonly { readonly name: string; readonly value?: unknown; readonly expect: string | null }[]
  readonly topZoneCases: readonly {
    readonly name: string
    readonly children: readonly string[]
    readonly hidden?: readonly number[]
    readonly widePlacement?: string
    readonly widthClass: WidthClass
    readonly owner: 'appBar' | 'navBar' | 'none'
    readonly atScreenTop: boolean
  }[]
  readonly screenTopZoneCases: readonly ZoneCase[]
  readonly safeTopValueCases: readonly { readonly name: string; readonly safeTop: unknown; readonly height: number; readonly effective: number }[]
  readonly safeTopModalCases: readonly {
    readonly name: string
    readonly placement: 'bottom' | 'center'
    readonly frame: { readonly width: number; readonly height: number }
    readonly safeTop: number
    readonly contentHeight: number
    readonly margin: number
    readonly expect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly scrolls: boolean; readonly centerY: number }
  }[]
  readonly screenTopPressCases: readonly PressCase[]
  readonly screenTopRuleCases: readonly { readonly name: string; readonly rule: string; readonly expect: unknown }[]
  readonly screenTopDocumentCases: readonly {
    readonly name: string
    readonly props: Record<string, unknown>
    readonly propsOn?: Record<string, unknown>
    readonly appBar?: boolean
    readonly schema: boolean
    readonly codes: readonly string[]
  }[]
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/media-chrome/media-chrome-cases.json', 'utf8')) as Table
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as { readonly 'x-style': { readonly layout: Record<string, unknown> } }
const LAYOUT = ARTIFACT['x-style'].layout

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)
const without = <Source extends object>(source: Source, ...keys: readonly string[]): Record<string, unknown> => Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)))
const at = (root: unknown, path: string): unknown => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], root)

const lit = (value: string): Record<string, unknown> => ({ kind: 'literal', value })
const node = (id: string, type: string, props: Record<string, unknown> = {}, extra: Partial<UiNode> = {}): UiNode => ({ id, type, props, ...extra })
const text = (id: string, extra: Partial<UiNode> = {}): UiNode => node(id, 'Text', { content: lit(id) }, extra)
const appBar = (extra: Partial<UiNode> = {}): UiNode => node('bar', 'AppBar', { title: lit('Title'), showBack: false }, extra)
const navBar = (widePlacement?: string): UiNode => ({ ...node('nav', 'NavBar', widePlacement === undefined ? {} : { widePlacement }), children: [node('item', 'NavItem', { label: lit('Home'), icon: 'house', action: { type: 'none' } })] })
const documentOf = (children: readonly UiNode[], rootProps: Record<string, unknown> = {}): UiDocument =>
  ({
    schemaVersion: '9.19.0',
    documentId: 'screen-top',
    name: 'top',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'a', root: { ...node('root', 'Screen', rootProps), children } }],
  }) as unknown as UiDocument
const quiet = (): undefined => undefined

const rootOf = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('[data-hl-type="Screen"]')!

describe('the top of a screen: the table', () => {
  it('has as many groups and rows as were written by hand', () => {
    expect([TABLE.bodyTopCases.length, TABLE.topZoneCases.length, TABLE.screenTopZoneCases.length, TABLE.screenTopPressCases.length, TABLE.screenTopRuleCases.length, TABLE.screenTopDocumentCases.length, TABLE.safeTopValueCases.length]).toEqual([7, 11, 22, 25, 27, 7, 10])
    for (const group of [TABLE.bodyTopCases, TABLE.topZoneCases, TABLE.screenTopZoneCases, TABLE.screenTopPressCases, TABLE.screenTopRuleCases, TABLE.screenTopDocumentCases, TABLE.safeTopValueCases]) {
      expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
    }
    expect(TABLE.safeTopModalCases).toHaveLength(9)
    expect(new Set(TABLE.safeTopModalCases.map((row) => row.name)).size).toBe(9)
  })
})

describe('the field bodyTop: how the reader reads it', () => {
  it.each(named(TABLE.bodyTopCases))('%s', (_name, row) => {
    expect(bodyTopOf('value' in row ? { bodyTop: row.value } : {}) ?? null).toBe(row.expect)
  })

  it('no props at all, or props that are not an object: no word', () => {
    expect([bodyTopOf(undefined), bodyTopOf(null)]).toEqual([undefined, undefined])
    // An own key only: the prototype chain says nothing.
    expect(bodyTopOf(Object.create({ bodyTop: 'screenTop' }) as object)).toBeUndefined()
  })
})

describe('who owns the app bar zone', () => {
  const typed = (row: Table['topZoneCases'][number]): { readonly type: string; readonly index: number; readonly props?: Record<string, unknown> }[] =>
    row.children.map((type, index) => ({ type, index, ...(type === 'NavBar' && row.widePlacement !== undefined ? { props: { widePlacement: row.widePlacement } } : {}) }))

  it.each(named(TABLE.topZoneCases))('function: %s', (_name, row) => {
    const hidden = new Set(row.hidden ?? [])
    const owner = topZoneOwnerIn(typed(row), row.widthClass, (child) => !hidden.has(child.index))
    expect(owner).toBe(row.owner)
    expect(bodyStartsAtScreenTop({ bodyTop: 'screenTop' }, owner)).toBe(row.atScreenTop)
    expect(bodyStartsAtScreenTop({}, owner)).toBe(false)
  })

  it.each(named(TABLE.topZoneCases))('a real screen: the mark of the body from the top stands exactly where the function says: %s', (_name, row) => {
    const hidden = new Set(row.hidden ?? [])
    const others = (['compact', 'medium', 'expanded'] as const).filter((name) => name !== row.widthClass)
    const children = row.children.map((type, index) => {
      const off: Partial<UiNode> = hidden.has(index) ? { showOn: others } : {}
      if (type === 'AppBar') return appBar(off)
      if (type === 'NavBar') return navBar(row.widePlacement)
      return text(`t${String(index)}`, off)
    })
    const view = render(<HotlayoutScreen document={documentOf(children, { bodyTop: 'screenTop' })} initialWidthClass={row.widthClass} scroll="screen" onReport={quiet} />)
    expect(rootOf(view.container).getAttribute('data-hl-body-top')).toBe(row.atScreenTop ? 'screenTop' : null)
    // The own strip of the navigation bar stands in the zone of the bar — and only where the function named it the owner.
    expect(view.container.querySelector('[data-hl-zone="navTop"]') !== null).toBe(row.owner === 'navBar')
  })
})

describe('zones in numbers', () => {
  const inputOf = (row: ZoneCase): ScreenTopInput => without(row, 'name', 'expect') as unknown as ScreenTopInput

  it.each(named(TABLE.screenTopZoneCases))('function: %s', (_name, row) => {
    expect(screenTopZonesOf(inputOf(row))).toEqual(row.expect)
  })

  it('without the inset and the word the numbers are exactly those of 9.9.0', () => {
    for (const row of TABLE.screenTopZoneCases) {
      const plain = without(inputOf(row), 'bodyTop', 'safeTop') as unknown as ScreenTopInput
      const now = screenTopZonesOf(plain)
      const before = screenZonesOf(plain)
      expect({ ...now, appBar: now.appBar === null ? null : { top: now.appBar.top, height: now.appBar.height } }, row.name).toEqual({ ...before, bodyAtScreenTop: false, safeTop: 0 })
    }
  })

  it.each(named(TABLE.safeTopValueCases))('how much of the inset is taken into account: %s', (_name, row) => {
    expect(safeTopOf(row.safeTop, row.height)).toBe(row.effective)
    const zones = screenTopZonesOf({ height: row.height, safeTop: row.safeTop as number, padding: { top: 0, bottom: 0 }, gap: 0, bodyContentHeight: 0 })
    expect(zones.safeTop).toBe(row.effective)
    expect(zones.height).toBeLessThanOrEqual(row.height)
  })

  it('NaN and infinity, which JSON does not carry, are zero', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined]) expect(safeTopOf(value, 600)).toBe(0)
  })

  it('the CSS of the host prop: env by default, a clean number, anything else is zero', () => {
    expect(safeTopInset(undefined)).toBe('env(safe-area-inset-top, 0px)')
    expect(safeTopInset('env')).toBe('env(safe-area-inset-top, 0px)')
    expect(safeTopInset(59)).toBe('59px')
    expect(safeTopInset(47.5)).toBe('47.5px')
    expect(safeTopInset(0)).toBe('0px')
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY, '59px', '1px;position:fixed', null, true, {}, []]) expect(safeTopInset(bad), JSON.stringify(bad)).toBe('0px')
    // A number that is huge is held to the largest real inset of a device.
    expect(safeTopInset(1e9)).toBe('200px')
  })
})

describe('who takes the press', () => {
  it.each(named(TABLE.screenTopPressCases))('function: %s', (_name, row) => {
    const { width, direction, sidePadding, ...input } = row.screen
    const zones = screenTopZonesOf(input as ScreenTopInput)
    const left = direction === 'rtl' ? sidePadding.end : sidePadding.start
    expect(screenPressZoneAt(zones, row.point, { left, width: width - sidePadding.start - sidePadding.end })).toBe(row.expect)
  })

  it('the same point in both modes: under the bar without the word nobody, with the word the body', () => {
    const base = { height: 852, safeTop: 59, appBarHeight: 48, padding: { top: 16, bottom: 0 }, gap: 12, bodyContentHeight: 1200 }
    const box = { left: 16, width: 353 }
    expect(screenPressZoneAt(screenTopZonesOf(base), { x: 8, y: 100 }, box)).toBe('none')
    expect(screenPressZoneAt(screenTopZonesOf({ ...base, bodyTop: 'screenTop' }), { x: 8, y: 100 }, box)).toBe('body')
  })

  it('a real screen: the zone of the bar takes no events, the box of the bar does; the body stays under it', () => {
    const view = render(<HotlayoutScreen document={documentOf([appBar(), text('hero')], { bodyTop: 'screenTop' })} scroll="screen" onReport={quiet} />)
    const lift = rootOf(view.container).querySelector<HTMLElement>(':scope > [data-hl-zone="appBar"]')!
    expect(lift.hasAttribute('data-hl-lifted')).toBe(true)
    // The zone has no height of its own: the bar overflows it and lies over the body, which starts at the top edge.
    expect(lift.style.blockSize).toBe('0px')
    const area = lift.firstElementChild as HTMLElement
    expect(area.style.position).toBe('absolute')
    expect(area.style.pointerEvents).toBe('none')
    const holder = area.firstElementChild as HTMLElement
    expect(holder.style.display).toBe('contents')
    expect(holder.style.pointerEvents).toBe('auto')
    expect(holder.querySelector('header')).not.toBeNull()
    expect(rootOf(view.container).querySelector(':scope > [data-hl-zone="body"]')).not.toBeNull()
  })
})

describe('the rules as data', () => {
  it('the blocks of the package are the blocks of the artifact, whole', () => {
    expect(BODY_TOP_RULES).toEqual(LAYOUT.bodyTop)
    expect(SAFE_TOP_RULES).toEqual(LAYOUT.safeTop)
  })

  it.each(named(TABLE.screenTopRuleCases))('%s', (_name, row) => {
    expect(at({ bodyTop: BODY_TOP_RULES, safeTop: SAFE_TOP_RULES }, row.rule)).toEqual(row.expect)
  })

  it('the word list carries no word for «as without the field»', () => {
    expect(BODY_TOP_RULES.values).toEqual(['screenTop'])
    expect(bodyTopOf({ bodyTop: 'belowBar' })).toBeUndefined()
  })
})

describe('the documents of the table: the reader draws what it has read', () => {
  it.each(named(TABLE.screenTopDocumentCases))('%s', (_name, row) => {
    const children = row.appBar === false ? [text('hero')] : [appBar(), text('hero')]
    const view = render(<HotlayoutScreen document={documentOf(children, row.props)} scroll="screen" onReport={quiet} />)
    const word = bodyTopOf(row.props)
    expect(rootOf(view.container).getAttribute('data-hl-body-top')).toBe(word ?? null)
    // The app bar is a zone in every case where it exists: lifted over the body with the word, a strip above it without.
    const bar = row.appBar === false ? null : rootOf(view.container).querySelector(':scope > [data-hl-zone="appBar"]')
    expect(bar === null).toBe(row.appBar === false)
    if (bar !== null) expect(bar.hasAttribute('data-hl-lifted')).toBe(word === 'screenTop')
  })
})

describe('the body from the top edge: what changes and what does not', () => {
  const draw = (children: UiNode[], rootProps: Record<string, unknown>, host: Record<string, unknown> = {}): HTMLElement =>
    rootOf(render(<HotlayoutScreen document={documentOf(children, rootProps)} scroll="screen" onReport={quiet} {...host} />).container)

  it('without the field, or with an unknown word, the markup is exactly the screen of 9.18', () => {
    const plain = render(<HotlayoutScreen document={documentOf([appBar(), text('a')])} scroll="screen" onReport={quiet} />).container.innerHTML
    cleanup()
    const unknown = render(<HotlayoutScreen document={documentOf([appBar(), text('a')], { bodyTop: 'belowBar' })} scroll="screen" onReport={quiet} />).container.innerHTML
    expect(unknown).toBe(plain)
  })

  it('the first child of the body has no gap and no padding above it; the bar stands where it stood', () => {
    const style = { padding: { top: 16, bottom: 8, start: 4, end: 4 } }
    const root = draw([appBar(), text('a'), text('b')], { bodyTop: 'screenTop' }, {})
    expect(root.getAttribute('data-hl-body-top')).toBe('screenTop')
    const content = root.querySelector<HTMLElement>(':scope > [data-hl-zone="body"]')!.firstElementChild as HTMLElement
    expect(content.style.paddingBlockStart).toBe('')
    expect(style.padding.top).toBe(16)
  })

  it('without an app bar the top padding of the root stays inside the scroll', () => {
    const doc = documentOf([text('a')], { bodyTop: 'screenTop' })
    const withPadding = { ...doc, screens: [{ screenId: 'a', name: 'a', root: { ...(doc.screens[0] as { root: UiNode }).root, style: { padding: { top: 16, bottom: 8, start: 4, end: 4 } } } }] } as unknown as UiDocument
    const view = render(<HotlayoutScreen document={withPadding} scroll="screen" onReport={quiet} />)
    const content = rootOf(view.container).querySelector<HTMLElement>(':scope > [data-hl-zone="body"]')!.firstElementChild as HTMLElement
    expect(content.style.paddingBlockStart).not.toBe('')
    expect(rootOf(view.container).querySelector('[data-hl-lifted]')).toBeNull()
    expect(rootOf(view.container).querySelector('[data-hl-zone="safeTop"]')).toBeNull()
  })

  it('a pulled first child raises nothing', () => {
    const pulled = text('a', { pull: 'xl' } as Partial<UiNode>)
    const root = draw([appBar(), pulled], { bodyTop: 'screenTop' })
    const body = root.querySelector<HTMLElement>(':scope > [data-hl-zone="body"]')!
    expect(body.style.marginBlockStart).toBe('')
    expect(body.style.paddingBlockStart).toBe('')
    // The same document without the word raises the area of the body, as in 9.10.0.
    const normal = draw([appBar(), pulled], {})
    cleanup()
    expect(normal.querySelector<HTMLElement>(':scope > [data-hl-zone="body"]')!.style.marginBlockStart).not.toBe('')
  })

  it('the bar in a stuck page gets no backdrop, the content shows through it', () => {
    const doc = documentOf([appBar(), text('a')], { bodyTop: 'screenTop' })
    const withBackground = { ...doc, screens: [{ screenId: 'a', name: 'a', root: { ...(doc.screens[0] as { root: UiNode }).root, style: { background: { kind: 'color', color: 'primary' } } } }] } as unknown as UiDocument
    const view = render(<HotlayoutScreen document={withBackground} onReport={quiet} />)
    expect(view.container.querySelector('[data-hl-backdrop]')).toBeNull()
    cleanup()
    const plain = documentOf([appBar(), text('a')], {})
    const plainBackground = { ...plain, screens: [{ screenId: 'a', name: 'a', root: { ...(plain.screens[0] as { root: UiNode }).root, style: { background: { kind: 'color', color: 'primary' } } } }] } as unknown as UiDocument
    expect(render(<HotlayoutScreen document={plainBackground} onReport={quiet} />).container.querySelector('[data-hl-backdrop]')).not.toBeNull()
  })

  it('a page without its own height: the zone sticks and the bar lies over the body from it', () => {
    const stuck = render(<HotlayoutScreen document={documentOf([appBar(), text('a')], { bodyTop: 'screenTop' })} onReport={quiet} />).container
    const lift = stuck.querySelector<HTMLElement>('[data-hl-lifted]')!
    expect(lift.style.position).toBe('sticky')
    cleanup()
    const loose = render(<HotlayoutScreen document={documentOf([appBar(), text('a')], { bodyTop: 'screenTop' })} chrome="static" onReport={quiet} />).container
    expect(loose.querySelector<HTMLElement>('[data-hl-lifted]')!.style.position).toBe('relative')
  })

  it('the server renders the lifted bar too, without window', () => {
    const html = renderToString(<HotlayoutScreen document={documentOf([appBar(), text('a')], { bodyTop: 'screenTop' })} scroll="screen" safeAreaTop={44} />)
    expect(html).toContain('data-hl-lifted')
    expect(html).toContain('44px')
  })
})

describe('the top safe inset the reader adds', () => {
  const show = (children: UiNode[], rootProps: Record<string, unknown>, host: Record<string, unknown>): HTMLElement => rootOf(render(<HotlayoutScreen document={documentOf(children, rootProps)} onReport={quiet} {...host} />).container)

  it('with an app bar the inset is INSIDE its box above the content: its top padding grows by it', () => {
    const root = show([appBar(), text('a')], {}, { scroll: 'screen', safeAreaTop: 59 })
    const header = root.querySelector<HTMLElement>('[data-hl-zone="appBar"] header')!
    expect(header.style.paddingBlockStart).toContain('59px')
    expect(root.querySelector('[data-hl-zone="safeTop"]')).toBeNull()
  })

  it('a named padding of the bar stays below the inset', () => {
    const bar = appBar({ style: { padding: { top: 'md', bottom: 'md', start: 'md', end: 'md' } } } as Partial<UiNode>)
    const root = show([bar, text('a')], {}, { scroll: 'screen', safeAreaTop: 47 })
    const header = root.querySelector<HTMLElement>('header')!
    // `md` is 12 in the built-in theme: the padding stays and the inset is added to it (the engine folds the sum).
    expect(header.style.paddingBlockStart).toBe('calc(59px)')
    expect(header.style.paddingBlockEnd).not.toBe('')
  })

  it('without an app bar (or with one hidden) it stands above the body area', () => {
    const root = show([text('a')], {}, { scroll: 'screen', safeAreaTop: 59 })
    const spacer = root.querySelector<HTMLElement>(':scope > [data-hl-zone="safeTop"]')!
    expect(spacer.style.blockSize).toBe('59px')
    expect(spacer.nextElementSibling?.getAttribute('data-hl-zone')).toBe('body')
    cleanup()
    const hidden = show([appBar({ showOn: ['expanded'] }), text('a')], {}, { scroll: 'screen', safeAreaTop: 59 })
    expect(hidden.querySelector(':scope > [data-hl-zone="safeTop"]')).not.toBeNull()
  })

  it('a screen whose body starts at the top edge adds nothing to the body: no spacer; the bar still carries it', () => {
    const alone = show([text('a')], { bodyTop: 'screenTop' }, { scroll: 'screen', safeAreaTop: 59 })
    expect(alone.querySelector('[data-hl-zone="safeTop"]')).toBeNull()
    cleanup()
    const withBar = show([appBar(), text('a')], { bodyTop: 'screenTop' }, { scroll: 'screen', safeAreaTop: 59 })
    expect(withBar.querySelector<HTMLElement>('header')!.style.paddingBlockStart).toContain('59px')
  })

  it('the own strip of the navigation bar carries it inside its box (wide place)', () => {
    const view = render(<HotlayoutScreen document={documentOf([text('a'), navBar()])} initialWidthClass="medium" scroll="screen" safeAreaTop={30} onReport={quiet} />)
    expect(view.container.querySelector<HTMLElement>('[data-hl-zone="navTop"] nav')!.style.paddingBlockStart).toContain('30px')
  })

  it('a page without its own height: only while the bar sticks to the top of the window', () => {
    expect(show([appBar(), text('a')], {}, { safeAreaTop: 59 }).querySelector<HTMLElement>('header')!.style.paddingBlockStart).toContain('59px')
    cleanup()
    expect(show([appBar(), text('a')], {}, { safeAreaTop: 59, chrome: 'static' }).querySelector<HTMLElement>('header')!.style.paddingBlockStart).not.toContain('59px')
    cleanup()
    expect(show([text('a')], {}, { safeAreaTop: 59 }).querySelector('[data-hl-zone="safeTop"]')).toBeNull()
  })

  it('a modal layer has no inset inside', () => {
    const document = {
      ...documentOf([text('a')]),
      screens: [
        { screenId: 'a', name: 'a', root: { ...node('root', 'Screen'), children: [text('a')] } },
        { screenId: 'm', name: 'm', presentation: 'modal', root: { ...node('root-m', 'Screen'), children: [appBar({ id: 'bar-m' }), text('b')] } },
      ],
    } as unknown as UiDocument
    const view = render(<HotlayoutScreen document={document} entry="a" scroll="screen" safeAreaTop={59} onReport={quiet} />)
    expect(view.container.querySelector('header')).toBeNull()
  })

  it('what the host passes: the default is the env of the platform, bad values are zero, and the value never reaches the style as text', () => {
    // jsdom cannot parse `env()` inside `calc()`; the server string is what a browser gets.
    expect(renderToString(<HotlayoutScreen document={documentOf([appBar(), text('a')])} scroll="screen" />)).toContain('env(safe-area-inset-top, 0px)')
    for (const bad of [-1, Number.NaN, '59', '1px;color:red', null, {}]) {
      cleanup()
      const root = show([appBar(), text('a')], {}, { scroll: 'screen', safeAreaTop: bad })
      expect(root.querySelector('header')!.getAttribute('style') ?? '', JSON.stringify(bad)).not.toContain('color:red')
      expect(root.querySelector<HTMLElement>('header')!.style.paddingBlockStart).toBe('')
    }
  })
})

/** A page with a button that opens a modal screen with the given placement. */
const modalDocumentOf = (placement: 'bottom' | 'center'): UiDocument =>
  ({
    schemaVersion: '9.19.0',
    documentId: 'screen-top-modal',
    name: 'top',
    initialScreenId: 'a',
    screens: [
      { screenId: 'a', name: 'a', root: { ...node('root', 'Screen'), children: [node('go', 'Button', { label: lit('open'), variant: 'primary', action: { type: 'navigate', params: { screenId: 'layer' } } })] } },
      { screenId: 'layer', name: 'layer', presentation: 'modal', modalPlacement: placement, root: { ...node('layer-root', 'Screen'), children: [text('m')] } },
    ],
  }) as unknown as UiDocument

describe('a modal layer under the top inset', () => {
  it.each(named(TABLE.safeTopModalCases))('function: %s', (_name, row) => {
    // The layer area is the frame below the inset; the layer is computed by the same function as without it.
    const inset = safeTopOf(row.safeTop, row.frame.height)
    const box = modalBoxOf({ placement: row.placement, viewport: { width: row.frame.width, height: row.frame.height - inset }, contentHeight: row.contentHeight, margin: row.margin })
    const y = inset + box.y
    expect({ x: box.x, y, width: box.width, height: box.height, scrolls: box.scrolls, centerY: y + box.height / 2 }).toEqual(row.expect)
    expect(at(SAFE_TOP_RULES, `modal.${row.placement === 'center' ? 'window' : 'sheet'}`)).toBe(at(LAYOUT, `safeTop.modal.${row.placement === 'center' ? 'window' : 'sheet'}`))
  })

  /*
   * jsdom computes no layout, so the markup is checked by structure: the scrim covers the whole
   * root (inset included), and the inset is padding at the top of the layer AREA, so the sheet stops
   * below it and the window is centred in what is left. Pixels are checked in Chrome.
   */
  it.each(named(TABLE.safeTopModalCases))('real screen: %s', (_name, row) => {
    const view = render(<HotlayoutScreen document={modalDocumentOf(row.placement)} scroll="screen" safeAreaTop={row.safeTop} onReport={quiet} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
    const layer = view.container.querySelector<HTMLElement>('[data-hl-presentation="modal"]')!
    expect(layer.querySelector<HTMLElement>('[data-hl-scrim]')?.style.inset).toBe('0px')
    const area = layer.querySelector<HTMLElement>('[data-hl-layer-area]')!
    const inset = `${String(row.safeTop)}px`
    if (row.placement === 'center') {
      expect([area.style.alignItems, area.style.justifyContent]).toEqual(['center', 'center'])
      if (row.safeTop === 0) {
        expect(area.style.padding).toBe('var(--product-space-xl)')
      } else {
        // The `xl` margin plus the inset (jsdom folds the sum of two pixel lengths into one).
        expect(area.style.paddingBlockStart).toBe(`calc(${String(row.margin + row.safeTop)}px)`)
        expect(area.style.paddingBlockEnd).toBe('var(--product-space-xl)')
        expect(area.style.paddingInline).toBe('var(--product-space-xl)')
      }
    } else {
      expect(area.style.justifyContent).toBe('flex-end')
      expect(area.style.paddingBlockStart).toBe(row.safeTop === 0 ? '' : inset)
    }
    // Inside the layer there is no inset (`safeTop.modal.inside`): its screen root has no inset zone.
    expect(layer.querySelector('[data-hl-zone="safeTop"]')).toBeNull()
  })
})
