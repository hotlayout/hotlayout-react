/**
 * Adversarial tests for the schema 9.5.0 fields that arrive from the network: `icon`,
 * `iconPosition`, `size`, `variant` and the `label` of an icon button.
 *
 * They are all words from a closed list, which makes them easy to read by indexing a table:
 * `SIZES[size]`, `ORDER[position]`. `size: 'constructor'` would then yield the `Object` function and
 * `icon: '__proto__'` a prototype instead of a glyph. The package promises three things about this
 * untrusted input, each asserted as behaviour:
 *
 *  - IT DOES NOT THROW, on the server either: a value outside the list, a non-string, `null`, an
 *    object or an array gives the contract default (`defaultButtonSize`,
 *    `iconBesideText.defaultPosition`), a neutral role or an empty box;
 *  - IT STAYS IN ITS PLACE: a document string never becomes a style property or an address; the
 *    icon mask comes only from the icon set (`icons.ts`) and the icon button name goes into
 *    `aria-label` as text;
 *  - IT DOES NOT BREAK THE HOST LAYOUT: an icon button without any field stays a button of its size.
 */
import { cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { HotlayoutReport, UiDocument } from './index'
import { buttonGeometryOf, hasIconBesideText, iconBesideTextOrder, iconButtonNameOf, iconPositionOf } from './layout-rules'
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const MARK = 'evil.example'
const CSS = `red;position:fixed;inset:0;background:url(https://${MARK}/x)`
const MARKUP = `<img src=x onerror="globalThis.pwned=1"><svg onload="globalThis.pwned=1">`

/** Values an attacker substitutes for a word from the list. They go through JSON, as from the network. */
const HOSTILE: readonly (readonly [string, unknown])[] = [
  ['name from the prototype', 'constructor'],
  ['__proto__', '__proto__'],
  ['toString', 'toString'],
  ['hasOwnProperty', 'hasOwnProperty'],
  ['word outside the list', 'gigantic'],
  ['case', 'LG'],
  ['empty string', ''],
  ['spaces', '  '],
  ['number', 7],
  ['zero', 0],
  ['flag', true],
  ['null', null],
  ['object', { kind: 'media', url: `https://${MARK}/a.svg` }],
  ['object with toString', { toString: 'lg', valueOf: 'lg' }],
  ['array', ['lg', 'end']],
  ['"CSS"', CSS],
  ['markup', MARKUP],
  ['path', '../../etc/passwd'],
  ['data-URI', 'data:image/svg+xml,<svg onload=alert(1)>'],
  ['megabyte', 'a'.repeat(1_048_576)],
]

const lit = (value: unknown): unknown => ({ kind: 'literal', value })
const okText = { id: 'ok', type: 'Text', props: { content: lit('ok') } }

function documentWith(children: readonly unknown[]): UiDocument {
  return JSON.parse(
    JSON.stringify({ schemaVersion: READER_SCHEMA_VERSION, documentId: 'doc', name: 'Doc', initialScreenId: 's', screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children: [...children, okText] } }] }),
  ) as UiDocument
}

interface Drawn {
  readonly container: HTMLElement
  readonly node: HTMLElement
  readonly reports: readonly HotlayoutReport[]
}

/** Draws node `n` in the browser and on the server; the screen did not throw, the sibling is intact, React printed nothing. */
function draw(node: Record<string, unknown>, direction: 'ltr' | 'rtl' = 'ltr'): Drawn {
  const document = documentWith([node])
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const reports: HotlayoutReport[] = []
  expect(renderToString(<HotlayoutScreen document={document} dir={direction} onReport={() => undefined} />)).toContain('data-hl-node="ok"')
  const view = render(<HotlayoutScreen document={document} dir={direction} onReport={(report) => reports.push(report)} />)
  expect(view.container.querySelector('[data-hl-node="ok"]')?.textContent).toBe('ok')
  expect(reports.filter((report) => report.kind === 'render-error')).toEqual([])
  expect(errors).not.toHaveBeenCalled()
  errors.mockRestore()
  const found = view.container.querySelector<HTMLElement>('[data-hl-node="n"]')
  if (found === null) throw new Error('node was not drawn')
  return { container: view.container, node: found, reports }
}

