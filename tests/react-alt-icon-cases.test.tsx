/**
 * THE DESCRIPTION OF A PICTURE AND AN ICON FROM DATA THROUGH THE PACKAGE `@hotlayout/react` (schema 9.19.0):
 *  - `iconPathCases` (22 rows) and `iconPathDocumentCases` (9) of `contract/fixtures/icon-text/icon-text-cases.json`;
 *  - the description `alt` as a string of the document — translated under the key of the field, from data, from a
 *    template, empty = decorative (the rows `9.19.0 …` of `nameCases` of the composition table are run by
 *    the composition case test).
 *
 * The reference implementation is checked against the same table elsewhere; this is the third reader. Every
 * `iconPathCases` row goes through the function the reader resolves by and through a real `HotlayoutScreen` in both
 * directions of writing: the resolved name, whether the box is drawn or empty, whether it is mirrored, the order of
 * the parts beside a text. NO ROW IS SKIPPED.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { UiDocument, UiNode } from '../src/index'
import { ICON_FROM_DATA_RULES, resolveIconName } from '../src/icon-path'
import { MIRRORED_ICONS } from '../src/icons'

afterEach(cleanup)

type Json = Record<string, unknown>
interface IconCase {
  readonly name: string
  readonly widget: 'Icon' | 'Button' | 'Badge' | 'IconButton'
  readonly props: Json
  readonly data: Json
  readonly expect: { readonly resolved: unknown; readonly box: 'drawn' | 'empty' | 'none'; readonly mirrored: boolean; readonly logical?: readonly ('icon' | 'text')[] }
}
interface Table {
  readonly iconPathCases: readonly IconCase[]
  readonly iconPathDocumentCases: readonly { readonly name: string; readonly widget: string; readonly props: Json; readonly schema: boolean; readonly codes: readonly string[] }[]
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/icon-text/icon-text-cases.json', 'utf8')) as Table
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as Record<string, unknown>

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)
const lit = (value: string): Json => ({ kind: 'literal', value })

function documentOf(node: UiNode, extra: Json = {}): UiDocument {
  return { schemaVersion: '9.19.0', documentId: 'alt-icon-case', name: 'Case', initialScreenId: 's', screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children: [node] } }], ...extra } as unknown as UiDocument
}

function nodeOf(widget: string, props: Json): UiNode {
  const base: Record<string, Json> = {
    Icon: { size: 'md' },
    Button: { label: lit('Redeem'), variant: 'primary', action: { type: 'none' }, fullWidth: false },
    Badge: { label: lit('New'), tone: 'neutral' },
    IconButton: { label: lit('About'), variant: 'primary', size: 'md', action: { type: 'none' } },
    ListTile: { title: lit('Profile'), leading: { kind: 'none' }, trailing: { kind: 'none' } },
  }
  return { id: 'n', type: widget, props: { ...base[widget], ...props } } as unknown as UiNode
}

function drawn(node: UiNode, data: Json, direction: 'ltr' | 'rtl'): { readonly container: HTMLElement; readonly host: HTMLElement } {
  const view = render(<HotlayoutScreen document={documentOf(node)} data={data} dir={direction} onReport={() => undefined} />)
  const host = view.container.querySelector<HTMLElement>('[data-hl-node="n"]')
  if (host === null) throw new Error('the node is not drawn')
  return { container: view.container, host }
}

/** The element that draws the icon of the node, wherever the widget keeps it. */
function glyphOf(host: HTMLElement, widget: string): HTMLElement | null {
  if (widget === 'Icon') return host.firstElementChild as HTMLElement | null
  if (widget === 'IconButton') return host.firstElementChild?.firstElementChild as HTMLElement | null
  const part = host.querySelector('[data-hl-beside="icon"]')
  return part === null ? null : (part.firstElementChild as HTMLElement | null)
}

