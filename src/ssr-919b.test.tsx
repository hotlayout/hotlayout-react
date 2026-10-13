/**
 * The server and the browser say the same for the second half of schema 9.19.0: the state of an option and of a toggle
 * (computed from the data, never kept in a component), the place of an option in its group, the counter of a field, the
 * caption of a row, the description of a picture and the name of an icon from data. The server markup is drawn WITHOUT
 * the globals of the browser; then the very same document is hydrated over it, and React must find nothing to complain
 * about.
 */
import { readFileSync } from 'node:fs'
import { act } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'

// act() of React 18 and 19 asks the test environment for this flag.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const frame = (name: string): UiDocument => JSON.parse(readFileSync(`contract/fixtures/${name}.json`, 'utf8')) as UiDocument

/** The server markup of the document, in an environment with no browser at all. */
function serverMarkup(given: UiDocument, data: Record<string, unknown>, screenId?: string): string {
  const document = screenId === undefined ? given : ({ ...given, initialScreenId: screenId } as UiDocument)
  for (const name of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'getComputedStyle']) vi.stubGlobal(name, undefined)
  try {
    return renderToString(<HotlayoutScreen document={document} data={data} onReport={() => undefined} />)
  } finally {
    vi.unstubAllGlobals()
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const CASES: readonly { readonly frame: string; readonly screens: readonly string[]; readonly data: Record<string, unknown> }[] = [
  { frame: 'choice-controls-screens', screens: ['wallet', 'survey'], data: { 'account.period': 'month', 'account.balanceHidden': true, 'survey.score': 7, 'survey.topicFood': true } },
  { frame: 'parts-screens', screens: ['card', 'form'], data: { 'account.income': 40, 'user.firstName': 'Alex' } },
  { frame: 'alt-icon-date-screens', screens: ['operation'], data: { 'account.lastIcon': 'trending-up', 'account.lastAt': '2026-10-15T12:00:00.000Z', 'account.lastMerchant': 'Cafe Roma' } },
]

describe('the server markup of the second half of 9.19 is the markup of the browser', () => {
  it.each(CASES.flatMap((row) => row.screens.map((screen) => ({ ...row, screen }))))('$frame / $screen: hydration over the server markup raises no warning', async (row) => {
    const document = { ...frame(row.frame), initialScreenId: row.screen } as UiDocument
    const html = serverMarkup(document, row.data)
    const host = window.document.createElement('div')
    host.innerHTML = html
    window.document.body.append(host)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      hydrateRoot(host, <HotlayoutScreen document={document} data={row.data} onReport={() => undefined} />)
      await Promise.resolve()
    })
    expect(errors.mock.calls.map((call) => String(call[0]))).toEqual([])
    host.remove()
  })

  it('the state of an option and of a toggle is in the server markup', () => {
    const html = serverMarkup(frame('choice-controls-screens'), { 'account.period': 'month', 'account.balanceHidden': true })
    expect(html).toContain('role="radio"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toMatch(/aria-posinset="\d+"[^>]*aria-setsize="\d+"|aria-setsize="\d+"[^>]*aria-posinset="\d+"/)
  })

  it('the counter, the caption and the tile are in the server markup', () => {
    const html = serverMarkup(frame('parts-screens'), {}, 'form') + serverMarkup(frame('parts-screens'), {}, 'card')
    expect(html).toContain('data-hl-counter')
    expect(html).toContain('data-hl-caption')
    expect(html).toContain('data-hl-tile')
    expect(html).toMatch(/\d+ \/ \d+/)
  })

  it('the description and the icon from data are in the server markup', () => {
    const html = serverMarkup(frame('alt-icon-date-screens'), { 'account.lastIcon': 'trending-up', 'account.lastMerchant': 'Cafe Roma' })
    expect(html).toContain('data-hl-glyph="trending-up"')
    expect(html).toContain('Cafe Roma')
  })
})