/** No document string became a style, an address or an element. */
function expectInert(drawn: Drawn): void {
  for (const element of drawn.container.querySelectorAll<HTMLElement>('[style]')) {
    const style = element.getAttribute('style') ?? ''
    expect(style).not.toContain(MARK)
    expect(style).not.toContain('position: fixed')
    // The only address in a style is a mask from the icon set.
    for (const url of style.match(/url\([^)]*\)/g) ?? []) expect(url.startsWith('url("data:image/svg+xml,%3Csvg xmlns=')).toBe(true)
  }
  expect(drawn.container.querySelector('img, svg, script, iframe')).toBeNull()
  expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
}

const button = (props: Record<string, unknown>): Record<string, unknown> => ({ id: 'n', type: 'Button', props: { label: lit('Redeem'), variant: 'primary', action: { type: 'none' }, fullWidth: false, ...props } })
const badge = (props: Record<string, unknown>): Record<string, unknown> => ({ id: 'n', type: 'Badge', props: { label: lit('Chip'), tone: 'neutral', ...props } })
const iconButton = (props: Record<string, unknown>): Record<string, unknown> => ({ id: 'n', type: 'IconButton', props: { icon: 'info', label: lit('About'), variant: 'ghost', size: 'md', action: { type: 'none' }, ...props } })
const tile = (icon: unknown): Record<string, unknown> => ({ id: 'n', type: 'ListTile', props: { title: lit('Row'), leading: { kind: 'none' }, trailing: { kind: 'text', text: lit('120'), icon } } })

const MD_PADDING = 'var(--product-space-sm) var(--product-space-md)'
const MD_FONT = 'var(--product-font-title-s)'

describe('`icon`: a name outside the set or a non-string gives an empty box, not a glyph, a style or an address', () => {
  it.each(HOSTILE)('%s', (_name, icon) => {
    for (const node of [button({ icon }), badge({ icon }), tile(icon), iconButton({ icon })]) expectInert(draw(node))
  })

  it.each(HOSTILE.filter(([, value]) => value !== null))('%s: the icon box is in place and empty in a button, a badge, a row slot and an icon button', (_name, icon) => {
    for (const node of [button({ icon }), badge({ icon }), tile(icon)]) {
      const drawn = draw(node)
      const box = drawn.node.querySelector<HTMLElement>('[data-hl-beside="icon"]')
      expect(box).not.toBeNull()
      const glyph = box?.firstElementChild as HTMLElement
      expect(glyph.style.maskImage).toBe('')
      expect(glyph.style.inlineSize).toBe('1em')
      expect(glyph.style.blockSize).toBe('1lh')
    }
    const round = draw(iconButton({ icon }))
    expect(round.node.tagName).toBe('BUTTON')
    expect((round.node.firstElementChild as HTMLElement).style.inlineSize).toBe('1lh')
    expect((round.node.firstElementChild?.firstElementChild as HTMLElement).style.maskImage).toBe('')
  })

  it('`null` and a missing field mean no icon: neither a box nor a gap between the parts', () => {
    for (const icon of [null, undefined]) {
      for (const node of [button({ icon }), badge({ icon }), tile(icon)]) expect(draw(node).node.querySelector('[data-hl-beside="icon"]')).toBeNull()
    }
    expect(hasIconBesideText(null)).toBe(false)
    expect(hasIconBesideText(undefined)).toBe(false)
    for (const [, icon] of HOSTILE) if (icon !== null) expect(hasIconBesideText(icon)).toBe(true)
  })

  it('an own `__proto__` key in props is dropped: the rest of the button is drawn', () => {
    const node = JSON.parse('{"id":"n","type":"Button","props":{"label":{"kind":"literal","value":"Redeem"},"variant":"primary","fullWidth":false,"action":{"type":"none"},"__proto__":{"icon":"gift","size":"lg"}}}') as Record<string, unknown>
    const drawn = draw(node)
    expect(drawn.node.textContent).toBe('Redeem')
    expect(drawn.node.querySelector('[data-hl-beside="icon"]')).toBeNull()
    expect(drawn.node.style.padding).toBe(MD_PADDING)
    expect(({} as Record<string, unknown>).icon).toBeUndefined()
  })
})

