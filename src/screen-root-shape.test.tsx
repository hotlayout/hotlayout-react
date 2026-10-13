/**
 * The screen root has ONE shape for all width classes.
 *
 * A width class changes styles, not structure: the screen body sits in the same wrappers at the
 * same depth whether or not an app bar, a bottom zone and a content column are present. Otherwise
 * React rebuilds the body subtree: an input loses focus and unfinished composition, an expanded
 * block collapses.
 *
 * The guard runs over every screen of every contract fixture, in two ways:
 *  - the path from the package root to each body node (tags, roles and zone marks of the wrappers)
 *    is the same in all three classes, which is visible in the server markup too;
 *  - a body node element after a live class change is the SAME element (identity, not similarity),
 *    which is what "not remounted" means.
 *
 * Alongside: the rules that travel with this one — focus on a navigation item that moves with the
 * bar, and the width class lock on a real screen (the rule itself is in `width-class-lock.test.ts`).
 */
import { act, cleanup, render } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { ThemeContract, UiDocument } from './index'
import { WIDTH_CLASSES } from './width-class'
import type { WidthClass } from './width-class'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const FIXTURES_DIR = 'contract/fixtures'
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown
const fixtureNames = readdirSync(FIXTURES_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))

/** The theme of a fixture if it has its own (`contract/fixtures/themes/`); otherwise the built-in one. */
function themeOf(name: string): ThemeContract | undefined {
  try {
    return read(join(FIXTURES_DIR, 'themes', `${name.replace(/-screens?$/, '')}-theme.json`)) as ThemeContract
  } catch {
    return undefined
  }
}

/** Package root widths by which a test picks the class: jsdom computes no layout. */
const WIDTH_OF: Readonly<Record<WidthClass, number>> = { compact: 393, medium: 800, expanded: 1280 }

/** Fake `ResizeObserver` and package root width. The clock stands still until the test advances it. */
function stubMeasuring(): { readonly setWidth: (width: number) => void; readonly clock: { now: number } } {
  const callbacks: ResizeObserverCallback[] = []
  const clock = { now: 1000 }
  let width = 0
  class FakeObserver {
    constructor(callback: ResizeObserverCallback) {
      callbacks.push(callback)
    }
    observe(): void {
      /* the test supplies the size */
    }
    unobserve(): void {
      /* the fake observer unsubscribes nothing */
    }
    disconnect(): void {
      /* and disconnects nothing */
    }
  }
  vi.stubGlobal('ResizeObserver', FakeObserver)
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const own = this.hasAttribute('data-hotlayout') ? width : 0
    return { x: 0, y: 0, top: 0, left: 0, right: own, bottom: 0, width: own, height: 0, toJSON: () => ({}) }
  })
  const setWidth = (next: number): void => {
    width = next
    act(() => {
      // An entry without a size: the reader measures the root by its rectangle, which the test supplies.
      for (const callback of callbacks) callback([], {} as ResizeObserver)
    })
  }
  return { setWidth, clock }
}

/** One step of a path: tag, role and zone mark — everything by which a wrapper differs for React and for a screen reader. */
function stepOf(element: Element): string {
  const role = element.getAttribute('role')
  const zone = element.getAttribute('data-hl-zone')
  const content = element.hasAttribute('data-hl-content') ? '[content]' : ''
  return `${element.tagName.toLowerCase()}${role === null ? '' : `[role=${role}]`}${zone === null ? '' : `[zone=${zone}]`}${content}`
}

/** The path from the package root to an element (the element itself excluded). */
function pathOf(element: Element): string {
  const steps: string[] = []
  for (let at = element.parentElement; at !== null && !at.hasAttribute('data-hotlayout'); at = at.parentElement) steps.unshift(stepOf(at))
  return steps.join(' > ')
}

/** Children of the first-layer body: document nodes standing directly in the body content column. A node whose id occurs twice is skipped, since identity cannot be compared for it. */
function bodyNodes(container: ParentNode): Map<string, HTMLElement> {
  const column = container.querySelector('[data-hl-presentation="page"] [data-hl-zone="body"] > div > [data-hl-content]')
  const found = new Map<string, HTMLElement>()
  const repeated = new Set<string>()
  for (const child of Array.from(column?.children ?? [])) {
    const id = child.getAttribute('data-hl-node')
    if (id === null || !(child instanceof HTMLElement)) continue
    if (found.has(id)) repeated.add(id)
    found.set(id, child)
  }
  for (const id of repeated) found.delete(id)
  return found
}

