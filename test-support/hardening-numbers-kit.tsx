/**
 * Number handling under extreme values: every numeric leaf of every contract fixture, every numeric
 * data value and every numeric theme value gets each extreme a network document can carry
 * (`JSON.parse('1e309')` is Infinity; host data can carry NaN directly). The screen must not throw,
 * no style may carry an exponent, `NaN`, `Infinity` or a seven-digit length, and the markup must
 * not explode in size.
 *
 * Each list of cases is cut into slices (`shard.ts`) that `hardening-2026-10/numbers.<k>.deep.test.tsx`
 * run in parallel.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BUILT_IN_THEME_CONTRACT, HotlayoutScreen } from '../src/index'
import type { HotlayoutReport, ThemeContract, UiDocument } from '../src/index'
import { badNumberIn, EXTREMES, leavesOf, replaced, screenFixtures, serverMarkup, showingScreenOf, sinksOf, THREW, valueAt } from './hardening-kit'
import type { Fixture, Path } from './hardening-kit'
import { sampleData } from './sample-data'
import { shardOf } from './shard'

/** How many files the sweeps are cut into: `numbers.<1..N>.deep.test.tsx`. */
export const NUMBERS_SLICE_COUNT = 8

/**
 * The browser tests render hundreds of screens in one jsdom document with `injectStyles={false}`: the
 * stylesheet is a constant (no number reaches it), and jsdom keeps every injected sheet in
 * `document.styleSheets` after unmount, so each later selector match walks all of them (a file run went
 * from 4.8 s to 69 s for one test). The numbers under test reach inline styles only.
 */
export function check(html: string, cleanLength: number, what: string): void {
  expect(html.includes(THREW), `${what}: the screen threw — ${/data-test-threw="">([^<]*)/.exec(html)?.[1] ?? ''}`).toBe(false)
  for (const sink of sinksOf(html)) {
    const bad = badNumberIn(sink)
    if (bad !== undefined) throw new Error(`${what}: ${bad} reached the markup — ${sink.slice(0, 240)}`)
  }
  // A number must not multiply the markup (dots, steps, copies): five times the clean screen plus 50 KB is generous.
  expect(html.length, `${what}: the markup grew from ${String(cleanLength)} to ${String(html.length)}`).toBeLessThan(cleanLength * 5 + 50_000)
}

/* ------------------------------------------------------------------ the lists of cases */

export interface LeafCase {
  readonly fixture: Fixture
  readonly path: Path
}

export interface ScreenCase {
  readonly fixture: Fixture
  readonly index: number
  readonly screenId: string
}

export interface TransitionCase extends ScreenCase {
  readonly label: string
  readonly value: number
}

const screensOf = (document: UiDocument): readonly { screenId?: unknown }[] => (document as { screens: readonly { screenId?: unknown }[] }).screens

/** Every numeric leaf of every fixture. */
export function numericLeafCases(): LeafCase[] {
  return screenFixtures().flatMap((fixture) => leavesOf(fixture.document).filter((path) => typeof valueAt(fixture.document, path) === 'number').map((path) => ({ fixture, path })))
}

/** Every screen (with a string id) of every fixture. */
export function screenCases(): ScreenCase[] {
  return screenFixtures().flatMap((fixture) =>
    screensOf(fixture.document).flatMap((screen, index) => (typeof screen.screenId === 'string' ? [{ fixture, index, screenId: screen.screenId }] : [])),
  )
}

/** Every screen of every fixture under every extreme. */
export function transitionCases(): TransitionCase[] {
  return screenCases().flatMap((screen) => EXTREMES.map(([label, value]) => ({ ...screen, label, value })))
}

