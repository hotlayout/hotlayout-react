/**
 * The trust boundary for the leaves of schema 9.20.0: a hostile string or number in EVERY leaf of
 * the frame `motion-blur-screens`, and a hostile value of every SHAPE of the new fields
 * (`motion`, the `backdropBlur` of a screen entry, `style.backdropBlur`, also in a state and in a
 * width layer), must not reach `style`, `src` or an address. The new fields turn into numbers in
 * variables and in one filter, so the check is also that the markup never carries a number the
 * schema does not allow.
 */
import { render, fireEvent, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

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

function expectClean(html: string, what: string): void {
  for (const sink of sinksOf(html)) {
    if (sink.includes(MARK) || /position\s*:\s*fixed/.test(sink) || /\d{7,}(?:px|ms)/.test(sink) || /[\n\r]/.test(sink)) throw new Error(`${what}: a hostile value reached the style or an address — ${sink.slice(0, 200)}`)
  }
  // The numbers of the new fields are bounded: no shift beyond 48 px, no blur beyond 40 px, no cycle beyond a minute.
  for (const match of html.matchAll(/--hl-motion-(?:x|y|y2):(-?\d+(?:\.\d+)?)px/g)) expect(Math.abs(Number(match[1])), what).toBeLessThanOrEqual(48)
  for (const match of html.matchAll(/backdrop-filter:blur\((-?\d+(?:\.\d+)?)px\)/g)) {
    expect(Number(match[1]), what).toBeGreaterThanOrEqual(1)
    expect(Number(match[1]), what).toBeLessThanOrEqual(40)
  }
  for (const match of html.matchAll(/--hl-motion-duration:(\d+)ms/g)) expect(Number(match[1]), what).toBeLessThanOrEqual(60_000)
}

const FRAME = JSON.parse(readFileSync('contract/fixtures/motion-blur-screens.json', 'utf8')) as UiDocument
const silent = (): void => undefined

function draw(document: UiDocument, screenIndex: number | undefined): string {
  const screens = (document as { screens?: readonly { screenId?: unknown }[] }).screens ?? []
  const id = screenIndex === undefined ? undefined : screens[screenIndex]?.screenId
  const shown = typeof id === 'string' ? ({ ...document, initialScreenId: id } as UiDocument) : document
  return renderToStaticMarkup(<HotlayoutScreen document={shown} injectStyles={false} onReport={silent} scroll="screen" />)
}

describe('guard 9.20: no leaf of the new frame reaches a style or an address', () => {
  it('the clean frame passes the guard (otherwise it would catch itself) and really has the new fields', () => {
    const html = draw(FRAME, undefined)
    expectClean(html, 'frame')
    expect(html).toContain('data-hl-motion="float"')
    expect(html).toMatch(/[^-]backdrop-filter:blur\(\d+px\)/)
  })

  it('every leaf in turn — a hostile string and a hostile number', () => {
    const leaves = leavesOf(FRAME).filter((path) => {
      const key = path[path.length - 1]
      return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
    })
    expect(leaves.length).toBeGreaterThan(80)
    for (const field of ['motion', 'backdropBlur']) expect(leaves.some((path) => path.includes(field)), field).toBe(true)
    for (const path of leaves) {
      const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
      expectClean(draw(replaced(FRAME, path, HOSTILE_STRING) as UiDocument, only), `frame: ${path.join('.')}`)
      expectClean(draw(replaced(FRAME, path, HOSTILE_NUMBER) as UiDocument, only), `frame: ${path.join('.')}`)
    }
  }, 120_000)

  it('the shape of every new field gets every hostile value, in every width class and state', () => {
    const hostile: unknown[] = [
      HOSTILE_STRING,
      HOSTILE_NUMBER,
      [HOSTILE_STRING],
      { [HOSTILE_STRING]: HOSTILE_STRING, kind: HOSTILE_STRING },
      { kind: 'float', axis: HOSTILE_STRING, amplitude: HOSTILE_STRING, duration: HOSTILE_STRING, delay: HOSTILE_STRING },
      { kind: 'float', axis: 'both', amplitude: HOSTILE_NUMBER, duration: HOSTILE_NUMBER, delay: HOSTILE_NUMBER },
      { kind: 'pulse', scale: HOSTILE_STRING, opacity: HOSTILE_STRING, duration: HOSTILE_STRING },
      { kind: 'pulse', scale: HOSTILE_NUMBER, opacity: HOSTILE_NUMBER, duration: 2000 },
      { kind: 'float', axis: 'both', amplitude: 8, duration: 2000, [HOSTILE_STRING]: HOSTILE_STRING },
      null,
      true,
      -1,
      Number.POSITIVE_INFINITY,
    ]
    for (const value of hostile) {
      const document = {
        schemaVersion: '9.20.0',
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
              motion: value,
              style: { backdropBlur: value },
              children: [
                { id: 'go', type: 'Button', props: { label: { kind: 'literal', value: 'x' }, variant: 'primary', action: { type: 'navigate', params: { screenId: 'b' } } }, motion: value, style: { backdropBlur: value } },
                { id: 'card', type: 'Container', props: {}, motion: value, style: { backdropBlur: value, radius: 'lg' }, styleWhen: [{ when: { path: 'x', op: 'isTrue' }, style: { backdropBlur: value } }], styleOn: { medium: { backdropBlur: value }, expanded: { backdropBlur: value } } },
                { id: 'icon', type: 'IconButton', props: { icon: 'info', label: { kind: 'literal', value: 'x' }, variant: 'ghost', action: { type: 'none' } }, motion: value, style: { backdropBlur: value } },
              ],
            },
          },
          { screenId: 'b', name: 'b', presentation: 'modal', backdropBlur: value, root: { id: 'rb', type: 'Screen', props: {}, motion: value, style: { backdropBlur: value }, children: [] } },
        ],
      } as unknown as UiDocument
      for (const widthClass of WIDTH_CLASSES) {
        const { container, unmount } = render(<HotlayoutScreen document={document} data={{ x: true }} initialWidthClass={widthClass} injectStyles={false} onReport={silent} />)
        expectClean(container.innerHTML, `${JSON.stringify(value)} ${widthClass}`)
        fireEvent.click(container.querySelector('[data-hl-node="go"]')!)
        expectClean(container.innerHTML, `${JSON.stringify(value)} ${widthClass}, the layer`)
        unmount()
        expectClean(renderToStaticMarkup(<HotlayoutScreen document={document} data={{ x: true }} initialWidthClass={widthClass} injectStyles={false} onReport={silent} />), `${JSON.stringify(value)} ${widthClass}, server`)
      }
    }
  })
})
