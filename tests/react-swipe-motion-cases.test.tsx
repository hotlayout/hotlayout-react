/**
 * @vitest-environment jsdom
 *
 * THE MOTION OF "DRAG TO CONFIRM" THROUGH THE PACKAGE `@hotlayout/react` (schema 9.34.0,
 * `contract/fixtures/swipe-motion/swipe-motion-cases.json` and the screens of
 * `contract/fixtures/swipe-motion-screens.json`).
 *
 * Every group of the table goes through the pure functions of the package (curves to 1e-4) and the
 * rule block of the artifact; the screens go through a real `<HotlayoutScreen>`: the fill behind the
 * thumb, the radius of the thumb, the circle, the fill over the screen in both of its places (inside
 * the screen root and, when the host steers the route, on `document.body`), the action that waits
 * for the fill, the button that leaves first. NO ROW IS SKIPPED.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { NavigationEvent, UiDocument } from '../src/index'
import {
  RIPPLE_ACTION_TYPES,
  SWIPE_COLLAPSE,
  SWIPE_HALO_OPACITY,
  SWIPE_REVEAL,
  SWIPE_RIPPLE,
  confirmTransitionOf,
  swipeBusyReturnOf,
  swipeCollapseAt,
  swipeLabelOpacityOf,
  swipeRevealAt,
  swipeRippleAt,
  swipeRippleScaleOf,
  swipeSequenceOf,
  swipeThumbRadiusOf,
  swipeTrailOf,
} from '../src/swipe-motion'
import type { SwipeSequenceInput } from '../src/swipe-motion'
import type { SwipeTrack } from '../src/swipe-confirm'

type Row<T> = T & { readonly name: string }
interface Area {
  readonly centerX: number
  readonly centerY: number
  readonly screenWidth: number
  readonly screenHeight: number
  readonly core: number
}
const TABLE = JSON.parse(readFileSync('contract/fixtures/swipe-motion/swipe-motion-cases.json', 'utf8')) as {
  readonly labelCases: readonly Row<{ progress: number; expect: number }>[]
  readonly trailCases: readonly Row<{ track: SwipeTrack; progress: number; expect: { start: number; width: number } }>[]
  readonly thumbRadiusCases: readonly Row<{ track: SwipeTrack; radius: number | null; expect: number }>[]
  readonly collapseCases: readonly Row<{ track: SwipeTrack; elapsed: number; expect: Record<string, number> }>[]
  readonly rippleScaleCases: readonly Row<{ area: Area; expect: number }>[]
  readonly rippleCases: readonly Row<{ scale: number; elapsed: number; expect: number }>[]
  readonly revealCases: readonly Row<{ elapsed: number; expect: number }>[]
  readonly sequenceCases: readonly Row<{ input: SwipeSequenceInput; expect: readonly string[] }>[]
  readonly busyReturnCases: readonly Row<{ reducedMotion: boolean; expect: readonly string[] }>[]
  readonly fieldCases: readonly Row<{ props: Record<string, unknown>; reads: string | null }>[]
  readonly ruleCases: readonly Row<{ rule: string; expect: unknown }>[]
}
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as Record<string, unknown>
const BLOCK = ARTIFACT['x-swipeConfirmMotion']
const FIXTURE = JSON.parse(readFileSync('contract/fixtures/swipe-motion-screens.json', 'utf8')) as UiDocument
const named = <R extends { readonly name: string }>(rows: readonly R[]): readonly (readonly [string, R])[] => rows.map((row) => [row.name, row] as const)
const at = (root: unknown, path: string): unknown => path.split('.').reduce<unknown>((value, key) => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined), root)
const close = (actual: number, expected: number): void => {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-4)
}

describe('the table through the pure functions of the package', () => {
  it.each(named(TABLE.labelCases))('labelCases: %s', (_name, row) => {
    close(swipeLabelOpacityOf(row.progress), row.expect)
  })
  it.each(named(TABLE.trailCases))('trailCases: %s', (_name, row) => {
    const strip = swipeTrailOf(row.track, row.progress)
    close(strip.start, row.expect.start)
    close(strip.width, row.expect.width)
  })
  it.each(named(TABLE.thumbRadiusCases))('thumbRadiusCases: %s', (_name, row) => {
    close(swipeThumbRadiusOf({ ...row.track, radius: row.radius ?? undefined }), row.expect)
  })
  it.each(named(TABLE.collapseCases))('collapseCases: %s', (_name, row) => {
    const frame = swipeCollapseAt(row.track, row.elapsed) as unknown as Record<string, number>
    for (const [key, value] of Object.entries(row.expect)) close(frame[key] ?? Number.NaN, value)
  })
  it.each(named(TABLE.rippleScaleCases))('rippleScaleCases: %s', (_name, row) => {
    close(swipeRippleScaleOf(row.area), row.expect)
  })
  it.each(named(TABLE.rippleCases))('rippleCases: %s', (_name, row) => {
    close(swipeRippleAt(row.scale, row.elapsed), row.expect)
  })
  it.each(named(TABLE.revealCases))('revealCases: %s', (_name, row) => {
    close(swipeRevealAt(row.elapsed), row.expect)
  })
  it.each(named(TABLE.sequenceCases))('sequenceCases: %s', (_name, row) => {
    expect(swipeSequenceOf(row.input)).toEqual(row.expect)
  })
  it.each(named(TABLE.busyReturnCases))('busyReturnCases: %s', (_name, row) => {
    expect(swipeBusyReturnOf(row.reducedMotion)).toEqual(row.expect)
  })
  it.each(named(TABLE.fieldCases))('fieldCases: %s', (_name, row) => {
    expect(confirmTransitionOf(row.props) ?? null).toBe(row.reads)
  })
  it('a missing or hostile props object reads as no field', () => {
    for (const props of [undefined, null, { confirmTransition: { toString: () => 'ripple' } }]) expect(confirmTransitionOf(props)).toBeUndefined()
  })
})

describe('ruleCases: the numbers of the package are the numbers of the artifact block', () => {
  const mirror: Readonly<Record<string, unknown>> = {
    'collapse.durationMs': SWIPE_COLLAPSE.durationMs,
    'collapse.curve': SWIPE_COLLAPSE.curve,
    'collapse.haloOpacity': SWIPE_HALO_OPACITY,
    'ripple.durationMs': SWIPE_RIPPLE.durationMs,
    'ripple.curve': SWIPE_RIPPLE.curve,
    'reveal.durationMs': SWIPE_REVEAL.durationMs,
    'ripple.actions': RIPPLE_ACTION_TYPES,
  }
  it.each(named(TABLE.ruleCases))('%s', (_name, row) => {
    expect(at(BLOCK, row.rule)).toEqual(row.expect)
    if (row.rule in mirror) expect(mirror[row.rule]).toEqual(row.expect)
  })
})

/* -------------------------------------------------------------------------- */
/* Real buttons                                                                */
/* -------------------------------------------------------------------------- */