/** One leaf per (fixture, last keys): the browser render is slower than the server one, and the same key reaches the same code. */
export function representativeCases(): LeafCase[] {
  return screenFixtures().flatMap((fixture) => {
    const seen = new Set<string>()
    return leavesOf(fixture.document)
      .filter((path) => {
        if (typeof valueAt(fixture.document, path) !== 'number') return false
        const key = path
          .slice(-3)
          .filter((part) => typeof part === 'string')
          .join('.')
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((path) => ({ fixture, path }))
  })
}

const THEME = BUILT_IN_THEME_CONTRACT

/** Every numeric leaf of the built-in theme. */
export function themeCases(): Path[] {
  return leavesOf(THEME).filter((path) => typeof valueAt(THEME, path) === 'number')
}

export const SHOWCASE_NAME = 'rewards-showcase-screens.json'

/* ------------------------------------------------------------------ the sweeps */

function itServerLeaves(shard: number): void {
  it(`slice ${String(shard)}: every numeric leaf of the fixtures under every extreme number (server render)`, () => {
    const cleanLengths = new Map<string, number>()
    for (const { fixture, path } of shardOf(numericLeafCases(), shard, NUMBERS_SLICE_COUNT)) {
      const screen = showingScreenOf(fixture.document, path)
      const key = `${fixture.name}:${String(path[1])}`
      if (!cleanLengths.has(key)) cleanLengths.set(key, serverMarkup(screen).length)
      for (const [label, value] of EXTREMES) {
        const hostile = showingScreenOf(replaced(fixture.document, path, value), path)
        check(serverMarkup(hostile), cleanLengths.get(key) ?? 0, `${fixture.name} ${path.join('.')} = ${label}`)
      }
    }
  }, 120_000 / NUMBERS_SLICE_COUNT + 60_000)
}

function withNumbers(value: number): { data: Record<string, unknown>; collections: Record<string, readonly Record<string, unknown>[]> } {
  const { data, collections } = sampleData()
  const nextData: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(data)) nextData[key] = typeof item === 'number' ? value : item
  const nextCollections: Record<string, readonly Record<string, unknown>[]> = {}
  for (const [key, list] of Object.entries(collections)) {
    const record = list[0] ?? {}
    const next: Record<string, unknown> = {}
    for (const [field, item] of Object.entries(record)) next[field] = typeof item === 'number' ? value : item
    nextCollections[key] = [next, next, next]
  }
  return { data: nextData, collections: nextCollections }
}

function itServerData(shard: number): void {
  it(`slice ${String(shard)}: every numeric DATA value under every extreme number (server render)`, () => {
    const { data, collections } = sampleData()
    for (const { fixture, index, screenId } of shardOf(screenCases(), shard, NUMBERS_SLICE_COUNT)) {
      const shown = { ...fixture.document, initialScreenId: screenId } as UiDocument
      const clean = serverMarkup(shown, { data, collections }).length
      for (const [label, value] of EXTREMES) {
        const host = withNumbers(value)
        check(serverMarkup(shown, { data: host.data, collections: host.collections, now: Date.parse('2026-10-19T12:00:00Z') }), clean, `${fixture.name} screen ${String(index)} data = ${label}`)
      }
    }
  }, 120_000 / NUMBERS_SLICE_COUNT + 60_000)
}

function itServerTheme(shard: number): void {
  it(`slice ${String(shard)}: every numeric theme leaf on the showcase`, () => {
    const showcase = screenFixtures().find((fixture) => fixture.name === SHOWCASE_NAME)
    if (showcase === undefined) throw new Error('no showcase fixture')
    const clean = serverMarkup(showcase.document, { theme: THEME }).length
    for (const path of shardOf(themeCases(), shard, NUMBERS_SLICE_COUNT))
      for (const [label, value] of EXTREMES) {
        const hostile: ThemeContract = replaced(THEME, path, value)
        check(serverMarkup(showcase.document, { theme: hostile }), clean, `theme ${path.join('.')} = ${label}`)
      }
  }, 120_000 / NUMBERS_SLICE_COUNT + 60_000)
}

/**
 * One transition: data numbers change from 3 to an extreme. Reports whether any frame was
 * scheduled and whether a frame loop still runs after the transition. Needs fake timers.
 */
export function runTransition({ fixture, index, screenId, label, value }: TransitionCase): { started: boolean; running: boolean } {
  const { data, collections } = sampleData()
  const numbered = (number: number): Record<string, unknown> => Object.fromEntries(Object.entries(data).map(([key, item]) => [key, typeof item === 'number' ? number : item]))
  const shown = { ...fixture.document, initialScreenId: screenId } as UiDocument
  const reports: HotlayoutReport[] = []
  const view = render(<HotlayoutScreen injectStyles={false} document={shown} data={numbered(3)} collections={collections} onReport={(report) => reports.push(report)} />)
  act(() => {
    vi.advanceTimersByTime(2000)
  })
  view.rerender(<HotlayoutScreen injectStyles={false} document={shown} data={numbered(value)} collections={collections} onReport={(report) => reports.push(report)} />)
  const started = vi.getTimerCount() > 0
  act(() => {
    vi.advanceTimersByTime(3000)
  })
  const frames = vi.getTimerCount()
  act(() => {
    vi.advanceTimersByTime(1000)
  })
  // What is still scheduled after the transition must be the countdown clock only, not a frame loop.
  const running = vi.getTimerCount() > 2 || frames > 2
  expect(reports.filter((report) => report.kind === 'render-error'), `${fixture.name}/${screenId} (screen ${String(index)}) = ${label}`).toEqual([])
  view.unmount()
  cleanup()
  return { started, running }
}

export const FAKE_TIMERS = ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] as const

