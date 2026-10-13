/**
 * The trust boundary for the leaves of schema 9.19.0: a hostile string or number in EVERY leaf
 * of the frames of the three themes (`composition-screens`, `money-screens`, `hero-screens`)
 * must not reach `style`, `src` or an address — and neither must a hostile value of the host
 * prop `safeAreaTop`. The new leaves: `action` and `label` of a container, `currencyDisplay`,
 * `currencyPosition`, `sign`, `Text.spans[place].parts`, `Screen.props.bodyTop`.
 */
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'

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
    if (sink.includes(MARK) || /position\s*:\s*fixed/.test(sink) || /\d{7,}px/.test(sink) || /[\n\r]/.test(sink)) throw new Error(`${what}: a hostile value reached the style or an address — ${sink.slice(0, 200)}`)
  }
}

const FRAMES = ['composition-screens', 'money-screens', 'hero-screens'] as const
const frame = (name: string): UiDocument => JSON.parse(readFileSync(`contract/fixtures/${name}.json`, 'utf8')) as UiDocument
const silent = (): void => undefined

function draw(document: UiDocument, screenIndex: number | undefined, host: Record<string, unknown> = {}): string {
  const screens = (document as { screens?: readonly { screenId?: unknown }[] }).screens ?? []
  const id = screenIndex === undefined ? undefined : screens[screenIndex]?.screenId
  const shown = typeof id === 'string' ? ({ ...document, initialScreenId: id } as UiDocument) : document
  return renderToStaticMarkup(<HotlayoutScreen document={shown} injectStyles={false} onReport={silent} scroll="screen" {...host} />)
}

describe('guard 9.19: no leaf of the new frames reaches a style or an address', () => {
  it.each(FRAMES)('the clean frame %s passes the guard (otherwise it would catch itself)', (name) => {
    expectClean(draw(frame(name), undefined), name)
  })

  it.each(FRAMES)('%s: every leaf in turn — a hostile string and a hostile number', (name) => {
    const document = frame(name)
    const leaves = leavesOf(document).filter((path) => {
      const key = path[path.length - 1]
      return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
    })
    expect(leaves.length).toBeGreaterThan(100)
    for (const path of leaves) {
      const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
      expectClean(draw(replaced(document, path, HOSTILE_STRING) as UiDocument, only), `${name}: ${path.join('.')}`)
      expectClean(draw(replaced(document, path, HOSTILE_NUMBER) as UiDocument, only), `${name}: ${path.join('.')}`)
    }
  }, 240_000)

  it('the new leaves by hand: money fields, parts of an amount, the word of the body, the action and label of a card', () => {
    const hostile: unknown[] = [HOSTILE_STRING, HOSTILE_NUMBER, [HOSTILE_STRING], { [HOSTILE_STRING]: HOSTILE_STRING }, null, true]
    for (const value of hostile) {
      const document = {
        schemaVersion: '9.19.0',
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
              props: { bodyTop: value },
              children: [
                { id: 'bar', type: 'AppBar', props: { title: { kind: 'literal', value: 'T' }, showBack: false } },
                {
                  id: 'amount',
                  type: 'Text',
                  props: {
                    content: { kind: 'template', template: '{a}', values: { a: { kind: 'binding', path: 'x', fallback: '0', format: 'currency', currency: 'USD', currencyDisplay: value, currencyPosition: value, sign: value } } },
                    spans: { a: { parts: { fraction: value, currency: { color: value, typography: value, weight: value, fontStyle: value, textDecoration: value } } } },
                  },
                },
                { id: 'card', type: 'Container', props: { action: value, label: value }, children: [{ id: 'inner', type: 'Text', props: { content: { kind: 'literal', value: 'x' } } }] },
                { id: 'card2', type: 'Row', props: { action: { type: 'navigate', params: { screenId: value }, track: value }, label: value }, children: [] },
              ],
            },
          },
        ],
      } as unknown as UiDocument
      const html = renderToStaticMarkup(<HotlayoutScreen document={document} data={{ x: 1850.5 }} injectStyles={false} onReport={silent} scroll="screen" />)
      expectClean(html, JSON.stringify(value))
    }
  })

  it('a hostile `safeAreaTop` of the host is zero, never a style: the value goes into padding as a clean number or as the one word', () => {
    const document = frame('hero-screens')
    for (const value of [HOSTILE_STRING, HOSTILE_NUMBER, Number.NaN, Number.POSITIVE_INFINITY, -1, null, {}, [HOSTILE_STRING]]) {
      const html = draw(document, undefined, { safeAreaTop: value })
      expectClean(html, `safeAreaTop ${String(value)}`)
    }
    // A huge number is held to the largest real inset, not written as given.
    expect(draw(document, undefined, { safeAreaTop: HOSTILE_NUMBER })).not.toContain(String(HOSTILE_NUMBER))
    expect(draw(document, undefined, { safeAreaTop: 44 })).toContain('44px')
  })
})
