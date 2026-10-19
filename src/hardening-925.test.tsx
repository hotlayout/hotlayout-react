/**
 * The trust boundary for the leaves of schema 9.25.0: a hostile string or number in EVERY leaf of the
 * frame `glow-press-screens`, and a hostile value of every SHAPE of the new fields (`glow`,
 * `style.shadowColor`, `pressFeedback`, `haptic`), must not reach `style`, `src` or an address, must
 * not make the page fall, and must not reach the host. The new fields are words of closed lists: the
 * glow strength comes from the contract's numbers, the haptic word handed to the host is one of the
 * six, and nothing of the document is copied into a style as a string.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'
import { HAPTIC_WORDS } from './haptic'
import { PRESS_FEEDBACK_ATTRIBUTE } from './press-feedback'
import { readProgressGlow } from './progress-glow'
import { readShadowColor } from './shadow-color'

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
const FRAME = JSON.parse(readFileSync('contract/fixtures/glow-press-screens.json', 'utf8')) as UiDocument

function draw(document: UiDocument, screenIndex: number | undefined): string {
  const screens = (document as { screens?: readonly { screenId?: unknown }[] }).screens ?? []
  const id = screenIndex === undefined ? undefined : screens[screenIndex]?.screenId
  const shown = typeof id === 'string' ? ({ ...document, initialScreenId: id } as UiDocument) : document
  return renderToStaticMarkup(<HotlayoutScreen document={shown} injectStyles={false} onReport={silent} scroll="screen" />)
}

describe('guard 9.25: no leaf of the glow and press frame reaches a style or an address', () => {
  it('the clean frame passes the guard and really has the new fields', () => {
    for (const index of [undefined, 0, 1]) expectClean(draw(FRAME, index), `frame ${String(index)}`)
    const text = JSON.stringify(FRAME)
    for (const field of ['"glow"', '"shadowColor"', '"pressFeedback"', '"haptic"']) expect(text, field).toContain(field)
    expect(draw(FRAME, 0)).toContain('data-hl-glow=')
    expect(draw(FRAME, 1)).toContain(`${PRESS_FEEDBACK_ATTRIBUTE}="card"`)
  })

  it('every leaf in turn — a hostile string and a hostile number', () => {
    const leaves = leavesOf(FRAME).filter((path) => {
      const key = path[path.length - 1]
      return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
    })
    expect(leaves.length).toBeGreaterThan(80)
    for (const field of ['glow', 'shadowColor', 'pressFeedback', 'haptic']) expect(leaves.some((path) => path.includes(field)), field).toBe(true)
    for (const path of leaves) {
      const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
      expectClean(draw(replaced(FRAME, path, HOSTILE_STRING) as UiDocument, only), `frame: ${path.join('.')}`)
      expectClean(draw(replaced(FRAME, path, HOSTILE_NUMBER) as UiDocument, only), `frame: ${path.join('.')}`)
    }
  }, 120_000)
})

describe('the shape of every new field gets every hostile value', () => {
  const hostile: unknown[] = [HOSTILE_STRING, HOSTILE_NUMBER, [HOSTILE_STRING], { soft: true }, { [HOSTILE_STRING]: 1 }, 'Soft', 'STRONG', ' soft', 'soft ', 'soft,strong', 'Background', 'NONE', null, true, false, 0, -1, Number.POSITIVE_INFINITY]

  function documentOf(children: readonly Record<string, unknown>[]): UiDocument {
    return { schemaVersion: '9.25.0', documentId: 'h', name: 'h', initialScreenId: 'a', screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children } }] } as unknown as UiDocument
  }

  it('`glow` and `shadowColor` take any value without a style leak or a fall; only an exact word acts', () => {
    for (const value of hostile) {
      const bar = { id: 'bar', type: 'ProgressBar', props: { value: { kind: 'literal', value: 3 }, max: { kind: 'literal', value: 6 }, segments: 6, glow: value, currentColor: 'accent' } }
      const solid = { id: 'solid', type: 'ProgressBar', props: { value: { kind: 'literal', value: 3 }, max: { kind: 'literal', value: 6 }, glow: value } }
      const ring = { id: 'ring', type: 'CircularProgress', props: { value: { kind: 'literal', value: 30 }, max: { kind: 'literal', value: 100 }, glow: value } }
      const card = { id: 'card', type: 'Container', style: { background: { kind: 'color', color: 'accent' }, shadow: 'medium', shadowColor: value }, props: { direction: 'column' }, children: [] }
      const html = renderToStaticMarkup(<HotlayoutScreen document={documentOf([bar, solid, ring, card])} injectStyles={false} onReport={silent} />)
      expectClean(html, `value ${JSON.stringify(value)}`)
      const acts = readProgressGlow(value) !== undefined
      expect(html.includes('data-hl-glow='), JSON.stringify(value)).toBe(acts)
      // The shadow keeps the variable of the theme unless the exact word is there.
      expect(html.includes('var(--product-elevation-medium)'), JSON.stringify(value)).toBe(readShadowColor(value) === undefined)
    }
  })

  it('`pressFeedback` takes any value: only the exact word `none` turns the feedback off', () => {
    for (const value of [...hostile, 'none']) {
      const card = { id: 'card', type: 'Container', pressFeedback: value, props: { direction: 'column', action: { type: 'open' } }, children: [] }
      const html = renderToStaticMarkup(<HotlayoutScreen document={documentOf([card])} injectStyles={false} onReport={silent} />)
      expectClean(html, `value ${JSON.stringify(value)}`)
      expect(html.includes(`${PRESS_FEEDBACK_ATTRIBUTE}="card"`), JSON.stringify(value)).toBe(value !== 'none')
    }
  })

  it('`haptic` hands the host only a word of the list, whatever the document says', () => {
    for (const value of [...hostile, ...HAPTIC_WORDS]) {
      const heard: unknown[] = []
      const button = { id: 'go', type: 'Button', props: { label: { kind: 'literal', value: 'Go' }, variant: 'primary', action: { type: 'open', haptic: value } } }
      const view = render(<HotlayoutScreen document={documentOf([button])} injectStyles={false} onReport={silent} onHaptic={(word) => heard.push(word)} />)
      fireEvent.click(view.container.querySelector('[data-hl-node="go"]') as HTMLElement)
      expect(heard, JSON.stringify(value)).toEqual((HAPTIC_WORDS as readonly unknown[]).includes(value) ? [value] : [])
      cleanup()
    }
  })

  it('a host without the handler does not stop the press', () => {
    const button = { id: 'go', type: 'Button', props: { label: { kind: 'literal', value: 'Go' }, variant: 'primary', action: { type: 'open', haptic: 'light' } } }
    const seen: string[] = []
    const plain = render(<HotlayoutScreen document={documentOf([button])} injectStyles={false} onReport={silent} onAction={(action) => seen.push(action.type)} />)
    fireEvent.click(plain.container.querySelector('[data-hl-node="go"]') as HTMLElement)
    expect(seen).toEqual(['open'])
  })
})
