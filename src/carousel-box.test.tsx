/**
 * The box of a carousel row in its parent: its own `style` size, margins and the place of a stack
 * layer decide it, as for any other node. The shell around the scrolling element (the row plus its
 * dots) used to take `inline-size: 100%` of the parent whatever the row said, so a carousel 112 px
 * wide still took the whole line, and a layer offset or alignment landed on the inner row, inside a
 * shell that stretched over the stack.
 *
 * jsdom computes no layout: the structural condition is checked — the place keys lie on the shell,
 * the outermost element of the node, and the scrolling element fills it.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { UiDocument } from './index'

afterEach(() => {
  cleanup()
})

const card = (id: string): Record<string, unknown> => ({ id, type: 'Container', props: { direction: 'column', gap: 'none' }, style: { width: 80, height: 40 } })
const carousel = (extra: Record<string, unknown>): Record<string, unknown> => ({
  id: 'fan',
  type: 'Row',
  props: { gap: 'none', scrollable: true, carousel: { perView: 1, indicator: 'none' } },
  children: [card('a'), card('b'), card('c')],
  ...extra,
})
const doc = (children: readonly unknown[]): UiDocument =>
  JSON.parse(
    JSON.stringify({
      schemaVersion: READER_SCHEMA_VERSION,
      documentId: 'carousel-box',
      name: 'carousel-box',
      initialScreenId: 's',
      screens: [{ screenId: 's', name: 's', root: { id: 's-root', type: 'Screen', props: { gap: 'sm' }, children } }],
    }),
  ) as UiDocument

function shellOf(container: HTMLElement): HTMLElement {
  const shell = container.querySelector<HTMLElement>('[data-hl-carousel-shell]')
  if (shell === null) throw new Error('no carousel shell')
  return shell
}

describe('the box of a carousel row', () => {
  it('its own width lies on the shell, and the shell does not take the whole line', () => {
    const view = render(<HotlayoutScreen document={doc([carousel({ style: { width: 112, margin: 'sm' } })])} injectStyles={false} onReport={() => undefined} />)
    const shell = shellOf(view.container)
    expect(shell.style.width).toBe('112px')
    expect(shell.style.inlineSize).toBe('')
    expect(shell.style.margin).not.toBe('')
    const row = view.container.querySelector<HTMLElement>('[data-hl-node="fan"]')
    expect(row?.style.width).toBe('')
    expect(row?.style.margin).toBe('')
  })

  it('without an own width the shell takes the place the parent gives, as before', () => {
    const view = render(<HotlayoutScreen document={doc([carousel({})])} injectStyles={false} onReport={() => undefined} />)
    expect(shellOf(view.container).style.inlineSize).toBe('100%')
  })

  it('a stack layer places the shell: offset and rotation on the outermost element of the node', () => {
    const stack = {
      id: 'stack',
      type: 'Stack',
      props: { alignHorizontal: 'center', alignVertical: 'center' },
      style: { width: 300, height: 200 },
      children: [
        { id: 'base', type: 'Container', props: { direction: 'column', gap: 'none' }, style: { width: 300, height: 200 } },
        carousel({ style: { width: 112 }, layer: { alignHorizontal: 'end', offsetX: { by: 'md', toward: 'start' }, rotate: 8 } }),
      ],
    }
    const view = render(<HotlayoutScreen document={doc([stack])} injectStyles={false} onReport={() => undefined} />)
    const shell = shellOf(view.container)
    expect(shell.style.position).toBe('relative')
    expect(shell.style.rotate).toBe('8deg')
    expect(shell.style.width).toBe('112px')
    const row = view.container.querySelector<HTMLElement>('[data-hl-node="fan"]')
    expect(row?.style.rotate).toBe('')
    expect(row?.style.position).toBe('')
  })

  it('the look of the box (background, padding, radius) stays on the scrolling row', () => {
    const view = render(<HotlayoutScreen document={doc([carousel({ style: { width: 112, padding: 'sm', radius: 'md', background: { kind: 'color', color: 'surface' } } })])} injectStyles={false} onReport={() => undefined} />)
    const row = view.container.querySelector<HTMLElement>('[data-hl-node="fan"]')
    expect(row?.style.padding).not.toBe('')
    expect(row?.style.backgroundColor).not.toBe('')
    expect(shellOf(view.container).style.backgroundColor).toBe('')
  })
})
