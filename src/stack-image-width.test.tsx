/**
 * The width of an image inside a stack.
 *
 * The width of an image is given by its parent (the intrinsic size of the file is never read), so a
 * layer without a named width must take the whole stack, whatever the alignment of the stack says.
 * Layout is not computed in jsdom, so the test checks the structural condition: the cell of such a
 * layer stretches. A named width is drawn by the image itself and the cell keeps the stack alignment.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { UiDocument } from './index'

afterEach(cleanup)

function image(style: Record<string, unknown> | undefined): unknown {
  return {
    id: 'pic',
    type: 'Image',
    props: { source: { kind: 'url', url: 'https://cdn.example/a.png' }, aspectRatio: '16:9', alt: 'pic' },
    ...(style === undefined ? {} : { style }),
  }
}

function cellOf(layer: unknown): HTMLElement {
  const stack = { id: 'stack', type: 'Stack', props: { alignHorizontal: 'start', alignVertical: 'start' }, children: [layer] }
  const document = {
    schemaVersion: READER_SCHEMA_VERSION,
    documentId: 'doc',
    name: 'Doc',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'A', root: { id: 'root', type: 'Screen', props: {}, children: [stack] } }],
  } as unknown as UiDocument
  const view = render(<HotlayoutScreen document={document} />)
  const cell = view.container.querySelector('[data-hl-node="pic"]')?.parentElement
  if (!(cell instanceof HTMLElement)) throw new Error('the layer cell is missing')
  return cell
}

describe('an image layer of a stack', () => {
  it('takes the whole stack width without a named width', () => {
    expect(cellOf(image(undefined)).style.justifySelf).toBe('stretch')
  })

  it('takes the whole stack width with a named height only', () => {
    expect(cellOf(image({ height: 372 })).style.justifySelf).toBe('stretch')
  })

  it('keeps the alignment of the stack when its width is named', () => {
    expect(cellOf(image({ width: 200 })).style.justifySelf).toBe('')
  })
})