const screensOf = (document: UiDocument): readonly string[] => document.screens.map((entry) => entry.screenId)
const startingAt = (document: UiDocument, screenId: string): UiDocument => ({ ...document, initialScreenId: screenId })

describe('guard: the path to body nodes is the same in all three width classes, for every screen of every fixture', () => {
  const cases = fixtureNames.flatMap((name) => {
    const document = read(join(FIXTURES_DIR, `${name}.json`)) as UiDocument
    return screensOf(document).map((screenId) => [`${name} · ${screenId}`, name, document, screenId] as const)
  })

  it('fixtures are found and they hold more than one screen', () => {
    expect(fixtureNames.length).toBeGreaterThan(20)
    expect(cases.length).toBeGreaterThan(fixtureNames.length)
  })

  it.each(cases)('%s: server markup', (_label, name, document, screenId) => {
    const paths = WIDTH_CLASSES.map((widthClass) => {
      const html = renderToString(<HotlayoutScreen document={startingAt(document, screenId)} theme={themeOf(name)} initialWidthClass={widthClass} injectStyles={false} onReport={() => undefined} />)
      const holder = window.document.createElement('div')
      holder.innerHTML = html
      const nodes = bodyNodes(holder)
      // The content column exists in every class, however many children it has.
      expect(holder.querySelector('[data-hl-presentation="page"] [data-hl-zone="body"] > div > [data-hl-content]'), widthClass).not.toBeNull()
      return new Map(Array.from(nodes, ([id, element]) => [id, pathOf(element)]))
    })
    const [compact, medium, expanded] = paths
    if (compact === undefined || medium === undefined || expanded === undefined) throw new Error('there are three classes')
    for (const [id, path] of compact) {
      // A node hidden by the class (`showOn`) has nothing to compare with.
      for (const other of [medium, expanded]) if (other.has(id)) expect(other.get(id), id).toBe(path)
    }
    // One and the same path for EVERY body node: the root structure does not depend on its children.
    expect(new Set([...compact.values(), ...medium.values(), ...expanded.values()]).size).toBeLessThanOrEqual(1)
  })

  it.each(cases)('%s: a live class change keeps the same elements', (_label, name, document, screenId) => {
    const measuring = stubMeasuring()
    measuring.setWidth(WIDTH_OF.compact)
    const view = render(<HotlayoutScreen document={startingAt(document, screenId)} theme={themeOf(name)} injectStyles={false} onReport={() => undefined} />)
    let before = bodyNodes(view.container)
    for (const widthClass of ['medium', 'expanded', 'compact', 'expanded'] as const) {
      measuring.clock.now += 5000
      measuring.setWidth(WIDTH_OF[widthClass])
      const after = bodyNodes(view.container)
      for (const [id, element] of before) {
        const now = after.get(id)
        if (now !== undefined) expect(now === element, `${id} → ${widthClass}: remounted`).toBe(true)
      }
      before = after
    }
  })
})

/* ───────────────────────── zones that appear and disappear with the class ───────────────────────── */

type Json = Record<string, unknown>
const lit = (value: unknown): Json => ({ kind: 'literal', value })
const text = (id: string, extra: Json = {}): Json => ({ id, type: 'Text', props: { content: lit(id), align: 'start', overflow: 'ellipsis' }, ...extra })
const field = (id: string): Json => ({ id, type: 'TextField', props: { value: { kind: 'binding', path: `form.${id}` }, label: lit(id) } })
const navItem = (id: string, screenId?: string): Json => ({ id, type: 'NavItem', props: { icon: 'house', label: lit(id), action: screenId === undefined ? { type: 'none' } : { type: 'navigate.section', params: { screenId } } } })
const navBar = (props: Json = {}): Json => ({ id: 'nav', type: 'NavBar', props, children: [navItem('nav-a', 's'), navItem('nav-b'), navItem('nav-c')] })
const appBar = (extra: Json = {}): Json => ({ id: 'bar', type: 'AppBar', props: { title: lit('Title'), showBack: false }, children: [], ...extra })
const doc = (children: readonly Json[], rootExtra: Json = {}): UiDocument =>
  JSON.parse(
    JSON.stringify({
      schemaVersion: READER_SCHEMA_VERSION,
      documentId: 'shape',
      name: 'shape',
      initialScreenId: 's',
      screens: [{ screenId: 's', name: 's', root: { id: 'root', type: 'Screen', props: { gap: 'sm' }, style: { padding: 'md' }, children, ...rootExtra } }],
    }),
  ) as UiDocument
