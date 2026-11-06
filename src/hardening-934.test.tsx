/**
 * The trust boundary for the motion of the drag-to-confirm button: a hostile string or number in
 * EVERY leaf of the frame `swipe-motion-screens` must not reach a style or an address, a hostile
 * `confirmTransition` plays no fill, and neither a hostile colour nor a hostile radius that the
 * browser reports can reach the fill layer, the fill behind the thumb or the thumb.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'
import { safeComputedColor } from './sanitize'

afterEach(() => {
  cleanup()
  for (const layer of document.querySelectorAll('[data-hl-swipe-cover]')) layer.remove()
  vi.useRealTimers()
})

const MARK = 'attacker.test'
const HOSTILE_STRING = `#000"');},url(http://${MARK}/x);position:fixed;inset:0;z-index:9;--y:`
const HOSTILE_NUMBER = 123_456_789
const FRAME = JSON.parse(readFileSync('contract/fixtures/swipe-motion-screens.json', 'utf8')) as UiDocument
const silent = (): void => undefined

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

function draw(document: UiDocument, screenIndex: number | undefined): string {
  const screens = (document as { screens?: readonly { screenId?: unknown }[] }).screens ?? []
  const id = screenIndex === undefined ? undefined : screens[screenIndex]?.screenId
  const shown = typeof id === 'string' ? ({ ...document, initialScreenId: id } as UiDocument) : document
  return renderToStaticMarkup(<HotlayoutScreen document={shown} injectStyles={false} onReport={silent} scroll="screen" />)
}

describe('no leaf of the motion frame reaches a style or an address', () => {
  it('every leaf in turn — a hostile string and a hostile number', () => {
    expectClean(draw(FRAME, undefined), 'the clean frame')
    const leaves = leavesOf(FRAME).filter((path) => {
      const key = path[path.length - 1]
      return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
    })
    expect(leaves.length).toBeGreaterThan(50)
    expect(leaves.some((path) => path.includes('confirmTransition'))).toBe(true)
    for (const path of leaves) {
      const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
      expectClean(draw(replaced(FRAME, path, HOSTILE_STRING) as UiDocument, only), `frame: ${path.join('.')}`)
      expectClean(draw(replaced(FRAME, path, HOSTILE_NUMBER) as UiDocument, only), `frame: ${path.join('.')}`)
    }
  }, 120_000)
})

describe('the colour of the fill is a colour the browser computed, nothing else', () => {
  it('only rgb() and rgba() with numbers pass, rebuilt from their numbers', () => {
    expect(safeComputedColor('rgb(79, 70, 229)')).toBe('rgba(79, 70, 229, 1)')
    expect(safeComputedColor('rgba(79, 70, 229, 0.5)')).toBe('rgba(79, 70, 229, 0.5)')
    for (const hostile of [HOSTILE_STRING, `rgb(1, 2, 3);position:fixed;inset:0`, `rgb(1, 2, 3) url(http://${MARK}/x)`, 'red', '#ff0000', 'var(--product-color-primary)', 'rgb(url(http://x), 2, 3)', 'rgba(1, 2, 3, 1e9)', '', null, 12, {}]) {
      expect(safeComputedColor(hostile), String(hostile)).toBeUndefined()
    }
    expect(safeComputedColor('rgb(999, 2, 3)')).toBe('rgba(255, 2, 3, 1)')
  })
})

describe('what the browser reports about a real button cannot carry a hostile value into the DOM', () => {
  const restore: (() => void)[] = []
  let radius = ''
  let fill = 'rgb(79, 70, 229)'

  beforeAll(() => {
    for (const property of ['offsetWidth', 'offsetHeight'] as const) {
      const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, property)
      Object.defineProperty(HTMLElement.prototype, property, {
        configurable: true,
        get(this: HTMLElement) {
          if (this.getAttribute('data-hl-confirm') === 'swipe') return property === 'offsetWidth' ? 345 : 48
          if (this.hasAttribute('data-hotlayout')) return property === 'offsetWidth' ? 393 : 852
          return 0
        },
      })
      restore.push(() => {
        if (original !== undefined) Object.defineProperty(HTMLElement.prototype, property, original)
      })
    }
    if (!('PointerEvent' in window)) {
      class PointerEventStandIn extends MouseEvent {
        readonly pointerId: number
        constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
          super(type, init)
          this.pointerId = init.pointerId ?? 1
        }
      }
      Object.defineProperty(window, 'PointerEvent', { configurable: true, value: PointerEventStandIn })
      restore.push(() => Reflect.deleteProperty(window, 'PointerEvent'))
    }
    const original = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
      const style = original(element, pseudo)
      const overrides: Record<string, string> = {}
      if (element.getAttribute('data-hl-confirm') === 'swipe') Object.assign(overrides, { borderBlockStartWidth: '1px', borderTopLeftRadius: radius })
      if (element.parentElement?.hasAttribute('data-hl-swipe-orb') === true && (element as HTMLElement).style.display === 'flex') overrides.backgroundColor = fill
      if (Object.keys(overrides).length === 0) return style
      return new Proxy(style, {
        get: (target, key) => {
          if (typeof key === 'string' && key in overrides) return overrides[key]
          const value = Reflect.get(target, key) as unknown
          return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
        },
      })
    })
    return () => {
      vi.restoreAllMocks()
      for (const undo of restore.reverse()) undo()
    }
  })

  const button = (view: { container: HTMLElement }): HTMLElement => view.container.querySelector('[data-hl-node="pay-swipe"]') as HTMLElement
  function swipe(target: HTMLElement): void {
    act(() => {
      fireEvent.pointerDown(target, { pointerId: 1, button: 0, clientX: 100, clientY: 200 })
      fireEvent.pointerMove(target, { pointerId: 1, clientX: 400, clientY: 200 })
      fireEvent.pointerUp(target, { pointerId: 1, clientX: 400, clientY: 200 })
      fireEvent.click(target, { detail: 1 })
    })
  }
  function advance(ms: number): void {
    for (let left = ms; left > 0; left -= 16) {
      act(() => {
        vi.advanceTimersByTime(Math.min(16, left))
      })
    }
  }

  it('a hostile radius becomes a finite number of pixels or a circle; the thumb and the fill behind it carry nothing else', () => {
    for (const hostile of [`12px;position:fixed;inset:0;background:url(http://${MARK}/x)`, `${HOSTILE_STRING}`, '1e999px', 'NaN', '-5px', 'calc(1px + 2px)']) {
      radius = hostile
      const view = render(<HotlayoutScreen document={FRAME} injectStyles={false} onReport={silent} />)
      const html = view.container.innerHTML
      expectClean(html, `radius ${hostile}`)
      for (const part of ['thumb', 'trail']) {
        const style = view.container.querySelector<HTMLElement>(`[data-hl-swipe-${part}]`)?.getAttribute('style') ?? ''
        expect(style, part).not.toContain(MARK)
        expect(style, part).not.toMatch(/position\s*:\s*fixed/)
        expect(style, part).toMatch(/border-radius:\s*(?:\d+(?:\.\d+)?px|50%)/)
      }
      view.unmount()
    }
    radius = ''
  })

  it('a hostile computed colour plays no fill: no layer anywhere, the action runs when the circle is there', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    const events: string[] = []
    for (const cover of [undefined, () => undefined]) {
      fill = `rgb(1, 2, 3);position:fixed;inset:0;background:url(http://${MARK}/x)`
      const view = render(
        <HotlayoutScreen
          document={FRAME}
          injectStyles={false}
          onReport={silent}
          onNavigate={(event) => {
            events.push(event.to.screenId)
            return undefined
          }}
          {...(cover === undefined ? {} : { onScreenCovered: cover })}
        />,
      )
      swipe(button(view))
      advance(900)
      expect(document.querySelector('[data-hl-swipe-cover]')).toBeNull()
      expect(document.body.innerHTML).not.toContain(MARK)
      view.unmount()
    }
    expect(events).toEqual(['paid', 'paid'])
    fill = 'rgb(79, 70, 229)'
  })

  it('the layer carries only numbers, the computed colour and fixed words in its style', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    const view = render(<HotlayoutScreen document={FRAME} injectStyles={false} onReport={silent} onScreenCovered={() => undefined} />)
    swipe(button(view))
    advance(850)
    const layer = document.querySelector('[data-hl-swipe-cover]')
    expect(layer).not.toBeNull()
    const styles = [layer, ...(layer?.querySelectorAll('*') ?? [])].map((element) => element?.getAttribute('style') ?? '')
    for (const style of styles) {
      expect(style).not.toMatch(/url\(|var\(|;\s*;|expression/i)
      expect(style).not.toContain(MARK)
    }
    expect(styles.join(' ')).toContain('background-color: rgb(79, 70, 229)')
    view.unmount()
  })
})
