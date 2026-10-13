/**
 * The "icon beside text" case table through the `@hotlayout/react` package:
 * `contract/fixtures/icon-text/icon-text-cases.json` (schema 9.5.0).
 *
 * The reference implementation, canvas and preview model are checked by
 * the builder's own test of the same table; this is the web reader. The package imports nothing from
 * `src/`, so the rule is written a second time there (`style.ts`) and this table keeps the copies
 * together.
 *
 * Every row goes TWO ways:
 *  1. the package mirrors of the rule (`iconBesideTextOrder`, `buttonGeometryOf`,
 *     `iconButtonNameOf`) give the same answer as the table;
 *  2. a real `HotlayoutScreen`: the node is built from the row and the answer is read from the
 *     drawn markup — child order, padding and font tokens in the inline style, `aria-label`,
 *     colour.
 *
 * HOW NUMBERS ARE CHECKED. jsdom computes no layout, so pixels cannot be measured here. The package
 * writes geometry as TOKENS (`var(--product-space-xs)`, `var(--product-font-body-m)`, `1em`,
 * `1lh`); the test reads the tokens from the markup and computes the number from the table `theme`
 * block — the same built-in theme values the rows rely on (and checks that the package built-in
 * theme holds exactly them). Real pixels are measured by a browser, not by this file.
 *
 * NO ROWS ARE SKIPPED: all 39, including those marked `readerOnly`.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { BUILT_IN_THEME_CONTRACT, HotlayoutScreen } from '../src/index'
import type { UiDocument, UiNode } from '../src/index'
import { MIRRORED_ICONS } from '../src/icons'
import { buttonGeometryOf, DEFAULT_BUTTON_SIZE, ICON_BESIDE_TEXT, glyphTypographyOf, ICON_BUTTON, iconBesideTextOrder, iconButtonNameOf, iconPositionOf, LIST_TILE_ICON_SIZES, LIST_TILE_TRAILING_COLOR } from '../src/layout-rules'
afterEach(cleanup)

type Part = 'icon' | 'text'
interface Metric {
  readonly fontSize: number
  readonly lineHeight: number
}
interface OrderCase {
  readonly name: string
  readonly widget: 'Button' | 'Badge' | 'ListTile'
  readonly props: { readonly icon?: unknown; readonly iconPosition?: unknown }
  readonly direction: 'ltr' | 'rtl'
  readonly readerOnly?: boolean
  readonly expect: { readonly logical: readonly Part[]; readonly visual: readonly Part[]; readonly drawn: boolean; readonly mirrored: boolean }
}
interface GlyphCase {
  readonly name: string
  readonly widget: 'Button' | 'Badge' | 'ListTile'
  readonly size?: string
  readonly typography: string
  readonly expect: { readonly glyph: number; readonly boxInline: number; readonly boxBlock: number; readonly gap: number; readonly addsInline: number; readonly addsBlock: number }
}
interface ButtonSizeCase {
  readonly name: string
  readonly size: string | null
  readonly border: number
  readonly readerOnly?: boolean
  readonly expect: { readonly paddingBlock: number; readonly paddingInline: number; readonly typography: string; readonly block: number }
}
interface IconButtonCase {
  readonly name: string
  readonly size: string
  readonly border: number
  readonly readerOnly?: boolean
  readonly expect: { readonly side: number; readonly glyph: number; readonly padding: number }
}
interface NameCase {
  readonly name: string
  readonly label: string
  readonly icon: unknown
  readonly expect: string
}
interface ColorCase {
  readonly name: string
  readonly named: string | null
  readonly expect: { readonly text: string; readonly icon: string }
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/icon-text/icon-text-cases.json', 'utf8')) as {
  readonly theme: { readonly spacing: Readonly<Record<string, number>>; readonly typography: Readonly<Record<string, Metric>> }
  readonly gap: string
  readonly orderCases: readonly OrderCase[]
  readonly glyphCases: readonly GlyphCase[]
  readonly buttonSizeCases: readonly ButtonSizeCase[]
  readonly iconButtonCases: readonly IconButtonCase[]
  readonly nameCases: readonly NameCase[]
  readonly colorCases: readonly ColorCase[]
}

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)
const space = (token: string): number => TABLE.theme.spacing[token] ?? Number.NaN
const metric = (token: string): Metric => TABLE.theme.typography[token] ?? { fontSize: Number.NaN, lineHeight: Number.NaN }
/** A font line in pixels, rounded the way the table names it (18 x 1.3333 is 24). */
const line = (token: string): number => Math.round(metric(token).fontSize * metric(token).lineHeight)

