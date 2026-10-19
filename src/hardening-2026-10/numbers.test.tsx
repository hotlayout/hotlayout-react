/**
 * Limit 1 — number handling. Earlier passes put ONE hostile number (123 456 789) into every leaf.
 * Here every numeric leaf of every contract fixture gets each extreme a network document can carry
 * (`JSON.parse('1e309')` is Infinity; host data can carry NaN directly): the screen must not throw,
 * no style may carry an exponent, `NaN`, `Infinity` or a seven-digit length, and the markup must not
 * explode in size.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { sampleData } from '../../test-support/sample-data'
import { BUILT_IN_THEME_CONTRACT, HotlayoutScreen } from '../index'
import type { HotlayoutReport, ThemeContract, UiDocument } from '../index'
import { badNumberIn, EXTREMES, leavesOf, replaced, screenFixtures, serverMarkup, showingScreenOf, sinksOf, THREW, valueAt } from '../../test-support/hardening-kit'

function check(html: string, cleanLength: number, what: string): void {
  expect(html.includes(THREW), `${what}: the screen threw — ${/data-test-threw="">([^<]*)/.exec(html)?.[1] ?? ''}`).toBe(false)
  for (const sink of sinksOf(html)) {
    const bad = badNumberIn(sink)
    if (bad !== undefined) throw new Error(`${what}: ${bad} reached the markup — ${sink.slice(0, 240)}`)
  }
  // A number must not multiply the markup (dots, steps, copies): five times the clean screen plus 50 KB is generous.
  expect(html.length, `${what}: the markup grew from ${String(cleanLength)} to ${String(html.length)}`).toBeLessThan(cleanLength * 5 + 50_000)
}

describe('limit 1: the number guard itself', () => {
  it('catches what it must and passes colours, names and ordinary numbers', () => {
    for (const bad of ['width:1e+300px', 'margin:-1e+300px', 'width:1e-300px', 'width:NaNpx', 'inset:Infinitypx', 'width:12345678px', 'translate:-1.5e-7px 0']) expect(badNumberIn(bad), bad).toBeDefined()
    for (const good of ['color:#1e2a3b', '--hl-c-1e2:#fff', 'width:120px', 'transform:rotate(-45deg)', 'font-weight:600', 'opacity:0.5', 'flex:1 1 0%']) expect(badNumberIn(good), good).toBeUndefined()
  })
})

describe('limit 1: every numeric leaf of every fixture under every extreme number (server render)', () => {
  for (const fixture of screenFixtures()) {
    const numeric = leavesOf(fixture.document).filter((path) => typeof valueAt(fixture.document, path) === 'number')
    if (numeric.length === 0) continue
    it(`${fixture.name}: ${String(numeric.length)} numeric leaves`, () => {
      const cleanLengths = new Map<string, number>()
      for (const path of numeric) {
        const screen = showingScreenOf(fixture.document, path)
        const key = String(path[1])
        if (!cleanLengths.has(key)) cleanLengths.set(key, serverMarkup(screen).length)
        for (const [label, value] of EXTREMES) {
          const hostile = showingScreenOf(replaced(fixture.document, path, value), path)
          check(serverMarkup(hostile), cleanLengths.get(key) ?? 0, `${fixture.name} ${path.join('.')} = ${label}`)
        }
      }
    }, 120_000)
  }
})

describe('limit 1: every numeric DATA value under every extreme number (server render)', () => {
  const { data, collections } = sampleData()
  const withNumbers = (value: number): { data: Record<string, unknown>; collections: Record<string, readonly Record<string, unknown>[]> } => {
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

  for (const fixture of screenFixtures()) {
    const screens = (fixture.document as { screens: readonly { screenId?: unknown }[] }).screens
    it(`${fixture.name}: ${String(screens.length)} screens`, () => {
      for (const [index, screen] of screens.entries()) {
        if (typeof screen.screenId !== 'string') continue
        const shown = { ...fixture.document, initialScreenId: screen.screenId } as UiDocument
        const clean = serverMarkup(shown, { data, collections }).length
        for (const [label, value] of EXTREMES) {
          const host = withNumbers(value)
          check(serverMarkup(shown, { data: host.data, collections: host.collections, now: Date.parse('2026-10-19T12:00:00Z') }), clean, `${fixture.name} screen ${String(index)} data = ${label}`)
        }
      }
    }, 120_000)
  }
})

describe('limit 1: every numeric THEME value under every extreme number (server render)', () => {
  const theme = BUILT_IN_THEME_CONTRACT
  const numeric = leavesOf(theme).filter((path) => typeof valueAt(theme, path) === 'number')
  const showcase = screenFixtures().find((fixture) => fixture.name === 'rewards-showcase-screens.json')

  it('every numeric theme leaf on the showcase', () => {
    if (showcase === undefined) throw new Error('no showcase fixture')
    expect(numeric.length).toBeGreaterThan(20)
    const clean = serverMarkup(showcase.document, { theme }).length
    for (const path of numeric)
      for (const [label, value] of EXTREMES) {
        const hostile: ThemeContract = replaced(theme, path, value)
        check(serverMarkup(showcase.document, { theme: hostile }), clean, `theme ${path.join('.')} = ${label}`)
      }
  }, 120_000)
})

describe('limit 1: a transition to an extreme number ends', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('every fixture: data numbers change from 3 to each extreme; frames stop within three seconds and nothing throws', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] })
    let sawFrames = 0
    const { data, collections } = sampleData()
    const numbered = (value: number): Record<string, unknown> => Object.fromEntries(Object.entries(data).map(([key, item]) => [key, typeof item === 'number' ? value : item]))
    let running = 0
    for (const fixture of screenFixtures()) {
      const screens = (fixture.document as { screens: readonly { screenId?: unknown }[] }).screens
      for (const screen of screens) {
        if (typeof screen.screenId !== 'string') continue
        const shown = { ...fixture.document, initialScreenId: screen.screenId } as UiDocument
        for (const [label, value] of EXTREMES) {
          const reports: HotlayoutReport[] = []
          const view = render(<HotlayoutScreen document={shown} data={numbered(3)} collections={collections} onReport={(report) => reports.push(report)} />)
          act(() => {
            vi.advanceTimersByTime(2000)
          })
          view.rerender(<HotlayoutScreen document={shown} data={numbered(value)} collections={collections} onReport={(report) => reports.push(report)} />)
          if (vi.getTimerCount() > 0) sawFrames += 1
          act(() => {
            vi.advanceTimersByTime(3000)
          })
          const frames = vi.getTimerCount()
          act(() => {
            vi.advanceTimersByTime(1000)
          })
          // What is still scheduled after the transition must be the countdown clock only, not a frame loop.
          if (vi.getTimerCount() > 2 || frames > 2) running += 1
          expect(reports.filter((report) => report.kind === 'render-error'), `${fixture.name}/${screen.screenId} = ${label}`).toEqual([])
          view.unmount()
        }
      }
    }
    expect(sawFrames, 'no transition ever started: the check would be empty').toBeGreaterThan(0)
    expect(running).toBe(0)
  }, 120_000)
})

describe('limit 1: in the browser — effects, timers and measurements under extreme numbers', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** One leaf per (fixture, last keys): the browser render is slower than the server one, and the same key reaches the same code. */
  function representatives(document: UiDocument): readonly (readonly (string | number)[])[] {
    const seen = new Set<string>()
    return leavesOf(document).filter((path) => {
      if (typeof valueAt(document, path) !== 'number') return false
      const key = path.slice(-3).filter((part) => typeof part === 'string').join('.')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  for (const fixture of screenFixtures()) {
    const paths = representatives(fixture.document)
    if (paths.length === 0) continue
    it(`${fixture.name}: ${String(paths.length)} kinds of numeric leaf`, () => {
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
      for (const path of paths)
        for (const [label, value] of EXTREMES) {
          const reports: HotlayoutReport[] = []
          const what = `${fixture.name} ${path.join('.')} = ${label}`
          const view = render(<HotlayoutScreen document={showingScreenOf(replaced(fixture.document, path, value), path)} onReport={(report) => reports.push(report)} />)
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
        }
    }, 120_000)
  }
})
