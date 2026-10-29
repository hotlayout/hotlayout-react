/**
 * @vitest-environment jsdom
 *
 * Which nodes read `visibilityTransition`: a zone of the screen follows its condition at once, any
 * other node fades. The zone is a navigation bar or its item, a node with a `pin` field (whatever
 * the word) and the app bar that is the FIRST child of the screen root.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'

afterEach(cleanup)

const FADE = { visibleIf: { path: 'on', op: 'eq', value: 1 }, visibilityTransition: 'fade' }
const text = (id: string) => ({ id, type: 'Text', props: { content: { kind: 'literal', value: id }, align: 'start', overflow: 'ellipsis' } })

function documentOf(children: readonly Record<string, unknown>[]): UiDocument {
  return {
    schemaVersion: '9.33.0',
    documentId: 'fade-zones',
    name: 'Fade zones',
    initialScreenId: 'main',
    screens: [{ screenId: 'main', name: 'Main', root: { id: 'root', type: 'Screen', props: { gap: 'md' }, children } }],
  } as unknown as UiDocument
}

function phaseOf(id: string): string {
  const element = document.querySelector<HTMLElement>(`[data-hl-node="${id}"]`)
  if (element === null) return 'absent'
  return element.getAttribute('data-hl-fade') ?? 'shown'
}

/** Draws with the condition holding, then makes it stop holding, and reads the node right after. */
function afterConditionStops(doc: UiDocument, id: string): string {
  const screen = (on: number) => <HotlayoutScreen document={doc} data={{ on }} onAction={() => undefined} />
  const view = render(screen(1))
  expect(phaseOf(id)).toBe('shown')
  act(() => {
    view.rerender(screen(0))
  })
  return phaseOf(id)
}

describe('visibility fade: which nodes are zones', () => {
  it('an ordinary node fades out', () => {
    const doc = documentOf([{ id: 'plain', type: 'Column', props: { gap: 'none', align: 'start' }, children: [text('t')], ...FADE }, text('rest')])
    expect(afterConditionStops(doc, 'plain')).toBe('leaving')
  })

  it('the first child of the root that is an app bar follows the condition at once', () => {
    const bar = { id: 'bar', type: 'AppBar', props: { title: { kind: 'literal', value: 'Title' }, showBack: false }, ...FADE }
    expect(afterConditionStops(documentOf([bar, text('rest')]), 'bar')).toBe('absent')
  })

  it('an app bar that is not the first child of the root fades', () => {
    const bar = { id: 'bar', type: 'AppBar', props: { title: { kind: 'literal', value: 'Title' }, showBack: false }, ...FADE }
    expect(afterConditionStops(documentOf([text('first'), bar]), 'bar')).toBe('leaving')
  })

  it.each(['top', 'bottom'])('a node with `pin: %s` follows the condition at once', (pin) => {
    const pinned = { id: 'pinned', type: 'Column', props: { gap: 'none', align: 'start' }, children: [text('t')], pin, ...FADE }
    expect(afterConditionStops(documentOf([pin === 'top' ? pinned : text('first'), ...(pin === 'top' ? [text('rest')] : [pinned])]), 'pinned')).toBe('absent')
  })

  it('a node with a `pin` word the reader does not know is still a zone', () => {
    const pinned = { id: 'pinned', type: 'Column', props: { gap: 'none', align: 'start' }, children: [text('t')], pin: 'left', ...FADE }
    expect(afterConditionStops(documentOf([text('first'), pinned]), 'pinned')).toBe('absent')
  })
})