const TRACK = { width: 345, height: 48, border: 1, inset: 4 }
const THUMB = TRACK.height - 2 * TRACK.border - 2 * TRACK.inset
const TRAVEL = TRACK.width - 2 * TRACK.border - 2 * TRACK.inset - THUMB
const ROOT = { width: 393, height: 852 }
const ORB_BOX = { left: 100, top: 700, size: TRACK.height }
const CORE_SIZE = THUMB
/** The side of the busy ring that stands in the core of the collapsed button. */
const SPINNER = 18
const GLYPH = 'rgb(255, 255, 255)'
const FILL = 'rgb(79, 70, 229)'
const restore: (() => void)[] = []
const computed = { radius: '' as string, fill: FILL as string }

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }
}

beforeAll(() => {
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
  const sizes = (element: HTMLElement): { width: number; height: number } => {
    if (element.getAttribute('data-hl-confirm') === 'swipe') return { width: TRACK.width, height: TRACK.height }
    if (element.hasAttribute('data-hotlayout')) return ROOT
    return { width: 0, height: 0 }
  }
  for (const property of ['offsetWidth', 'offsetHeight'] as const) {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, property)
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get(this: HTMLElement) {
        return property === 'offsetWidth' ? sizes(this).width : sizes(this).height
      },
    })
    restore.push(() => {
      if (original !== undefined) Object.defineProperty(HTMLElement.prototype, property, original)
    })
  }
  const originalRect = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement): DOMRect {
    if (this.hasAttribute('data-hotlayout')) return rect(0, 0, ROOT.width, ROOT.height)
    if (this.hasAttribute('data-hl-swipe-orb')) return rect(ORB_BOX.left, ORB_BOX.top, ORB_BOX.size, ORB_BOX.size)
    if (this.parentElement?.hasAttribute('data-hl-swipe-orb') === true && this.style.display === 'flex') return rect(ORB_BOX.left + 5, ORB_BOX.top + 5, CORE_SIZE, CORE_SIZE)
    if (this.hasAttribute('data-hl-spinner')) return rect(ORB_BOX.left + 15, ORB_BOX.top + 15, SPINNER, SPINNER)
    return originalRect.call(this)
  }
  restore.push(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect
  })
  const originalStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
    const style = originalStyle(element, pseudo)
    const overrides: Record<string, string> = {}
    if (element.getAttribute('data-hl-confirm') === 'swipe') Object.assign(overrides, { borderBlockStartWidth: `${String(TRACK.border)}px`, borderTopLeftRadius: computed.radius })
    if (element.parentElement?.hasAttribute('data-hl-swipe-orb') === true && (element as HTMLElement).style.display === 'flex') Object.assign(overrides, { backgroundColor: computed.fill, color: GLYPH })
    if (Object.keys(overrides).length === 0) return style
    return new Proxy(style, {
      get: (target, key) => {
        if (typeof key === 'string' && key in overrides) return overrides[key]
        const value = Reflect.get(target, key) as unknown
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
      },
    })
  })
})
afterAll(() => {
  vi.restoreAllMocks()
  for (const undo of restore.reverse()) undo()
})
afterEach(() => {
  cleanup()
  for (const layer of document.querySelectorAll('[data-hl-swipe-cover]')) layer.remove()
  computed.radius = ''
  computed.fill = FILL
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const fake = (): void => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
}
/** Time passes frame by frame: React draws between the frames, as a browser does (one big step would batch every state change into one draw). */
const advance = (ms: number): void => {
  for (let left = ms; left > 0; left -= 16) {
    act(() => {
      vi.advanceTimersByTime(Math.min(16, left))
    })
  }
}
const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

interface Notes {
  readonly log: string[]
  readonly covered: (state: boolean) => void
  readonly navigate: (event: NavigationEvent) => undefined
}
function notes(): Notes {
  const log: string[] = []
  return {
    log,
    covered: (state) => {
      log.push(`covered:${String(state)}`)
    },
    navigate: (event) => {
      log.push(`navigate:${event.to.screenId}`)
      return undefined
    },
  }
}

function show(options: { readonly cover?: boolean; readonly onAction?: (type: string) => unknown } = {}) {
  const seen = notes()
  const view = render(
    <HotlayoutScreen
      document={FIXTURE}
      injectStyles={false}
      onNavigate={seen.navigate}
      onAction={((action: { type: string }) => options.onAction?.(action.type)) as never}
      {...(options.cover === true ? { onScreenCovered: seen.covered } : {})}
    />,
  )
  const button = (id: string): HTMLElement => {
    const found = view.container.querySelector<HTMLElement>(`[data-hl-node="${id}"]`)
    if (found === null) throw new Error(`no button ${id}`)
    return found
  }
  return { ...view, ...seen, button }
}

function swipe(button: HTMLElement, to = 400): void {
  act(() => {
    fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 100, clientY: 200 })
    fireEvent.pointerMove(button, { pointerId: 1, clientX: to, clientY: 200 })
    fireEvent.pointerUp(button, { pointerId: 1, clientX: to, clientY: 200 })
    fireEvent.click(button, { detail: 1 })
  })
}

