/**
 * The trust boundary for the leaves of schemas 9.22.0 and 9.23.0: a hostile string or number in EVERY
 * leaf of the frames `float-nav-swipe-screens` and `filter-gradient-compact-screens`, and a hostile
 * value of every SHAPE of the new fields (`float`, `badgeWhen`, `confirm`, `border.style`, `where`,
 * `valuePath`, `item`, `textGradient`, `notation`), must not reach `style`, `src` or an address. The new
 * fields turn into a word that selects a branch, a condition, a gradient, a number in a data URL and a
 * suffix from a table, so the check is also that a data URL in the markup is only the two shapes the
 * reader makes itself, and that a hostile filter or operand reads nothing off the prototype.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'
import { WIDTH_CLASSES } from './width-class'

afterEach(cleanup)

const MARK = 'attacker.test'
const HOSTILE_STRING = `#000"');},url(http://${MARK}/x);position:fixed;inset:0;z-index:9;--y:`
const HOSTILE_NUMBER = 123_456_789

type Path = readonly (string | number)[]

function leavesOf(value: unknown, path: Path = [], out: Path[] = []): Path[] {
  if (Array.isArray(value)) value.forEach((item, index) => leavesOf(item, [...path, index], out))
  else if (typeof value === 'object' && value !== null) for (const [key, item] of Object.entries(value)) leavesOf(item, [...path, key], out)
  else out.push(path)
  return out
}

function replaced(value: unknown, path: Path, next: unknown): unknown {
  const copy: unknown = structuredClone(value)
  let cursor = copy as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (last !== undefined) cursor[last] = next
  return copy
}

const decode = (text: string): string => text.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')

/** The CSS and the addresses in the markup: the attributes `style`, `src`, `srcset`, `href`. */
function sinksOf(html: string): readonly string[] {
  return [...html.matchAll(/\s(?:style|src|srcset|href)="([^"]*)"/g)].map((match) => decode(match[1] ?? ''))
}

/** The only data URLs the reader makes: the mask of an icon, and the dashes of a border (a path of numbers, one composed colour). */
const OWN_URL = /^url\("data:image\/svg\+xml,[^"]*"\)$/
const DASH_IMAGE = /^%3Csvg xmlns='http:\/\/www\.w3\.org\/2000\/svg' width='[\d.]+' height='[\d.]+' viewBox='0 0 [\d.]+ [\d.]+'%3E%3Cpath d='[MLAZ0-9 .-]+' fill='none' stroke='(?:%23[0-9a-f]{6}(?:[0-9a-f]{2})?|rgba\(\d+, \d+, \d+, [\d.]+\))' stroke-width='[\d.]+' stroke-dasharray='[\d.]+ [\d.]+'( transform='matrix\(-1 0 0 1 [\d.]+ 0\)')?\/%3E%3C\/svg%3E$/

function expectClean(html: string, what: string): void {
  for (const sink of sinksOf(html)) {
    if (sink.includes(MARK) || /position\s*:\s*fixed/.test(sink) || /(?<![\d.])\d{7,}(?:px|ms)/.test(sink) || /[\n\r]/.test(sink)) throw new Error(`${what}: a hostile value reached the style or an address — ${sink.slice(0, 200)}`)
    for (const url of sink.matchAll(/url\((?:"[^"]*"|[^)"]*)\)/g)) {
      const found = url[0]
      if (!OWN_URL.test(found)) throw new Error(`${what}: a url the reader did not make — ${found.slice(0, 160)}`)
      const body = found.slice('url("data:image/svg+xml,'.length, -2)
      // An icon mask is a body of the bundled set; the dashes of a border are the one shape above.
      if (body.includes('stroke-dasharray') && !DASH_IMAGE.test(body)) throw new Error(`${what}: the dashes are not made of numbers and one colour — ${body.slice(0, 200)}`)
    }
  }
}

const silent = (): void => undefined

const FRAMES = {
  nav: JSON.parse(readFileSync('contract/fixtures/float-nav-swipe-screens.json', 'utf8')) as UiDocument,
  filter: JSON.parse(readFileSync('contract/fixtures/filter-gradient-compact-screens.json', 'utf8')) as UiDocument,
}
const DATA = {
  'user.newCount': 3,
  'user.points': 1580,
  'user.yearDust': 1300,
  'ui.rewardsCategory': 'food',
  'user.isPremium': true,
  'task.progress': 3,
  'survey.goal': 'saving',
}
const COLLECTIONS = {
  rewards: [
    { id: 'coffee', category: 'food', title: 'Coffee', price: 450 },
    { id: 'book', category: 'fun', title: 'Book', price: 900 },
    { id: 'ticket', category: 'fun', title: 'Ticket', price: 1200 },
  ],
  items: [
    { selectedId: 'saving', name: 'Saver', image: 'https://example.com/a.png' },
    { selectedId: 'travel', name: 'Trip', image: 'https://example.com/b.png' },
  ],
}