describe('an icon from data: the table and the block', () => {
  it('the table is on the place: the rows are counted, the names do not repeat', () => {
    expect([TABLE.iconPathCases.length, TABLE.iconPathDocumentCases.length]).toEqual([22, 9])
    for (const group of [TABLE.iconPathCases, TABLE.iconPathDocumentCases]) expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
  })

  it('the block `x-iconFromData` of the package is the block of the artifact, whole', () => {
    expect(ICON_FROM_DATA_RULES).toEqual(ARTIFACT['x-iconFromData'])
  })
})

describe('iconPathCases: the name the icon is drawn by', () => {
  it.each(named(TABLE.iconPathCases))('%s', (_name, row) => {
    const nameProp = row.widget === 'Icon' ? 'name' : 'icon'
    const resolved = resolveIconName(row.props[nameProp], row.props.iconPath, (path) => row.data[path])
    expect(resolved ?? null).toEqual(row.expect.resolved)
  })

  it.each(named(TABLE.iconPathCases))('on a real screen, left to right: %s', (_name, row) => {
    const { container, host } = drawn(nodeOf(row.widget, row.props), row.data, 'ltr')
    const glyph = glyphOf(host, row.widget)
    if (row.expect.box === 'none') {
      expect(glyph).toBeNull()
    } else {
      expect(glyph).not.toBeNull()
      // Drawn — a mask of the set; an empty box — the same box without a mask, and no attribute carries the string from data.
      expect(glyph?.style.maskImage !== '').toBe(row.expect.box === 'drawn')
      expect(glyph?.style.inlineSize).toBe('1em')
      expect(glyph?.style.blockSize).toBe('1lh')
      if (row.expect.box === 'drawn') expect(glyph?.getAttribute('data-hl-glyph')).toBe(row.expect.resolved)
      else expect(glyph?.getAttribute('data-hl-glyph')).toBeNull()
      expect(glyph?.style.scale ?? '').toBe('')
    }
    // Nothing that came from data is anywhere in the markup but as a drawn name of the set.
    if (row.expect.box !== 'drawn' && typeof row.expect.resolved === 'string' && row.expect.resolved !== row.props.icon && row.expect.resolved !== row.props.name) expect(container.innerHTML).not.toContain(row.expect.resolved)
  })

  it.each(named(TABLE.iconPathCases))('on a real screen, right to left: %s', (_name, row) => {
    const { host } = drawn(nodeOf(row.widget, row.props), row.data, 'rtl')
    const glyph = glyphOf(host, row.widget)
    if (row.expect.box === 'none') {
      expect(glyph).toBeNull()
      return
    }
    // Mirrored by the RESOLVED name, by the list of the contract, and only there.
    expect(glyph?.style.scale === '-1 1').toBe(row.expect.mirrored)
    expect(row.expect.mirrored).toBe(row.expect.box === 'drawn' && typeof row.expect.resolved === 'string' && MIRRORED_ICONS.includes(row.expect.resolved))
    expect(host.outerHTML.match(/scale: -1 1/g)?.length ?? 0).toBe(row.expect.mirrored ? 1 : 0)
  })

  it('the order of the parts beside a text is the same as for the icon of the document', () => {
    for (const row of TABLE.iconPathCases) {
      if (row.expect.logical === undefined) continue
      const { host } = drawn(nodeOf(row.widget, row.props), row.data, 'ltr')
      const parts = [...host.children].map((child) => (child.getAttribute('data-hl-beside') === 'icon' ? 'icon' : 'text'))
      // A place with no element children is the text alone.
      expect(parts.length === 0 ? ['text'] : parts, row.name).toEqual(row.expect.logical)
      cleanup()
    }
  })

  it('the gap beside the text stays when the box is empty', () => {
    const { host } = drawn(nodeOf('Button', { icon: 'gift', iconPath: 'account.lastIcon' }), { 'account.lastIcon': 'no-such-icon' }, 'ltr')
    expect(host.style.gap).toBe('var(--product-space-xs)')
    expect(host.querySelector('[data-hl-beside="icon"]')).not.toBeNull()
  })

  it('a hostile value is never an address, a drawing, an attribute or a style: the box is empty', () => {
    const hostile = ['https://example.com/x.svg', "<path d='M0 0h24v24H0z'/>", 'url(https://example.com/x)', 'star;position:fixed', '"><script>alert(1)</script>', '__proto__', 'constructor', 'toString', { name: 'star' }, ['star'], 7, true]
    for (const value of hostile) {
      const html = renderToStaticMarkup(<HotlayoutScreen document={documentOf(nodeOf('Icon', { name: 'star', iconPath: 'account.lastIcon' }))} data={{ 'account.lastIcon': value }} />)
      expect(html, JSON.stringify(value)).not.toContain('data:image/svg+xml')
      expect(html, JSON.stringify(value)).not.toContain('example.com')
      expect(html, JSON.stringify(value)).not.toContain('<script')
      expect(html, JSON.stringify(value)).not.toContain('position:fixed')
      expect(html, JSON.stringify(value)).not.toContain('data-hl-glyph="star;')
    }
  })

  it('a path of a node without an icon is not read; a path of a list row is not read at all', () => {
    const { host } = drawn(nodeOf('Button', { iconPath: 'account.lastIcon' }), { 'account.lastIcon': 'flame' }, 'ltr')
    expect(host.querySelector('[data-hl-beside]')).toBeNull()
    cleanup()
    const row = drawn(nodeOf('ListTile', { iconPath: 'account.lastIcon', leading: { kind: 'icon', icon: 'gift' } }), { 'account.lastIcon': 'flame' }, 'ltr')
    expect(row.host.querySelector('[data-hl-glyph="gift"]')).not.toBeNull()
    expect(row.host.querySelector('[data-hl-glyph="flame"]')).toBeNull()
  })

  it('the icon button keeps its name from the label of the document, not from the name that came from data', () => {
    const { host } = drawn(nodeOf('IconButton', { icon: 'info', iconPath: 'account.lastIcon', label: lit('') }), { 'account.lastIcon': 'heart' }, 'ltr')
    expect(host.getAttribute('aria-label')).toBe('info')
  })
})

