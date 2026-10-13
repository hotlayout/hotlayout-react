/**
 * What jsdom can say about a layout that only a browser computes (sticky app bar backdrop, focus
 * scroll margin, visible area of a modal layer). The measurements are stubbed as Chrome would
 * report them; pixel truth is checked by a Chrome script, not here.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { UiDocument } from './index'
import { HOTLAYOUT_CSS } from './styles'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const lit = (value: unknown): unknown => ({ kind: 'literal', value })
const gradient = { background: { kind: 'gradient', gradient: { angle: 180, stops: [{ color: 'primary', position: 0 }, { color: 'accent', position: 1 }] } } }
const doc = (screens: readonly Record<string, unknown>[]): UiDocument =>
  JSON.parse(JSON.stringify({ schemaVersion: READER_SCHEMA_VERSION, documentId: 'layout-stubs', name: 'layout-stubs', initialScreenId: screens[0]?.screenId, screens })) as UiDocument
const bar = { id: 'bar', type: 'AppBar', props: { title: lit('Bar'), showBack: false } }
const open = { id: 'open', type: 'Button', props: { label: lit('open'), variant: 'primary', action: { type: 'navigate', params: { screenId: 'm' } } } }
const withBar = (extra: readonly unknown[] = []): UiDocument =>
  doc([
    { screenId: 's', name: 's', root: { id: 'root', type: 'Screen', props: { gap: 'sm' }, style: gradient, children: [bar, open, ...extra] } },
    { screenId: 'm', name: 'm', presentation: 'modal', modalPlacement: 'center', root: { id: 'rm', type: 'Screen', props: {}, children: [{ id: 't', type: 'Text', props: { content: lit('in') } }] } },
  ])

describe('sticky app bar backdrop: the root background at the root size', () => {
  it('the observer writes the root size and the scroll offset; the background lies on the backdrop, not on the zone', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(777)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(72)
    const view = render(<HotlayoutScreen document={withBar()} stickyOffset={56} onReport={() => undefined} />)
    const root = view.container.querySelector<HTMLElement>('[data-hl-type="Screen"]')!
    expect(root.style.getPropertyValue('--hl-backdrop-w')).toBe('320px')
    expect(root.style.getPropertyValue('--hl-backdrop-h')).toBe('777px')
    expect(root.style.getPropertyValue('--hl-sticky-clear')).toBe('calc(72px + 56px)')
    const zone = root.querySelector<HTMLElement>('[data-hl-zone="appBar"]')!
    expect(zone.style.backgroundImage).toBe('')
    expect(zone.querySelector<HTMLElement>('[data-hl-backdrop] > div')!.style.backgroundImage).toContain('gradient')
  })

  it('without measuring (server, first frame) the backdrop is zero-sized: the zone is transparent over the root background', () => {
    const view = render(<HotlayoutScreen document={withBar()} injectStyles={false} onReport={() => undefined} />)
    const inner = view.container.querySelector<HTMLElement>('[data-hl-backdrop] > div')!
    expect(inner.style.inlineSize).toBe('var(--hl-backdrop-w, 0px)')
    expect(inner.style.blockSize).toBe('var(--hl-backdrop-h, 0px)')
  })
})

describe('focus does not hide under a sticky app bar', () => {
  it('the stylesheet gives body elements scroll-margin-block-start = zone height + stickyOffset (a root variable)', () => {
    expect(HOTLAYOUT_CSS).toContain('[data-hl-zone="body"] .hl-press')
    expect(HOTLAYOUT_CSS).toContain('[data-hl-zone="body"] button')
    expect(HOTLAYOUT_CSS).toContain('scroll-margin-block-start:var(--hl-sticky-clear,0px)')
  })
})

describe('modal layer area: the part of the block visible in the viewport', () => {
  it('the observer writes the visible height: the intersection of the block with the viewport, recomputed on scroll', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    const flush = (): void => {
      act(() => {
        for (const callback of frames.splice(0)) callback(0)
      })
    }
    let rect = { top: 111, bottom: 888 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ ...rect, width: 320, height: rect.bottom - rect.top, x: 0, y: rect.top, left: 0, right: 320, toJSON: () => ({}) }))
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(430)
    const view = render(<HotlayoutScreen document={withBar()} onReport={() => undefined} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="open"]')!)
    const layer = view.container.querySelector<HTMLElement>('[data-hl-presentation="modal"]')!
    // The block top is below the viewport top: the visible part runs from the block top to the viewport bottom.
    expect(layer.style.getPropertyValue('--hl-visible-h')).toBe('319px')
    rect = { top: -482, bottom: 295 }
    fireEvent.scroll(window)
    flush()
    // The block bottom is above the viewport bottom: from the viewport top to the block bottom.
    expect(layer.style.getPropertyValue('--hl-visible-h')).toBe('295px')
    rect = { top: -100, bottom: 677 }
    fireEvent.scroll(window)
    flush()
    // The block covers the viewport: exactly the viewport.
    expect(layer.style.getPropertyValue('--hl-visible-h')).toBe('430px')
  })

  it('scroll="screen": no measuring is needed, the area is the whole block', () => {
    const view = render(<HotlayoutScreen document={withBar()} scroll="screen" onReport={() => undefined} />)
    fireEvent.click(view.container.querySelector('[data-hl-node="open"]')!)
    expect(view.container.querySelector<HTMLElement>('[data-hl-presentation="modal"]')!.style.getPropertyValue('--hl-visible-h')).toBe('')
  })
})
