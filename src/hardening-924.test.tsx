/**
 * The trust boundary for the leaves of schema 9.24.0: a hostile string or number in EVERY leaf of the
 * frame `appear-swipe-dot-screens`, and a hostile value of every SHAPE of the new fields
 * (`animateIn`, `pin`, the answer of the host to an action), must not reach `style`, `src` or an
 * address, and must not make the page fall. `animateIn` is the literal `true` or nothing, `pin` a
 * word of a closed list, the answer of the host a promise only when it has a `then` function.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'
import { promiseOf } from './swipe-busy'
import { appearTargets } from './value-appear'

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
const sinksOf = (html: string): readonly string[] => [...html.matchAll(/\s(?:style|src|srcset|href)="([^"]*)"/g)].map((match) => decode(match[1] ?? ''))
const OWN_URL = /^url\("data:image\/svg\+xml,[^"]*"\)$/

function expectClean(html: string, what: string): void {
  for (const sink of sinksOf(html)) {
    if (sink.includes(MARK) || /position\s*:\s*fixed/.test(sink) || /(?<![\d.])\d{7,}(?:px|ms)/.test(sink) || /[\n\r]/.test(sink)) throw new Error(`${what}: a hostile value reached the style or an address — ${sink.slice(0, 200)}`)
    for (const url of sink.matchAll(/url\((?:"[^"]*"|[^)"]*)\)/g)) if (!OWN_URL.test(url[0])) throw new Error(`${what}: a url the reader did not make — ${url[0].slice(0, 160)}`)
  }
}

const silent = (): void => undefined
const FRAME = JSON.parse(readFileSync('contract/fixtures/appear-swipe-dot-screens.json', 'utf8')) as UiDocument
const DATA = { 'user.points': 12480, 'task.progress': 80, 'user.unread': 3 }

function draw(document: UiDocument, screenIndex: number | undefined): string {
  const screens = (document as { screens?: readonly { screenId?: unknown }[] }).screens ?? []
  const id = screenIndex === undefined ? undefined : screens[screenIndex]?.screenId
  const shown = typeof id === 'string' ? ({ ...document, initialScreenId: id } as UiDocument) : document
  return renderToStaticMarkup(<HotlayoutScreen document={shown} data={DATA} injectStyles={false} onReport={silent} scroll="screen" />)
}

describe('guard 9.24: no leaf of the appearance, busy and dot frame reaches a style or an address', () => {
  it('the clean frame passes the guard and really has the new fields', () => {
    for (const index of [undefined, 1, 2, 3]) expectClean(draw(FRAME, index), `frame ${String(index)}`)
    expect(JSON.stringify(FRAME)).toContain('"animateIn":true')
    expect(JSON.stringify(FRAME)).toContain('"pin":"top"')
    expect(draw(FRAME, undefined)).toContain('data-hl-zone="topPinned"')
  })

  it('every leaf in turn — a hostile string and a hostile number', () => {
    const leaves = leavesOf(FRAME).filter((path) => {
      const key = path[path.length - 1]
      return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
    })
    expect(leaves.length).toBeGreaterThan(80)
    for (const field of ['animateIn', 'pin', 'badgeWhen', 'confirm']) expect(leaves.some((path) => path.includes(field)), field).toBe(true)
    for (const path of leaves) {
      const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
      expectClean(draw(replaced(FRAME, path, HOSTILE_STRING) as UiDocument, only), `frame: ${path.join('.')}`)
      expectClean(draw(replaced(FRAME, path, HOSTILE_NUMBER) as UiDocument, only), `frame: ${path.join('.')}`)
    }
  }, 120_000)
})

describe('the shape of every new field gets every hostile value', () => {
  const hostile: unknown[] = [HOSTILE_STRING, HOSTILE_NUMBER, [HOSTILE_STRING], { top: true }, { [HOSTILE_STRING]: 1 }, 'Top', 'TOP', ' top', 'top ', 'bottom,top', null, true, false, 0, -1, Number.POSITIVE_INFINITY]

  function documentOf(extraNode: Record<string, unknown>): UiDocument {
    return {
      schemaVersion: '9.24.0',
      documentId: 'h',
      name: 'h',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children: [{ id: 'one', type: 'Text', props: { content: { kind: 'literal', value: 'one' } } }, extraNode, { id: 'two', type: 'Text', props: { content: { kind: 'binding', path: 'user.points', fallback: '0', format: 'number' } } }] } }],
    } as unknown as UiDocument
  }

  it('`pin` and `animateIn` take any value without a style, an address or a fall; only the exact word and the literal `true` act', () => {
    for (const value of hostile) {
      const node = { id: 'x', type: 'Text', pin: value, props: { content: { kind: 'binding', path: 'user.points', fallback: '0' }, animateIn: value } }
      const html = renderToStaticMarkup(<HotlayoutScreen document={documentOf(node)} data={DATA} injectStyles={false} onReport={silent} scroll="screen" />)
      expectClean(html, `value ${JSON.stringify(value)}`)
      // The word acts only at the start of the root: `one` is not pinned, so even the exact word is not read here.
      expect(html).not.toContain('data-hl-zone="topPinned"')
    }
    for (const value of hostile) expect(appearTargets({ content: { kind: 'binding', path: 'a.b' }, animateIn: value }).length > 0, JSON.stringify(value)).toBe(value === true)
  })

  it('the word at the start of the root pins only when it is exactly `top`', () => {
    for (const value of hostile) {
      const html = renderToStaticMarkup(
        <HotlayoutScreen document={{ ...documentOf({ id: 'x', type: 'Text', props: {} }), screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children: [{ id: 'first', type: 'Text', pin: value, props: { content: { kind: 'literal', value: 'first' } } }] } }] } as unknown as UiDocument} injectStyles={false} onReport={silent} scroll="screen" />,
      )
      expectClean(html, `pin ${JSON.stringify(value)}`)
      expect(html.includes('data-hl-zone="topPinned"')).toBe(false)
    }
  })

  it('a hostile answer of the host is no promise, and a hostile promise does not break the render', async () => {
    const trap = {
      get then(): never {
        throw new Error('hostile getter')
      },
    }
    for (const answer of [HOSTILE_STRING, HOSTILE_NUMBER, null, undefined, {}, { then: HOSTILE_STRING }, trap]) expect(promiseOf(answer)).toBeUndefined()
    // A promise that rejects with a hostile reason: handled by the button, never an unhandled rejection.
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const swipe = { id: 'redeem', type: 'Button', props: { label: { kind: 'literal', value: 'Redeem' }, action: { type: 'redeem' }, confirm: 'swipe' } }
    const view = render(<HotlayoutScreen document={documentOf(swipe)} onAction={() => Promise.reject(new Error(HOSTILE_STRING))} injectStyles={false} onReport={silent} />)
    const button = view.container.querySelector('[data-hl-node="redeem"]') as HTMLElement
    await act(async () => {
      fireEvent.click(button, { detail: 0 })
      await Promise.resolve()
      await Promise.resolve()
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(view.container.querySelector('[role="alert"]')).toBeNull()
  })
})
