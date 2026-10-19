/**
 * The trust boundary for the leaves of schemas 9.26.0 and 9.27.0: a hostile string or number in EVERY
 * leaf of the frames `longpress-groups-sheet-screens` and `live-record-screens` (and in the data of the
 * collections the frames read), and a hostile value of every SHAPE of the new fields (`longPress`,
 * `longPressLabel`, `groupBy`, `dismissible`), must not reach `style`, `src` or an address, must not
 * put a document string into an `id` or an ARIA attribute, must not make the page fall, and must not
 * reach the host except as an action of the shape the contract names.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from './index'
import type { Collections, UiDocument } from './index'
import { LONG_PRESS_MS } from './long-press'

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
const sinksOf = (html: string): readonly string[] => [...html.matchAll(/\s(?:style|src|srcset|href)="([^"]*)"/g)].map((match) => decode(match[1] ?? ''))
const OWN_URL = /^url\("data:image\/svg\+xml,[^"]*"\)$/
/** The only forms an id or an ARIA attribute made by the reader can have. */
const AID = /^[:\w«»-]+$/

function expectClean(html: string, what: string): void {
  for (const sink of sinksOf(html)) {
    if (sink.includes(MARK) || /position\s*:\s*fixed/.test(sink) || /(?<![\d.])\d{7,}(?:px|ms)/.test(sink) || /[\n\r]/.test(sink)) throw new Error(`${what}: a hostile value reached the style or an address — ${sink.slice(0, 200)}`)
    for (const url of sink.matchAll(/url\((?:"[^"]*"|[^)"]*)\)/g)) if (!OWN_URL.test(url[0])) throw new Error(`${what}: a url the reader did not make — ${url[0].slice(0, 160)}`)
  }
  for (const match of html.matchAll(/\saria-describedby="([^"]*)"/g)) if (!AID.test(match[1] ?? '')) throw new Error(`${what}: a document string became aria-describedby — ${match[1]}`)
  for (const match of html.matchAll(/\saria-keyshortcuts="([^"]*)"/g)) if (match[1] !== 'ContextMenu Shift+F10') throw new Error(`${what}: aria-keyshortcuts is not the contract's — ${match[1]}`)
}

const silent = (): void => undefined
const read = (path: string): UiDocument => JSON.parse(readFileSync(path, 'utf8')) as UiDocument
const GROUPS = read('contract/fixtures/longpress-groups-sheet-screens.json')
const LIVE = read('contract/fixtures/live-record-screens.json')

const ACTIVITIES = [
  { title: 'Coffee week', day: 'Today' },
  { title: 'Movie night', day: 'Today' },
  { title: 'Strong week', day: 'Yesterday' },
]
const TASKS = { tasks: [{ id: 'spend', title: 'Spend 500', status: 'inProgress', progress: 3, target: 5 }], doneTasks: [{ id: 'walk', title: 'Walk', status: 'completed', progress: 2, target: 2 }] }

function draw(document: UiDocument, screenIndex: number | undefined, collections: Collections | undefined): string {
  const screens = (document as { screens?: readonly { screenId?: unknown }[] }).screens ?? []
  const id = screenIndex === undefined ? undefined : screens[screenIndex]?.screenId
  const shown = typeof id === 'string' ? ({ ...document, initialScreenId: id } as UiDocument) : document
  return renderToStaticMarkup(<HotlayoutScreen document={shown} collections={collections} injectStyles={false} onReport={silent} scroll="screen" />)
}

function everyLeaf(frame: UiDocument, collections: Collections, label: string, minimum: number, fields: readonly string[]): void {
  const keep = (path: Path): boolean => {
    const key = path[path.length - 1]
    return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
  }
  const leaves = leavesOf(frame).filter(keep)
  expect(leaves.length).toBeGreaterThan(minimum)
  for (const field of fields) expect(leaves.some((path) => path.includes(field)), field).toBe(true)
  for (const path of leaves) {
    const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
    expectClean(draw(replaced(frame, path, HOSTILE_STRING) as UiDocument, only, collections), `${label}: ${path.join('.')}`)
    expectClean(draw(replaced(frame, path, HOSTILE_NUMBER) as UiDocument, only, collections), `${label}: ${path.join('.')}`)
  }
}

