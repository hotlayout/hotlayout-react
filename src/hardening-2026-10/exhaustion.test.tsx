/**
 * Limit 6 — resource exhaustion. A network document or the host's data must not make the reader do
 * work that grows faster than its input: lists of every fixture drawn from large collections
 * (groups, filters, numbering, carousels, grids, live records), a document with a hundred thousand
 * nodes, every pattern of the contract run against inputs built to make a backtracking engine
 * (V8's) explode, and endless motion that a reduced-motion preference must stop.
 */
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { contractFile } from '../../test-support/paths'
import { sampleData } from '../../test-support/sample-data'
import { HOTLAYOUT_CSS, HotlayoutScreen } from '../index'
import type { UiDocument, UiNode } from '../index'
import { screenFixtures, serverMarkup, THREW } from '../../test-support/hardening-kit'

afterEach(cleanup)

function collectionsOf(size: number): Record<string, readonly Record<string, unknown>[]> {
  const { collections } = sampleData()
  const out: Record<string, readonly Record<string, unknown>[]> = {}
  for (const [path, list] of Object.entries(collections)) {
    const record = list[0] ?? {}
    out[path] = Array.from({ length: size }, (_, index) => {
      const copy: Record<string, unknown> = {}
      for (const [field, value] of Object.entries(record)) copy[field] = field === 'id' ? `r${String(index)}` : typeof value === 'string' && field !== 'image' ? `${value} ${String(index % 7)}` : value
      return copy
    })
  }
  return out
}

function timed(run: () => string): { ms: number; html: string } {
  const start = performance.now()
  const html = run()
  return { ms: performance.now() - start, html }
}

describe('limit 6: lists cost linear time in the data', () => {
  // The reader draws at most `MAX_COLLECTION_ITEMS` records, but filters, groups, numbering and live-record lookups see the whole collection.
  const small = collectionsOf(5_000)
  const large = collectionsOf(40_000)
  const { data } = sampleData()
  for (const fixture of screenFixtures()) {
    const screens = (fixture.document as { screens: readonly { screenId?: unknown }[] }).screens
    it(`${fixture.name}: eight times the records costs at most ~24 times the time`, () => {
      for (const screen of screens) {
        if (typeof screen.screenId !== 'string') continue
        const shown = { ...fixture.document, initialScreenId: screen.screenId } as UiDocument
        const a = timed(() => serverMarkup(shown, { data, collections: small }))
        const b = timed(() => serverMarkup(shown, { data, collections: large }))
        expect(b.html.includes(THREW), `${fixture.name}/${screen.screenId}`).toBe(false)
        // The drawn rows are bounded, so the markup does not grow with the data.
        expect(b.html.length, `${fixture.name}/${screen.screenId}`).toBeLessThan(a.html.length * 1.5 + 10_000)
        expect(b.ms, `${fixture.name}/${screen.screenId}: ${a.ms.toFixed(0)} ms -> ${b.ms.toFixed(0)} ms`).toBeLessThan(Math.max(a.ms * 24, 400))
      }
    }, 120_000)
  }
})

describe('limit 6: a document with a hundred thousand nodes', () => {
  const text = (id: string): UiNode => ({ id, type: 'Text', props: { content: { kind: 'literal', value: id }, align: 'start', overflow: 'ellipsis' } }) as unknown as UiNode
  const broad = (count: number): UiDocument =>
    ({
      schemaVersion: '9.27.0',
      documentId: 'broad',
      initialScreenId: 's',
      screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children: Array.from({ length: count }, (_, index) => text(`n${String(index)}`)) } }],
    }) as unknown as UiDocument

  it('is drawn on the server in linear time (10^4 vs 10^5) and does not throw', () => {
    const a = timed(() => serverMarkup(broad(10_000)))
    const b = timed(() => serverMarkup(broad(100_000)))
    expect(b.html.includes(THREW)).toBe(false)
    expect(b.ms, `${a.ms.toFixed(0)} ms -> ${b.ms.toFixed(0)} ms`).toBeLessThan(Math.max(a.ms * 30, 1500))
  }, 120_000)
})

