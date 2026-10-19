/**
 * The trust boundary for the leaves of schema 9.21.0: a hostile string or number in EVERY leaf of the
 * frame `value-countdown-screens`, and a hostile value of every SHAPE of the new fields
 * (`animateChanges`, `cap`, `titleShown`, `styleScrolled`, and `unit` and `pad` of a binding), must
 * not reach `style`, `src` or an address. The new fields turn into a word that selects a branch, a
 * number in a variable, a conic gradient and a layer of the existing style, so the check is also
 * that the markup never carries a number the schema does not allow and that a hostile layer cannot
 * change the box of the bar.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'
import { WIDTH_CLASSES } from './width-class'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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

function expectClean(html: string, what: string): void {
  for (const sink of sinksOf(html)) {
    if (sink.includes(MARK) || /position\s*:\s*fixed/.test(sink) || /(?<![\d.])\d{7,}(?:px|ms)/.test(sink) || /[\n\r]/.test(sink)) throw new Error(`${what}: a hostile value reached the style or an address — ${sink.slice(0, 200)}`)
  }
  // The blur of a layer is bounded (1..40) and an end of a ring is a few degrees, not a hostile number.
  for (const match of html.matchAll(/backdrop-filter:blur\((-?\d+(?:\.\d+)?)px\)/g)) {
    expect(Number(match[1]), what).toBeGreaterThanOrEqual(1)
    expect(Number(match[1]), what).toBeLessThanOrEqual(40)
  }
}

const FRAME = JSON.parse(readFileSync('contract/fixtures/value-countdown-screens.json', 'utf8')) as UiDocument
const silent = (): void => undefined

function draw(document: UiDocument, screenIndex: number | undefined): string {
  const screens = (document as { screens?: readonly { screenId?: unknown }[] }).screens ?? []
  const id = screenIndex === undefined ? undefined : screens[screenIndex]?.screenId
  const shown = typeof id === 'string' ? ({ ...document, initialScreenId: id } as UiDocument) : document
  return renderToStaticMarkup(<HotlayoutScreen document={shown} data={{ 'user.points': 1580, 'task.progress': 3, 'task.target': 5, 'offer.endsAt': '2026-10-12T23:05:09.000Z' }} injectStyles={false} onReport={silent} scroll="screen" />)
}

describe('guard 9.21: no leaf of the new frame reaches a style or an address', () => {
  it('the clean frame passes the guard (otherwise it would catch itself) and really has the new fields', () => {
    const html = draw(FRAME, undefined)
    expectClean(html, 'frame')
    expect(html).toContain('data-hl-cap="round"')
    expect(html).toContain('data-hl-cap-end=')
    const mission = draw(FRAME, 1)
    expect(mission).toContain('data-hl-title-rest="hidden"')
  })

  it('every leaf in turn — a hostile string and a hostile number', () => {
    const leaves = leavesOf(FRAME).filter((path) => {
      const key = path[path.length - 1]
      return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
    })
    expect(leaves.length).toBeGreaterThan(80)
    for (const field of ['animateChanges', 'cap', 'titleShown', 'styleScrolled', 'unit', 'pad']) expect(leaves.some((path) => path.includes(field)), field).toBe(true)
    for (const path of leaves) {
      const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
      expectClean(draw(replaced(FRAME, path, HOSTILE_STRING) as UiDocument, only), `frame: ${path.join('.')}`)
      expectClean(draw(replaced(FRAME, path, HOSTILE_NUMBER) as UiDocument, only), `frame: ${path.join('.')}`)
    }
  }, 120_000)

  it('the shape of every new field gets every hostile value, in every width class and state, and the page still holds', () => {
    const hostile: unknown[] = [
      HOSTILE_STRING,
      HOSTILE_NUMBER,
      [HOSTILE_STRING],
      { [HOSTILE_STRING]: HOSTILE_STRING, kind: HOSTILE_STRING },
      { background: { kind: 'color', color: HOSTILE_STRING }, color: HOSTILE_STRING, shadow: HOSTILE_STRING, backdropBlur: HOSTILE_NUMBER, padding: HOSTILE_STRING, height: HOSTILE_NUMBER },
      { background: { kind: 'color', color: { value: HOSTILE_STRING } }, color: { token: HOSTILE_STRING, opacity: HOSTILE_STRING }, backdropBlur: HOSTILE_STRING },
      { background: { kind: 'image', source: { kind: 'literal', value: `http://${MARK}/x.png` } } },
      null,
      true,
      -1,
      Number.POSITIVE_INFINITY,
    ]
    for (const value of hostile) {
      const document = {
        schemaVersion: '9.21.0',
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
                { id: 'bar', type: 'AppBar', props: { title: { kind: 'literal', value: 'x' }, showBack: true, titleShown: value }, styleScrolled: value, styleWhen: [{ when: { path: 'x', op: 'isTrue' }, style: { color: value } }], styleOn: { medium: { color: value }, expanded: { color: value } } },
                { id: 'ring', type: 'CircularProgress', props: { value: { kind: 'binding', path: 'v', fallback: 0 }, max: { kind: 'literal', value: 100 }, cap: value, animateChanges: value, thickness: 'md' }, style: { width: 96, height: 96 } },
                { id: 'bar2', type: 'ProgressBar', props: { value: { kind: 'binding', path: 'v', fallback: 0 }, max: { kind: 'literal', value: 100 }, cap: value, animateChanges: value, segments: value } },
                { id: 'n', type: 'Text', props: { content: { kind: 'binding', path: 'v', fallback: '0', format: 'number', unit: value, pad: value }, animateChanges: value } },
                { id: 'c', type: 'Text', props: { content: { kind: 'binding', path: 'at', fallback: '0', format: 'countdownPart', unit: value, pad: value }, animateChanges: value } },
                { id: 'filler', type: 'Text', props: { content: { kind: 'literal', value: 'filler' } } },
              ],
            },
          },
        ],
      } as unknown as UiDocument
      for (const widthClass of WIDTH_CLASSES) {
        const { container, unmount } = render(<HotlayoutScreen document={document} data={{ x: true, v: 5, at: '2026-10-12T23:05:09.000Z' }} initialWidthClass={widthClass} injectStyles={false} onReport={silent} scroll="screen" />)
        expectClean(container.innerHTML, `${JSON.stringify(value)} ${widthClass}`)
        const body = container.querySelector<HTMLElement>('[data-hl-zone="body"]')
        if (body !== null) {
          body.scrollTop = 40
          fireEvent.scroll(body)
        }
        expectClean(container.innerHTML, `${JSON.stringify(value)} ${widthClass}, scrolled`)
        expect(container.querySelector('[data-hl-node="filler"]')).not.toBeNull()
        unmount()
      }
    }
  })

  it('a hostile layer cannot change the box of the bar or reach an address, even scrolled', () => {
    const document = {
      schemaVersion: '9.21.0',
      documentId: 'h',
      name: 'h',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children: [{ id: 'bar', type: 'AppBar', props: { title: { kind: 'literal', value: 'x' }, showBack: true }, styleScrolled: { background: { kind: 'color', color: { value: '#ff0000' } }, position: 'fixed', inset: 0, zIndex: 9, width: HOSTILE_NUMBER, padding: HOSTILE_STRING } }, { id: 'p', type: 'Text', props: { content: { kind: 'literal', value: 'p' } } }] } }],
    } as unknown as UiDocument
    const { container } = render(<HotlayoutScreen document={document} injectStyles={false} onReport={silent} scroll="screen" />)
    const body = container.querySelector<HTMLElement>('[data-hl-zone="body"]') as HTMLElement
    body.scrollTop = 40
    fireEvent.scroll(body)
    const style = container.querySelector<HTMLElement>('[data-hl-node="bar"]')?.getAttribute('style') ?? ''
    expect(style).toContain('rgb(255, 0, 0)')
    expect(style).not.toMatch(/position:\s*fixed|z-index|123456789/)
    expectClean(container.innerHTML, 'layer')
  })

  it('a number in the middle of a transition is a number the data gave, not a string the document chose', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] })
    const document = {
      schemaVersion: '9.21.0',
      documentId: 't',
      name: 't',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children: [{ id: 'n', type: 'Text', props: { content: { kind: 'binding', path: 'v', fallback: '0', format: 'number' }, animateChanges: true } }] } }],
    } as unknown as UiDocument
    const view = render(<HotlayoutScreen document={document} data={{ v: 100 }} locale="en" injectStyles={false} />)
    for (const next of [HOSTILE_STRING, { toString: () => HOSTILE_STRING }, [HOSTILE_STRING], Number.NaN, Number.POSITIVE_INFINITY, 1e300, -1e300]) {
      view.rerender(<HotlayoutScreen document={document} data={{ v: next }} locale="en" injectStyles={false} />)
      for (let frame = 0; frame < 50; frame += 1) {
        act(() => {
          vi.advanceTimersByTime(16)
        })
        // The text may carry the value as it is (it is text); what it must never do is reach a style or an address.
        expectClean(view.container.innerHTML, `transition ${String(next)}`)
        expect(view.container.querySelector('[data-hl-node="n"]')).not.toBeNull()
      }
      view.rerender(<HotlayoutScreen document={document} data={{ v: 100 }} locale="en" injectStyles={false} />)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
    }
    expectClean(view.container.innerHTML, 'transition')
  })
})
