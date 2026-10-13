/**
 * BOTTOM ZONE CASE TABLE THROUGH THE `@hotlayout/react` PACKAGE:
 * `contract/fixtures/bottom-zone/bottom-zone-cases.json` (schema 9.12.0).
 *
 * The reference and the builder preview are checked against the same table elsewhere; this file is
 * another reader. The package does not import from `src/`, so the rule is written a second time in it
 * (`bottom-zone.ts`, `media-chrome.ts`), and this table keeps the two copies together. Each group runs
 * twice: the package's pure function and a REAL `HotlayoutScreen` (jsdom computes no layout, so the
 * markup is checked against the structural condition of the rule: what is in which zone, in what
 * order, what sticks, and the name and state exposed to a screen reader).
 *
 * The "documents" group concerns the builder validator; the reader is checked like this: the
 * document is drawn and does not crash, and what it read matches the expectation. The section
 * switching flows (`9.12 sections: …`) run in the action case test. NO ROWS ARE
 * SKIPPED.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { HotlayoutAction, ScreenShown, UiDocument, UiNode } from '../src/index'
import {
  BOTTOM_ZONE_RULES,
  isActiveNavAction,
  NAV_BAR_LAYOUT,
  navBarHeightOf,
  navItemSharesOf,
  PIN_EDGES,
  pinOf,
  screenChildrenByZone,
  SECTION_ACTION_TYPE,
  sectionStackOf,
} from '../src/bottom-zone'
import { SCREEN_ANATOMY, screenZonesOf } from '../src/media-chrome'
import { safeBottomInset } from '../src/sanitize'

/** The directory of the package: a folder of the builder's repository, or the root of the package's own. */
const PACKAGE_DIR = join(__dirname, '../')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

interface ChildSpec {
  readonly id: string
  readonly type: string
  readonly pin?: unknown
  readonly pull?: unknown
}
interface ZoneCase {
  readonly name: string
  readonly height: number
  readonly shrink?: boolean
  readonly appBarHeight?: number
  readonly padding: { readonly top: number; readonly bottom: number }
  readonly gap: number
  readonly bodyContentHeight?: number
  readonly firstPull?: number
  readonly scrollTop?: number
  readonly bottom: { readonly pinnedHeight?: number; readonly navBarHeight?: number; readonly safeBottom?: number }
  readonly expect: ReturnType<typeof screenZonesOf>
}
interface ScreenSpec {
  readonly id: string
  readonly modal?: boolean
  readonly children?: readonly ChildSpec[]
  readonly nav?: readonly string[]
  readonly after?: readonly ChildSpec[]
}
const TABLE = JSON.parse(readFileSync('contract/fixtures/bottom-zone/bottom-zone-cases.json', 'utf8')) as {
  readonly childrenCases: readonly { readonly name: string; readonly children: readonly ChildSpec[]; readonly expect: { readonly appBar: string | null; readonly body: readonly string[]; readonly pinned: string | null; readonly navBar: string | null } }[]
  readonly pinCases: readonly { readonly name: string; readonly pin: unknown; readonly expect: string | null }[]
  readonly zoneCases: readonly ZoneCase[]
  readonly navHeightCases: readonly { readonly name: string; readonly metrics: Parameters<typeof navBarHeightOf>[0]; readonly expect: number }[]
  readonly navShareCases: readonly { readonly name: string; readonly width: number; readonly visible: readonly boolean[]; readonly rtl: boolean; readonly expect: readonly ({ start: number; width: number } | null)[] }[]
  readonly activeCases: readonly { readonly name: string; readonly action: { type: string; params?: Record<string, string> }; readonly shown: string; readonly expect: boolean }[]
  readonly sectionCases: readonly { readonly name: string; readonly stack: readonly string[]; readonly target: string; readonly expect: readonly string[] | null }[]
  readonly ruleCases: readonly { readonly name: string; readonly block: 'bottomZone' | 'navBar'; readonly rule: string; readonly expect: unknown }[]
  readonly documentCases: readonly { readonly name: string; readonly screens: readonly ScreenSpec[]; readonly sentences: readonly string[] }[]
}
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as {
  readonly 'x-style': { readonly layout: { readonly bottomZone: Record<string, unknown>; readonly navBar: Record<string, unknown>; readonly screen: { readonly bottom: Record<string, string>; readonly body: Record<string, string> } }; readonly colorParts: Record<string, unknown> }
  readonly 'x-actions': { readonly catalog: readonly { readonly type: string; readonly executor: string }[]; readonly section: Record<string, string> }
  readonly 'x-screenShown': { readonly causes: readonly string[]; readonly transitions: Record<string, string> }
  readonly 'x-compatibility': { readonly policy: Record<string, string>; readonly features: Record<string, string>; readonly widgets: Record<string, string> }
}

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)

/* ───────────────────────────── nodes and documents ───────────────────────────── */

const lit = (value: string): { kind: 'literal'; value: string } => ({ kind: 'literal', value })
const quiet = (): void => undefined

function nodeOf(spec: ChildSpec): UiNode {
  const base: Record<string, unknown> = { id: spec.id, type: spec.type, props: {} }
  if (spec.type === 'Text') base.props = { content: lit(`text ${spec.id}`), align: 'start', overflow: 'ellipsis' }
  if (spec.type === 'Button') base.props = { label: lit(`button ${spec.id}`), variant: 'primary', fullWidth: true, action: { type: 'none' } }
  if (spec.type === 'AppBar') base.props = { title: lit('Title'), showBack: false }
  if (spec.pin !== undefined) base.pin = spec.pin
  if (spec.pull !== undefined) base.pull = spec.pull
  return base as unknown as UiNode
}

const section = (screenId: string): { type: string; params: { screenId: string } } => ({ type: SECTION_ACTION_TYPE, params: { screenId } })

function navBar(targets: readonly string[], extra: Partial<UiNode> = {}): UiNode {
  return {
    id: 'nav',
    type: 'NavBar',
    props: {},
    children: targets.map((target, index) => ({ id: `nav-${String(index)}`, type: 'NavItem', props: { icon: 'house', label: lit(`Section ${target}`), action: section(target) } })),
    ...extra,
  }
}

const ROOT_STYLE = { padding: { top: 'lg', end: 'lg', bottom: 'xl', start: 'md' } }

function rootOf(id: string, children: readonly UiNode[], rootExtra: Record<string, unknown> = {}): UiNode {
  return { id: `root-${id}`, type: 'Screen', props: { gap: 'md' }, style: ROOT_STYLE, children, ...rootExtra }
}

function documentOf(screens: readonly { readonly id: string; readonly modal?: boolean; readonly root: UiNode }[], initial?: string): UiDocument {
  return {
    schemaVersion: '9.12.0',
    documentId: 'case',
    name: 'case',
    initialScreenId: initial ?? screens[0]?.id ?? 'home',
    screens: screens.map((entry) => ({ screenId: entry.id, name: entry.id, ...(entry.modal === true ? { presentation: 'modal' } : {}), root: entry.root })),
  } as unknown as UiDocument
}

function specDocument(screens: readonly ScreenSpec[]): UiDocument {
  return documentOf(
    screens.map((entry) => ({
      id: entry.id,
      ...(entry.modal === true ? { modal: true } : {}),
      root: rootOf(entry.id, [...(entry.children ?? []).map(nodeOf), ...(entry.nav === undefined ? [] : [navBar(entry.nav)]), ...(entry.after ?? []).map(nodeOf)]),
    })),
  )
}