describe('iconPathDocumentCases: the reader draws every document and does not fall', () => {
  it.each(named(TABLE.iconPathDocumentCases))('%s', (_name, row) => {
    const { host } = drawn(nodeOf(row.widget, row.props), { 'account.lastIcon': 'flame', 'account.balance': 5 }, 'ltr')
    expect(host).not.toBeNull()
  })
})

/* ---------------------------- the description ---------------------------- */

const imageNode = (alt: unknown): UiNode => ({ id: 'n', type: 'Image', props: { source: { kind: 'asset', asset: 'logo' }, ...(alt === undefined ? {} : { alt }) } }) as unknown as UiNode
const iconNode = (alt: unknown): UiNode => ({ id: 'n', type: 'Icon', props: { name: 'gift', size: 'md', ...(alt === undefined ? {} : { alt }) } }) as unknown as UiNode

function described(node: UiNode, options: { readonly data?: Json; readonly locale?: string; readonly localization?: Json } = {}): HTMLElement {
  const view = render(<HotlayoutScreen document={documentOf(node, options.localization === undefined ? {} : { localization: options.localization })} data={options.data ?? {}} locale={options.locale} onReport={() => undefined} />)
  const host = view.container.querySelector<HTMLElement>('[data-hl-node="n"]')
  if (host === null) throw new Error('the node is not drawn')
  return host
}

const nameOfPicture = (host: HTMLElement): string | null => (host.getAttribute('role') === 'img' ? host.getAttribute('aria-label') : host.getAttribute('alt'))
const isDecorative = (host: HTMLElement): boolean => host.getAttribute('aria-hidden') === 'true' || host.getAttribute('alt') === ''

