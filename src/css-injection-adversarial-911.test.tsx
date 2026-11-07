/**
 * Controls for the hostile-value sweep over a document that uses the newer fields (schema
 * 9.9-9.11). The sweeps themselves are `css-injection-adversarial-911.<k>.deep.test.tsx`, each
 * running one slice of the paths; the document, the hostile values and the checks are in
 * `test-support/css-injection-kit.tsx`.
 */
import { cleanup } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { attackDocument, attackPaths, COLLECTIONS, DATA, dirtOf, sinksOf, SLICE_COUNT, UNAVAILABLE } from '../test-support/css-injection-kit'
import { expectPartition, expectSliceFiles } from '../test-support/shard'
import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'

afterEach(cleanup)

describe('9.9-9.11: hostile values at every document path, with all the newer fields', () => {
  const document = attackDocument()
  const paths = attackPaths(document)

  it('the clean document is drawn in every anatomy and the guard passes it', () => {
    expect(paths.length).toBeGreaterThan(300)
    for (const entry of ['main', 'window', 'sheet']) {
      for (const scroll of ['page', 'screen'] as const) {
        const html = renderToStaticMarkup(<HotlayoutScreen document={{ ...document, initialScreenId: entry } as unknown as UiDocument} data={DATA} collections={COLLECTIONS} scroll={scroll} injectStyles={false} onReport={() => undefined} />)
        expect(html).not.toContain(UNAVAILABLE)
        for (const sink of sinksOf(html)) expect(dirtOf(sink), sink).toBeUndefined()
      }
    }
    // The newer fields do reach the style; otherwise the sweeps would check nothing.
    const html = renderToStaticMarkup(<HotlayoutScreen document={document as unknown as UiDocument} data={DATA} collections={COLLECTIONS} injectStyles={false} onReport={() => undefined} />)
    expect(html).toMatch(/rotate:12deg/)
    expect(html).toMatch(/inset-inline-start:-128px/)
    expect(html).toMatch(/aspect-ratio:2\.3333/)
    expect(html).toMatch(/position:sticky/)
    expect(html).toMatch(/scroll-snap-type/)
    expect(html).toMatch(/data-hl-step/)
  })

  it('the slices of the sweeps cover every path exactly once, and every slice has a file', () => {
    expectPartition(
      paths.map((path) => path.join('\u0000')),
      SLICE_COUNT,
    )
    expectSliceFiles('', 'css-injection-adversarial-911', SLICE_COUNT)
  })
})