describe('`iconPosition`: a value outside the list gives the contract default (`start`)', () => {
  it.each(HOSTILE)('%s', (_name, iconPosition) => {
    expect(iconPositionOf(iconPosition)).toBe('start')
    expect(iconBesideTextOrder('gift', iconPosition)).toEqual(['icon', 'text'])
    for (const node of [button({ icon: 'gift', iconPosition }), badge({ icon: 'gift', iconPosition })]) {
      const drawn = draw(node, 'rtl')
      expect([...drawn.node.children].map((child) => child.getAttribute('data-hl-beside') ?? 'text')).toEqual(['icon', 'text'])
      // RTL order is not reversed by hand: no `order`, no `row-reverse`, no `direction` on the surface.
      expect(drawn.node.style.flexDirection).toBe('')
      expect(drawn.node.style.direction).toBe('')
      expectInert(drawn)
    }
  })

  it('a position without an icon means nothing; in a row slot the `iconPosition` field is not read at all', () => {
    expect(draw(button({ iconPosition: 'end' })).node.children).toHaveLength(1)
    const node = { id: 'n', type: 'ListTile', props: { title: lit('Row'), leading: { kind: 'none' }, trailing: { kind: 'text', text: lit('120'), icon: 'coins', iconPosition: 'start' } } }
    const slot = draw(node).node.lastElementChild as HTMLElement
    expect([...slot.children].map((child) => child.getAttribute('data-hl-beside') ?? 'text')).toEqual(['text', 'icon'])
  })
})

describe('`size`: a value outside the list gives `defaultButtonSize`, for buttons and icon buttons', () => {
  it.each(HOSTILE)('%s', (_name, size) => {
    expect(buttonGeometryOf(size)).toEqual(buttonGeometryOf('md'))
    const wide = draw(button({ size }))
    expect(wide.node.style.padding).toBe(MD_PADDING)
    expect(wide.node.style.font).toBe(MD_FONT)
    expectInert(wide)
    const round = draw(iconButton({ size }))
    expect(round.node.style.padding).toBe('var(--product-space-sm)')
    expect(round.node.style.font).toBe(MD_FONT)
    expectInert(round)
  })

  it('the size table is read by OWN key and is not changed by reading', () => {
    const md = buttonGeometryOf('md')
    for (const size of ['constructor', '__proto__', 'toString', 'valueOf']) expect(buttonGeometryOf(size)).toBe(md)
    expect(Object.isFrozen(md) || md.padding.block === 'sm').toBe(true)
    expect(buttonGeometryOf('sm').typography).toBe('bodyM')
    expect(buttonGeometryOf('lg').padding).toEqual({ block: 'md', inline: 'lg' })
  })
})

describe('`variant`: a role outside the list gives a neutral look and the button stays a button', () => {
  it.each(HOSTILE)('%s', (_name, variant) => {
    for (const node of [button({ variant, icon: 'gift' }), iconButton({ variant })]) {
      const drawn = draw(node)
      expect(drawn.node.tagName).toBe('BUTTON')
      expect(drawn.node.style.color).toBe('var(--product-color-on-surface)')
      expect(drawn.node.style.backgroundColor).toBe('')
      // The role name never reaches a border variable name.
      expect(drawn.node.getAttribute('style')).not.toContain('--product-role-button-variant-')
      expectInert(drawn)
    }
  })
})

