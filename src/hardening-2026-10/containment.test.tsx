/**
 * Limit 7 — UI containment. The package draws INSIDE a host page (a bank's site): nothing it draws
 * may leave the root's box or the root's subtree, and nothing it does may take the host page from
 * the person — no fixed layer over the page, no element outside the root (also in server markup),
 * `inert` only on the package's own layers, and no keyboard trap the person cannot leave.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { HOTLAYOUT_CSS, HotlayoutScreen } from '../index'
import type { UiDocument, UiNode } from '../index'
import { screenFixtures } from '../../test-support/hardening-kit'

afterEach(cleanup)

const label = (value: string): unknown => ({ kind: 'literal', value })
const text = (id: string, value: string): UiNode => ({ id, type: 'Text', props: { content: label(value), align: 'start', overflow: 'ellipsis' } }) as unknown as UiNode

function withModal(modalChildren: readonly UiNode[], dismissible: boolean): UiDocument {
  return {
    schemaVersion: '9.27.0',
    documentId: 'containment',
    initialScreenId: 'page',
    screens: [
      {
        screenId: 'page',
        name: 'Page',
        root: { id: 'page-root', type: 'Screen', props: {}, children: [{ id: 'open', type: 'Button', props: { label: label('Open'), variant: 'primary', action: { type: 'navigate', params: { screenId: 'layer' } } } }] },
      },
      { screenId: 'layer', name: 'Layer', presentation: 'modal', dismissible, root: { id: 'layer-root', type: 'Screen', props: {}, children: modalChildren } },
    ],
  } as unknown as UiDocument
}

function hostPage(document: UiDocument): { before: HTMLElement; after: HTMLElement; container: HTMLElement } {
  const { container, getByTestId } = render(
    <div>
      <button data-testid="before">Host before</button>
      <HotlayoutScreen document={document} onReport={() => undefined} />
      <button data-testid="after">Host after</button>
    </div>,
  )
  return { before: getByTestId('before'), after: getByTestId('after'), container }
}

function openLayer(container: HTMLElement): HTMLElement {
  const open = container.querySelector('[data-hl-node="open"]')?.closest('button')
  if (open === null || open === undefined) throw new Error('no opener')
  act(() => {
    fireEvent.click(open, { detail: 1 })
  })
  const layer = container.querySelector<HTMLElement>('[data-hl-presentation="modal"]')
  if (layer === null) throw new Error('the layer did not open')
  return layer
}

describe('limit 7: nothing leaves the root', () => {
  it('no element of any fixture screen is fixed-positioned, and the stylesheet positions nothing fixed', () => {
    expect(HOTLAYOUT_CSS).not.toMatch(/position\s*:\s*fixed/)
    for (const fixture of screenFixtures()) {
      const screens = (fixture.document as { screens: readonly { screenId?: unknown }[] }).screens
      for (const screen of screens) {
        if (typeof screen.screenId !== 'string') continue
        const { container, unmount } = render(<HotlayoutScreen document={{ ...fixture.document, initialScreenId: screen.screenId } as UiDocument} onReport={() => undefined} />)
        for (const element of [...container.querySelectorAll<HTMLElement>('[style]')]) {
          expect(element.style.position, `${fixture.name}/${screen.screenId}`).not.toBe('fixed')
          const z = Number(element.style.zIndex)
          if (element.style.zIndex !== '' && Number.isFinite(z)) expect(Math.abs(z), `${fixture.name}/${screen.screenId}`).toBeLessThanOrEqual(10)
        }
        // Portals: everything the package drew is inside its root.
        expect(document.body.querySelectorAll('[data-hl-node]').length).toBe(container.querySelectorAll('[data-hl-node]').length)
        unmount()
      }
    }
  }, 120_000)

  it('LIMIT HOLDS (fixed in 0.25.0): server markup holds nothing outside the package root (React hoists an image preload link before it)', () => {
    const picture = { id: 'pic', type: 'Image', props: { source: { kind: 'url', url: 'https://cdn.example.com/a.png' }, alt: 'x', fit: 'cover' } } as unknown as UiNode
    const html = renderToString(<HotlayoutScreen document={withModal([], true)} onReport={() => undefined} />)
    expect(html.startsWith('<div data-hotlayout')).toBe(true)
    const withPicture = { ...withModal([], true), screens: [{ screenId: 'page', name: 'Page', root: { id: 'r', type: 'Screen', props: {}, children: [picture] } }] } as unknown as UiDocument
    const pictureHtml = renderToString(<HotlayoutScreen document={withPicture} onReport={() => undefined} />)
    expect(pictureHtml.slice(0, 60)).toMatch(/^<div data-hotlayout/)
  })

  it('a modal layer marks inert only the package’s own layers, never a host element', () => {
    const { before, after, container } = hostPage(withModal([text('t', 'Hello')], true))
    openLayer(container)
    expect(document.querySelectorAll('[inert]').length).toBeGreaterThan(0)
    for (const element of [...document.querySelectorAll('[inert]')]) expect(container.querySelector('[data-hotlayout]')?.contains(element), element.outerHTML.slice(0, 80)).toBe(true)
    expect(before.closest('[inert]')).toBeNull()
    expect(after.closest('[inert]')).toBeNull()
  })

  it('Esc inside a dismissible layer does not reach the host page; the host keeps its own Esc otherwise', () => {
    let hostEsc = 0
    const { container } = hostPage(withModal([text('t', 'Hello')], true))
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') hostEsc += 1
    })
    const layer = openLayer(container)
    fireEvent.keyDown(layer.querySelector('[tabindex]') ?? layer, { key: 'Escape' })
    expect(hostEsc).toBe(0)
  })
})

describe('limit 7: no keyboard trap on the host page', () => {
  it('LIMIT HOLDS (fixed in 0.25.0): a layer that waits for an action and has nothing to focus does not swallow Tab', () => {
    const { container } = hostPage(withModal([text('t', 'Please wait')], false))
    const layer = openLayer(container)
    const focused = document.activeElement
    expect(layer.contains(focused)).toBe(true)
    // Tab is the keyboard user's only way back to the host page: cancelling it leaves the page unreachable.
    const passed = fireEvent.keyDown(focused ?? layer, { key: 'Tab' })
    expect(passed, 'Tab was cancelled inside the layer').toBe(true)
  })

  it('LIMIT HOLDS (fixed in 0.25.0): Tab from the last stop of a non-dismissible layer may leave the package instead of cycling forever', () => {
    const button = { id: 'ok', type: 'Button', props: { label: label('OK'), variant: 'primary', action: { type: 'confirm.ok' } } } as unknown as UiNode
    const { container } = hostPage(withModal([text('t', 'Confirm'), button], false))
    const layer = openLayer(container)
    const last = layer.querySelector<HTMLElement>('button')
    if (last === null) throw new Error('no button in the layer')
    last.focus()
    const passed = fireEvent.keyDown(last, { key: 'Tab' })
    expect(passed, 'Tab from the last stop was cancelled and focus went back to the first one').toBe(true)
  })
})