const part = (button: HTMLElement, name: string): HTMLElement => {
  const found = button.querySelector<HTMLElement>(`[data-hl-swipe-${name}]`)
  if (found === null) throw new Error(`no ${name}`)
  return found
}
const labelOf = (button: HTMLElement): HTMLElement => {
  const found = [...button.children].find((child) => !child.hasAttribute('data-hl-swipe-thumb') && !child.hasAttribute('data-hl-swipe-trail') && !child.hasAttribute('data-hl-swipe-orb'))
  if (found === undefined) throw new Error('no label')
  return found as HTMLElement
}
const layer = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-hl-swipe-cover]')
const SENT = 'Payment sent'

describe('the fill behind the thumb and the label (934, 935)', () => {
  it('the fill is under the label and the thumb; at rest it is exactly the thumb', () => {
    const view = show()
    const button = view.button('pay-swipe')
    const order = [...button.children].map((child) => (child.hasAttribute('data-hl-swipe-trail') ? 'trail' : child.hasAttribute('data-hl-swipe-thumb') ? 'thumb' : 'label'))
    expect(order).toEqual(['trail', 'label', 'thumb'])
    const rest = swipeTrailOf(TRACK, 0)
    expect(part(button, 'trail').style.inlineSize).toBe(`${String(rest.width)}px`)
    expect(part(button, 'trail').style.insetInlineStart).toBe(`${String(rest.start - TRACK.border)}px`)
    expect(labelOf(button).style.opacity).toBe('1')
  })

  it('half the way: the fill is the thumb and half the way, the label is half seen', () => {
    const view = show()
    const button = view.button('pay-swipe')
    act(() => {
      fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 100, clientY: 200 })
      fireEvent.pointerMove(button, { pointerId: 1, clientX: 100 + TRAVEL / 2, clientY: 200 })
    })
    close(Number.parseFloat(part(button, 'trail').style.inlineSize), swipeTrailOf(TRACK, 0.5).width)
    expect(labelOf(button).style.opacity).toBe('0.5')
    expect(part(button, 'thumb').style.translate).toBe(`${String(TRAVEL / 2)}px 0`)
  })
})