const camel = (kebab: string): string => kebab.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
/** A spacing token from `var(--product-space-xs)`. */
const spaceTokenOf = (css: string): string => camel(/^var\(--product-space-([a-z-]+)\)$/.exec(css.trim())?.[1] ?? `not-a-token:${css}`)
/** A font token from `var(--product-font-body-m)`. */
const fontTokenOf = (css: string): string => camel(/^var\(--product-font-([a-z-]+)\)$/.exec(css.trim())?.[1] ?? `not-a-token:${css}`)
/** A colour token from `var(--product-color-on-surface)`. */
const colorTokenOf = (css: string): string => camel(/^var\(--product-color-([a-z-]+)\)$/.exec(css.trim())?.[1] ?? `not-a-token:${css}`)

const lit = (value: string): Record<string, unknown> => ({ kind: 'literal', value })

function documentOf(node: UiNode): UiDocument {
  return { schemaVersion: '9.5.0', documentId: 'icon-text-case', name: 'Case', initialScreenId: 's', screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children: [node] } }] }
}

/** Node `n` drawn by the package in this writing direction. */
function drawn(node: UiNode, direction: 'ltr' | 'rtl' = 'ltr'): { readonly root: HTMLElement; readonly host: HTMLElement } {
  const view = render(<HotlayoutScreen document={documentOf(node)} dir={direction} onReport={() => undefined} />)
  const host = view.container.querySelector<HTMLElement>('[data-hl-node="n"]')
  const root = view.container.querySelector<HTMLElement>('[data-hotlayout]')
  if (host === null || root === null) throw new Error('node was not drawn')
  return { root, host }
}

function nodeOf(widget: 'Button' | 'Badge' | 'ListTile' | 'IconButton', props: Record<string, unknown>, extra: Partial<UiNode> = {}): UiNode {
  const base: Record<string, Record<string, unknown>> = {
    Button: { label: lit('Redeem'), variant: 'primary', action: { type: 'none' }, fullWidth: false },
    Badge: { label: lit('52 days left'), tone: 'neutral' },
    ListTile: { title: lit('Coffee voucher'), leading: { kind: 'none' }, trailing: { kind: 'none' } },
    IconButton: { icon: 'info', label: lit('About'), variant: 'primary', size: 'md', action: { type: 'none' } },
  }
  return { id: 'n', type: widget, props: { ...base[widget], ...props }, ...extra }
}

/** The place where the icon and the text stand: the button or badge surface itself, or the trailing slot of a row. */
function placeOf(host: HTMLElement, widget: OrderCase['widget']): HTMLElement {
  if (widget !== 'ListTile') return host
  const slot = host.lastElementChild
  if (!(slot instanceof HTMLElement)) throw new Error('row slot was not drawn')
  return slot
}

const isIconPart = (element: Element): boolean => element.getAttribute('data-hl-beside') === 'icon'

/** Parts in MARKUP order, that is in writing direction. A place without element children is the text itself. */
function partsOf(place: HTMLElement): readonly Part[] {
  const children = [...place.children]
  return children.length === 0 ? ['text'] : children.map((child) => (isIconPart(child) ? 'icon' : 'text'))
}