describe('icon button of the wrong shape', () => {
  const shapes: readonly (readonly [string, unknown])[] = [
    ['no props', { id: 'n', type: 'IconButton' }],
    ['props is null', { id: 'n', type: 'IconButton', props: null }],
    ['props is an array', { id: 'n', type: 'IconButton', props: ['info'] }],
    ['empty props', { id: 'n', type: 'IconButton', props: {} }],
    ['icon only', { id: 'n', type: 'IconButton', props: { icon: 'x' } }],
    ['label is a string', { id: 'n', type: 'IconButton', props: { icon: 'x', label: 'Close' } }],
    ['label is a number', { id: 'n', type: 'IconButton', props: { icon: 'x', label: 42 } }],
    ['label of an unknown kind', { id: 'n', type: 'IconButton', props: { icon: 'x', label: { kind: 'markdown', source: '**x**' } } }],
    ['action is a string', { id: 'n', type: 'IconButton', props: { icon: 'x', label: lit('Close'), action: 'submit' } }],
    ['action is null', { id: 'n', type: 'IconButton', props: { icon: 'x', label: lit('Close'), action: null } }],
    ['children on a leaf', { id: 'n', type: 'IconButton', props: { icon: 'x', label: lit('Close') }, children: [okText, { id: 'deep', type: 'IconButton', props: {} }] }],
    ['style of the wrong shape', { id: 'n', type: 'IconButton', props: { icon: 'x', label: lit('Close') }, style: { padding: CSS, typography: CSS, radius: CSS, color: CSS, border: { width: CSS, color: CSS } } }],
  ]

  it.each(shapes)('%s: drawn as a button of the default size, a click does not throw', (_name, node) => {
    const drawn = draw(node as Record<string, unknown>)
    expect(drawn.node.tagName).toBe('BUTTON')
    expect(drawn.node.style.font).toBe(MD_FONT)
    expect((drawn.node.firstElementChild as HTMLElement).style.inlineSize).toBe('1lh')
    // A leaf: an icon button does not draw children from the document.
    expect(drawn.node.querySelector('[data-hl-node]')).toBeNull()
    drawn.node.click()
    expectInert(drawn)
  })

  it('name: a document string goes into `aria-label` as TEXT, markup and "CSS" stay plain characters', () => {
    for (const text of [MARKUP, CSS, '" onfocus="globalThis.pwned=1', 'a'.repeat(100_000)]) {
      const drawn = draw(iconButton({ label: lit(text) }))
      expect(drawn.node.getAttribute('aria-label')).toBe(text)
      expect(drawn.node.textContent).toBe('')
      expect(drawn.node.getAttribute('onfocus')).toBeNull()
      expectInert(drawn)
    }
    // Server: the attribute is escaped, no new attribute or element appears.
    const html = renderToString(<HotlayoutScreen document={documentWith([iconButton({ label: lit(`"><script>globalThis.pwned=1</script>`) })])} onReport={() => undefined} />)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })

  it('name from the icon: strings only, hyphens become spaces; a non-string gives no name and no exception', () => {
    expect(iconButtonNameOf('', 'chevron-left')).toBe('chevron left')
    expect(iconButtonNameOf(' \n\t ', '---')).toBe('')
    for (const icon of [null, undefined, 7, true, {}, ['x'], { toString: () => 'x', replaceAll: () => 'x' }]) expect(iconButtonNameOf('', icon)).toBe('')
    // A hostile icon string becomes the name as TEXT, and only when there is no label.
    const drawn = draw(iconButton({ icon: MARKUP, label: lit('') }))
    expect(drawn.node.getAttribute('aria-label')).toBe(MARKUP.replaceAll('-', ' ').trim())
    expectInert(drawn)
    expect(draw(iconButton({ icon: MARKUP, label: lit('Close') })).node.getAttribute('aria-label')).toBe('Close')
  })

  it('action: the host receives the same shape as from a button, `type` and string params', () => {
    const seen: unknown[] = []
    const document = documentWith([iconButton({ action: { type: 'share', params: { channel: 'chat', nested: { a: 1 }, count: 2 }, extra: MARKUP } })])
    const view = render(<HotlayoutScreen document={document} onAction={(action, source) => seen.push({ action, node: source.nodeId })} onReport={() => undefined} />)
    view.container.querySelector<HTMLElement>('[data-hl-node="n"]')?.click()
    expect(seen).toEqual([{ action: { type: 'share', params: { channel: 'chat' } }, node: 'n' }])
  })

  it('a thousand icon buttons with a thousand foreign names draw without delay and without growing a mask cache', () => {
    const many = Array.from({ length: 1000 }, (_, index) => ({ id: `b${String(index)}`, type: 'IconButton', props: { icon: `ghost-${String(index)}`, label: lit(''), variant: 'ghost', size: 'sm' } }))
    const started = performance.now()
    const view = render(<HotlayoutScreen document={documentWith(many)} onReport={() => undefined} />)
    expect(performance.now() - started).toBeLessThan(5000)
    expect(view.container.querySelectorAll('button')).toHaveLength(1000)
    expect(view.container.querySelector('[data-hl-node="b7"]')?.getAttribute('aria-label')).toBe('ghost 7')
  })
})
