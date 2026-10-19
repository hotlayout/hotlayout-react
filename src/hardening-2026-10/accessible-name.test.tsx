/**
 * Limit 3 — the accessible name of a pressable card. The card's name is its `label`, then the text
 * of its content. Content the SCREEN does not show must not be part of what a screen reader user
 * hears before activating it: a node hidden by `visibleIf`, by `showOn` in the current width class,
 * the folded body of an accordion, an inactive tab panel, and text painted fully transparent.
 * Otherwise a document can make a sighted user and a screen reader user agree to different things
 * with one press ("Show offer" on screen, "Confirm transfer" in the name).
 */
import { cleanup, render, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../index'
import type { UiDocument, UiNode } from '../index'

afterEach(cleanup)

const text = (id: string, value: string, extra: Record<string, unknown> = {}): UiNode =>
  ({ id, type: 'Text', props: { content: { kind: 'literal', value }, align: 'start', overflow: 'ellipsis' }, ...extra }) as unknown as UiNode

function card(children: readonly UiNode[]): UiDocument {
  return {
    schemaVersion: '9.27.0',
    documentId: 'card-name',
    initialScreenId: 's',
    screens: [
      {
        screenId: 's',
        name: 'S',
        root: {
          id: 'root',
          type: 'Screen',
          props: {},
          children: [{ id: 'card', type: 'Container', props: { direction: 'column', action: { type: 'offer.open' } }, children }],
        },
      },
    ],
  } as unknown as UiDocument
}

function cardName(document: UiDocument, data: Record<string, unknown> = {}): string {
  const { container } = render(<HotlayoutScreen document={document} data={data} onReport={() => undefined} initialWidthClass="compact" />)
  const element = container.querySelector('[data-hl-node="card"]')
  if (element === null) throw new Error('the card is not drawn')
  expect(element.getAttribute('role')).toBe('button')
  // The accessible name as testing-library computes it (the algorithm assistive technology follows): the matcher sees it.
  let name: string | undefined
  within(element.parentElement ?? container).queryAllByRole('button', {
    name: (computed, candidate) => {
      if (candidate === element) name = computed
      return true
    },
  })
  if (name === undefined) throw new Error('the card is not exposed as a button')
  return name
}

describe('limit 3: a card is named only by what it shows', () => {
  it('control: the visible text names the card', () => {
    expect(cardName(card([text('a', 'Show offer')]))).toContain('Show offer')
  })

  it('a child hidden by visibleIf is not in the name', () => {
    const name = cardName(card([text('a', 'Show offer'), text('b', 'Confirm transfer', { visibleIf: { path: 'user.isVip', op: 'isTrue' } })]), { 'user.isVip': false })
    expect(name).not.toContain('Confirm transfer')
  })

  it('a child hidden by showOn in the current width class is not in the name', () => {
    const name = cardName(card([text('a', 'Show offer'), text('b', 'Confirm transfer', { showOn: ['expanded'] })]))
    expect(name).not.toContain('Confirm transfer')
  })

  it('the folded body of an accordion is not in the name', () => {
    const accordion = {
      id: 'acc',
      type: 'Accordion',
      props: { title: { kind: 'literal', value: 'Details' }, initiallyExpanded: false },
      children: [text('b', 'Confirm transfer')],
    } as unknown as UiNode
    expect(cardName(card([text('a', 'Show offer'), accordion]))).not.toContain('Confirm transfer')
  })

  it('an inactive tab panel is not in the name', () => {
    const tabs = {
      id: 'tabs',
      type: 'Tabs',
      props: { initialTab: 0 },
      children: [
        { id: 't1', type: 'Tab', props: { title: { kind: 'literal', value: 'One' } }, children: [text('a1', 'First panel')] },
        { id: 't2', type: 'Tab', props: { title: { kind: 'literal', value: 'Two' } }, children: [text('b', 'Confirm transfer')] },
      ],
    } as unknown as UiNode
    expect(cardName(card([text('a', 'Show offer'), tabs]))).not.toContain('Confirm transfer')
  })

  it('LIMIT DOES NOT HOLD: text painted fully transparent (style.opacity 0) is not in the name', () => {
    const name = cardName(card([text('a', 'Show offer'), text('b', 'Confirm transfer', { style: { opacity: 0 } })]))
    expect(name).not.toContain('Confirm transfer')
  })
})