type Props = Partial<React.ComponentProps<typeof HotlayoutScreen>>
function show(document: UiDocument, props: Props = {}): ReturnType<typeof render> {
  return render(<HotlayoutScreen document={document} scroll="screen" onReport={quiet} {...props} />)
}

const zoneOf = (container: ParentNode, name: string): HTMLElement | null => container.querySelector<HTMLElement>(`[data-hl-zone="${name}"]`)
const nodeIn = (container: ParentNode, id: string): HTMLElement | null => container.querySelector<HTMLElement>(`[data-hl-node="${id}"]`)

/* ───────────────────────────── table structure ───────────────────────────── */

describe('bottom zone table in the package: structure', () => {
  it('all groups are in place, names are unique, 131 rows in total', () => {
    const groups = [TABLE.childrenCases, TABLE.pinCases, TABLE.zoneCases, TABLE.navHeightCases, TABLE.navShareCases, TABLE.activeCases, TABLE.sectionCases, TABLE.ruleCases, TABLE.documentCases]
    for (const rows of groups) {
      expect(rows.length).toBeGreaterThan(3)
      expect(new Set(rows.map((row) => row.name)).size).toBe(rows.length)
    }
    expect(groups.reduce((sum, rows) => sum + rows.length, 0)).toBe(131)
  })
})

/* ───────────────────────────── package pure functions ───────────────────────────── */

describe('which root child is in which zone (package function)', () => {
  it.each(named(TABLE.childrenCases))('%s', (_name, row) => {
    const placed = screenChildrenByZone(row.children)
    expect({ appBar: placed.appBar?.id ?? null, body: placed.body.map((child) => child.id), pinned: placed.pinned?.id ?? null, navBar: placed.navBar?.id ?? null }).toEqual(row.expect)
  })

  it.each(named(TABLE.pinCases))('reading `pin`: %s', (_name, row) => {
    expect(pinOf({ pin: row.pin }) ?? null).toBe(row.expect)
  })

  it('`pin` is read only as an own field: the node prototype does not supply the word', () => {
    expect(pinOf(Object.create({ pin: 'bottom' }) as object)).toBeUndefined()
    expect(pinOf(null)).toBeUndefined()
    expect([...PIN_EDGES]).toEqual(ARTIFACT['x-style'].layout.bottomZone.pinValues)
  })
})

function zoneInput(row: ZoneCase): Parameters<typeof screenZonesOf>[0] {
  return {
    height: row.height,
    shrink: row.shrink,
    appBarHeight: row.appBarHeight,
    padding: row.padding,
    gap: row.gap,
    bodyContentHeight: row.bodyContentHeight,
    firstPull: row.firstPull,
    scrollTop: row.scrollTop,
    bottom: row.bottom,
  }
}

describe('geometry, height, shares, active item, stack (package functions)', () => {
  it.each(named(TABLE.zoneCases))('zones: %s', (_name, row) => {
    expect(screenZonesOf(zoneInput(row))).toEqual(row.expect)
  })

  it('invariants on every row: the zone does not depend on scrolling, the body ends at its top edge', () => {
    for (const row of TABLE.zoneCases) {
      const input = { ...zoneInput(row), scrollTop: undefined }
      const rest = screenZonesOf(input)
      const scrolled = screenZonesOf({ ...input, scrollTop: rest.maxScroll })
      expect(scrolled.bottom, row.name).toEqual(rest.bottom)
      expect(scrolled.body, row.name).toEqual(rest.body)
      if (rest.bottom !== null) expect(rest.body.top + rest.body.height, row.name).toBe(rest.bottom.top)
    }
  })

  it('without heights in `bottom` there is no zone and no safe area inset is added', () => {
    const input = { height: 568, appBarHeight: 56, padding: { top: 16, bottom: 16 }, gap: 12, bodyContentHeight: 900 }
    const before = screenZonesOf(input)
    expect(before.bottom).toBeNull()
    expect(screenZonesOf({ ...input, bottom: {} })).toEqual(before)
    expect(screenZonesOf({ ...input, bottom: { safeBottom: 34 } })).toEqual(before)
  })

  it.each(named(TABLE.navHeightCases))('bar height: %s', (_name, row) => {
    expect(navBarHeightOf(row.metrics)).toBe(row.expect)
  })

  it.each(named(TABLE.navShareCases))('item shares: %s', (_name, row) => {
    expect(navItemSharesOf(row.width, row.visible, row.rtl)).toEqual(row.expect)
  })

  it.each(named(TABLE.activeCases))('active item: %s', (_name, row) => {
    expect(isActiveNavAction(row.action, row.shown)).toBe(row.expect)
  })

  it.each(named(TABLE.sectionCases))('section stack: %s', (_name, row) => {
    expect(sectionStackOf(row.stack, row.target) ?? null).toEqual(row.expect)
  })
})

/* ───────────────────────────── artifact data ───────────────────────────── */

describe('the rule is artifact data', () => {
  it.each(named(TABLE.ruleCases))('%s', (_name, row) => {
    const mirror = row.block === 'bottomZone' ? { ...BOTTOM_ZONE_RULES, pinValues: [...PIN_EDGES] } : NAV_BAR_LAYOUT
    const value = row.rule.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], mirror)
    expect(value).toEqual(row.expect)
    // And the same in the artifact: the mirror has not fallen behind the file everyone reads.
    const fromArtifact = row.rule.split('.').reduce<unknown>((at, key) => (at as Record<string, unknown> | undefined)?.[key], ARTIFACT['x-style'].layout[row.block])
    expect(value).toEqual(fromArtifact)
  })

  it('artifact blocks are exactly the package mirrors, the screen anatomy leads to the bottom zone', () => {
    const { bottomZone, navBar: bar, screen: anatomy } = ARTIFACT['x-style'].layout
    const without = (block: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> => Object.fromEntries(Object.entries(block).filter(([key]) => !keys.includes(key)))
    const zoneRules = without(bottomZone, ['cases', 'pinValues'])
    const barRules = without(bar, ['cases'])
    expect(BOTTOM_ZONE_RULES).toEqual(zoneRules)
    expect(NAV_BAR_LAYOUT).toEqual(barRules)
    expect(anatomy.bottom).toEqual(SCREEN_ANATOMY.bottom)
    expect(anatomy.body.area).toBe(SCREEN_ANATOMY.body.area)
    expect(SCREEN_ANATOMY.bottom.content).toBe('x-style.layout.bottomZone')
  })

  it('the section action is in the reader catalog, the `switch` reason is in the event, the item parts are in the colour', () => {
    expect(ARTIFACT['x-actions'].catalog.find((entry) => entry.type === SECTION_ACTION_TYPE)).toMatchObject({ executor: 'reader' })
    expect(ARTIFACT['x-actions'].section).toMatchObject({ type: SECTION_ACTION_TYPE, cause: 'switch', record: 'not-carried' })
    expect(ARTIFACT['x-screenShown'].causes).toContain('switch')
    expect(ARTIFACT['x-style'].colorParts.NavItem).toEqual({ whenUnnamed: 'built-in', parts: { activeItem: 'primary', inactiveItem: 'secondary' } })
    for (const widget of ['NavBar', 'NavItem']) expect(ARTIFACT['x-compatibility'].widgets[widget], widget).toBe('9.12.0')
  })
})