describe('guard 9.26: no leaf of the long press, groups and sheets frame reaches a style or an address', () => {
  it('the clean frame passes the guard and really has the new fields', () => {
    const html = draw(GROUPS, 0, { activities: ACTIVITIES as never })
    expectClean(html, 'frame')
    const text = JSON.stringify(GROUPS)
    for (const field of ['"longPress"', '"longPressLabel"', '"groupBy"', '"dismissible"']) expect(text, field).toContain(field)
    expect(html).toContain('aria-keyshortcuts="ContextMenu Shift+F10"')
    expect(html).toContain('Today')
  })

  it('every leaf in turn — a hostile string and a hostile number', () => {
    everyLeaf(GROUPS, { activities: ACTIVITIES as never }, 'frame', 60, ['longPress', 'longPressLabel', 'groupBy', 'dismissible'])
  }, 120_000)

  it('every leaf of the data the groups are read from — the headers show text, never a style', () => {
    const records = ACTIVITIES.map((record) => ({ ...record }))
    for (const field of ['title', 'day'] as const) {
      for (const hostile of [HOSTILE_STRING, HOSTILE_NUMBER, { [HOSTILE_STRING]: 1 }, [HOSTILE_STRING], null, true]) {
        const mixed = records.map((record, index) => (index === 1 ? { ...record, [field]: hostile } : record))
        expectClean(draw(GROUPS, 0, { activities: mixed as never }), `data ${field}`)
      }
    }
  })
})

describe('guard 9.27: no leaf of the live record frame, or of the data it follows, reaches a style or an address', () => {
  it('every leaf in turn — a hostile string and a hostile number', () => {
    everyLeaf(LIVE, TASKS as never, 'frame', 120, ['source', 'item'])
  }, 120_000)

  it('a page opened from a row and then fed hostile records draws text only', () => {
    const element = (collections: Collections): React.ReactElement => <HotlayoutScreen document={LIVE} collections={collections} injectStyles={false} onReport={silent} />
    const view = render(element(TASKS as never))
    fireEvent.click(view.container.querySelector('[data-hl-node="active-list-row"]') as HTMLElement)
    for (const hostile of [HOSTILE_STRING, HOSTILE_NUMBER, { [HOSTILE_STRING]: 1 }, [HOSTILE_STRING], null]) {
      act(() => {
        view.rerender(element({ tasks: [{ id: 'spend', title: hostile, status: hostile, progress: hostile, target: hostile }] as never, doneTasks: [] }))
      })
      expectClean(view.container.innerHTML, `record ${JSON.stringify(hostile).slice(0, 30)}`)
    }
  })
})

