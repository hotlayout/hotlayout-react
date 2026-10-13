/**
 * THE PARTS OF A LIST ROW THROUGH THE PACKAGE `@hotlayout/react` (schema 9.19.0) — all eight groups of
 * `contract/fixtures/list-tile/list-tile-cases.json`: `lineCases`, `tileCases`, `leadingBoxCases`,
 * `trailingColumnCases`, `rowCases`, `lookCases`, `leadingColorCases`, `documentCases`.
 *
 * The reference and the builder are checked by the builder's own test of the same table; this is the
 * third reader. The geometry groups (`leadingBoxCases`, `trailingColumnCases`, `rowCases`) are
 * numbers of the rule — they go through the functions the row is built by; jsdom has no layout, so
 * the pixels are looked at in Chrome, and here the DOM is checked for the structure that makes the
 * numbers true (the tile is a square of the side, the column is the text over the caption, pressed
 * to the end). The groups about who is drawn in which colour go through a real screen: the colour
 * and the typography of the text, the caption and the icon are compared with what the very same
 * resolver gives for the answer of the row.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { HotlayoutReport, UiDocument } from '../src/index'
import { LIST_TILE_PARTS_LAYOUT, leadingIconBoxOf, leadingIconColorOf, leadingTileOf, listTileRowRects, listTileShownLines, trailingCaptionLookOf, trailingColumnOf, trailingTextLookOf } from '../src/list-tile-parts'
import { PART_STYLE_RULES } from '../src/part-style'
import { colorCss, radiusCss, typographyCss } from '../src/resolve'
import { typographyToCss } from '../src/style'
import type { TextStyleContext } from '../src/style'
import { resolveTheme } from '../src/theme-resolve'
import { isConditionMet } from '../src/conditions'

afterEach(cleanup)

const THEME = resolveTheme(undefined).theme

type Json = Record<string, unknown>
interface Table {
  readonly lineCases: readonly { readonly name: string; readonly natural: number; readonly limit: unknown; readonly expected: { readonly lines: number; readonly cut: boolean } }[]
  readonly tileCases: readonly { readonly name: string; readonly leading: Json; readonly expected: Json | null }[]
  readonly leadingBoxCases: readonly { readonly name: string; readonly leading: Json; readonly glyph: { readonly inline: number; readonly block: number }; readonly expected: Json }[]
  readonly trailingColumnCases: readonly { readonly name: string; readonly textInline: number; readonly textLine: number; readonly caption: { readonly inline: number; readonly line: number } | null; readonly expected: Json }[]
  readonly rowCases: readonly { readonly name: string; readonly rowInline: number; readonly gap: number; readonly direction: 'ltr' | 'rtl'; readonly leading: { readonly inline: number; readonly block: number } | null; readonly trailing: { readonly inline: number; readonly block: number } | null; readonly bodyBlock: number; readonly expected: Json }[]
  readonly lookCases: readonly { readonly name: string; readonly trailing: Json; readonly context: { readonly color: unknown; readonly colorNamed: boolean }; readonly met: readonly string[]; readonly expected: { readonly text: { readonly color: unknown; readonly typography: unknown }; readonly caption: { readonly color: unknown; readonly typography: unknown } } }[]
  readonly leadingColorCases: readonly { readonly name: string; readonly leading: Json; readonly context: { readonly color: unknown; readonly colorNamed: boolean }; readonly expected: unknown }[]
  readonly documentCases: readonly { readonly name: string; readonly props: Json; readonly schema: boolean; readonly codes: readonly string[] }[]
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/list-tile/list-tile-cases.json', 'utf8')) as Table
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as { readonly 'x-style': { readonly layout: Record<string, unknown> } }

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)
const lit = (value: string): Json => ({ kind: 'literal', value })
const nullless = (value: unknown): unknown => (value === undefined ? null : value)

/* ─────────────── a screen with one row ─────────────── */

function documentOf(children: readonly unknown[]): UiDocument {
  return {
    schemaVersion: '9.19.0',
    documentId: 'list-tile-case',
    name: 'list tile',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children } }],
  } as unknown as UiDocument
}

function show(rowProps: Json, options: { readonly data?: Json; readonly namedColor?: unknown; readonly direction?: 'rtl' } = {}): { readonly container: HTMLElement; readonly reports: HotlayoutReport[] } {
  const reports: HotlayoutReport[] = []
  const row = { id: 'tile', type: 'ListTile', props: { title: lit('Title'), ...rowProps } }
  const wrapped = options.namedColor === undefined ? row : { id: 'card', type: 'Container', props: { direction: 'column', gap: 'none' }, style: { color: options.namedColor }, children: [row] }
  const view = render(<HotlayoutScreen document={documentOf([wrapped])} data={options.data ?? {}} onReport={(report) => reports.push(report)} />)
  return { container: view.container, reports }
}