/* ───────────────────────────── documents ───────────────────────────── */

describe('documents (`documentCases`): the reader does not crash and draws what it read', () => {
  it.each(named(TABLE.documentCases))('%s', (_name, row) => {
    const reports: unknown[] = []
    const document = specDocument(row.screens)
    const view = show(document, { onReport: (report) => void reports.push(report) })
    const first = row.screens[0]!
    expect(view.container.querySelector(`[data-hl-screen="${first.id}"]`)).not.toBeNull()
    // How many items were read: the first five of those named, each a button. A modal first screen is drawn as a page, and the bar is on it.
    expect(view.container.querySelectorAll('nav button').length).toBe(Math.min(5, first.nav?.length ?? 0))
    // The pinned block: it is the last child, not counting the bar, and only with `pin: bottom` (computed by the package function).
    const pinned = (first.children ?? []).filter((child) => child.pin === 'bottom')
    const lastIndex = (first.children ?? []).length - 1
    const readAsPinned = pinned.length > 0 && (first.after ?? []).length === 0 && (first.children ?? [])[lastIndex]?.pin === 'bottom'
    expect(zoneOf(view.container, 'pinned') !== null).toBe(readAsPinned)
    expect(reports.filter((report) => (report as { kind: string }).kind === 'render-error')).toEqual([])
  })

  it('server render draws the same document without `window`', () => {
    for (const row of TABLE.documentCases) {
      const html = renderToString(<HotlayoutScreen document={specDocument(row.screens)} scroll="screen" />)
      expect(html, row.name).toContain(`data-hl-screen="${row.screens[0]!.id}"`)
    }
  })
})

/* ───────────────────────────── real screen: zones ───────────────────────────── */

describe('real screen: root children fall into markup zones', () => {
  it.each(named(TABLE.childrenCases))('%s', (_name, row) => {
    const children = row.children.map((child) => (child.type === 'NavBar' ? ({ ...navBar(['home']), id: child.id, ...(child.pin === undefined ? {} : { pin: child.pin }) }) : nodeOf(child)))
    const { container } = show(documentOf([{ id: 'home', root: rootOf('home', children) }]))
    const idsIn = (selector: string): string[] => Array.from(container.querySelectorAll<HTMLElement>(`${selector} > [data-hl-node]`)).map((element) => element.getAttribute('data-hl-node') ?? '')
    const root = container.querySelector<HTMLElement>('[data-hl-type="Screen"]')!
    // The app bar and body children lie in their zones; an unrecognised node in the right place is an ordinary body child.
    expect(root.querySelector(':scope > [data-hl-zone="appBar"] > [data-hl-node]')?.getAttribute('data-hl-node') ?? null).toBe(row.expect.appBar)
    // One root shape for all zone combinations: body children and the pinned block stand in the content column (`data-hl-content`).
    expect(idsIn('[data-hl-zone="body"] > div > [data-hl-content]')).toEqual(row.expect.body)
    expect(root.querySelector(':scope > [data-hl-zone="bottom"] > [data-hl-zone="pinned"] > [data-hl-content] > [data-hl-node]')?.getAttribute('data-hl-node') ?? null).toBe(row.expect.pinned)
    expect(root.querySelector(':scope > [data-hl-zone="bottom"] > [data-hl-zone="navBar"] > [data-hl-node]')?.getAttribute('data-hl-node') ?? null).toBe(row.expect.navBar)
    expect(root.querySelector(':scope > [data-hl-zone="bottom"]') !== null).toBe(row.expect.pinned !== null || row.expect.navBar !== null)
  })

  it('zone markup: app bar, body, bottom zone, in this order; the body scrolls, the bottom zone and app bar stay', () => {
    const { container } = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'bar', type: 'AppBar' }), nodeOf({ id: 'a', type: 'Text' }), nodeOf({ id: 'cta', type: 'Button', pin: 'bottom' }), navBar(['home', 'rewards'])]) }]))
    const root = container.querySelector<HTMLElement>('[data-hl-type="Screen"]')!
    const zones = Array.from(root.children).map((element) => element.getAttribute('data-hl-zone'))
    expect(zones).toEqual(['appBar', 'body', 'bottom'])
    const body = zoneOf(root, 'body')!
    const bottom = zoneOf(root, 'bottom')!
    expect(body.style.overflowY).toBe('auto')
    expect(body.style.overflowX).toBe('hidden')
    expect(bottom.style.flex).toBe('0 0 auto')
    expect(bottom.style.overflowY).toBe('')
    expect(bottom.style.position).toBe('')
    // At the bottom the zones from top to bottom: the pinned block, then the bar.
    expect(Array.from(bottom.children).map((element) => element.getAttribute('data-hl-zone'))).toEqual(['pinned', 'navBar'])
  })

  it('root padding is shared: the block gets the side and bottom ones, the body has a gap instead of the bottom one, the bar gets none', () => {
    const { container } = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), nodeOf({ id: 'cta', type: 'Button', pin: 'bottom' }), navBar(['home'])]) }]))
    const root = container.querySelector<HTMLElement>('[data-hl-type="Screen"]')!
    expect(root.style.padding).toBe('')
    const content = zoneOf(root, 'body')!.firstElementChild as HTMLElement
    expect(content.style.paddingBlockEnd).toBe('var(--product-space-md)')
    expect(content.style.paddingBlockStart).toBe('var(--product-space-lg)')
    expect(content.style.paddingInlineStart).not.toBe('')
    const pinned = zoneOf(root, 'pinned')!
    expect(pinned.style.paddingInlineStart).toBe(content.style.paddingInlineStart)
    expect(pinned.style.paddingInlineEnd).toBe(content.style.paddingInlineEnd)
    expect(pinned.style.paddingBlockEnd).toBe('var(--product-space-xl)')
    const bar = zoneOf(root, 'navBar')!
    expect(bar.style.paddingInlineStart).toBe('')
    expect(bar.style.paddingBlockEnd).toBe('')
  })

  it('without a block the root bottom padding stays with the body; a body without visible children has no gap', () => {
    const noBlock = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), navBar(['home'])]) }]))
    expect((zoneOf(noBlock.container, 'body')!.firstElementChild as HTMLElement).style.paddingBlockEnd).toBe('var(--product-space-xl)')
    cleanup()
    const emptyBody = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'cta', type: 'Button', pin: 'bottom' })]) }]))
    expect((zoneOf(emptyBody.container, 'body')!.firstElementChild as HTMLElement).style.paddingBlockEnd).toBe('')
  })

  it('a node hidden by a condition has no zone: the bottom padding goes back to the body, another node does not take its place', () => {
    const hidden = { visibleIf: { path: 'x.y', op: 'isTrue' } } as Partial<UiNode>
    const view = show(
      documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), { ...nodeOf({ id: 'cta', type: 'Button', pin: 'bottom' }), ...hidden }, { ...navBar(['home']), ...hidden }]) }]),
      { data: { 'x.y': false } },
    )
    expect(zoneOf(view.container, 'bottom')).toBeNull()
    expect(nodeIn(view.container, 'cta')).toBeNull()
    expect(nodeIn(view.container, 'a')).not.toBeNull()
    expect((zoneOf(view.container, 'body')!.firstElementChild as HTMLElement).style.paddingBlockEnd).toBe('var(--product-space-xl)')
  })

  it('the pinned block width is that of a root column child: a button spans the full width between the paddings', () => {
    const { container } = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), nodeOf({ id: 'cta', type: 'Button', pin: 'bottom' })]) }]))
    const button = nodeIn(container, 'cta')!
    expect(button.style.display).toBe('flex')
    expect(zoneOf(container, 'pinned')!.style.display).toBe('flex')
    expect(zoneOf(container, 'pinned')!.style.flexDirection).toBe('column')
  })
})

