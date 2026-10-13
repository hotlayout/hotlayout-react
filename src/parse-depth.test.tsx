/**
 * The guard of the parse depth is the one of the artifact: a tree of up to 32 levels BELOW the screen root (the root is
 * level 0) is drawn, a deeper one makes that screen not drawn (`x-style.layout.composition.depth.readerParseLimit`).
 */
import { readFileSync } from 'node:fs'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument, UiNode } from './index'

afterEach(cleanup)

const LIMIT = (JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as { 'x-style': { layout: { composition: { depth: { readerParseLimit: number } } } } })['x-style'].layout.composition.depth.readerParseLimit

/** A chain of columns with a text at the bottom: `levels` levels below the root. */
function chain(levels: number): UiNode {
  let node: UiNode = { id: 'leaf', type: 'Text', props: { content: { kind: 'literal', value: 'bottom' } } }
  for (let level = levels - 1; level >= 1; level -= 1) node = { id: `c${String(level)}`, type: 'Column', props: {}, children: [node] }
  return { id: 'root', type: 'Screen', props: {}, children: [node] }
}

const documentOf = (deep: UiNode): UiDocument =>
  ({
    schemaVersion: '9.19.0',
    documentId: 'depth',
    name: 'depth',
    initialScreenId: 'a',
    screens: [
      { screenId: 'a', name: 'a', root: deep },
      { screenId: 'b', name: 'b', root: { id: 'rb', type: 'Screen', props: {}, children: [{ id: 'tb', type: 'Text', props: { content: { kind: 'literal', value: 'other' } } }] } },
    ],
  }) as unknown as UiDocument

describe('the parse depth: 32 levels below the root', () => {
  it('the limit is the number of the artifact', () => {
    expect(LIMIT).toBe(32)
  })

  it('exactly 32 levels below the root are drawn', () => {
    const view = render(<HotlayoutScreen document={documentOf(chain(LIMIT))} onReport={() => undefined} />)
    expect(view.container.querySelector('[data-hl-node="leaf"]')?.textContent).toBe('bottom')
  })

  it('33 levels below the root: the screen is not drawn, another screen of the document is not hurt', () => {
    const view = render(<HotlayoutScreen document={documentOf(chain(LIMIT + 1))} onReport={() => undefined} />)
    expect(view.container.querySelector('[data-hl-node="leaf"]')).toBeNull()
    expect(view.container.textContent).toContain('was not rendered')
    cleanup()
    const other = render(<HotlayoutScreen document={{ ...documentOf(chain(LIMIT + 1)), initialScreenId: 'b' } as UiDocument} onReport={() => undefined} />)
    expect(other.container.textContent).toContain('other')
  })
})