describe('thumbRadiusCases: the thumb and the fill behind it have the radius concentric with the track (946)', () => {
  it.each([
    ['radius 12 (md)', '12px', '8px'],
    ['radius 16', '16px', '12px'],
    ['a percentage is of the height: 25% of 48 is 12', '25%', '8px'],
    ['a pill (9999px): a circle', '9999px', '50%'],
    ['a square track', '0px', '0px'],
    ['not a length (not measured): a circle', '', '50%'],
  ])('%s', (_name, radius, expected) => {
    computed.radius = radius
    const view = show()
    const button = view.button('pay-swipe')
    expect(part(button, 'thumb').style.borderRadius).toBe(expected)
    // The fill behind the thumb is a strip, never `50%`: its radius is always in pixels.
    expect(part(button, 'trail').style.borderRadius).toBe(expected === '50%' ? '19px' : expected)
  })
})

describe('the busy circle (936, 937) on an action of the host', () => {
  it('glides to the end, collapses into a circle with the indicator, and expands back when the host answers', async () => {
    fake()
    // The surface fades through longhand properties only: React must not warn about a shorthand it cannot update.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let answer: () => void = () => undefined
    const view = show({
      onAction: () =>
        new Promise<void>((resolve) => {
          answer = resolve
        }),
    })
    const button = view.button('pay-tip')
    swipe(button)
    expect(part(button, 'thumb').style.translate).toBe(`${String(TRAVEL)}px 0`)
    expect(button.querySelector('[data-hl-swipe-orb]')).toBeNull()
    advance(SWIPE_BUSY_COMPLETE_MS - 1)
    expect(button.querySelector('[data-hl-swipe-orb]')).toBeNull()
    advance(1)
    // The first frame: the pill is the whole button.
    expect(part(button, 'orb').getAttribute('data-hl-swipe-orb')).toBe('wide')
    expect(part(button, 'orb').style.inlineSize).toBe(`${String(TRACK.width)}px`)
    advance(40)
    const orb = part(button, 'orb')
    expect(orb.getAttribute('data-hl-swipe-orb')).toBe('round')
    close(Number.parseFloat(orb.style.inlineSize), TRACK.height)
    close(Number.parseFloat(orb.style.insetInlineStart), swipeCollapseAt(TRACK, SWIPE_COLLAPSE.durationMs).start - TRACK.border)
    expect(orb.style.transition).toContain(`${String(SWIPE_COLLAPSE.durationMs)}ms cubic-bezier(0.4, 0, 0.2, 1)`)
    // The halo is the fill at 0.4; the indicator is in the core; the thumb, the fill and the label are not drawn.
    expect((orb.firstElementChild as HTMLElement).style.opacity).toBe(String(SWIPE_HALO_OPACITY))
    expect(orb.querySelector('[data-hl-spinner]')).not.toBeNull()
    for (const hidden of [part(button, 'thumb'), part(button, 'trail'), labelOf(button)]) expect(hidden.style.opacity).toBe('0')
    // The surface of the button fades out; the box keeps its size.
    expect(button.style.backgroundColor).toBe('transparent')
    expect(button.style.boxShadow).toBe('none')
    expect(button.style.transition).toContain('background-color')
    answer()
    await flush()
    // The circle expands back, the thumb waits at the end; then the thumb returns.
    expect(part(button, 'orb').getAttribute('data-hl-swipe-orb')).toBe('wide')
    expect(part(button, 'thumb').style.translate).toBe(`${String(TRAVEL)}px 0`)
    advance(SWIPE_COLLAPSE.durationMs - 1)
    expect(button.querySelector('[data-hl-swipe-orb]')).not.toBeNull()
    advance(1)
    expect(button.querySelector('[data-hl-swipe-orb]')).toBeNull()
    expect(part(button, 'thumb').style.translate).toBe('0px 0')
    expect(part(button, 'thumb').style.transition).toContain('250ms')
    expect(button.hasAttribute('aria-busy')).toBe(false)
    expect(layer()).toBeNull()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('a press that is not a navigation never plays the fill, whatever the field says', () => {
    fake()
    const view = show({ onAction: () => new Promise<void>(() => undefined) })
    swipe(view.button('pay-tip'))
    advance(5000)
    expect(layer()).toBeNull()
  })

  it('"reduce motion": the thumb jumps to the end busy, there is no circle, and the screen changes at once', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList)
    fake()
    const view = show()
    swipe(view.button('pay-swipe'))
    expect(view.log).toEqual(['navigate:paid'])
    advance(3000)
    expect(layer()).toBeNull()
  })

  it('the keyboard acts at once, with no fill (then the busy circle as after a swipe)', () => {
    fake()
    const view = show()
    act(() => {
      fireEvent.click(view.button('pay-swipe'), { detail: 0 })
    })
    expect(view.log).toEqual(['navigate:paid'])
    advance(3000)
    expect(layer()).toBeNull()
  })
})