/* ───────────────────────────── navigation bar ───────────────────────────── */

describe('navigation bar: markup, name, keyboard', () => {
  const home = (extra: readonly UiNode[] = []): UiDocument =>
    documentOf([
      { id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), ...extra, navBar(['home', 'rewards', 'profile'])]) },
      { id: 'rewards', root: rootOf('rewards', [nodeOf({ id: 'b', type: 'Text' }), navBar(['home', 'rewards', 'profile'])]) },
      { id: 'profile', root: rootOf('profile', [nodeOf({ id: 'c', type: 'Text' }), navBar(['home', 'rewards', 'profile'])]) },
    ])

  it('a navigation landmark; an item is a button named by its label, the active one is "current page"; not a tablist', () => {
    const view = show(home())
    const nav = view.container.querySelector('nav')!
    expect(nav.tagName).toBe('NAV')
    expect(view.container.querySelector('[role="tablist"]')).toBeNull()
    expect(screen.getByRole('navigation')).toBe(nav)
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Section home', 'Section rewards', 'Section profile'])
    expect(buttons.map((button) => button.getAttribute('aria-current'))).toEqual(['page', null, null])
    expect(buttons.every((button) => button.tagName === 'BUTTON' && button.getAttribute('tabindex') !== '-1')).toBe(true)
  })

  it('after switching, the item of the shown screen becomes active', () => {
    const view = show(home())
    fireEvent.click(screen.getByRole('button', { name: 'Section rewards' }))
    expect(view.container.querySelector('[data-hl-screen="rewards"]')).not.toBeNull()
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-current'))).toEqual([null, 'page', null])
  })

  it('equal shares: each item is `flex: 1 1 0` without gaps, the row does not wrap, an item fills the whole row height', () => {
    const view = show(home())
    const row = view.container.querySelector<HTMLElement>('nav > div')!
    expect(row.style.display).toBe('flex')
    expect(row.style.flexWrap).toBe('')
    expect(row.style.gap).toBe('')
    expect(row.style.alignItems).toBe('stretch')
    for (const button of screen.getAllByRole('button')) {
      expect(button.style.flex).toBe('1 1 0px')
      expect(button.style.minInlineSize).toBe('0px')
    }
  })

  it('item: the icon ABOVE the label, padding sm / xs, gap xs; the label is one line with an ellipsis, centred', () => {
    const view = show(home())
    const item = screen.getByRole('button', { name: 'Section home' })
    expect(item.style.flexDirection).toBe('column')
    expect(item.style.alignItems).toBe('center')
    expect(item.style.justifyContent).toBe('center')
    expect(item.style.gap).toBe('var(--product-space-xs)')
    expect(item.style.paddingBlock).toBe('var(--product-space-sm)')
    expect(item.style.paddingInline).toBe('var(--product-space-xs)')
    const [icon, label] = Array.from(item.children) as HTMLElement[]
    expect(icon!.getAttribute('aria-hidden')).toBe('true')
    expect(icon!.querySelector('[data-hl-glyph="house"]')).not.toBeNull()
    expect(icon!.style.font).toBe('var(--product-font-title-m)')
    expect(label!.style.whiteSpace).toBe('nowrap')
    expect(label!.style.textOverflow).toBe('ellipsis')
    expect(label!.style.overflow).toBe('hidden')
    expect(label!.style.textAlign).toBe('center')
    expect(label!.style.font).toBe('var(--product-font-body-s)')
    expect(view.container.querySelector('nav')).not.toBeNull()
  })

  it('built-in background and top border; the active one is `primary`, the rest `muted`, the icon has the same colour', () => {
    const view = show(home())
    const nav = view.container.querySelector('nav')!
    expect(nav.style.backgroundColor).toBe('var(--product-color-surface)')
    expect(nav.style.borderBlockStart).toBe('1px solid var(--product-color-border)')
    const [active, rest] = screen.getAllByRole('button')
    expect(active!.style.color).toBe('var(--product-color-primary)')
    expect(rest!.style.color).toBe('var(--product-color-muted)')
  })

  it('named `style.background` and `style.border` replace the built-in ones', () => {
    const own = {
      style: { background: { kind: 'color', color: 'primary' }, border: { width: 2, color: 'accent' } },
    }
    const view = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), navBar(['home'], own as unknown as Partial<UiNode>)]) }]))
    const nav = view.container.querySelector('nav')!
    expect(nav.style.backgroundColor).toBe('var(--product-color-primary)')
    expect(nav.style.border).toBe('2px solid var(--product-color-accent)')
    expect(nav.style.borderBlockStart).not.toBe('1px solid var(--product-color-border)')
  })

  it('a named colour: the active one as is, the rest with the opacity of the secondary part', () => {
    const view = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), navBar(['home', 'rewards'], { style: { color: 'success' } })]) }]))
    const [active, rest] = screen.getAllByRole('button')
    expect(active!.style.color).toBe('var(--product-color-success)')
    expect(rest!.style.color).toBe('rgba(21, 128, 61, 0.6)')
    expect(view.container.querySelector('nav')).not.toBeNull()
  })

  it('a hidden item has no share; of eight, the first five visible are drawn', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      id: `nav-${String(index)}`,
      type: 'NavItem',
      props: { icon: 'house', label: lit(`P${String(index)}`), action: section('home') },
      ...(index === 0 ? { visibleIf: { path: 'x.y', op: 'isTrue' } } : {}),
    }))
    show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), { id: 'nav', type: 'NavBar', props: {}, children: items } as unknown as UiNode]) }]), { data: { 'x.y': false } })
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5'])
  })

  it('an empty label: the name comes from the icon name, as for an icon button', () => {
    const bar = { id: 'nav', type: 'NavBar', props: {}, children: [{ id: 'i', type: 'NavItem', props: { icon: 'gift', label: lit('​  '), action: section('home') } }] } as unknown as UiNode
    show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), bar]) }]))
    const name = screen.getByRole('button').textContent
    expect(name).toBeTruthy()
    expect(name).not.toBe('​  ')
  })

  it('keyboard: Enter presses, auto-repeat is not a press', () => {
    const actions: HotlayoutAction[] = []
    show(home(), { onAction: (action) => void actions.push(action) })
    const item = screen.getByRole('button', { name: 'Section rewards' })
    expect(fireEvent.keyDown(item, { key: 'Enter', repeat: true })).toBe(false)
    expect(fireEvent.keyDown(item, { key: ' ', repeat: true })).toBe(false)
    expect(actions).toEqual([])
  })

  it('right-to-left writing: the root carries dir=rtl, the first document item is first in the markup (flex puts it on the right)', () => {
    const view = show(home(), { dir: 'rtl' })
    expect(view.container.querySelector('[data-hotlayout]')!.getAttribute('dir')).toBe('rtl')
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Section home', 'Section rewards', 'Section profile'])
  })

  it('an unknown icon is an empty box of the same size, the item works', () => {
    const bar = { id: 'nav', type: 'NavBar', props: {}, children: [{ id: 'i', type: 'NavItem', props: { icon: 'no-such-icon', label: lit('Label'), action: section('home') } }] } as unknown as UiNode
    show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), bar]) }]))
    const icon = screen.getByRole('button').firstElementChild as HTMLElement
    expect(icon.style.font).toBe('var(--product-font-title-m)')
    expect(icon.querySelector('[data-hl-glyph]')).not.toBeNull()
  })
})

