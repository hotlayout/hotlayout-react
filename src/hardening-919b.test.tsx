/**
 * The trust boundary for the leaves of the second half of schema 9.19.0: a hostile string or number in EVERY leaf of
 * the frames `choice-controls-screens`, `parts-screens` and `alt-icon-date-screens`, and a hostile value in the DATA the
 * new fields read, must not reach `style`, `src` or an address. The new leaves: the shape of a write action, the style
 * and the states of a part of a list row (`trailing.style`, `captionStyle…`), the colour and the tile of the leading icon,
 * `fieldRadius` / `fieldBackground` / `fieldBorderColor` / `fieldBorderWidth` / `fieldHeight`, the text of a mark of a
 * field, `alt`, `iconPath`, `dateParts` and `unset`.
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

const FRAMES = ['choice-controls-screens', 'parts-screens', 'alt-icon-date-screens'] as const
const frame = (name: string): UiDocument => JSON.parse(readFileSync(`contract/fixtures/${name}.json`, 'utf8')) as UiDocument
const silent = (): void => undefined

function draw(document: UiDocument, screenIndex: number | undefined, data: Record<string, unknown> = {}): string {
  const screens = (document as { screens?: readonly { screenId?: unknown }[] }).screens ?? []
  const id = screenIndex === undefined ? undefined : screens[screenIndex]?.screenId
  const shown = typeof id === 'string' ? ({ ...document, initialScreenId: id } as UiDocument) : document
  return renderToStaticMarkup(<HotlayoutScreen document={shown} data={data} injectStyles={false} onReport={silent} scroll="screen" />)
}

describe('guard 9.19b: no leaf of the new frames reaches a style or an address', () => {
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

  it('the new leaves by hand: the shape of every new field gets every hostile value', () => {
    const hostile: unknown[] = [HOSTILE_STRING, HOSTILE_NUMBER, [HOSTILE_STRING], { [HOSTILE_STRING]: HOSTILE_STRING, token: HOSTILE_STRING, value: HOSTILE_STRING, opacity: HOSTILE_NUMBER }, null, true, -1]
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
              props: {},
              propsOn: { unset: { expanded: value, medium: [value] } },
              styleOn: { unset: value },
              children: [
                { id: 'set', type: 'Button', props: { label: { kind: 'literal', value: 'x' }, variant: 'primary', iconPath: value, icon: value, action: { type: 'setValue', params: { path: value, value, valueType: value }, paramBindings: { path: value } } } },
                { id: 'toggle', type: 'IconButton', props: { icon: 'eye', iconPath: value, label: { kind: 'literal', value: 'x' }, action: { type: 'toggleValue', params: { path: value } } } },
                {
                  id: 'row',
                  type: 'ListTile',
                  props: {
                    title: { kind: 'literal', value: 'x' },
                    titleMaxLines: value,
                    subtitleMaxLines: value,
                    leading: { kind: 'icon', icon: value, color: value, tile: { color: value, radius: value, size: value } },
                    trailing: {
                      kind: 'text',
                      text: { kind: 'literal', value: '1' },
                      style: { color: value, typography: value },
                      styleWhen: [{ when: { path: 'x', op: 'isTrue' }, style: { color: value, typography: value } }],
                      caption: { kind: 'literal', value: 'c' },
                      captionStyle: { color: value, typography: value },
                      captionStyleWhen: [{ when: { path: 'x', op: 'isTrue' }, style: { color: value } }],
                    },
                  },
                },
                {
                  id: 'field',
                  type: 'TextField',
                  props: {
                    label: { kind: 'literal', value: 'x' },
                    value: { kind: 'binding', path: 'x' },
                    fieldRadius: value,
                    fieldBackground: value,
                    fieldBorderColor: value,
                    fieldBorderWidth: value,
                    fieldHeight: value,
                    prefix: { kind: 'text', text: value },
                    suffix: { kind: 'icon', icon: value },
                    maxLength: value,
                    counter: value,
                  },
                },
                { id: 'img', type: 'Image', props: { source: { kind: 'asset', asset: 'logo' }, alt: value } },
                { id: 'ico', type: 'Icon', props: { name: 'gift', iconPath: value, alt: value } },
                { id: 'date', type: 'Text', props: { content: { kind: 'binding', path: 'when', fallback: '-', format: 'date', dateParts: value } } },
                { id: 'box', type: 'Container', props: {}, style: { padding: 'md', background: { kind: 'color', color: 'surface' } }, styleOn: { unset: { expanded: value, medium: [value, 'background'] } } },
              ],
            },
          },
        ],
      } as unknown as UiDocument
      const html = draw(document, undefined, { x: true, when: '2026-10-15T12:00:00.000Z' })
      expectClean(html, JSON.stringify(value))
    }
  })

  it('a hostile VALUE IN THE DATA does not reach a style, an address or an attribute of the new fields', () => {
    const document = frame('alt-icon-date-screens')
    const data: Record<string, unknown> = {}
    for (const path of ['account.lastIcon', 'account.lastStatus', 'account.lastMerchant', 'account.lastAt', 'account.period', 'survey.goal', 'user.firstName', 'item.image', 'item.name']) data[path] = HOSTILE_STRING
    const html = draw(document, undefined, data)
    expectClean(html, 'data')
    // A name from data that is not a name of the set never becomes an attribute either.
    expect(html).not.toContain(`data-hl-glyph="${HOSTILE_STRING}`)
    for (const value of [HOSTILE_NUMBER, true, null, [HOSTILE_STRING], { x: HOSTILE_STRING }]) {
      expectClean(draw(document, undefined, { 'account.lastIcon': value, 'account.lastMerchant': value, 'account.lastAt': value }), JSON.stringify(value))
    }
  })

  it('a write to a path with a prototype segment is refused by the gate: nothing is handed to the host', () => {
    // The press itself is checked by the table `writeCases` (rows «gate: refused»); here the form of the gate is the one of every input.
    const document = {
      schemaVersion: '9.19.0',
      documentId: 'h',
      name: 'h',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children: [{ id: 'go', type: 'Button', props: { label: { kind: 'literal', value: 'x' }, variant: 'primary', action: { type: 'setValue', params: { path: '__proto__.polluted', value: 'yes' } } } }] } }],
    } as unknown as UiDocument
    const html = draw(document, undefined)
    expectClean(html, 'write')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})