const show = (document: UiDocument, props: Partial<Parameters<typeof HotlayoutScreen>[0]> = {}): HTMLElement =>
  render(<HotlayoutScreen document={document} injectStyles={false} onReport={() => undefined} {...props} />).container

describe('all zone combinations: the path to the body is the same whichever zones are shown', () => {
  const pinned: Json = { id: 'cta', type: 'Button', props: { label: lit('cta'), variant: 'primary', action: { type: 'none' }, fullWidth: true }, pin: 'bottom' }
  const combos: readonly [string, readonly Json[], Json][] = [
    ['body only', [text('t')], {}],
    ['app bar', [appBar(), text('t')], {}],
    ['pinned block', [text('t'), pinned], {}],
    ['navigation bar', [text('t'), navBar()], {}],
    ['navigation bar that stays at the bottom', [text('t'), navBar({ widePlacement: 'bottom' })], {}],
    ['app bar, pinned block and navigation bar', [appBar(), text('t'), pinned, navBar()], {}],
    ['content column', [text('t')], { props: { gap: 'sm', contentMaxWidth: 720 } }],
    ['content column on wide classes only', [appBar(), text('t'), pinned, navBar()], { propsOn: { expanded: { contentMaxWidth: 960 } } }],
    ['app bar on phones only, pinned block on wide classes only', [appBar({ showOn: ['compact'] }), text('t'), { ...pinned, showOn: ['medium', 'expanded'] }, navBar()], {}],
  ]
  const BODY_PATH = 'div > div > div[zone=body] > div > div[content]'

  it.each(combos)('%s', (_name, children, rootExtra) => {
    for (const hostProps of [{}, { scroll: 'screen' as const }, { chrome: 'static' as const }]) {
      for (const widthClass of WIDTH_CLASSES) {
        const container = show(doc(children, rootExtra), { initialWidthClass: widthClass, ...hostProps })
        const node = container.querySelector('[data-hl-node="t"]')
        if (node === null) throw new Error('no body')
        // Package root -> page layer -> screen root -> body area -> body padding -> content column.
        expect(pathOf(node), `${widthClass} ${JSON.stringify(hostProps)}`).toBe(BODY_PATH)
        cleanup()
      }
    }
  })

  it('the pinned block sits in the content column with and without the field — the same element after a class change', () => {
    const measuring = stubMeasuring()
    measuring.setWidth(393)
    const view = show(doc([text('t'), pinned], { propsOn: { medium: { contentMaxWidth: 720 } } }))
    const before = view.querySelector('[data-hl-node="cta"]')
    expect(before?.parentElement?.hasAttribute('data-hl-content')).toBe(true)
    expect(before?.parentElement?.style.maxInlineSize).toBe('')
    measuring.setWidth(800)
    const after = view.querySelector('[data-hl-node="cta"]')
    expect(after).toBe(before)
    expect(after?.parentElement?.style.maxInlineSize).toBe('720px')
  })
})