describe('the shape of every new field gets every hostile value', () => {
  const hostile: unknown[] = [HOSTILE_STRING, HOSTILE_NUMBER, [HOSTILE_STRING], { type: HOSTILE_STRING }, { type: ['a'] }, 'True', ' false', 'false ', null, true, 0, -1, Number.POSITIVE_INFINITY, '__proto__', 'constructor']

  function documentOf(children: readonly Record<string, unknown>[], more: readonly Record<string, unknown>[] = []): UiDocument {
    return { schemaVersion: '9.27.0', documentId: 'h', name: 'h', initialScreenId: 'a', screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children } }, ...more] } as unknown as UiDocument
  }

  it('`longPress` and `longPressLabel` take any value without a leak or a fall; a document string never becomes an id', () => {
    for (const value of hostile) {
      const card = { id: 'card', type: 'Container', props: { direction: 'column', longPress: value, longPressLabel: value }, children: [{ id: 't', type: 'Text', props: { content: { kind: 'literal', value: 'x' } } }] }
      const row = { id: 'row', type: 'ListTile', props: { title: { kind: 'literal', value: 'x' }, longPress: value, longPressLabel: value } }
      expectClean(renderToStaticMarkup(<HotlayoutScreen document={documentOf([card, row])} injectStyles={false} onReport={silent} />), `value ${JSON.stringify(value)}`)
    }
  })

  it('a long press hands the host an action of the contract\'s shape: own string params, a word of the haptic list, a checked event', () => {
    vi.useFakeTimers()
    const heard: unknown[] = []
    const haptics: unknown[] = []
    const tracks: unknown[] = []
    // Parsed from text so `__proto__` is an OWN key, as in a document that came over the network.
    const hostileAction = JSON.parse(
      `{"type":"held","params":{"__proto__":"x","constructor":"y","ok":"fine","n":5,"o":{"a":1}},"haptic":${JSON.stringify(HOSTILE_STRING)},"track":{"event":${JSON.stringify(HOSTILE_STRING)}}}`,
    ) as Record<string, unknown>
    const card = { id: 'card', type: 'Container', props: { direction: 'column', longPress: hostileAction, longPressLabel: { kind: 'literal', value: 'More' } }, children: [] }
    const view = render(<HotlayoutScreen document={documentOf([card])} injectStyles={false} onReport={silent} onAction={(action) => heard.push(action)} onHaptic={(word) => haptics.push(word)} onTrack={(event) => tracks.push(event)} />)
    const element = view.container.querySelector('[data-hl-node="card"]') as HTMLElement
    fireEvent.pointerDown(element, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 1, clientY: 1 })
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_MS)
    })
    expect(haptics).toEqual([])
    expect(tracks).toEqual([])
    expect(heard).toHaveLength(1)
    const action = heard[0] as { type: string; params?: Record<string, unknown> }
    expect(action.type).toBe('held')
    expect(Object.keys(action.params ?? {})).toEqual(['ok'])
    expect(Object.isFrozen(action.params)).toBe(true)
  })

  it('`groupBy` takes any value: the list draws every record and nothing leaks', () => {
    for (const value of hostile) {
      const list = {
        id: 'list',
        type: 'Repeater',
        props: { source: 'activities', item: 'activity', groupBy: value },
        children: [
          { id: 'row', type: 'Text', props: { content: { kind: 'binding', path: 'activity.title', fallback: '' } } },
          { id: 'header', type: 'Text', props: { content: { kind: 'binding', path: 'activity.day', fallback: '' } } },
        ],
      }
      const html = renderToStaticMarkup(<HotlayoutScreen document={documentOf([list])} collections={{ activities: ACTIVITIES as never }} injectStyles={false} onReport={silent} />)
      expectClean(html, `value ${JSON.stringify(value)}`)
      for (const record of ACTIVITIES) expect(html).toContain(record.title)
    }
  })

  it('`dismissible` takes any value: only the word false locks a modal screen', () => {
    for (const value of [...hostile, false]) {
      const modal = { screenId: 'm', name: 'm', presentation: 'modal', dismissible: value, root: { id: 'm-root', type: 'Screen', props: {}, children: [{ id: 'm-text', type: 'Text', props: { content: { kind: 'literal', value: 'sheet' } } }] } }
      const open = { id: 'open', type: 'Button', props: { label: { kind: 'literal', value: 'Open' }, action: { type: 'navigate', params: { screenId: 'm' } } } }
      const view = render(<HotlayoutScreen document={documentOf([open], [modal])} injectStyles={false} onReport={silent} />)
      fireEvent.click(view.container.querySelector('[data-hl-node="open"]') as HTMLElement)
      fireEvent.click(view.container.querySelector('[data-hl-scrim]') as HTMLElement)
      expect(view.container.querySelector('[role="dialog"]') === null, JSON.stringify(value)).toBe(value !== false)
      cleanup()
    }
  })
})

beforeEach(() => {
  vi.useRealTimers()
})