describe('case table: structure and theme', () => {
  it('the table has 39 rows and names within a group are unique', () => {
    const groups = [TABLE.orderCases, TABLE.glyphCases, TABLE.buttonSizeCases, TABLE.iconButtonCases, TABLE.nameCases, TABLE.colorCases]
    expect(groups.reduce((sum, rows) => sum + rows.length, 0)).toBe(39)
    for (const rows of groups) expect(new Set(rows.map((row) => row.name)).size).toBe(rows.length)
  })

  it('the theme numbers in the table are values of the package BUILT-IN theme', () => {
    const theme = BUILT_IN_THEME_CONTRACT.themes[BUILT_IN_THEME_CONTRACT.defaultThemeId] as unknown as { spacing: Record<string, number>; typography: Record<string, Metric> }
    for (const [token, value] of Object.entries(TABLE.theme.spacing)) expect(theme.spacing[token], token).toBe(value)
    for (const [token, value] of Object.entries(TABLE.theme.typography)) {
      expect(theme.typography[token]?.fontSize, token).toBe(value.fontSize)
      expect(theme.typography[token]?.lineHeight, token).toBe(value.lineHeight)
    }
  })

  it('the words the table refers to are the same as in the package mirrors', () => {
    expect(TABLE.gap).toBe(ICON_BESIDE_TEXT.gap)
    expect(ICON_BESIDE_TEXT.crossAlign).toBe('center')
    expect(ICON_BESIDE_TEXT.color).toBe('text')
    expect(ICON_BESIDE_TEXT.defaultPosition).toBe('start')
    expect(DEFAULT_BUTTON_SIZE).toBe('md')
    expect(ICON_BUTTON.radius).toBe('pill')
  })
})

/* -------------------------------------------------------------------------- */
/* Order of parts                                                              */
/* -------------------------------------------------------------------------- */

/** The position at a place that does not ask for it (a row slot) is a word from `places`. */
function positionOf(row: OrderCase): unknown {
  const place = ICON_BESIDE_TEXT.places[row.widget]
  return place.position === 'iconPosition' ? row.props.iconPosition : place.position
}

describe('order of parts: the rule mirror', () => {
  it.each(named(TABLE.orderCases))('%s', (_name, row) => {
    const logical = iconBesideTextOrder(row.props.icon, positionOf(row))
    expect(logical).toEqual(row.expect.logical)
    // Only the writing direction turns the left-to-right logical order around.
    expect(row.direction === 'rtl' ? [...logical].reverse() : logical).toEqual(row.expect.visual)
  })

  it('an unknown position word, a non-string and a prototype name give the contract default', () => {
    for (const position of [undefined, null, 'above', 'START', 'constructor', '__proto__', 1, {}, ['end']]) expect(iconPositionOf(position)).toBe('start')
    expect(iconPositionOf('end')).toBe('end')
  })
})

describe('order of parts: HotlayoutScreen', () => {
  it.each(named(TABLE.orderCases))('%s', (_name, row) => {
    const props: Record<string, unknown> =
      row.widget === 'ListTile' ? { trailing: { kind: 'text', text: lit('1 850'), ...(row.props.icon === undefined ? {} : { icon: row.props.icon }) } } : { ...row.props }
    const { root, host } = drawn(nodeOf(row.widget, props), row.direction)
    const place = placeOf(host, row.widget)

    // The markup order is LOGICAL...
    expect(partsOf(place)).toEqual(row.expect.logical)
    // ...and the row direction swaps the sides: the root carries `dir` and the reader does not reverse the order itself.
    expect(root.getAttribute('dir')).toBe(row.direction)
    expect(place.style.flexDirection).toBe('')
    expect(place.style.direction).toBe('')
    for (const child of place.children) expect((child as HTMLElement).style.order).toBe('')

    const icon = [...place.children].find(isIconPart) as HTMLElement | undefined
    expect(icon !== undefined).toBe(row.expect.logical.includes('icon'))
    if (icon === undefined) return

    // The icon is decorative; the box is in place even when there is nothing to draw.
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    const glyph = icon.firstElementChild as HTMLElement
    expect(glyph.style.inlineSize).toBe('1em')
    expect(glyph.style.blockSize).toBe('1lh')
    // When drawn, the set mask is present; a name outside the set or a non-string leaves a box without a mask.
    expect(glyph.style.maskImage !== '').toBe(row.expect.drawn)
    if (row.expect.drawn) expect(glyph.style.maskImage).toContain('data:image/svg+xml')
    // The gap stays in both cases.
    expect(spaceTokenOf(place.style.gap)).toBe(TABLE.gap)
    // Mirroring is separate from the order, happens exactly once, and only for names in the contract list.
    expect(glyph.style.scale === '-1 1').toBe(row.expect.mirrored)
    expect(row.expect.mirrored).toBe(row.direction === 'rtl' && typeof row.props.icon === 'string' && MIRRORED_ICONS.includes(row.props.icon))
    expect(host.outerHTML.match(/scale: -1 1/g)?.length ?? 0).toBe(row.expect.mirrored ? 1 : 0)
  })
})

