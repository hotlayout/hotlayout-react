/**
 * ADVERSARIAL: a document and a theme from the network that CRASH the host app.
 *
 * The package promises (`README.md`, the `document` prop) "Not validated against the
 * schema … but never trusted either", and for the theme "An unreadable theme never
 * blanks the screen". A React exception during render is not just "an empty package screen":
 * without an error boundary in the host, React unmounts the WHOLE application tree, so one
 * corrupted node in storage would take down the entire host page.
 *
 * Every input here is legal JSON (what `JSON.parse` and `loadDocument` would return) that does not
 * have the shape the schema promises. The tests assert the DESIRED outcome: the render does not throw.
 */
import { cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen, READER_SCHEMA_VERSION, READER_THEME_VERSION } from './index'
import type { ThemeContract, UiDocument } from './index'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const lit = (value: unknown): unknown => ({ kind: 'literal', value })

/** A document with one screen whose root carries `children`; everything as if from `JSON.parse`. */
function documentWith(children: readonly unknown[], extra: Readonly<Record<string, unknown>> = {}): UiDocument {
  const raw = {
    schemaVersion: READER_SCHEMA_VERSION,
    documentId: 'doc',
    name: 'Doc',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'A', root: { id: 'root', type: 'Screen', props: {}, children } }],
    ...extra,
  }
  // Through JSON: exactly what would arrive from the network.
  return JSON.parse(JSON.stringify(raw)) as UiDocument
}

function themeWith(patch: Readonly<Record<string, unknown>>): ThemeContract {
  return JSON.parse(
    JSON.stringify({ themeContractVersion: READER_THEME_VERSION, defaultThemeId: 't', themes: { t: { id: 't', name: 'T', brightness: 'light', ...patch } } }),
  ) as ThemeContract
}

/** A render that keeps the output clean: React prints the exception to `console.error` itself. */
function renderQuietly(document: UiDocument, theme?: ThemeContract): () => void {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  return () => {
    render(<HotlayoutScreen document={document} theme={theme} onReport={() => undefined} />)
  }
}

const okText = { id: 'ok', type: 'Text', props: { content: lit('ok') } }

describe('a document of the wrong shape does not crash the host tree', () => {
  const nodes: readonly (readonly [string, unknown])[] = [
    ['node without props', { id: 'n', type: 'Column' }],
    ['props: null', { id: 'n', type: 'Row', props: null }],
    ['children is an object, not an array', { id: 'n', type: 'Column', props: {}, children: {} }],
    ['children is a number', { id: 'n', type: 'Column', props: {}, children: 7 }],
    ['children: [null]', { id: 'n', type: 'Column', props: {}, children: [null] }],
    ['visibleIf: null', { id: 'n', type: 'Text', props: { content: lit('x') }, visibleIf: null }],
    ['styleWhen is an object', { id: 'n', type: 'Text', props: { content: lit('x') }, styleWhen: {} }],
    ['styleWhen: [null]', { id: 'n', type: 'Text', props: { content: lit('x') }, styleWhen: [null] }],
    ['styleWhen without when', { id: 'n', type: 'Text', props: { content: lit('x') }, styleWhen: [{ style: {} }] }],
    ['object literal in a text', { id: 'n', type: 'Text', props: { content: lit({ a: 1 }) } }],
    ['array literal in a button label', { id: 'n', type: 'Button', props: { label: lit([{ a: 1 }]), variant: 'primary' } }],
    ['binding fallback text is an object', { id: 'n', type: 'Text', props: { content: { kind: 'binding', path: 'nope', fallback: { a: 1 } } } }],
    ['Image.source: null', { id: 'n', type: 'Image', props: { source: null } }],
    ['ListTile.leading: null', { id: 'n', type: 'ListTile', props: { title: lit('t'), leading: null, trailing: { kind: 'none' } } }],
    ['ListTile.trailing: null', { id: 'n', type: 'ListTile', props: { title: lit('t'), leading: { kind: 'none' }, trailing: null } }],
    ['style.border: null', { id: 'n', type: 'Container', props: {}, style: { border: null } }],
    ['style.background: null', { id: 'n', type: 'Container', props: {}, style: { background: null } }],
    ['Tabs with a null child', { id: 'n', type: 'Tabs', props: {}, children: [null] }],
    ['Stack with a null child', { id: 'n', type: 'Stack', props: {}, children: [null] }],
    ['Repeater: null template', { id: 'n', type: 'Repeater', props: { source: 'items', item: 'item' }, children: [null] }],
  ]

  it.each(nodes)('%s', (_name, node) => {
    const run = renderQuietly(documentWith([node, okText]))
    expect(run).not.toThrow()
  })

  const documents: readonly (readonly [string, UiDocument])[] = [
    ['screen without root', documentWith([], { screens: [{ screenId: 'a', name: 'A' }] })],
    ['root: null', documentWith([], { screens: [{ screenId: 'a', name: 'A', root: null }] })],
    ['screens: [null]', documentWith([], { screens: [null] })],
    ['localization: null', documentWith([okText], { localization: null })],
  ]

  it.each(documents)('%s', (_name, document) => {
    const run = renderQuietly(document)
    expect(run).not.toThrow()
  })

  it('entryPoints: null together with a named entry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const document = documentWith([okText], { entryPoints: null })
    expect(() => {
      render(<HotlayoutScreen document={document} entry="promo" onReport={() => undefined} />)
    }).not.toThrow()
  })

  it('the same on the server: one corrupted node does not give a 500 for the whole page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const document = documentWith([{ id: 'n', type: 'Column' }, okText])
    expect(() => renderToString(<HotlayoutScreen document={document} onReport={() => undefined} />)).not.toThrow()
  })
})

describe('a theme of the wrong shape: "An unreadable theme never blanks the screen"', () => {
  const themes: readonly (readonly [string, Readonly<Record<string, unknown>>])[] = [
    ['fontFamilies.body: null', { fontFamilies: { body: null } }],
    ['fontFamilies.body without fallback', { fontFamilies: { body: { primary: 'Inter' } } }],
    ['typography.bodyM: null', { typography: { bodyM: null } }],
    ['elevation.low is a string', { elevation: { low: 'soft' } }],
    ['elevation.low: [null]', { elevation: { low: [null] } }],
    ['elevation.low: layer without a colour', { elevation: { low: [{ offsetX: 0, offsetY: 1, blur: 2, spread: 0, opacity: 0.1 }] } }],
    ['gradient.brandBackdrop without stops', { gradient: { brandBackdrop: { angle: 0 } } }],
    ['gradient.brandBackdrop: null', { gradient: { brandBackdrop: null } }],
    ['roles.buttonVariant: null', { roles: { buttonVariant: null } }],
    ['roles.buttonVariant.primary: null', { roles: { buttonVariant: { primary: null } } }],
  ]

  it.each(themes)('%s', (_name, patch) => {
    const run = renderQuietly(documentWith([okText]), themeWith(patch))
    expect(run).not.toThrow()
  })

  it('a theme colour is a number, while the document asks for a shade of it', () => {
    const document = documentWith([{ id: 'n', type: 'Text', props: { content: lit('x') }, style: { color: { token: 'primary', opacity: 0.5 } } }])
    const run = renderQuietly(document, themeWith({ color: { primary: 255 } }))
    expect(run).not.toThrow()
  })
})
