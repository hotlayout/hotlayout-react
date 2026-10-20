/**
 * Paint order of the layers of a stack.
 *
 * The contract: layers paint in document order, the first is the lowest. CSS paints positioned boxes
 * above in-flow ones, so a positioned node inside an earlier layer (an offset, a shadow, a motion)
 * would climb above a later layer. Layout and painting are not computed in jsdom, so the test checks
 * the structural condition: every layer cell is its own stacking context and the cells stand in
 * document order, so a positioned descendant cannot leave its cell.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { UiDocument } from './index'

afterEach(cleanup)

const container = (id: string, extra: Record<string, unknown> = {}): unknown => ({
  id,
  type: 'Container',
  props: {},
  style: { width: 164, height: 164 },
  ...extra,
})

function stackCells(children: unknown[]): HTMLElement[] {
  const stack = { id: 'stack', type: 'Stack', props: {}, children }
  const document = {
    schemaVersion: READER_SCHEMA_VERSION,
    documentId: 'doc',
    name: 'Doc',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'A', root: { id: 'root', type: 'Screen', props: {}, children: [stack] } }],
  } as unknown as UiDocument
  const view = render(<HotlayoutScreen document={document} />)
  const element = view.container.querySelector('[data-hl-node="stack"]')
  if (!(element instanceof HTMLElement)) throw new Error('the stack is missing')
  return Array.from(element.children).filter((cell): cell is HTMLElement => cell instanceof HTMLElement && cell.querySelector('[data-hl-node]') !== null)
}

const idOf = (cell: HTMLElement | undefined): string | null | undefined => cell?.querySelector('[data-hl-node]')?.getAttribute('data-hl-node')

describe('layers of a stack paint in document order', () => {
  it('gives every layer cell its own stacking context, in document order', () => {
    const cells = stackCells([
      container('halo', { layer: { alignHorizontal: 'center', alignVertical: 'center' } }),
      container('planet'),
      container('badge', { layer: { alignHorizontal: 'end', alignVertical: 'start' } }),
    ])
    expect(cells.map(idOf)).toEqual(['halo', 'planet', 'badge'])
    for (const cell of cells) expect(cell.style.isolation).toBe('isolate')
  })

  it('keeps a positioned node of an early layer inside its cell', () => {
    const cells = stackCells([container('halo', { layer: { alignHorizontal: 'center', alignVertical: 'center' } }), container('planet')])
    const halo = cells[0]?.querySelector<HTMLElement>('[data-hl-node="halo"]')
    expect(halo?.style.position).toBe('relative')
    expect(cells[0]?.style.isolation).toBe('isolate')
    expect(cells[1]?.style.isolation).toBe('isolate')
    const [first, second] = cells
    if (first === undefined || second === undefined) throw new Error('the stack draws two layer cells')
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