/* ───────────────────────────── policy rows ───────────────────────────── */

describe('9.12.0 policy rows, one test each', () => {
  const policy = ARTIFACT['x-compatibility'].policy
  it('navBarNotLast: a bar that is not last is an ordinary body child where it stands; there is no zone', () => {
    expect(policy.navBarNotLast).toBe('ordinary-child')
    const view = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), navBar(['home']), nodeOf({ id: 'late', type: 'Text' })]) }]))
    expect(zoneOf(view.container, 'bottom')).toBeNull()
    const body = zoneOf(view.container, 'body')!
    expect(body.querySelector('nav')).not.toBeNull()
    expect(Array.from(body.querySelector(':scope > div > [data-hl-content]')!.children).map((element) => element.getAttribute('data-hl-node'))).toEqual(['a', 'nav', 'late'])
    // Nobody adds a safe area inset to such a bar.
    expect(view.container.querySelector('[data-hl-safe-inset]')).toBeNull()
  })

  it('navBarInModalLayer: a screen shown as a layer has no bar; the same screen as a page does', () => {
    expect(policy.navBarInModalLayer).toBe('not-drawn')
    const go = { id: 'go', type: 'Button', props: { label: lit('go'), action: { type: 'navigate', params: { screenId: 'sheet' } } } } as unknown as UiNode
    const document = documentOf([
      { id: 'home', root: rootOf('home', [go, navBar(['home', 'sheet'])]) },
      { id: 'sheet', modal: true, root: rootOf('sheet', [nodeOf({ id: 's', type: 'Text' }), navBar(['home', 'sheet'])]) },
    ])
    const view = show(document)
    fireEvent.click(nodeIn(view.container, 'go')!)
    const layer = view.container.querySelector('[data-hl-screen="sheet"]')!
    expect(layer.getAttribute('data-hl-presentation')).toBe('modal')
    expect(layer.querySelector('nav')).toBeNull()
    expect(layer.querySelector('[data-hl-zone="bottom"]')).toBeNull()
    expect(layer.querySelector('[data-hl-node="s"]')).not.toBeNull()
    expect(view.container.querySelector('[data-hl-screen="home"] nav')).not.toBeNull()
    // A screen switched to by a section is a page (the stack bottom), and the bar is on it.
    cleanup()
    const asPage = show(document)
    fireEvent.click(screen.getByRole('button', { name: 'Section sheet' }))
    expect(asPage.container.querySelector('[data-hl-screen="sheet"]')!.getAttribute('data-hl-presentation')).toBe('page')
    expect(asPage.container.querySelector('[data-hl-screen="sheet"] nav')).not.toBeNull()
  })

  it('navBarExtraItems: more than five gives the first five visible', () => {
    expect(policy.navBarExtraItems).toBe('first-five-visible')
    const targets = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 't', type: 'Text' }), navBar(targets)]) }]))
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('navBarNoActiveItem: no item leads here, so none is active, the bar works', () => {
    expect(policy.navBarNoActiveItem).toBe('none-active')
    show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 't', type: 'Text' }), navBar(['x', 'y'])]) }]))
    expect(screen.getAllByRole('button').every((button) => !button.hasAttribute('aria-current'))).toBe(true)
  })

  it('pinElsewhere: a `pin` in the wrong place is not read, the node is an ordinary body child', () => {
    expect(policy.pinElsewhere).toBe('ignore')
    const { container } = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'cta', type: 'Button', pin: 'bottom' }), nodeOf({ id: 'a', type: 'Text' })]) }]))
    expect(zoneOf(container, 'bottom')).toBeNull()
    expect(zoneOf(container, 'body')!.querySelector('[data-hl-node="cta"]')).not.toBeNull()
  })

  it('unreadablePin: a word from a newer minor, `true`, `null`, a number, an object, another case, an empty string all mean "no field"', () => {
    expect(policy.unreadablePin).toBe('ignore')
    for (const pin of ['top', true, null, 5, {}, [], 'Bottom', '', ' bottom']) {
      const { container } = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), nodeOf({ id: 'cta', type: 'Button', pin })]) }]))
      expect(zoneOf(container, 'bottom'), JSON.stringify(pin)).toBeNull()
      expect(nodeIn(container, 'cta'), JSON.stringify(pin)).not.toBeNull()
      cleanup()
    }
  })

  it('pinWithPull: `pull` on a pinned node is not read', () => {
    expect(policy.pinWithPull).toBe('pull-not-read')
    const { container } = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), nodeOf({ id: 'cta', type: 'Button', pin: 'bottom', pull: 'md' })]) }]))
    const button = nodeIn(container, 'cta')!
    expect(zoneOf(container, 'pinned')!.contains(button)).toBe(true)
    expect(button.style.marginBlockStart).toBe('')
    expect(button.style.position).not.toBe('relative')
  })

  describe('section switching (flows are in `react-actions-cases`)', () => {
    const build = (): UiDocument => documentOf([
      { id: 'home', root: rootOf('home', [nodeOf({ id: 't', type: 'Text' }), navBar(['home', 'rewards'])]) },
      { id: 'rewards', root: rootOf('rewards', [nodeOf({ id: 'u', type: 'Text' }), navBar(['home', 'rewards'])]) },
    ])

    it('sectionSwitch: the stack becomes the section, a `switch` event with depth 1', () => {
      expect(policy.sectionSwitch).toBe('stack-reset-to-the-section')
      const shown: ScreenShown[] = []
      const view = show(build(), { onScreenChange: (event) => void shown.push(event) })
      fireEvent.click(screen.getByRole('button', { name: 'Section rewards' }))
      expect(view.container.querySelectorAll('[data-hl-screen]')).toHaveLength(1)
      expect(shown.map((event) => [event.screenId, event.cause, event.depth, event.record])).toEqual([['home', 'entry', 1, null], ['rewards', 'switch', 1, null]])
    })

    it('sectionSwitchSameScreen: pressing the active item again does nothing, there is no event, analytics is sent', () => {
      expect(policy.sectionSwitchSameScreen).toBe('nothing')
      const shown: ScreenShown[] = []
      const tracked: unknown[] = []
      const document = build()
      const tracking = { ...document, screens: document.screens.map((entry) => ({ ...entry, root: { ...entry.root, children: entry.root.children!.map((child) => (child.type === 'NavBar' ? { ...child, children: child.children!.map((item) => ({ ...item, props: { ...item.props, action: { ...(item.props.action as object), track: { event: 'tab_open' } } } })) } : child)) } })) } as UiDocument
      show(tracking, { onScreenChange: (event) => void shown.push(event), onTrack: (event) => void tracked.push(event) })
      fireEvent.click(screen.getByRole('button', { name: 'Section home' }))
      expect(shown).toHaveLength(1)
      expect(tracked).toEqual([{ event: 'tab_open' }])
    })

    it('sectionSwitchRecord: the row record is not carried', () => {
      expect(policy.sectionSwitchRecord).toBe('not-carried')
      const shown: ScreenShown[] = []
      const document = documentOf([
        {
          id: 'home',
          root: rootOf('home', [
            { id: 'list', type: 'Repeater', props: { source: 'items', item: 'item' }, children: [{ id: 'row', type: 'Button', props: { label: lit('row'), action: section('rewards') } }] },
            navBar(['home', 'rewards']),
          ]),
        },
        { id: 'rewards', root: rootOf('rewards', [nodeOf({ id: 'u', type: 'Text' }), navBar(['home', 'rewards'])]) },
      ])
      show(document, { collections: { items: [{ id: 'bottle' }] }, onScreenChange: (event) => void shown.push(event) })
      fireEvent.click(screen.getByRole('button', { name: 'row' }))
      expect(shown[1]).toMatchObject({ screenId: 'rewards', cause: 'switch', record: null })
    })

    it('sectionSwitchScroll: the section is shown from the start: the layer is new, the body does not remember scrolling', () => {
      expect(policy.sectionSwitchScroll).toBe('from-the-top')
      const view = show(build())
      const before = view.container.querySelector('[data-hl-screen="home"]')!
      zoneOf(before, 'body')!.scrollTop = 120
      fireEvent.click(screen.getByRole('button', { name: 'Section rewards' }))
      fireEvent.click(screen.getByRole('button', { name: 'Section home' }))
      const again = view.container.querySelector('[data-hl-screen="home"]')!
      expect(again).not.toBe(before)
      expect(zoneOf(again, 'body')!.scrollTop).toBe(0)
    })

    it('sectionTargetModal: a section declared modal is a page', () => {
      expect(policy.sectionTargetModal).toBe('shown-as-page')
      const shown: ScreenShown[] = []
      const document = documentOf([
        { id: 'home', root: rootOf('home', [nodeOf({ id: 't', type: 'Text' }), navBar(['home', 'sheet'])]) },
        { id: 'sheet', modal: true, root: rootOf('sheet', [nodeOf({ id: 's', type: 'Text' })]) },
      ])
      show(document, { onScreenChange: (event) => void shown.push(event) })
      fireEvent.click(screen.getByRole('button', { name: 'Section sheet' }))
      expect(shown[1]).toMatchObject({ screenId: 'sheet', presentation: 'page', cause: 'switch', depth: 1 })
    })

    it('unknownSectionTarget: the section is not in the document, so the action goes to the host and nothing is shown; the same without `screenId`', () => {
      expect(policy.unknownSectionTarget).toBe('host')
      const actions: HotlayoutAction[] = []
      const shown: ScreenShown[] = []
      const document = documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 't', type: 'Text' }), navBar(['nowhere']), ]) }])
      show(document, { onAction: (action) => void actions.push(action), onScreenChange: (event) => void shown.push(event) })
      fireEvent.click(screen.getByRole('button'))
      expect(actions).toEqual([{ type: SECTION_ACTION_TYPE, params: { screenId: 'nowhere' } }])
      expect(shown).toHaveLength(1)
      cleanup()
      const bad = { id: 'nav', type: 'NavBar', props: {}, children: [{ id: 'i', type: 'NavItem', props: { icon: 'house', label: lit('Bad'), action: { type: SECTION_ACTION_TYPE } } }] } as unknown as UiNode
      const handed: HotlayoutAction[] = []
      show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 't', type: 'Text' }), bad]) }]), { onAction: (action) => void handed.push(action) })
      fireEvent.click(screen.getByRole('button'))
      expect(handed).toEqual([{ type: SECTION_ACTION_TYPE }])
    })

    it('backOnSection: "back" on a section goes to the host, as on the first screen', () => {
      expect(policy.backOnSection).toBe('host-as-on-the-first-screen')
      const actions: HotlayoutAction[] = []
      const document = build()
      const withBack = { ...document, screens: document.screens.map((entry) => ({ ...entry, root: { ...entry.root, children: [{ id: `back-${entry.screenId}`, type: 'Button', props: { label: lit('back'), action: { type: 'navigate.back' } } }, ...entry.root.children!] } })) } as UiDocument
      show(withBack, { onAction: (action) => void actions.push(action) })
      fireEvent.click(screen.getByRole('button', { name: 'Section rewards' }))
      fireEvent.click(screen.getByRole('button', { name: 'back' }))
      expect(actions).toEqual([{ type: 'navigate.back' }])
      expect(document.screens.length).toBe(2)
    })
  })

  it('bottomSafeInset: the inset sits under the bottom zone content; the bar background extends under it; with no zone nothing is added', () => {
    expect(policy.bottomSafeInset).toBe('reader-adds-under-the-bottom-zone')
    const withBar = documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), navBar(['home'])]) }])
    const byDefault = show(withBar)
    const spacer = byDefault.container.querySelector<HTMLElement>('nav [data-hl-safe-inset]')!
    // jsdom does not know `env()` and drops the value, so we look at the value in the server markup.
    expect(spacer).not.toBeNull()
    expect(renderToString(<HotlayoutScreen document={withBar} scroll="screen" />)).toContain('block-size:env(safe-area-inset-bottom, 0px)')
    // The inset is inside the bar itself: its background (on `nav`) extends to the physical bottom.
    expect(spacer.parentElement!.tagName).toBe('NAV')
    cleanup()
    const measured = show(withBar, { safeAreaBottom: 34 })
    expect(measured.container.querySelector<HTMLElement>('nav [data-hl-safe-inset]')!.style.blockSize).toBe('34px')
    cleanup()
    const zero = show(withBar, { safeAreaBottom: 0 })
    expect(zero.container.querySelector('[data-hl-safe-inset]')).toBeNull()
    cleanup()
    // A screen without a bottom zone gets nothing.
    const plain = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' })]) }]), { safeAreaBottom: 34 })
    expect(plain.container.querySelector('[data-hl-safe-inset]')).toBeNull()
    expect(zoneOf(plain.container, 'bottom')).toBeNull()
    cleanup()
    // A pinned block without a bar: the inset is transparent space under the root bottom padding.
    const pinnedOnly = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), nodeOf({ id: 'cta', type: 'Button', pin: 'bottom' })]) }]), { safeAreaBottom: 34 })
    expect(zoneOf(pinnedOnly.container, 'pinned')!.style.paddingBlockEnd).toBe('calc(58px)') // xl = 24 as a theme number: a `none` variable in math would be invalid
  })

  it('bottomSafeInset: the host prop is a number or \'env\'; anything else is zero, and only a computed string goes into the style', () => {
    expect(safeBottomInset(undefined)).toBe('env(safe-area-inset-bottom, 0px)')
    expect(safeBottomInset('env')).toBe('env(safe-area-inset-bottom, 0px)')
    expect(safeBottomInset(34)).toBe('34px')
    expect(safeBottomInset(0)).toBe('0px')
    expect(safeBottomInset(1e9)).toBe('200px')
    for (const hostile of ['34px', 'red;position:fixed', 'url(x)', -5, Number.NaN, Number.POSITIVE_INFINITY, null, {}, [], true, 'ENV']) {
      expect(safeBottomInset(hostile), typeof hostile).toBe('0px')
    }
  })

  it('bottomSafeInset: a sheet has an inset under the pinned block, a window in the middle does not', () => {
    const document = (placement: string): UiDocument =>
      ({
        schemaVersion: '9.12.0',
        documentId: 'case',
        name: 'case',
        initialScreenId: 'home',
        screens: [
          { screenId: 'home', name: 'home', root: rootOf('home', [{ id: 'go', type: 'Button', props: { label: lit('go'), action: { type: 'navigate', params: { screenId: 'sheet' } } } }]) },
          { screenId: 'sheet', name: 'sheet', presentation: 'modal', modalPlacement: placement, root: rootOf('sheet', [nodeOf({ id: 's', type: 'Text' }), nodeOf({ id: 'cta', type: 'Button', pin: 'bottom' })]) },
        ],
      }) as unknown as UiDocument
    for (const [placement, expected] of [['bottom', 'calc(58px)'], ['center', 'var(--product-space-xl)']] as const) {
      const view = show(document(placement), { safeAreaBottom: 34 })
      fireEvent.click(nodeIn(view.container, 'go')!)
      const layer = view.container.querySelector('[data-hl-screen="sheet"]')!
      expect(zoneOf(layer, 'pinned')!.style.paddingBlockEnd, placement).toBe(expected)
      // The pinned block at the bottom of the LAYER: the layer body scrolls above it.
      expect(zoneOf(layer, 'body')!.nextElementSibling).toBe(zoneOf(layer, 'bottom'))
      expect(zoneOf(layer, 'body')!.style.overflowY).toBe('auto')
      cleanup()
    }
  })

  it('bottomZoneKeyboard: the rule is only in the data, the reader executes nothing', () => {
    expect(policy.bottomZoneKeyboard).toBe('pinned-above-nav-bar-covered')
    expect(BOTTOM_ZONE_RULES.keyboard).toEqual({
      applies: 'when-the-screen-keyboard-is-shown',
      body: 'area-ends-at-the-top-of-the-pinned-block-above-the-keyboard',
      pinned: 'rides-above-the-keyboard',
      navBar: 'covered-by-the-keyboard',
      safeInset: 'not-added-above-the-keyboard',
      since: 'named-ahead-no-text-input-in-9.12',
    })
    const files = readdirSync(join(PACKAGE_DIR, 'src'), { recursive: true, encoding: 'utf8' }).filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.'))
    const sources = files.filter((file) => file === 'render.tsx' || file.startsWith('render/') || file === 'HotlayoutScreen.tsx' || file.startsWith('screen/') || file === 'bottom-zone.ts').map((file) => readFileSync(join(PACKAGE_DIR, 'src', file), 'utf8'))
    for (const source of sources) expect(source).not.toMatch(/visualViewport|virtualKeyboard/)
  })
})