describe('focus on a navigation item moves with the bar', () => {
  const screen = (): UiDocument => doc([appBar(), field('name'), navBar()])
  const item = (view: ParentNode, id: string): HTMLElement => {
    const found = view.querySelector<HTMLElement>(`nav [data-hl-node="${id}"]`)
    if (found === null) throw new Error(`item ${id} is missing`)
    return found
  }

  it('bottom -> app bar -> bottom: focus stays on the same item in its new place, not on <body>', () => {
    const measuring = stubMeasuring()
    measuring.setWidth(393)
    const view = show(screen())
    const low = item(view, 'nav-b')
    expect(low.closest('[data-hl-zone="navBar"]')).not.toBeNull()
    low.focus()
    expect(window.document.activeElement).toBe(low)

    measuring.setWidth(1280)
    const high = item(view, 'nav-b')
    expect(high.closest('[data-hl-zone="appBar"]')).not.toBeNull()
    expect(high).not.toBe(low)
    expect(window.document.activeElement).toBe(high)

    measuring.clock.now += 5000
    measuring.setWidth(393)
    const again = item(view, 'nav-b')
    expect(again.closest('[data-hl-zone="navBar"]')).not.toBeNull()
    expect(window.document.activeElement).toBe(again)
  })

  it('focus was in a body field and stays there: the item does not take it', () => {
    const measuring = stubMeasuring()
    measuring.setWidth(393)
    const view = show(screen())
    item(view, 'nav-b').focus()
    const input = view.querySelector('input')
    if (input === null) throw new Error('no input')
    input.focus()
    measuring.setWidth(1280)
    expect(view.querySelector('input')).toBe(input)
    expect(window.document.activeElement).toBe(input)
  })

  it('focus left the item for nowhere (a click on empty space) — the move does not bring it back', () => {
    const measuring = stubMeasuring()
    measuring.setWidth(393)
    const view = show(screen())
    const low = item(view, 'nav-b')
    low.focus()
    low.blur()
    measuring.setWidth(1280)
    expect(window.document.activeElement).toBe(window.document.body)
  })

  it('an item hidden on the wide class gets no focus, and the screen does not crash', () => {
    const measuring = stubMeasuring()
    measuring.setWidth(393)
    const hidden: Json = { ...navBar(), children: [navItem('nav-a', 's'), { ...navItem('nav-b'), showOn: ['compact'] }] }
    const view = show(doc([appBar(), text('t'), hidden]))
    item(view, 'nav-b').focus()
    measuring.setWidth(1280)
    expect(view.querySelector('nav [data-hl-node="nav-b"]')).toBeNull()
    expect(view.querySelector('nav [data-hl-node="nav-a"]')).not.toBeNull()
  })
})

describe('the width class lock on a real screen', () => {
  /** Three nodes, one per class: whichever is on screen names the active class. */
  const probes = [text('is-compact', { showOn: ['compact'] }), text('is-medium', { showOn: ['medium'] }), text('is-expanded', { showOn: ['expanded'] })]
  const classShown = (root: ParentNode): string => WIDTH_CLASSES.filter((name) => root.querySelector(`[data-hl-node="is-${name}"]`) !== null).join('+')

  const loops: readonly [string, Readonly<Record<string, number>>][] = [
    ['cycle over two classes', { compact: 700, medium: 300, expanded: 300 }],
    ['cycle over three classes', { compact: 700, medium: 1100, expanded: 300 }],
  ]

  it.each(loops)('%s stops at the narrowest class; after the host changes the width the class is correct', (_name, widthOfContent) => {
    const measuring = stubMeasuring()
    const view = show(doc(probes))
    let changes = 0
    let last = classShown(view)
    const frame = (width: number): void => {
      measuring.clock.now += 16
      measuring.setWidth(width)
      if (classShown(view) !== last) changes += 1
      last = classShown(view)
    }
    // A root without its own width: as wide as what is drawn in it.
    for (let step = 0; step < 60; step += 1) frame(widthOfContent[classShown(view)] ?? 0)
    expect(last).toBe('compact')
    expect(changes).toBeLessThanOrEqual(4)

    // The host gave the root a width (a window, a column): the class follows it, in each of the three.
    for (const [width, expected] of [[1300, 'expanded'], [800, 'medium'], [393, 'compact'], [1024, 'expanded']] as const) {
      measuring.clock.now += 2000
      measuring.setWidth(width)
      expect(classShown(view), String(width)).toBe(expected)
      // And it holds: the same width changes nothing.
      measuring.clock.now += 16
      measuring.setWidth(width)
      expect(classShown(view), String(width)).toBe(expected)
    }
  })

  it('honest jitter at a boundary that stopped at a width the lock took for a cycle step: within a second the class follows the width', () => {
    vi.useFakeTimers()
    try {
      const measuring = stubMeasuring()
      measuring.setWidth(599)
      const view = show(doc(probes))
      for (const width of [601, 599, 601, 599, 601]) {
        measuring.clock.now += 16
        measuring.setWidth(width)
      }
      // Locked on the narrower class although the width is already 601.
      expect(classShown(view)).toBe('compact')
      measuring.clock.now += 1100
      act(() => {
        vi.advanceTimersByTime(1100)
      })
      expect(classShown(view)).toBe('medium')
    } finally {
      vi.useRealTimers()
    }
  })
})