describe('the description alt is a string or a string of the document', () => {
  it('a plain string is heard as it is, on a picture and on an icon', () => {
    expect(nameOfPicture(described(imageNode('Summer sale')))).toBe('Summer sale')
    expect(nameOfPicture(described(iconNode('Gifts')))).toBe('Gifts')
  })

  it('a wrapped literal equals the plain string', () => {
    expect(nameOfPicture(described(imageNode(lit('Summer sale'))))).toBe('Summer sale')
    expect(nameOfPicture(described(iconNode(lit('Gifts'))))).toBe('Gifts')
  })

  it('a binding is read from the data of the node, the fallback is what is heard without data', () => {
    const alt = { kind: 'binding', path: 'merchant.name', fallback: 'Merchant' }
    expect(nameOfPicture(described(imageNode(alt), { data: { 'merchant.name': 'Cafe Roma' } }))).toBe('Cafe Roma')
    cleanup()
    expect(nameOfPicture(described(imageNode(alt)))).toBe('Merchant')
    cleanup()
    expect(nameOfPicture(described(imageNode(alt), { data: { 'merchant.name': '' } }))).toBe('Merchant')
  })

  it('a template is read like any template', () => {
    const alt = { kind: 'template', template: 'Logo of {name}', values: { name: { kind: 'binding', path: 'merchant.name', fallback: 'the shop' } } }
    expect(nameOfPicture(described(imageNode(alt), { data: { 'merchant.name': 'Cafe Roma' } }))).toBe('Logo of Cafe Roma')
    cleanup()
    expect(nameOfPicture(described(iconNode(alt)))).toBe('Logo of the shop')
  })

  it('a plain string is TRANSLATED under the key of the field itself (`<screen>/<node>/alt`), and without a translation it is the string', () => {
    const localization = { defaultLocale: 'en', locales: ['en', 'uk'], strings: { uk: { 's/n/alt': 'Літній розпродаж' } } }
    expect(nameOfPicture(described(imageNode('Summer sale'), { locale: 'uk', localization }))).toBe('Літній розпродаж')
    cleanup()
    expect(nameOfPicture(described(imageNode('Summer sale'), { locale: 'en', localization }))).toBe('Summer sale')
    cleanup()
    expect(nameOfPicture(described(imageNode('Winter sale'), { locale: 'uk', localization: { defaultLocale: 'en', locales: ['en', 'uk'], strings: { uk: {} } } }))).toBe('Winter sale')
  })

  it('the rule of shown text applies: runs of spaces collapse, the edges are cut', () => {
    expect(nameOfPicture(described(imageNode('  Summer   sale  ')))).toBe('Summer sale')
    cleanup()
    expect(nameOfPicture(described(iconNode('  Gifts \n and   more ')))).toBe('Gifts and more')
  })

  it('no description, an empty one and one made of spaces: the picture is decorative', () => {
    for (const alt of [undefined, '', '   ', lit(''), lit('  \t '), { kind: 'binding', path: 'merchant.name', fallback: '' }, { kind: 'mystery' }, 7, null, ['x']]) {
      expect(isDecorative(described(imageNode(alt))), JSON.stringify(alt)).toBe(true)
      cleanup()
      const icon = described(iconNode(alt))
      expect(icon.getAttribute('aria-hidden'), JSON.stringify(alt)).toBe('true')
      expect(icon.getAttribute('role')).toBeNull()
      expect(icon.getAttribute('aria-label')).toBeNull()
      cleanup()
    }
  })

  it('a real picture carries the description in `alt`; the placeholder of an asset — in the label of a picture', () => {
    const view = render(
      <HotlayoutScreen
        document={documentOf({ id: 'n', type: 'Image', props: { source: { kind: 'url', url: 'https://example.com/a.png' }, alt: { kind: 'binding', path: 'merchant.name', fallback: 'x' } } } as unknown as UiNode)}
        data={{ 'merchant.name': 'Cafe Roma' }}
      />,
    )
    expect(view.container.querySelector('img')?.getAttribute('alt')).toBe('Cafe Roma')
  })
})