/* ───────────────────────────── block without its own height ───────────────────────────── */

describe('block without its own height (`scroll="page"`): the bottom zone sticks to the window bottom', () => {
  const withBlock = (): UiDocument =>
    documentOf([
      {
        id: 'home',
        root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), nodeOf({ id: 'cta', type: 'Button', pin: 'bottom' }), navBar(['home'])], { style: { ...ROOT_STYLE, background: { kind: 'color', color: 'surface' } } }),
      },
    ])

  it('by default `position: sticky; bottom: 0`, above the content; the `chrome` prop applies to both zones', () => {
    const view = show(withBlock(), { scroll: 'page' })
    const bottom = zoneOf(view.container, 'bottom')!
    expect(bottom.style.position).toBe('sticky')
    expect(bottom.style.insetBlockEnd).toBe('0px')
    expect(bottom.style.zIndex).toBe('1')
    // The package root is not weakened: a click outside its bounds is caught by the host page, not the document.
    const rootEl = view.container.querySelector<HTMLElement>('[data-hotlayout]')!
    expect(rootEl.style.overflow).toBe('clip')
    expect(rootEl.style.contain).toBe('layout paint')
    cleanup()
    const fixed = show(withBlock(), { scroll: 'page', chrome: 'static' })
    expect(zoneOf(fixed.container, 'bottom')!.style.position).toBe('')
    // The bottom zone is the last row of the block.
    expect(zoneOf(fixed.container, 'body')!.nextElementSibling).toBe(zoneOf(fixed.container, 'bottom'))
  })

  it('the safe area inset applies only while the zone is stuck', () => {
    const sticky = show(withBlock(), { scroll: 'page', safeAreaBottom: 34 })
    expect(sticky.container.querySelector<HTMLElement>('[data-hl-safe-inset]')!.style.blockSize).toBe('34px')
    cleanup()
    const flat = show(withBlock(), { scroll: 'page', chrome: 'static', safeAreaBottom: 34 })
    expect(flat.container.querySelector('[data-hl-safe-inset]')).toBeNull()
  })

  it('`stickyBottomOffset`: a length or a host variable; anything else is zero', () => {
    const offsetOf = (value: unknown): string => {
      const view = show(withBlock(), { scroll: 'page', stickyBottomOffset: value as number })
      const text = zoneOf(view.container, 'bottom')!.style.insetBlockEnd
      cleanup()
      return text
    }
    expect(offsetOf('56px')).toBe('56px')
    expect(offsetOf(40)).toBe('40px')
    expect(offsetOf('var(--site-footer)')).toBe('var(--site-footer)')
    expect(offsetOf('calc(1px + 2px)')).toBe('0px')
    expect(offsetOf('0;position:fixed')).toBe('0px')
  })

  it('the backing under the pinned block is the root background at the root size, anchored to its bottom; without a block there is none', () => {
    const view = show(withBlock(), { scroll: 'page' })
    const backdrop = zoneOf(view.container, 'bottom')!.querySelector<HTMLElement>('[data-hl-backdrop]')!
    expect(backdrop.getAttribute('aria-hidden')).toBe('true')
    expect(backdrop.style.pointerEvents).toBe('none')
    expect(backdrop.style.justifyContent).toBe('flex-end')
    const inner = backdrop.firstElementChild as HTMLElement
    expect(inner.style.backgroundColor).toBe('var(--product-color-surface)')
    expect(inner.style.inlineSize).toContain('--hl-backdrop-w')
    expect(inner.style.blockSize).toContain('--hl-backdrop-h')
    cleanup()
    const navOnly = show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), navBar(['home'])]) }]), { scroll: 'page' })
    expect(navOnly.container.querySelector('[data-hl-backdrop]')).toBeNull()
    cleanup()
    const fixed = show(withBlock(), { scroll: 'page', chrome: 'static' })
    expect(fixed.container.querySelector('[data-hl-backdrop]')).toBeNull()
  })

  it('the bottom `scroll-margin` of body children equals the zone height (+ host offset): the root writes the variable, the stylesheet holds the rule', () => {
    const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320)
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(900)
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(61)
    const view = show(withBlock(), { scroll: 'page', stickyBottomOffset: '10px' })
    const root = view.container.querySelector<HTMLElement>('[data-hl-type="Screen"]')!
    expect(root.style.getPropertyValue('--hl-sticky-clear-end')).toBe('calc(61px + 10px)')
    expect(root.style.getPropertyValue('--hl-backdrop-w')).toBe('320px')
    expect(root.style.getPropertyValue('--hl-backdrop-h')).toBe('900px')
    expect(view.container.querySelector('style')!.textContent).toContain('scroll-margin-block-end:var(--hl-sticky-clear-end,0px)')
    view.unmount()
    client.mockRestore()
    clientHeight.mockRestore()
    offsetHeight.mockRestore()
  })

  it('a screen with its own height needs no sticking and no variables', () => {
    const view = show(withBlock(), { scroll: 'screen' })
    expect(zoneOf(view.container, 'bottom')!.style.position).toBe('')
    expect(view.container.querySelector<HTMLElement>('[data-hl-type="Screen"]')!.style.getPropertyValue('--hl-sticky-clear-end')).toBe('')
  })
})