const queryNode = (container: HTMLElement, id: string): HTMLElement => {
  const found = container.querySelector<HTMLElement>(`[data-hl-node="${id}"]`)
  if (found === null) throw new Error(`no node ${id}`)
  return found
}

/** What an element's style is once the browser has accepted a CSS object: the same path for the expected value and the drawn one. */
function accepted(css: Record<string, unknown>): CSSStyleDeclaration {
  const element = document.createElement('div')
  for (const [key, value] of Object.entries(css)) if (value !== undefined) (element.style as unknown as Record<string, unknown>)[key] = value
  return element.style
}

function expectLook(element: HTMLElement, look: { readonly color: unknown; readonly typography: unknown }): void {
  const color = colorCss(look.color, THEME)
  const typography = typographyToCss(typographyCss(look.typography, THEME)) as Record<string, unknown>
  expect(color, 'the colour of the answer resolves').toBeDefined()
  const want = accepted({ color, ...typography })
  expect(element.style.color).toBe(want.color)
  for (const key of Object.keys(typography)) expect((element.style as unknown as Record<string, string>)[key], key).toBe((want as unknown as Record<string, string>)[key])
}

/** A condition that holds with this value: the data the row names in `met`. */
function satisfying(condition: Json): unknown {
  switch (condition.op) {
    case 'gt':
    case 'gte':
      return Number(condition.value) + 1
    case 'lt':
    case 'lte':
      return Number(condition.value) - 1
    case 'isTrue':
      return true
    case 'isFalse':
      return false
    case 'eq':
      return condition.value
    case 'isNotEmpty':
      return 'x'
    default:
      return undefined
  }
}

function dataFor(row: Table['lookCases'][number]): Json {
  const data: Json = {}
  const states = [row.trailing.styleWhen, row.trailing.captionStyleWhen].flatMap((cases) => (Array.isArray(cases) ? (cases as readonly Json[]) : []))
  for (const state of states) {
    const when = state.when as Json
    if (typeof when.path === 'string' && row.met.includes(when.path) && !Object.hasOwn(data, when.path)) data[when.path] = satisfying(when)
  }
  return data
}

/* ─────────────── the table and the blocks ─────────────── */

describe('the parts of a list row: the table and the mirrored blocks', () => {
  it('the table is on the place: the rows are counted, the names do not repeat', () => {
    expect([TABLE.lineCases.length, TABLE.tileCases.length, TABLE.leadingBoxCases.length, TABLE.trailingColumnCases.length, TABLE.rowCases.length, TABLE.lookCases.length, TABLE.leadingColorCases.length, TABLE.documentCases.length]).toEqual([10, 13, 8, 5, 11, 17, 6, 21])
    for (const group of [TABLE.lineCases, TABLE.tileCases, TABLE.leadingBoxCases, TABLE.trailingColumnCases, TABLE.rowCases, TABLE.lookCases, TABLE.leadingColorCases, TABLE.documentCases]) expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
  })

  it('the blocks `partStyle` and `listTileParts` of the package are the blocks of the artifact, whole', () => {
    expect(PART_STYLE_RULES).toEqual(ARTIFACT['x-style'].layout.partStyle)
    expect(LIST_TILE_PARTS_LAYOUT).toEqual(ARTIFACT['x-style'].layout.listTileParts)
  })
})

/* ─────────────── lines ─────────────── */

describe('lineCases: the limit of lines of the title and the subtitle', () => {
  it.each(named(TABLE.lineCases))('%s', (_name, row) => {
    expect(listTileShownLines(row.natural, row.limit)).toEqual(row.expected)
  })

  // The server markup shows the style as written: a DOM implementation drops vendor properties it does not know.
  const markupOf = (props: Json): string => renderToStaticMarkup(<HotlayoutScreen document={documentOf([{ id: 'tile', type: 'ListTile', props: { title: lit('Title'), ...props } }])} />)

  it.each(named(TABLE.lineCases))('on a real screen: %s', (_name, row) => {
    const markup = markupOf({ titleMaxLines: row.limit, subtitle: lit('Subtitle'), subtitleMaxLines: row.limit })
    const valid = typeof row.limit === 'number' && Number.isInteger(row.limit) && row.limit >= 1 && row.limit <= 5
    const clamps = markup.match(/-webkit-line-clamp:(\d+)/g) ?? []
    // Both the title and the subtitle are clamped by a limit that reads, and by none that does not.
    expect(clamps).toEqual(valid ? [`-webkit-line-clamp:${String(row.limit)}`, `-webkit-line-clamp:${String(row.limit)}`] : [])
    // The text is heard whole: the cut is the look of the box, not of the text.
    expect(markup).toContain('>Title<')
    expect(markup).toContain('>Subtitle<')
  })

  it('a limit on the subtitle of a row without a subtitle is not read', () => {
    expect(markupOf({ subtitleMaxLines: 2 })).not.toContain('line-clamp')
  })
})