/** The glide of the thumb to the end (`x-swipeConfirmBusy.completeMs`). */
const SWIPE_BUSY_COMPLETE_MS = 200

describe('confirmTransition: ripple (938-943) inside the screen root', () => {
  it('the action waits for the fill: glide, circle, fill over the root, then the action, then the fade over the new screen', () => {
    fake()
    const view = show()
    const button = view.button('pay-swipe')
    swipe(button)
    expect(view.log).toEqual([])
    expect(button.getAttribute('aria-busy')).toBe('true')
    advance(SWIPE_BUSY_COMPLETE_MS + 40)
    expect(part(button, 'orb').getAttribute('data-hl-swipe-orb')).toBe('round')
    advance(SWIPE_COLLAPSE.durationMs - 40 - 1)
    expect(layer()).toBeNull()
    advance(1)
    const cover = layer()
    if (cover === null) throw new Error('no fill')
    // Not a child of the button: the action takes the button away with its screen. A child of the root, over the zones.
    expect(button.contains(cover)).toBe(false)
    expect(cover.parentElement).toBe(view.container.querySelector('[data-hotlayout]'))
    expect(cover.style.position).toBe('absolute')
    expect(cover.getAttribute('aria-hidden')).toBe('true')
    expect(cover.style.pointerEvents).toBe('auto')
    expect(cover.getAttribute('data-hl-swipe-cover')).toBe('growing')
    const circle = cover.firstElementChild as HTMLElement
    const scale = swipeRippleScaleOf({ centerX: ORB_BOX.left + ORB_BOX.size / 2, centerY: ORB_BOX.top + ORB_BOX.size / 2, screenWidth: ROOT.width, screenHeight: ROOT.height, core: CORE_SIZE })
    expect(circle.style.transform).toBe(`scale(${String(scale)})`)
    expect(circle.style.transition).toBe(`transform ${String(SWIPE_RIPPLE.durationMs)}ms linear`)
    for (const piece of [...circle.children]) expect((piece as HTMLElement).style.backgroundColor).toBe('rgb(79, 70, 229)')
    advance(SWIPE_RIPPLE.durationMs - 1)
    expect(view.log).toEqual([])
    advance(1)
    // The action runs once the fill covers the screen, and the fill fades over the next screen.
    expect(view.log).toEqual(['navigate:paid'])
    expect(view.container.textContent).toContain(SENT)
    expect(cover.getAttribute('data-hl-swipe-cover')).toBe('revealing')
    expect(cover.style.opacity).toBe('0')
    expect(cover.style.transition).toBe(`opacity ${String(SWIPE_REVEAL.durationMs)}ms linear`)
    advance(SWIPE_REVEAL.durationMs)
    expect(layer()).toBeNull()
    expect(view.log).toEqual(['navigate:paid'])
  })

  it('the button leaves before the fill covers the screen (942): no action, the fill goes with it', () => {
    fake()
    const view = show({ cover: true })
    swipe(view.button('pay-swipe'))
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs + 300)
    expect(layer()).not.toBeNull()
    view.unmount()
    expect(layer()).toBeNull()
    advance(5000)
    expect(view.log).toEqual(['covered:true', 'covered:false'])
  })

  it('leaving during the collapse is also nothing: no fill, no action', () => {
    fake()
    const view = show()
    swipe(view.button('pay-swipe'))
    advance(SWIPE_BUSY_COMPLETE_MS + 100)
    view.unmount()
    advance(5000)
    expect(layer()).toBeNull()
    expect(view.log).toEqual([])
  })

  it('no place for the fill (the root cannot be measured): the action runs when the circle is there', () => {
    fake()
    computed.fill = 'var(--product-color-primary)'
    const view = show()
    swipe(view.button('pay-swipe'))
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs)
    expect(layer()).toBeNull()
    expect(view.log).toEqual(['navigate:paid'])
  })

  it('a second gesture while the fill plays is nothing', () => {
    fake()
    const view = show()
    const button = view.button('pay-swipe')
    swipe(button)
    swipe(button)
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs + SWIPE_RIPPLE.durationMs)
    expect(view.log).toEqual(['navigate:paid'])
  })
})