/* ───────────────────────────── untrusted input ───────────────────────────── */

describe('untrusted input: a shape the contract does not promise does not crash the host', () => {
  const reports: unknown[] = []
  const sink = (report: unknown): void => void reports.push(report)

  it('50 items, a `NavItem` outside the bar, a `NavBar` that is not last, two bars, a bar in a column: it is drawn', () => {
    const many = { id: 'nav', type: 'NavBar', props: {}, children: Array.from({ length: 50 }, (_, index) => ({ id: `i${String(index)}`, type: 'NavItem', props: { icon: 'house', label: lit(`P${String(index)}`), action: section('home') } })) } as unknown as UiNode
    const lone = { id: 'lone', type: 'NavItem', props: { icon: 'house', label: lit('Lone'), action: section('home') } } as unknown as UiNode
    const nested = { id: 'col', type: 'Column', props: {}, children: [navBar(['home'], { id: 'inner' })] } as unknown as UiNode
    const document = documentOf([{ id: 'home', root: rootOf('home', [lone, nested, { ...navBar(['home']), id: 'nav-first' }, many]) }])
    const view = show(document, { onReport: sink })
    // Only the last bar is a zone, five items out of fifty; the other bars are ordinary body nodes.
    expect(zoneOf(view.container, 'navBar')!.querySelectorAll('button')).toHaveLength(5)
    expect(view.container.querySelectorAll('nav')).toHaveLength(3)
    expect(screen.getByText('Lone')).toBeTruthy()
    expect(reports.filter((report) => (report as { kind: string }).kind === 'render-error')).toEqual([])
  })

  it('an item without `props`, `null` instead of a node, an action that is not an object, `children` not an array do not crash it', () => {
    const broken = {
      id: 'nav',
      type: 'NavBar',
      props: {},
      children: [{ id: 'a', type: 'NavItem' }, null, { id: 'b', type: 'NavItem', props: { label: lit('B'), icon: 7, action: 'navigate.section' } }, { id: 'c', type: 'NavItem', props: { label: { kind: 'literal' }, icon: 'house', action: { type: SECTION_ACTION_TYPE, params: { screenId: { toString: 'x' } } } } }],
    } as unknown as UiNode
    const noChildren = { id: 'empty', type: 'NavBar', props: {}, children: 'items' } as unknown as UiNode
    show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), broken]) }]), { onReport: sink })
    cleanup()
    show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 'a', type: 'Text' }), noChildren]) }]), { onReport: sink })
    expect(reports.filter((report) => (report as { kind: string }).kind === 'render-error')).toEqual([])
  })

  it('`navigate.section` with hostile parameters: `__proto__`, a non-string, an empty one go to the host as is, the stack does not move', () => {
    const actions: HotlayoutAction[] = []
    const bar = {
      id: 'nav',
      type: 'NavBar',
      props: {},
      children: [
        { id: 'a', type: 'NavItem', props: { icon: 'house', label: lit('empty'), action: { type: SECTION_ACTION_TYPE, params: { screenId: '' } } } },
        { id: 'b', type: 'NavItem', props: { icon: 'house', label: lit('proto'), action: { type: SECTION_ACTION_TYPE, params: JSON.parse('{"__proto__":{"screenId":"home"}}') as unknown } } },
        { id: 'c', type: 'NavItem', props: { icon: 'house', label: lit('number'), action: { type: SECTION_ACTION_TYPE, params: { screenId: 5 } } } },
      ],
    } as unknown as UiNode
    const shown: ScreenShown[] = []
    show(documentOf([{ id: 'home', root: rootOf('home', [nodeOf({ id: 't', type: 'Text' }), bar]) }]), { onAction: (action) => void actions.push(action), onScreenChange: (event) => void shown.push(event) })
    for (const name of ['empty', 'proto', 'number']) fireEvent.click(screen.getByRole('button', { name }))
    expect(shown).toHaveLength(1)
    expect(actions).toHaveLength(3)
    expect(actions.every((action) => action.type === SECTION_ACTION_TYPE)).toBe(true)
  })
})

