/**
 * Server rendering without the browser globals.
 *
 * The repository tests run in jsdom (the shared `setup.ts` itself needs a DOM), where `window` and
 * `document` always exist, so touching them during render would not fail there. For the duration
 * of each render the browser globals are therefore REMOVED: if the package touches them, the test
 * fails with a `TypeError`, just as a customer's server would. Module-level access (at import
 * time) is caught by a separate package test that reads the sources.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HOTLAYOUT_CSS, HotlayoutScreen } from './index'
import type { ThemeContract, UiDocument } from './index'

const FIXTURES_DIR = 'contract/fixtures'
// The type parameter states what the file holds at the call site; otherwise every call would carry its own `as`.
 
const json = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
const names = readdirSync(FIXTURES_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''))

function themeOf(name: string): ThemeContract | undefined {
  try {
    return json<ThemeContract>(join(FIXTURES_DIR, 'themes', `${name.replace(/-screens?$/, '')}-theme.json`))
  } catch {
    return undefined
  }
}

describe('server rendering', () => {
  beforeEach(() => {
    for (const name of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'getComputedStyle']) vi.stubGlobal(name, undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('the environment really has no browser during render', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
  })

  it.each(names)('%s: renderToString does not crash and yields the screen markup', (name) => {
    const document = json<UiDocument>(join(FIXTURES_DIR, `${name}.json`))
    const html = renderToString(<HotlayoutScreen document={document} theme={themeOf(name)} locale="ar" onReport={() => undefined} />)
    expect(html).toContain('data-hotlayout')
    expect(html).toContain(`data-hl-node="${document.screens.find((screen) => screen.screenId === document.initialScreenId)?.root.id ?? ''}"`)
    // Arabic: the direction is already in the server markup when the document is shown in that language.
    expect(html).toMatch(/dir="(?:rtl|ltr)"/)
  })

 it('icons are drawn on the server: the mask is already in the markup, mirrored in RTL', () => {
    const icons = ['star', 'lock', 'arrow-right', 'circle-help']
    const document = {
      schemaVersion: '9.3.0',
      documentId: 'd',
      name: 'D',
      initialScreenId: 's',
      screens: [{ screenId: 's', name: 'S', root: { id: 'r', type: 'Screen', props: {}, children: icons.map((name) => ({ id: name, type: 'Icon', props: { name, size: 'md' } })) } }],
    } as unknown as UiDocument
    const rtl = renderToString(<HotlayoutScreen document={document} locale="ar" onReport={() => undefined} />)
    for (const name of icons) expect(rtl).toContain(`data-hl-glyph="${name}"`)
    expect(rtl.match(/(?<!-)mask-image:url\(&quot;data:image\/svg\+xml/g)).toHaveLength(icons.length)
    // Exactly one of the four is mirrored: `arrow-right`.
    expect(rtl.match(/scale:-1 1/g)).toHaveLength(1)
    expect(rtl).toMatch(/scale:-1 1[^>]*data-hl-glyph="arrow-right"|data-hl-glyph="arrow-right"[^>]*scale:-1 1/)
    expect(renderToString(<HotlayoutScreen document={document} locale="en" onReport={() => undefined} />)).not.toContain('scale:-1 1')
  })

  it('the stylesheet and theme variables arrive from the server: the first frame is already styled', () => {
    const html = renderToStaticMarkup(<HotlayoutScreen document={json<UiDocument>(join(FIXTURES_DIR, 'minimal-screen.json'))} onReport={() => undefined} />)
    expect(html).toContain('<style>')
    expect(html).toContain(HOTLAYOUT_CSS.slice(0, 40).replaceAll('"', '&quot;').slice(0, 20))
    expect(html).toContain('--product-color-primary')
  })

  it('a version rejection is also rendered on the server, without an exception', () => {
    const document = { ...json<UiDocument>(join(FIXTURES_DIR, 'minimal-screen.json')), schemaVersion: '1.0.0' }
    expect(renderToString(<HotlayoutScreen document={document} onReport={() => undefined} />)).toContain('role="alert"')
  })
})