/** Every regular expression the contract artifacts publish (keys named like a pattern). */
function contractPatterns(): readonly { readonly where: string; readonly source: string }[] {
  const found = new Map<string, string>()
  for (const file of ['screen-schema.json', 'theme.json', 'data-contract.json']) {
    const visit = (value: unknown, where: string): void => {
      if (Array.isArray(value)) value.forEach((item, index) => visit(item, `${where}[${String(index)}]`))
      else if (typeof value === 'object' && value !== null)
        for (const [key, item] of Object.entries(value)) {
          if (typeof item === 'string' && /pattern|Pattern|Characters$/.test(key)) found.set(item, `${file}:${where}.${key}`)
          else visit(item, `${where}.${key}`)
        }
    }
    visit(JSON.parse(readFileSync(contractFile(file), 'utf8')), '')
  }
  return [...found].map(([source, where]) => ({ source, where }))
}

/** Inputs that make backtracking engines slow: long runs of what a pattern repeats, ending in what it cannot take. */
function attacks(n: number): readonly string[] {
  const runs = ['a', '1', 'a.', 'a-', '-', '.', 'a1', '0', 'xn--', ' ', '​', 'a/', '%', '9.', 'A']
  const tails = ['', '!', '\u0000', '/', '.', '-', ':']
  const out: string[] = []
  for (const prefix of ['', 'https://', 'a/b/', 'myapp:', '#', '-']) for (const run of runs) for (const tail of tails) out.push(prefix + run.repeat(n) + tail)
  return out
}

describe('limit 6: every contract pattern under backtracking attacks in V8', () => {
  const patterns = contractPatterns()
  it('the artifacts publish patterns (otherwise this checks nothing)', () => {
    expect(patterns.length).toBeGreaterThan(10)
  })
  for (const { source, where } of patterns) {
    it(`${where}`, () => {
      const pattern = new RegExp(source, /\\p\{/.test(source) ? 'u' : '')
      for (const input of attacks(20_000)) {
        const start = performance.now()
        pattern.test(input)
        const ms = performance.now() - start
        expect(ms, `${source.slice(0, 60)} on ${JSON.stringify(input.slice(0, 20))}…`).toBeLessThan(150)
      }
    })
  }
})

describe('limit 6: endless motion stops for a reduced-motion preference', () => {
  it('every infinite animation the package stylesheet declares has a reduced-motion rule that stops it', () => {
    const css = HOTLAYOUT_CSS
    const infinite = [...css.matchAll(/([^{}]+)\{[^{}]*animation:[^;{}]*infinite[^{}]*\}/g)].map((match) => (match[1] ?? '').trim())
    const reduced = [...css.matchAll(/@media \(prefers-reduced-motion:reduce\)\{((?:[^{}]+\{[^{}]*\})+)\}/g)].map((match) => match[1] ?? '').join('\n')
    expect(infinite.length).toBeGreaterThan(0)
    for (const selector of infinite) expect(reduced, selector).toContain(selector.split(',')[0]?.trim() ?? selector)
  })
})

describe('limit 6: a live record follows the data in linear time', () => {
  const tasks = (count: number, doneLast: boolean): Record<string, readonly Record<string, unknown>[]> => {
    const record = (index: number): Record<string, unknown> => ({ id: `r${String(index)}`, title: `Task ${String(index)}`, status: 'open', progress: index % 5, target: 5 })
    const all = Array.from({ length: count }, (_, index) => record(index))
    // The followed record moves to the END of the other collection, so a lookup has to cross everything.
    return doneLast ? { tasks: all.slice(1), doneTasks: [...all.slice(1), { ...record(0), status: 'done' }] } : { tasks: all, doneTasks: [] }
  }
  const live = screenFixtures().find((fixture) => fixture.name === 'live-record-screens.json')

  it('ten updates of 160 000 records cost at most ~24 times ten updates of 20 000', () => {
    if (live === undefined) throw new Error('no live-record fixture')
    const measure = (count: number): number => {
      const view = render(<HotlayoutScreen document={live.document} collections={tasks(10, false)} onReport={() => undefined} />)
      const row = view.container.querySelector('[role="button"]')
      if (row === null) throw new Error('no row')
      fireEvent.click(row, { detail: 1 })
      const start = performance.now()
      for (let update = 0; update < 10; update += 1) view.rerender(<HotlayoutScreen document={live.document} collections={tasks(count + update, true)} onReport={() => undefined} />)
      const ms = performance.now() - start
      expect(view.container.textContent).toContain('done')
      view.unmount()
      return ms
    }
    const a = measure(20_000)
    const b = measure(160_000)
    expect(b, `${a.toFixed(0)} ms -> ${b.toFixed(0)} ms`).toBeLessThan(Math.max(a * 24, 1500))
  }, 120_000)
})