/* ───────────────────────────── fixture in three languages ───────────────────────────── */

describe('the `bottom-zone-screens` fixture: English, Ukrainian, Arabic', () => {
  const fixture = JSON.parse(readFileSync('contract/fixtures/bottom-zone-screens.json', 'utf8')) as UiDocument

  it.each([
    ['en', 'Home', 'ltr'],
    ['uk', null, 'ltr'],
    ['ar', null, 'rtl'],
  ] as const)('locale %s: five screens, a bar on three sections, direction %s', (locale, home, direction) => {
    const view = show(fixture, { locale })
    expect(view.container.querySelector('[data-hotlayout]')!.getAttribute('dir')).toBe(direction)
    expect(view.container.querySelectorAll('nav button')).toHaveLength(3)
    if (home !== null) expect(screen.getByRole('button', { name: home }).getAttribute('aria-current')).toBe('page')
    // The same document through the sections: each has a bar with exactly one active item.
    for (const target of ['rewards', 'profile', 'home']) {
      const buttons = Array.from(view.container.querySelectorAll('nav button'))
      fireEvent.click(buttons[['home', 'rewards', 'profile'].indexOf(target)]!)
      expect(view.container.querySelector(`[data-hl-screen="${target}"]`)).not.toBeNull()
      expect(view.container.querySelectorAll('nav button[aria-current="page"]')).toHaveLength(1)
    }
  })

  it('screen `terms`: a pinned button in the bottom zone, no bar; `confirm` is a sheet with two pinned buttons and no bar', () => {
    const view = show(fixture, { entry: undefined })
    fireEvent.click(nodeIn(view.container, 'home-terms')!)
    const terms = view.container.querySelector('[data-hl-screen="terms"]')!
    expect(zoneOf(terms, 'pinned')!.querySelector('[data-hl-node="terms-continue"]')).not.toBeNull()
    expect(terms.querySelector('nav')).toBeNull()
    expect(zoneOf(terms, 'body')!.querySelector('[data-hl-node="terms-7"]')).not.toBeNull()
    // The pinned button switches the section and closes "details".
    fireEvent.click(nodeIn(terms, 'terms-continue')!)
    expect(view.container.querySelector('[data-hl-screen="rewards"]')).not.toBeNull()
    expect(view.container.querySelectorAll('[data-hl-screen]')).toHaveLength(1)
    // The pinned button of the "rewards" screen is above the bar.
    const rewards = view.container.querySelector('[data-hl-screen="rewards"]')!
    expect(Array.from(zoneOf(rewards, 'bottom')!.children).map((element) => element.getAttribute('data-hl-zone'))).toEqual(['pinned', 'navBar'])
    // The confirmation sheet.
    fireEvent.click(nodeIn(rewards, 'rewards-redeem')!)
    const sheet = view.container.querySelector('[data-hl-screen="confirm"]')!
    expect(sheet.getAttribute('data-hl-presentation')).toBe('modal')
    expect(zoneOf(sheet, 'pinned')!.querySelectorAll('button')).toHaveLength(2)
    expect(sheet.querySelector('nav')).toBeNull()
    // The page bar under the sheet has not gone anywhere, but is hidden from the keyboard together with the page.
    expect(rewards.hasAttribute('inert')).toBe(true)
  })
})