/* ─────────────── tile ─────────────── */

describe('tileCases and leadingBoxCases: the tile under the leading icon', () => {
  it.each(named(TABLE.tileCases))('%s', (_name, row) => {
    expect(leadingTileOf(row.leading) ?? null).toEqual(row.expected)
  })

  it.each(named(TABLE.tileCases))('on a real screen: %s', (_name, row) => {
    const { container } = show({ leading: row.leading })
    const tile = container.querySelector<HTMLElement>('[data-hl-tile]')
    if (row.expected === null) {
      expect(tile).toBeNull()
      // A row with an icon but no readable tile colour draws the icon as without the field.
      if (row.leading.kind === 'icon') expect(queryNode(container, 'tile').querySelector('[aria-hidden]')).not.toBeNull()
      return
    }
    expect(tile).not.toBeNull()
    const side = `${String(row.expected.size)}px`
    expect(tile?.style.inlineSize).toBe(side)
    expect(tile?.style.blockSize).toBe(side)
    expect(tile?.style.backgroundColor).toBe(accepted({ backgroundColor: colorCss(row.expected.color, THEME) }).backgroundColor)
    expect(tile?.style.borderRadius).toBe(accepted({ borderRadius: radiusCss(row.expected.radius as never, THEME) }).borderRadius)
    expect(tile?.style.overflow).toBe('hidden')
  })

  it.each(named(TABLE.leadingBoxCases))('%s', (_name, row) => {
    expect(leadingIconBoxOf(row.leading, row.glyph)).toEqual(row.expected)
  })

  it('a tile whose colour the theme does not know keeps its box and has no background', () => {
    const { container } = show({ leading: { kind: 'icon', icon: 'gift', tile: { color: 'tileNope', size: 48 } } })
    const tile = container.querySelector<HTMLElement>('[data-hl-tile]')
    expect(tile?.style.inlineSize).toBe('48px')
    expect(tile?.style.backgroundColor).toBe('')
  })
})

/* ─────────────── columns and the row ─────────────── */

describe('trailingColumnCases and rowCases: the numbers of the columns', () => {
  it.each(named(TABLE.trailingColumnCases))('%s', (_name, row) => {
    expect(trailingColumnOf({ textInline: row.textInline, textLine: row.textLine, caption: row.caption ?? undefined })).toEqual({ ...row.expected, captionStart: nullless((row.expected as { captionStart: unknown }).captionStart) ?? undefined })
  })

  it.each(named(TABLE.rowCases))('%s', (_name, row) => {
    const rects = listTileRowRects({ rowInline: row.rowInline, gap: row.gap, direction: row.direction, leading: row.leading ?? undefined, trailing: row.trailing ?? undefined, bodyBlock: row.bodyBlock })
    expect({ block: rects.block, leading: rects.leading ?? null, body: rects.body, trailing: rects.trailing ?? null }).toEqual(row.expected)
  })

  it('the column of a trailing text with a caption: the text over the caption, pressed to the end, never shrinking', () => {
    const { container } = show({ trailing: { kind: 'text', text: lit('+100'), caption: lit('cashback') } })
    const column = container.querySelector<HTMLElement>('[data-hl-trailing-column]')
    expect(column).not.toBeNull()
    expect(column?.style.flexDirection).toBe('column')
    expect(column?.style.alignItems).toBe('flex-end')
    expect(column?.style.flex).toMatch(/^(none|0 0 auto)/)
    const caption = column?.querySelector<HTMLElement>('[data-hl-caption]')
    expect(caption?.textContent).toBe('cashback')
    expect(caption?.style.whiteSpace).toBe('nowrap')
    // The text line comes first.
    expect(column?.firstElementChild?.textContent).toBe('+100')
  })

  it('a caption that shows nothing has no line and takes no room', () => {
    for (const caption of [lit(''), lit('   '), lit(' '.repeat(0))]) {
      const { container } = show({ trailing: { kind: 'text', text: lit('+100'), caption } })
      expect(container.querySelector('[data-hl-caption]')).toBeNull()
      expect(container.querySelector('[data-hl-trailing-column]')).toBeNull()
      cleanup()
    }
  })

  it('a row without the new fields has no tile, no column, no clamp', () => {
    const { container } = show({ leading: { kind: 'icon', icon: 'gift' }, trailing: { kind: 'text', text: lit('+100') } })
    expect(container.querySelector('[data-hl-tile], [data-hl-trailing-column], [data-hl-caption]')).toBeNull()
  })
})