function draw(document: UiDocument, screenIndex: number | undefined): string {
  const screens = (document as { screens?: readonly { screenId?: unknown }[] }).screens ?? []
  const id = screenIndex === undefined ? undefined : screens[screenIndex]?.screenId
  const shown = typeof id === 'string' ? ({ ...document, initialScreenId: id } as UiDocument) : document
  return renderToStaticMarkup(<HotlayoutScreen document={shown} data={DATA} collections={COLLECTIONS as never} injectStyles={false} onReport={silent} scroll="screen" />)
}

const restore: (() => void)[] = []
beforeAll(() => {
  // A stand-in layout, so the dashes of a border are really made (jsdom gives every element a zero size).
  for (const [property, value] of [['offsetWidth', 345], ['offsetHeight', 82]] as const) {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, property)
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute('data-hl-dashed') || this.hasAttribute('data-hl-confirm') ? value : 0
      },
    })
    restore.push(() => {
      if (original !== undefined) Object.defineProperty(HTMLElement.prototype, property, original)
    })
  }
})
afterAll(() => {
  for (const undo of restore.reverse()) undo()
})

describe('guard 9.22: no leaf of the nav, swipe and dashed frame reaches a style or an address', () => {
  const frame = FRAMES.nav
  it('the clean frame passes the guard (otherwise it would catch itself) and really has the new fields', () => {
    for (const index of [undefined, 1, 2, 3]) expectClean(draw(frame, index), `frame ${String(index)}`)
    expect(draw(frame, undefined)).toContain('data-hl-floating')
    expect(draw(frame, undefined)).toContain('data-hl-badge')
    expect(draw(frame, 2)).toContain('data-hl-confirm="swipe"')
    expect(draw(frame, 3)).toContain('data-hl-dashed')
  })

  it('every leaf in turn — a hostile string and a hostile number', () => {
    const leaves = leavesOf(frame).filter((path) => {
      const key = path[path.length - 1]
      return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
    })
    expect(leaves.length).toBeGreaterThan(80)
    for (const field of ['float', 'badgeWhen', 'confirm', 'style']) expect(leaves.some((path) => path.includes(field)), field).toBe(true)
    for (const path of leaves) {
      const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
      expectClean(draw(replaced(frame, path, HOSTILE_STRING) as UiDocument, only), `nav: ${path.join('.')}`)
      expectClean(draw(replaced(frame, path, HOSTILE_NUMBER) as UiDocument, only), `nav: ${path.join('.')}`)
    }
  }, 120_000)
})

describe('guard 9.23: no leaf of the filter, gradient and compact frame reaches a style or an address', () => {
  const frame = FRAMES.filter
  it('the clean frame passes the guard and really has the new fields', () => {
    const html = draw(frame, undefined)
    expectClean(html, 'frame')
    expect(html).toContain('data-hl-text-gradient')
  })

  it('every leaf in turn — a hostile string and a hostile number', () => {
    const leaves = leavesOf(frame).filter((path) => {
      const key = path[path.length - 1]
      return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
    })
    expect(leaves.length).toBeGreaterThan(80)
    for (const field of ['where', 'valuePath', 'item', 'textGradient', 'notation']) expect(leaves.some((path) => path.includes(field)), field).toBe(true)
    for (const path of leaves) {
      expectClean(draw(replaced(frame, path, HOSTILE_STRING) as UiDocument, 0), `filter: ${path.join('.')}`)
      expectClean(draw(replaced(frame, path, HOSTILE_NUMBER) as UiDocument, 0), `filter: ${path.join('.')}`)
    }
  }, 120_000)
})