describe('when the host steers the route (947): onScreenCovered', () => {
  it('the layer is on the body, over the window; the host is told as the circle starts and after the fade', () => {
    fake()
    const view = show({ cover: true })
    swipe(view.button('pay-swipe'))
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs)
    const cover = layer()
    if (cover === null) throw new Error('no fill')
    expect(cover.parentElement).toBe(document.body)
    expect(cover.style.position).toBe('fixed')
    expect(Number(cover.style.zIndex)).toBeGreaterThan(1_000_000_000)
    // The far corner is the corner of the WINDOW, not of the root.
    const scale = swipeRippleScaleOf({ centerX: ORB_BOX.left + ORB_BOX.size / 2, centerY: ORB_BOX.top + ORB_BOX.size / 2, screenWidth: window.innerWidth, screenHeight: window.innerHeight, core: CORE_SIZE })
    expect((cover.firstElementChild as HTMLElement).style.transform).toBe(`scale(${String(scale)})`)
    // The host hears of the cover as the circle STARTS to grow, 800 ms before the action.
    expect(view.log).toEqual(['covered:true'])
    advance(SWIPE_RIPPLE.durationMs - 1)
    expect(view.log).toEqual(['covered:true'])
    advance(1)
    expect(view.log).toEqual(['covered:true', 'navigate:paid'])
    expect(cover.getAttribute('data-hl-swipe-cover')).toBe('revealing')
    advance(SWIPE_REVEAL.durationMs - 1)
    expect(view.log).toEqual(['covered:true', 'navigate:paid'])
    advance(1)
    expect(view.log).toEqual(['covered:true', 'navigate:paid', 'covered:false'])
    expect(layer()).toBeNull()
  })

  it('the host removes the screen right after the action: the fade still runs to the end and the host is told', () => {
    fake()
    const log: string[] = []
    let unmount: () => void = () => undefined
    const view = render(
      <HotlayoutScreen
        document={FIXTURE}
        injectStyles={false}
        onNavigate={(event) => {
          log.push(`navigate:${event.to.screenId}`)
          // The host takes the route over: its own screen goes in, this one is removed.
          unmount()
          return false
        }}
        onScreenCovered={(covered) => log.push(`covered:${String(covered)}`)}
      />,
    )
    unmount = view.unmount
    swipe(view.container.querySelector<HTMLElement>('[data-hl-node="pay-swipe"]') as HTMLElement)
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs + SWIPE_RIPPLE.durationMs)
    expect(log).toEqual(['covered:true', 'navigate:paid'])
    expect(view.container.querySelector('[data-hotlayout]')).toBeNull()
    expect(layer()?.getAttribute('data-hl-swipe-cover')).toBe('revealing')
    advance(SWIPE_REVEAL.durationMs)
    expect(layer()).toBeNull()
    expect(log).toEqual(['covered:true', 'navigate:paid', 'covered:false'])
  })

  it('the button leaves first: the layer goes, there is no action, and the host that heard "covered" hears that it is over', () => {
    fake()
    const view = show({ cover: true })
    swipe(view.button('pay-swipe'))
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs + 100)
    expect(view.log).toEqual(['covered:true'])
    view.unmount()
    advance(5000)
    expect(layer()).toBeNull()
    expect(view.log).toEqual(['covered:true', 'covered:false'])
  })

  it('two fills in a row are one state: the host hears true once and false once', () => {
    fake()
    const seen = notes()
    const doc = structuredClone(FIXTURE) as unknown as { screens: { root: { children: Record<string, unknown>[] } }[] }
    const children = doc.screens[0]?.root.children ?? []
    const first = children.find((child) => child.id === 'pay-swipe')
    if (first === undefined) throw new Error('no pay-swipe')
    children.push({ ...structuredClone(first), id: 'pay-swipe-2' })
    // The host takes the route over and keeps this screen, so both fills run to their end.
    const view = render(<HotlayoutScreen document={doc as unknown as UiDocument} injectStyles={false} onNavigate={(event) => (seen.navigate(event), false)} onScreenCovered={seen.covered} />)
    const buttonOf = (id: string): HTMLElement => view.container.querySelector<HTMLElement>(`[data-hl-node="${id}"]`) as HTMLElement
    swipe(buttonOf('pay-swipe'))
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs)
    swipe(buttonOf('pay-swipe-2'))
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs + SWIPE_RIPPLE.durationMs + SWIPE_REVEAL.durationMs + 100)
    expect(layer()).toBeNull()
    expect(seen.log.filter((entry) => entry.startsWith('navigate'))).toEqual(['navigate:paid', 'navigate:paid'])
    expect(seen.log.filter((entry) => entry.startsWith('covered'))).toEqual(['covered:true', 'covered:false'])
  })

  it('a host that passes a new function on every render still hears one pair', () => {
    fake()
    const log: string[] = []
    const view = render(<HotlayoutScreen document={FIXTURE} injectStyles={false} onScreenCovered={(covered) => log.push(`covered:${String(covered)}`)} />)
    swipe(view.container.querySelector<HTMLElement>('[data-hl-node="pay-swipe"]') as HTMLElement)
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs)
    // A re-render with a different function in between: the end of the fill goes to the function that is current.
    view.rerender(<HotlayoutScreen document={FIXTURE} injectStyles={false} onScreenCovered={(covered) => log.push(`again:${String(covered)}`)} />)
    advance(SWIPE_RIPPLE.durationMs + SWIPE_REVEAL.durationMs)
    expect(log).toEqual(['covered:true', 'again:false'])
  })

  it('the busy indicator stands in the middle of the circle, the size and colour of the glyph, and does not grow with it', () => {
    fake()
    const view = show({ cover: true })
    swipe(view.button('pay-swipe'))
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs)
    const indicator = layer()?.querySelector<HTMLElement>('[data-hl-swipe-indicator]')
    if (indicator === null || indicator === undefined) throw new Error('no indicator in the fill')
    const stroke = SPINNER / 8
    const centre = { x: ORB_BOX.left + ORB_BOX.size / 2, y: ORB_BOX.top + ORB_BOX.size / 2 }
    close(Number.parseFloat(indicator.style.left) + (SPINNER + 2 * stroke) / 2, centre.x)
    close(Number.parseFloat(indicator.style.top) + (SPINNER + 2 * stroke) / 2, centre.y)
    expect(indicator.style.width).toBe(`${String(SPINNER)}px`)
    expect(indicator.style.borderTopColor).toBe('transparent')
    expect(indicator.style.borderLeftColor).toBe(GLYPH)
    // A sibling of the circle, not inside it: the circle is scaled, the indicator is not.
    expect(indicator.parentElement).toBe(layer())
    expect(indicator.parentElement?.firstElementChild?.contains(indicator)).toBe(false)
  })

  it('the indicator is also in the fill inside the screen root', () => {
    fake()
    const view = show()
    swipe(view.button('pay-swipe'))
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs)
    expect(layer()?.querySelector('[data-hl-swipe-indicator]')).not.toBeNull()
  })

  it('a jump whose target is not found goes to the host: no circle, no fill over a screen that does not change', () => {
    fake()
    const seen = notes()
    const actions: string[] = []
    const doc = structuredClone(FIXTURE) as unknown as { screens: { root: { children: { id: string; props: { action: { params: { screenId: string } } } }[] } }[] }
    const target = doc.screens[0]?.root.children.find((child) => child.id === 'pay-swipe')
    if (target === undefined) throw new Error('no pay-swipe')
    target.props.action.params.screenId = 'nowhere'
    const view = render(<HotlayoutScreen document={doc as unknown as UiDocument} injectStyles={false} onNavigate={seen.navigate} onAction={((action: { type: string }) => actions.push(action.type)) as never} onScreenCovered={seen.covered} />)
    swipe(view.container.querySelector<HTMLElement>('[data-hl-node="pay-swipe"]') as HTMLElement)
    // The action runs at the release, as for any host action; the fill never starts.
    expect(actions).toEqual(['navigate'])
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs + SWIPE_RIPPLE.durationMs + SWIPE_REVEAL.durationMs)
    expect(layer()).toBeNull()
    expect(seen.log).toEqual([])
  })

  it('a throwing host does not leave the layer on the screen, and the action still runs', () => {
    fake()
    const log: string[] = []
    const view = render(
      <HotlayoutScreen
        document={FIXTURE}
        injectStyles={false}
        onNavigate={(event) => {
          log.push(`navigate:${event.to.screenId}`)
          return undefined
        }}
        onScreenCovered={(covered) => {
          if (covered) throw new Error('host failure')
        }}
      />,
    )
    swipe(view.container.querySelector<HTMLElement>('[data-hl-node="pay-swipe"]') as HTMLElement)
    advance(SWIPE_BUSY_COMPLETE_MS + SWIPE_COLLAPSE.durationMs)
    // The host that throws on `true` does not stop the fill: the layer is there, the action still runs and the layer still goes; the error is rethrown outside the layer's timers.
    expect(layer()).not.toBeNull()
    expect(() => advance(1)).toThrow('host failure')
    advance(SWIPE_RIPPLE.durationMs)
    expect(log).toEqual(['navigate:paid'])
    advance(SWIPE_REVEAL.durationMs)
    expect(layer()).toBeNull()
  })
})
