/**
 * Limit 9 — server render. A hostile document under `renderToString` / `renderToStaticMarkup`
 * must neither fail the page (no exception, a screen that cannot be drawn becomes a notice) nor
 * inject markup into the HTML string. Every string leaf and every object of every fixture gets a
 * markup payload, as a value and as a KEY.
 *
 * This file holds the controls; the sweep itself is `ssr.<k>.deep.test.tsx`, each file running one
 * slice of the cases (`test-support/hardening-ssr-kit.tsx`).
 */
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../index'
import { draw, injected, PAYLOAD, ssrCases, SSR_SLICE_COUNT } from '../../test-support/hardening-ssr-kit'
import { screenFixtures } from '../../test-support/hardening-kit'
import { expectPartition, expectSliceFiles } from '../../test-support/shard'

describe('limit 9: no markup injection and no failed page under a hostile document', () => {
  it('the injection check itself: the raw payload is caught, the escaped one is text', () => {
    expect(injected(PAYLOAD)).toBeDefined()
    expect(injected('<div title="&lt;/div&gt;&lt;script&gt; onerror=alert(1)">a<!-- -->b</div>')).toBeUndefined()
  })

  it('the default stylesheet the package injects is the only <style> (control: the clean screen has exactly one)', () => {
    const fixture = screenFixtures()[0]
    if (fixture === undefined) throw new Error('no fixtures')
    const html = renderToString(<HotlayoutScreen document={fixture.document} onReport={() => undefined} />)
    expect(html.split('<style').length - 1).toBe(1)
    expect(injected(draw(fixture.document))).toBeUndefined()
  })

  it('the slices of the sweep cover every case exactly once, and every slice has a file', () => {
    const cases = ssrCases()
    expect(cases.length).toBeGreaterThan(1000)
    expectPartition(cases, SSR_SLICE_COUNT)
    expectSliceFiles('hardening-2026-10', 'ssr', SSR_SLICE_COUNT)
  })
})