describe('the shape of every new field gets every hostile value, in every width class, and the page still holds', () => {
  const hostile: unknown[] = [
    HOSTILE_STRING,
    HOSTILE_NUMBER,
    [HOSTILE_STRING],
    { [HOSTILE_STRING]: HOSTILE_STRING, kind: HOSTILE_STRING },
    { path: HOSTILE_STRING, op: HOSTILE_STRING, valuePath: HOSTILE_STRING, item: HOSTILE_STRING, where: { path: HOSTILE_STRING, op: 'eq', valuePath: '__proto__' } },
    { path: '__proto__', op: 'eq', valuePath: 'constructor' },
    { angle: HOSTILE_NUMBER, stops: [{ color: HOSTILE_STRING, position: HOSTILE_NUMBER }, { color: { value: HOSTILE_STRING }, position: -1 }] },
    { width: HOSTILE_STRING, color: HOSTILE_STRING, style: HOSTILE_STRING },
    { width: HOSTILE_NUMBER, color: { value: HOSTILE_STRING }, style: 'dashed' },
    // A colour that resolves with a hostile width: the dashes ARE made, of numbers the reader clamped.
    { width: HOSTILE_NUMBER, color: 'border', style: 'dashed' },
    { width: -5, color: { token: 'accent', opacity: HOSTILE_NUMBER }, style: 'dashed' },
    null,
    true,
    -1,
    Number.POSITIVE_INFINITY,
  ]

  it('on a bar, an item, a button, a border, a list, a text and a number', () => {
    for (const value of hostile) {
      const document = {
        schemaVersion: '9.23.0',
        documentId: 'h',
        name: 'h',
        initialScreenId: 'a',
        screens: [
          {
            screenId: 'a',
            name: 'a',
            root: {
              id: 'root',
              type: 'Screen',
              props: {},
              children: [
                { id: 'list', type: 'Repeater', props: { source: 'rewards', item: 'reward', where: value, columns: 2 }, children: [{ id: 'tile', type: 'Text', props: { content: { kind: 'binding', path: 'reward.title', fallback: '?' } }, visibleIf: value }] },
                { id: 'empty', type: 'Text', props: { content: { kind: 'literal', value: 'none' } }, visibleIf: { path: 'rewards', op: 'isEmpty', item: value, where: value } },
                { id: 'g', type: 'Text', props: { content: { kind: 'literal', value: 'Rewards' } }, style: { textGradient: value, border: value, color: { value: '#112233' } }, styleWhen: [{ when: value, style: { textGradient: value } }] },
                { id: 'n', type: 'Text', props: { content: { kind: 'binding', path: 'user.yearDust', fallback: '0', format: 'number', notation: value } } },
                { id: 'b', type: 'Button', props: { label: { kind: 'literal', value: 'Go' }, variant: 'primary', fullWidth: true, action: { type: 'redeem' }, confirm: value }, style: { border: value } },
                { id: 'card', type: 'Container', props: {}, style: { radius: 12, border: value }, children: [{ id: 'inner', type: 'Text', props: { content: { kind: 'literal', value: 'inside' } } }] },
                { id: 'nav', type: 'NavBar', props: { float: value }, style: { margin: value }, children: [{ id: 'i', type: 'NavItem', props: { icon: 'house', label: { kind: 'literal', value: 'Home' }, action: { type: 'navigate.section', params: { screenId: 'a' } }, badgeWhen: value } }] },
              ],
            },
          },
        ],
      } as unknown as UiDocument
      for (const widthClass of WIDTH_CLASSES) {
        const { container, unmount } = render(<HotlayoutScreen document={document} data={DATA} collections={COLLECTIONS as never} initialWidthClass={widthClass} injectStyles={false} onReport={silent} scroll="screen" />)
        act(() => {
          const button = container.querySelector<HTMLElement>('[data-hl-node="b"]')
          if (button !== null) {
            fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 10, clientY: 10 })
            fireEvent.pointerMove(button, { pointerId: 1, clientX: 900, clientY: 10 })
            fireEvent.pointerUp(button, { pointerId: 1, clientX: 900, clientY: 10 })
          }
        })
        expectClean(container.innerHTML, `${JSON.stringify(value)} ${widthClass}`)
        expect(container.querySelector('[data-hl-node="root"]')).not.toBeNull()
        unmount()
      }
    }
  })

  it('a list whose filter names a prototype key or nests filters thousands of levels deep draws and never throws', () => {
    // JSON can nest as deep as it likes: a filter has no filter inside it, and the nesting is never followed.
    const cycle: Record<string, unknown> = { path: 'reward.category', op: 'eq', valuePath: 'ui.rewardsCategory' }
    let cursor = cycle
    for (let level = 0; level < 3000; level += 1) {
      const next: Record<string, unknown> = { path: 'reward.category', op: 'eq', valuePath: 'ui.rewardsCategory' }
      cursor.where = next
      cursor = next
    }
    const document = {
      schemaVersion: '9.23.0',
      documentId: 'h',
      name: 'h',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children: [{ id: 'list', type: 'Repeater', props: { source: 'rewards', item: 'reward', where: cycle }, children: [{ id: 'tile', type: 'Text', props: { content: { kind: 'binding', path: 'reward.title', fallback: '?' } } }] }, { id: 'empty', type: 'Text', props: { content: { kind: 'literal', value: 'none' } }, visibleIf: { path: 'rewards', op: 'isEmpty', item: 'reward', where: cycle } }] } }],
    } as unknown as UiDocument
    const { container } = render(<HotlayoutScreen document={document} data={DATA} collections={COLLECTIONS as never} injectStyles={false} onReport={silent} />)
    expect(container.querySelectorAll('[data-hl-node="tile"]').length).toBe(1)
    expect(container.querySelector('[data-hl-node="empty"]')).toBeNull()
  })
})