/* -------------------------------------------------------------------------- */
/* Icon size and gap                                                    */
/* -------------------------------------------------------------------------- */

describe('icon size and gap: HotlayoutScreen', () => {
  it.each(named(TABLE.glyphCases))('%s', (_name, row) => {
    const place = ICON_BESIDE_TEXT.places[row.widget]
    const props: Record<string, unknown> =
      row.widget === 'ListTile' ? { trailing: { kind: 'text', text: lit('120'), icon: 'coins' } } : { icon: 'gift', ...(row.size === undefined ? {} : { size: row.size }) }
    const host = placeOf(drawn(nodeOf(row.widget, props)).host, row.widget)
    const icon = [...host.children].find(isIconPart) as HTMLElement
    const glyph = icon.firstElementChild as HTMLElement

    /*
     * The font in which the icon is "set". Size `'text'` means the font of the text beside it: the
     * icon has no font of its own and inherits the surface font. In a row slot it is the step of the
     * icon scale named by the place, on the icon box itself.
     */
    const token = place.glyph === 'text' ? fontTokenOf(host.style.font) : fontTokenOf(icon.style.font)
    if (place.glyph === 'text') expect(icon.style.font).toBe('')
    else expect(token).toBe(glyphTypographyOf(LIST_TILE_ICON_SIZES.trailingIcon))
    expect(token).toBe(row.typography)

    // The glyph is one font size wide and one line of this font high.
    expect(glyph.style.inlineSize).toBe('1em')
    expect(glyph.style.blockSize).toBe('1lh')
    expect(metric(token).fontSize).toBe(row.expect.glyph)
    expect(metric(token).fontSize).toBe(row.expect.boxInline)
    expect(line(token)).toBe(row.expect.boxBlock)

    // The gap is a scale step; the widget grows by exactly the box plus the gap.
    const gap = space(spaceTokenOf(host.style.gap))
    expect(gap).toBe(row.expect.gap)
    expect(metric(token).fontSize + gap).toBe(row.expect.addsInline)

    /*
     * The widget does not get taller. In a button and a badge the icon box is a line of the SAME font
     * as the label; in a row slot it is a line of a smaller font (16) inside a text line (20). The box
     * has no padding of its own and is centred.
     */
    for (const side of ['padding', 'margin', 'blockSize', 'minBlockSize'] as const) expect(icon.style[side]).toBe('')
    expect(host.style.alignItems).toBe(ICON_BESIDE_TEXT.crossAlign)
    expect(row.expect.addsBlock).toBe(0)
    if (place.glyph !== 'text') expect(line(token)).toBeLessThanOrEqual(line(fontTokenOf(host.style.font)))
  })
})

/* -------------------------------------------------------------------------- */
/* Button sizes and the icon button                                              */
/* -------------------------------------------------------------------------- */

/** The built-in `primary` role has no border, `secondary` has a hairline one. */
const variantWithBorder = (border: number): string => (border === 0 ? 'primary' : 'secondary')

/** The role border width on the drawn surface, in pixels: the width variable is declared by the screen root. */
function borderOf(root: HTMLElement, host: HTMLElement): number {
  const style = host.getAttribute('style') ?? ''
  const variable = /border: var\((--[a-z0-9-]+)\) solid /.exec(style)?.[1]
  // A role without a border slot: `border: none` means neither a border nor room for one. The surface has no other (numeric) border.
  if (variable === undefined) {
    expect(style).not.toMatch(/border[a-z-]*: [^;]*\dpx/)
    return 0
  }
  return Number.parseFloat(root.style.getPropertyValue(variable))
}

