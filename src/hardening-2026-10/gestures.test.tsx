/**
 * Limit 4 — actions. One gesture is one action, whatever sequence of low-level events a browser
 * produces for it (touch with mouse emulation, a held key, a long press followed by the click the
 * browser still sends), and the reader never opens anything itself: every action of every fixture,
 * pressed, reaches the host and nothing else.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from '../index'
import type { HotlayoutAction, UiDocument, UiNode } from '../index'
import { screenFixtures } from '../../test-support/hardening-kit'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function screenWith(children: readonly UiNode[]): UiDocument {
  return {
    schemaVersion: '9.27.0',
    documentId: 'gestures',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children } }],
  } as unknown as UiDocument
}

const label = (value: string): unknown => ({ kind: 'literal', value })
const button: UiNode = { id: 'pay', type: 'Button', props: { label: label('Pay'), variant: 'primary', action: { type: 'payment.confirm' } } } as unknown as UiNode
const cardNode = (extra: Record<string, unknown> = {}): UiNode =>
  ({
    id: 'card',
    type: 'Container',
    props: { direction: 'column', action: { type: 'offer.open' }, ...extra },
    children: [{ id: 't', type: 'Text', props: { content: label('Offer'), align: 'start', overflow: 'ellipsis' } }],
  }) as unknown as UiNode

function mount(document: UiDocument): { actions: HotlayoutAction[]; container: HTMLElement } {
  const actions: HotlayoutAction[] = []
  const { container } = render(<HotlayoutScreen document={document} onReport={() => undefined} onAction={(action) => actions.push(action)} />)
  return { actions, container }
}

/** What a phone browser sends for ONE tap: touch, pointer and the emulated mouse events, then one click. */
function tap(element: Element): void {
  fireEvent.pointerDown(element, { pointerType: 'touch', isPrimary: true, button: 0 })
  fireEvent.touchStart(element)
  fireEvent.pointerUp(element, { pointerType: 'touch', isPrimary: true, button: 0 })
  fireEvent.touchEnd(element)
  fireEvent.mouseDown(element)
  fireEvent.mouseUp(element)
  fireEvent.click(element, { detail: 1 })
}

describe('limit 4: one gesture, one action', () => {
  it('a tap with mouse emulation on a button gives one action', () => {
    const { actions, container } = mount(screenWith([button]))
    const element = container.querySelector('[data-hl-node="pay"]')
    if (element === null) throw new Error('no button')
    tap(element.closest('button') ?? element)
    expect(actions.map((action) => action.type)).toEqual(['payment.confirm'])
  })

  it('a tap with mouse emulation on a card gives one action', () => {
    const { actions, container } = mount(screenWith([cardNode()]))
    const element = container.querySelector('[data-hl-node="card"]')
    if (element === null) throw new Error('no card')
    tap(element)
    expect(actions.map((action) => action.type)).toEqual(['offer.open'])
  })

  it('a double click is two presses and the dblclick event adds nothing', () => {
    const { actions, container } = mount(screenWith([cardNode()]))
    const element = container.querySelector('[data-hl-node="card"]')
    if (element === null) throw new Error('no card')
    fireEvent.click(element, { detail: 1 })
    fireEvent.click(element, { detail: 2 })
    fireEvent.doubleClick(element, { detail: 2 })
    expect(actions).toHaveLength(2)
  })

  it('Enter and Space on a card: one press each; keyup adds nothing; a held key repeats nothing', () => {
    const { actions, container } = mount(screenWith([cardNode()]))
    const element = container.querySelector('[data-hl-node="card"]')
    if (element === null) throw new Error('no card')
    fireEvent.keyDown(element, { key: 'Enter' })
    fireEvent.keyDown(element, { key: 'Enter', repeat: true })
    fireEvent.keyUp(element, { key: 'Enter' })
    fireEvent.keyDown(element, { key: ' ' })
    fireEvent.keyDown(element, { key: ' ', repeat: true })
    fireEvent.keyUp(element, { key: ' ' })
    expect(actions).toHaveLength(2)
  })

  describe('long press', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('a long press with the click the browser sends after it gives the long press action only', () => {
      const { actions, container } = mount(screenWith([cardNode({ longPress: { type: 'offer.menu' }, longPressLabel: label('More') })]))
      const element = container.querySelector('[data-hl-node="card"]')
      if (element === null) throw new Error('no card')
      fireEvent.pointerDown(element, { pointerType: 'touch', isPrimary: true, button: 0, clientX: 10, clientY: 10 })
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      fireEvent.pointerUp(element, { pointerType: 'touch', isPrimary: true, button: 0 })
      fireEvent.mouseDown(element)
      fireEvent.mouseUp(element)
      fireEvent.click(element, { detail: 1 })
      expect(actions.map((action) => action.type)).toEqual(['offer.menu'])
    })

    it('two fingers holding at once still give one long press', () => {
      const { actions, container } = mount(screenWith([cardNode({ longPress: { type: 'offer.menu' }, longPressLabel: label('More') })]))
      const element = container.querySelector('[data-hl-node="card"]')
      if (element === null) throw new Error('no card')
      fireEvent.pointerDown(element, { pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0, clientX: 10, clientY: 10 })
      act(() => {
        vi.advanceTimersByTime(200)
      })
      fireEvent.pointerDown(element, { pointerType: 'touch', pointerId: 2, isPrimary: false, button: 0, clientX: 40, clientY: 10 })
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      fireEvent.pointerUp(element, { pointerType: 'touch', pointerId: 1, button: 0 })
      fireEvent.pointerUp(element, { pointerType: 'touch', pointerId: 2, button: 0 })
      expect(actions.map((action) => action.type)).toEqual(['offer.menu'])
    })
  })
})

describe('limit 4: the reader never opens anything itself', () => {
  it('every pressable element of every fixture screen, pressed: no window.open, no navigation, no link with a document address', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const before = window.location.href
    let pressed = 0
    for (const fixture of screenFixtures()) {
      const screens = (fixture.document as { screens: readonly { screenId?: unknown }[] }).screens
      for (const screen of screens) {
        if (typeof screen.screenId !== 'string') continue
        const shown = { ...fixture.document, initialScreenId: screen.screenId } as UiDocument
        const { container, unmount } = render(<HotlayoutScreen document={shown} onReport={() => undefined} onAction={() => undefined} />)
        expect(container.querySelector('a[href], area[href], form[action], iframe, object, embed, base, meta'), `${fixture.name}/${screen.screenId}`).toBeNull()
        for (const element of [...container.querySelectorAll('button, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"]')]) {
          if (!element.isConnected) continue
          fireEvent.click(element, { detail: 1 })
          fireEvent.keyDown(element, { key: 'Enter' })
          pressed += 1
        }
        unmount()
      }
    }
    expect(pressed).toBeGreaterThan(100)
    expect(open).not.toHaveBeenCalled()
    expect(window.location.href).toBe(before)
  }, 120_000)
})