/* ─────────────── looks ─────────────── */

describe('lookCases: the colour and the typography of the trailing text and of the caption', () => {
  it.each(named(TABLE.lookCases))('%s', (_name, row) => {
    const isMet = (condition: never): boolean => row.met.includes((condition as { path: string }).path)
    const context = row.context as unknown as TextStyleContext
    expect(trailingTextLookOf(row.trailing, context, isMet)).toEqual(row.expected.text)
    expect(trailingCaptionLookOf(row.trailing, context, isMet)).toEqual(row.expected.caption)
  })

  it.each(named(TABLE.lookCases))('on a real screen: %s', (_name, row) => {
    const trailing = { kind: 'text', text: lit('SUM'), caption: lit('CAP'), ...row.trailing }
    const data = dataFor(row)
    const { container } = show({ trailing }, { data, ...(row.context.colorNamed ? { namedColor: row.context.color } : {}) })
    // The row holds the conditions to the data of the screen: those the table calls «met» do hold.
    for (const state of [row.trailing.styleWhen, row.trailing.captionStyleWhen].flatMap((cases) => (Array.isArray(cases) ? (cases as readonly Json[]) : []))) {
      const when = state.when as Json
      if (typeof when.path === 'string') expect(isConditionMet(when as never, data), String(when.path)).toBe(row.met.includes(when.path))
    }
    const text = Array.from(container.querySelectorAll<HTMLElement>('span')).find((element) => element.textContent === 'SUM' && element.children.length === 0)
    const caption = container.querySelector<HTMLElement>('[data-hl-caption]')
    expect(text).toBeDefined()
    expectLook(text!, row.expected.text)
    expectLook(caption!, row.expected.caption)
  })
})

describe('leadingColorCases: the colour of the leading icon', () => {
  it.each(named(TABLE.leadingColorCases))('%s', (_name, row) => {
    expect(leadingIconColorOf(row.leading, row.context as unknown as TextStyleContext)).toEqual(row.expected)
  })

  it.each(named(TABLE.leadingColorCases))('on a real screen: %s', (_name, row) => {
    const { container } = show({ leading: row.leading }, row.context.colorNamed ? { namedColor: row.context.color } : {})
    const icon = queryNode(container, 'tile').querySelector<HTMLElement>('[aria-hidden]')
    const want = accepted({ color: colorCss(row.expected, THEME) })
    expect(icon?.style.color).toBe(want.color)
  })
})

/* ─────────────── documents ─────────────── */

describe('documentCases: the reader draws every row and does not fall', () => {
  it.each(named(TABLE.documentCases))('%s', (_name, row) => {
    const { container } = show(row.props)
    expect(queryNode(container, 'tile')).not.toBeNull()
  })

  it('a style of the part with an unknown token keeps the look of the part (the key is skipped)', () => {
    const base = show({ trailing: { kind: 'text', text: lit('SUM') } })
    const baseColor = Array.from(base.container.querySelectorAll<HTMLElement>('span')).find((element) => element.textContent === 'SUM')?.style.color
    cleanup()
    const skipped = show({ trailing: { kind: 'text', text: lit('SUM'), style: { color: 'brandNope', typography: 'typoNope' } } })
    const element = Array.from(skipped.container.querySelectorAll<HTMLElement>('span')).find((entry) => entry.textContent === 'SUM')
    expect(element?.style.color).toBe(baseColor)
    expect(element?.style.color).not.toBe('')
  })

  it('padding of the node is the box of the node on all four sides', () => {
    const { container } = show({}, {})
    cleanup()
    const reports: HotlayoutReport[] = []
    const view = render(<HotlayoutScreen document={documentOf([{ id: 'tile', type: 'ListTile', props: { title: lit('T') }, style: { padding: { top: 'lg', end: 'xs', bottom: 'md', start: 'sm' } } }])} onReport={(report) => reports.push(report)} />)
    const style = queryNode(view.container, 'tile').style
    expect([style.paddingBlockStart, style.paddingInlineEnd, style.paddingBlockEnd, style.paddingInlineStart].every((side) => side !== '')).toBe(true)
    expect(container).toBeDefined()
  })
})