describe('button sizes', () => {
  it.each(named(TABLE.buttonSizeCases))('%s', (_name, row) => {
    // The rule mirror.
    const geometry = buttonGeometryOf(row.size ?? undefined)
    expect(space(geometry.padding.block)).toBe(row.expect.paddingBlock)
    expect(space(geometry.padding.inline)).toBe(row.expect.paddingInline)
    expect(geometry.typography).toBe(row.expect.typography)

    // Real screen: padding and font appear in the markup as tokens.
    const { root, host } = drawn(nodeOf('Button', { variant: variantWithBorder(row.border), ...(row.size === null ? {} : { size: row.size }) }))
    const [block, inline] = host.style.padding.split(' ')
    expect(space(spaceTokenOf(block ?? ''))).toBe(row.expect.paddingBlock)
    expect(space(spaceTokenOf(inline ?? ''))).toBe(row.expect.paddingInline)
    expect(fontTokenOf(host.style.font)).toBe(row.expect.typography)
    const border = borderOf(root, host)
    expect(border).toBe(row.border)
    // Height is the label line plus padding and border; the button has no minimum size for a finger.
    expect(line(fontTokenOf(host.style.font)) + 2 * space(spaceTokenOf(block ?? '')) + 2 * border).toBe(row.expect.block)
    for (const side of ['minBlockSize', 'minHeight', 'blockSize', 'height'] as const) expect(host.style[side]).toBe('')
    // The size is not written into the node when drawing: the radius does not depend on it.
    expect(host.style.borderRadius).toBe('var(--product-radius-md)')
  })
})

describe('icon button', () => {
  it.each(named(TABLE.iconButtonCases))('%s', (_name, row) => {
    const geometry = buttonGeometryOf(row.size)
    expect(space(geometry.padding.block)).toBe(row.expect.padding)
    expect(metric(geometry.typography).fontSize).toBe(row.expect.glyph)

    const { root, host } = drawn(nodeOf('IconButton', { variant: variantWithBorder(row.border), size: row.size }))
    expect(host.tagName).toBe('BUTTON')
    // The padding is ONE step on all four sides: the vertical padding of a button of this size.
    const padding = space(spaceTokenOf(host.style.padding))
    expect(padding).toBe(row.expect.padding)
    const token = fontTokenOf(host.style.font)
    // The content box is a square one font line wide; the glyph is one font size, centred.
    const box = host.firstElementChild as HTMLElement
    expect(box.style.inlineSize).toBe('1lh')
    expect(box.style.blockSize).toBe('1lh')
    expect(box.style.alignItems).toBe('center')
    expect(box.style.justifyContent).toBe('center')
    const glyph = box.firstElementChild as HTMLElement
    expect(glyph.style.inlineSize).toBe('1em')
    expect(metric(token).fontSize).toBe(row.expect.glyph)
    const border = borderOf(root, host)
    expect(border).toBe(row.border)
    expect(line(token) + 2 * padding + 2 * border).toBe(row.expect.side)
    expect(host.style.borderRadius).toBe(`var(--product-radius-${ICON_BUTTON.radius})`)
    for (const side of ['minBlockSize', 'minInlineSize', 'blockSize', 'inlineSize'] as const) expect(host.style[side]).toBe('')
  })

  it.each(named(TABLE.nameCases))('name: %s', (_name, row) => {
    expect(iconButtonNameOf(row.label, row.icon)).toBe(row.expect)

    const { host } = drawn(nodeOf('IconButton', { icon: row.icon, label: lit(row.label) }))
    // The button is drawn even when there is nothing to name it by.
    expect(host.tagName).toBe('BUTTON')
    expect(host.getAttribute('aria-label') ?? '').toBe(row.expect)
    // The name is not drawn on screen: the button has no visible text.
    expect(host.textContent).toBe('')
  })
})

/* -------------------------------------------------------------------------- */
/* Colour of the trailing row text and the icon beside it                              */
/* -------------------------------------------------------------------------- */

describe('colour of the trailing row text and the icon beside it', () => {
  it.each(named(TABLE.colorCases))('%s', (_name, row) => {
    expect({ text: row.named ?? LIST_TILE_TRAILING_COLOR, icon: row.named ?? LIST_TILE_TRAILING_COLOR }).toEqual(row.expect)

    const node = nodeOf('ListTile', { trailing: { kind: 'text', text: lit('120'), icon: 'coins' } }, row.named === null ? {} : { style: { color: row.named } })
    const slot = placeOf(drawn(node).host, 'ListTile')
    const icon = [...slot.children].find(isIconPart) as HTMLElement
    expect(colorTokenOf(slot.style.color)).toBe(row.expect.text)
    expect(colorTokenOf(icon.style.color)).toBe(row.expect.icon)
    // The glyph takes the colour of its box, not one of its own.
    expect((icon.firstElementChild as HTMLElement).style.backgroundColor).toBe('currentcolor')
  })
})