function itTransitions(shard: number): void {
  it(`slice ${String(shard)}: data numbers change from 3 to each extreme; frames stop within three seconds and nothing throws`, () => {
    vi.useFakeTimers({ toFake: [...FAKE_TIMERS] })
    let running = 0
    for (const job of shardOf(transitionCases(), shard, NUMBERS_SLICE_COUNT)) if (runTransition(job).running) running += 1
    expect(running).toBe(0)
  }, 120_000 / NUMBERS_SLICE_COUNT + 60_000)
}

function itBrowser(shard: number): void {
  it(`slice ${String(shard)}: in the browser, effects, timers and measurements under extreme numbers`, () => {
    vi.useFakeTimers()
    const delays: number[] = []
    const intervals: number[] = []
    const realInterval = globalThis.setInterval
    const realTimeout = globalThis.setTimeout
    vi.spyOn(globalThis, 'setInterval').mockImplementation(((handler: TimerHandler, delay?: number, ...rest: unknown[]) => {
      intervals.push(typeof delay === 'number' && Number.isFinite(delay) ? delay : -1)
      return realInterval(handler, delay, ...rest)
    }) as typeof setInterval)
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((handler: TimerHandler, delay?: number, ...rest: unknown[]) => {
      // A timeout beyond 2^31 − 1 ms fires AT ONCE in browsers; a non-number fires at once too.
      if (delay !== undefined && (typeof delay !== 'number' || !Number.isFinite(delay) || delay > 2 ** 31 - 1 || delay < 0)) delays.push(-1)
      return realTimeout(handler, delay, ...rest)
    }) as typeof setTimeout)
    for (const { fixture, path } of shardOf(representativeCases(), shard, NUMBERS_SLICE_COUNT))
      for (const [label, value] of EXTREMES) {
        const reports: HotlayoutReport[] = []
        const what = `${fixture.name} ${path.join('.')} = ${label}`
        const view = render(<HotlayoutScreen injectStyles={false} document={showingScreenOf(replaced(fixture.document, path, value), path)} onReport={(report) => reports.push(report)} />)
        act(() => {
          vi.advanceTimersByTime(3000)
        })
        expect(reports.filter((report) => report.kind === 'render-error'), what).toEqual([])
        for (const element of [...view.container.querySelectorAll<HTMLElement>('[style]')]) {
          const bad = badNumberIn(element.getAttribute('style') ?? '')
          if (bad !== undefined) throw new Error(`${what}: ${bad} in the DOM`)
        }
        expect(view.container.querySelectorAll('*').length, what).toBeLessThan(20_000)
        // A countdown ticks once a second at most; nothing polls faster, and no timeout is unbounded.
        expect(delays.filter((delay) => delay < 0), what).toEqual([])
        expect(intervals.filter((delay) => delay < 1000), what).toEqual([])
        view.unmount()
        cleanup()
      }
  }, 120_000 / NUMBERS_SLICE_COUNT + 60_000)
}

/** The five sweeps over one slice of their cases (`numbers.<shard>.deep.test.tsx` calls this). */
export function describeNumberSlice(shard: number): void {
  describe(`limit 1: extreme numbers (slice ${String(shard)} of ${String(NUMBERS_SLICE_COUNT)})`, () => {
    afterEach(() => {
      cleanup()
      vi.useRealTimers()
      vi.restoreAllMocks()
    })
    itServerLeaves(shard)
    itServerData(shard)
    itServerTheme(shard)
    itTransitions(shard)
    itBrowser(shard)
  })
}
