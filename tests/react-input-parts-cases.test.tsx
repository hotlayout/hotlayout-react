/**
 * THE PARTS OF A TEXT FIELD THROUGH THE PACKAGE `@hotlayout/react` (schema 9.19.0) — the five new groups of `contract/fixtures/inputs/input-cases.json`:
 * `fieldBoxCases`, `affixRowCases`, `counterCases`, `noteRowCases`, `partsDocumentCases`.
 *
 * The numbers of the rule (`fieldBoxHeightOf`, `affixRowOf`, `noteRowOf`) go through the functions the field is
 * built by; jsdom has no layout, so the pixels are looked at in Chrome and here the DOM is checked for the
 * structure that makes them true — the box is the wrapper of the field when there is a mark, the marks never
 * shrink, the counter stands after the live region and is not in it. The text of the counter goes through a
 * real screen with the value in the data.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen } from '../src/index'
import type { HotlayoutReport, UiDocument } from '../src/index'
import { affixRowOf, fieldBoxHeightOf, FIELD_AFFIX_TEXT_MAX, INPUT_PARTS_LAYOUT, inputCounterText, noteRowOf } from '../src/input-parts'

afterEach(cleanup)

type Json = Record<string, unknown>
interface Table {
  readonly fieldBoxCases: readonly { readonly name: string; readonly metrics: { readonly textLine: number; readonly paddingBlock: number }; readonly lines: number; readonly height?: unknown; readonly borderWidth?: unknown; readonly expect: number }[]
  readonly affixRowCases: readonly { readonly name: string; readonly boxInline: number; readonly border: number; readonly paddingInline: number; readonly gap: number; readonly prefix?: number; readonly suffix?: number; readonly expect: Json; readonly rtl?: Json }[]
  readonly counterCases: readonly { readonly name: string; readonly props: Json; readonly shown: string; readonly expect: string | null }[]
  readonly noteRowCases: readonly { readonly name: string; readonly rowInline: number; readonly gap: number; readonly counter?: number; readonly expect: Json; readonly rtl?: Json }[]
  readonly partsDocumentCases: readonly { readonly name: string; readonly props: Json; readonly schema: boolean; readonly codes: readonly string[] }[]
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/inputs/input-cases.json', 'utf8')) as Table
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as { readonly 'x-style': { readonly layout: Record<string, unknown> } }

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)
const lit = (value: string): Json => ({ kind: 'literal', value })
const nullless = (value: unknown): unknown => (value === undefined ? null : value)

function documentOf(children: readonly unknown[]): UiDocument {
  return {
    schemaVersion: '9.19.0',
    documentId: 'input-parts-case',
    name: 'input parts',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children } }],
  } as unknown as UiDocument
}

function show(fieldProps: Json, options: { readonly data?: Json; readonly locale?: string; readonly reports?: HotlayoutReport[] } = {}): HTMLElement {
  const node = { id: 'field', type: 'TextField', props: { label: lit('Label'), value: { kind: 'binding', path: 'user.firstName' }, ...fieldProps } }
  const view = render(<HotlayoutScreen document={documentOf([node])} data={options.data ?? {}} onReport={(report) => options.reports?.push(report)} />)
  return view.container
}

const input = (container: HTMLElement): HTMLInputElement => {
  const found = container.querySelector<HTMLInputElement>('input, textarea')
  if (found === null) throw new Error('no field')
  return found
}

describe('the parts of a text field: the table and the mirrored block', () => {
  it('the table is on the place: the rows are counted, the names do not repeat', () => {
    expect([TABLE.fieldBoxCases.length, TABLE.affixRowCases.length, TABLE.counterCases.length, TABLE.noteRowCases.length, TABLE.partsDocumentCases.length]).toEqual([16, 7, 16, 4, 20])
    for (const group of [TABLE.fieldBoxCases, TABLE.affixRowCases, TABLE.counterCases, TABLE.noteRowCases, TABLE.partsDocumentCases]) expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
  })

  it('the block `inputParts` of the package is the block of the artifact, whole', () => {
    expect(INPUT_PARTS_LAYOUT).toEqual(ARTIFACT['x-style'].layout.inputParts)
    expect(FIELD_AFFIX_TEXT_MAX).toBe(8)
  })
})

describe('fieldBoxCases: the height of the box of the field', () => {
  it.each(named(TABLE.fieldBoxCases))('%s', (_name, row) => {
    expect(fieldBoxHeightOf(row.metrics, { lines: row.lines, height: row.height, borderWidth: row.borderWidth })).toBe(row.expect)
  })

  it.each(named(TABLE.fieldBoxCases))('on a real screen: %s', (_name, row) => {
    const box = input(show({ lines: row.lines, ...(row.height === undefined ? {} : { fieldHeight: row.height }), ...(row.borderWidth === undefined ? {} : { fieldBorderWidth: row.borderWidth }) }))
    const named = row.lines === 1 && typeof row.height === 'number' && Number.isInteger(row.height) && row.height >= 32 && row.height <= 120
    const width = typeof row.borderWidth === 'number' && Number.isInteger(row.borderWidth) && row.borderWidth >= 1 && row.borderWidth <= 4 ? row.borderWidth : 1
    if (named) {
      // Exact: the border does not add to it; the content is centred, the vertical padding does not apply.
      expect(box.style.blockSize).toBe(`${String(row.height)}px`)
      expect(box.style.paddingBlock).toMatch(/^0(px)?$/)
    } else {
      expect(box.style.blockSize).toContain(`${String(2 * width)}px`)
      expect(box.style.blockSize).toContain(`${String(row.lines)}lh`)
    }
    expect(box.style.border).toContain(`${String(width)}px solid`)
  })
})

describe('affixRowCases: the row inside the box', () => {
  it.each(named(TABLE.affixRowCases))('%s', (_name, row) => {
    const result = affixRowOf({ boxInline: row.boxInline, border: row.border, paddingInline: row.paddingInline, gap: row.gap, prefix: row.prefix, suffix: row.suffix })
    expect({ ...result, prefixStart: nullless(result.prefixStart), suffixStart: nullless(result.suffixStart) }).toEqual(row.expect)
    // In a right-to-left screen the left edge is «box − start − width» (the rows with «rtl» give it).
    if (row.rtl !== undefined) {
      expect(row.boxInline - (result.prefixStart ?? 0) - (row.prefix ?? 0)).toBe(row.rtl.prefixX)
      expect(row.boxInline - result.textStart - result.textInline).toBe(row.rtl.textX)
      expect(row.boxInline - (result.suffixStart ?? 0) - (row.suffix ?? 0)).toBe(row.rtl.suffixX)
    }
  })

  it('the box is the wrapper of the field when there is a mark: [mark, field, mark] in this order, the field bare, the marks never shrink', () => {
    const container = show({ prefix: { kind: 'icon', icon: 'mail' }, suffix: { kind: 'text', text: lit('₴') } })
    const box = container.querySelector<HTMLElement>('[data-hl-field-box]')!
    expect(box).not.toBeNull()
    expect(Array.from(box.children).map((child) => child.getAttribute('data-hl-affix') ?? child.tagName.toLowerCase())).toEqual(['icon', 'input', 'text'])
    expect(box.style.display).toBe('flex')
    expect(box.style.border).toContain('solid')
    const field = input(container)
    expect(field.style.border).not.toContain('solid')
    expect(field.style.flex).toMatch(/^1/)
    for (const mark of Array.from(box.querySelectorAll<HTMLElement>('[data-hl-affix]'))) expect(mark.style.flex).toMatch(/^(none|0 0 auto)/)
  })

  it('the sides are logical: the same order of the DOM, and the screen direction turns the row', () => {
    const view = render(
      <HotlayoutScreen
        document={{ ...documentOf([{ id: 'field', type: 'TextField', props: { label: lit('L'), value: { kind: 'binding', path: 'user.firstName' }, prefix: { kind: 'text', text: lit('A') }, suffix: { kind: 'text', text: lit('B') } } }]), localization: { sourceLocale: 'ar', locales: ['ar'], translations: {} } } as unknown as UiDocument}
        locale="ar"
      />,
    )
    const box = view.container.querySelector<HTMLElement>('[data-hl-field-box]')!
    expect(Array.from(box.querySelectorAll('[data-hl-affix]')).map((mark) => mark.textContent)).toEqual(['A', 'B'])
    expect(view.container.querySelector('[dir="rtl"]')).not.toBeNull()
    // The direction of the CONTENT is not changed: a mail goes left to right in the box of a right-to-left screen.
    cleanup()
    const mail = show({ keyboard: 'email', prefix: { kind: 'text', text: lit('@') } })
    expect(input(mail).getAttribute('dir')).toBe('ltr')
    expect(mail.querySelector('[data-hl-field-box]')?.getAttribute('dir')).toBeNull()
  })

  it('a mark is not the value: it is never written, and a press on it puts the focus in the field', () => {
    const writes: unknown[] = []
    const view = render(<HotlayoutScreen document={documentOf([{ id: 'field', type: 'TextField', props: { label: lit('L'), value: { kind: 'binding', path: 'user.firstName' }, suffix: { kind: 'text', text: lit('kg') } } }])} onWrite={(...args) => writes.push(args)} />)
    const mark = view.container.querySelector<HTMLElement>('[data-hl-affix="text"]')!
    fireEvent.mouseDown(mark)
    expect(document.activeElement).toBe(input(view.container))
    fireEvent.change(input(view.container), { target: { value: '70' } })
    expect(writes).toEqual([['user.firstName', '70']])
  })

  it('the text of a mark is cut to eight code points of the shown text; an empty one is no mark at all, with no gap', () => {
    const container = show({ prefix: { kind: 'text', text: lit('1234567😀9') }, suffix: { kind: 'text', text: lit('   ') } })
    expect(container.querySelector('[data-hl-affix="text"]')?.textContent).toBe('1234567😀')
    expect(container.querySelectorAll('[data-hl-affix]')).toHaveLength(1)
    cleanup()
    const none = show({ prefix: { kind: 'text', text: lit('') } })
    expect(none.querySelector('[data-hl-field-box], [data-hl-affix]')).toBeNull()
  })

  it('the text of a mark is read with the field (aria-describedby), an icon is not', () => {
    const container = show({ prefix: { kind: 'icon', icon: 'mail' }, suffix: { kind: 'text', text: lit('₴') } })
    const markText = container.querySelector<HTMLElement>('[data-hl-affix="text"]')!
    expect(markText.id).not.toBe('')
    expect(input(container).getAttribute('aria-describedby')).toBe(markText.id)
    expect(container.querySelector<HTMLElement>('[data-hl-affix="icon"]')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('an icon the set does not have is an empty box of the same size, and the gap stays', () => {
    const container = show({ prefix: { kind: 'icon', icon: 'no-such-icon' } })
    const mark = container.querySelector<HTMLElement>('[data-hl-affix="icon"]')!
    expect(mark).not.toBeNull()
    expect(mark.firstElementChild?.getAttribute('data-hl-glyph')).toBe('no-such-icon')
  })
})

describe('counterCases: the text of the counter', () => {
  it.each(named(TABLE.counterCases))('%s', (_name, row) => {
    expect(inputCounterText(row.props, row.shown) ?? null).toBe(row.expect)
  })

  it.each(named(TABLE.counterCases))('on a real screen: %s', (_name, row) => {
    const container = show(row.props, { data: { 'user.firstName': row.shown } })
    const counter = container.querySelector<HTMLElement>('[data-hl-counter]')
    if (row.expect === null) expect(counter).toBeNull()
    else expect(counter?.textContent).toBe(row.expect)
  })

  it('the counter follows what the person types, counting what is SHOWN', () => {
    const container = show({ counter: true, maxLength: 10 })
    const field = input(container)
    fireEvent.focus(field)
    fireEvent.change(field, { target: { value: '😀a😀' } })
    expect(container.querySelector('[data-hl-counter]')?.textContent).toBe('3 / 10')
  })
})

describe('noteRowCases: the row under the box', () => {
  it.each(named(TABLE.noteRowCases))('%s', (_name, row) => {
    const result = noteRowOf({ rowInline: row.rowInline, gap: row.gap, counter: row.counter })
    expect({ ...result, counterStart: nullless(result.counterStart) }).toEqual(row.expect)
    if (row.rtl !== undefined) expect(row.rowInline - (result.counterStart ?? 0) - (row.counter ?? 0)).toBe(row.rtl.counterX)
  })

  it('the row: the note from the start takes the rest and wraps, the counter is one line and never shrinks; the live region is always there and the counter is not in it', () => {
    const container = show({ counter: true, maxLength: 20, helper: lit('Only your first name') })
    const row = container.querySelector<HTMLElement>('[data-hl-note-row]')!
    expect(row.style.display).toBe('flex')
    const [live, counter] = Array.from(row.children) as HTMLElement[]
    expect(live?.getAttribute('aria-live')).toBe('polite')
    expect(live?.textContent).toBe('Only your first name')
    expect(counter?.getAttribute('data-hl-counter')).toBe('')
    expect(counter?.style.flex).toMatch(/^(none|0 0 auto)/)
    expect(counter?.style.whiteSpace).toBe('pre')
    expect(live?.contains(counter ?? null)).toBe(false)
    // The counter is read with the field and is not announced on every key.
    expect(input(container).getAttribute('aria-describedby')).toContain(counter?.id ?? 'x')
  })

  it('without a note the row holds the counter alone, and the live region is there', () => {
    const container = show({ counter: true, maxLength: 20 })
    const row = container.querySelector<HTMLElement>('[data-hl-note-row]')!
    expect(row.querySelector('[aria-live]')).not.toBeNull()
    expect(row.textContent).toBe('0 / 20')
  })

  it('without a counter there is no row: the note stays as before', () => {
    const container = show({ helper: lit('Hint') })
    expect(container.querySelector('[data-hl-note-row], [data-hl-counter]')).toBeNull()
    expect(container.querySelector('[aria-live]')?.textContent).toBe('Hint')
  })
})

describe('partsDocumentCases: the reader draws every field and does not fall; what it does not read it skips', () => {
  it.each(named(TABLE.partsDocumentCases))('%s', (_name, row) => {
    const reports: HotlayoutReport[] = []
    const container = show(row.props, { reports })
    expect(container.querySelector('[data-hl-node="field"]')).not.toBeNull()
    expect(input(container)).not.toBeNull()
  })

  it('a width of the border, a height or a radius out of range is the built-in value', () => {
    for (const props of [{ fieldBorderWidth: 0 }, { fieldBorderWidth: 5 }]) {
      expect(input(show(props)).style.border).toContain('1px solid')
      cleanup()
    }
    expect(input(show({ fieldHeight: 31 })).style.blockSize).toContain('calc(')
    cleanup()
    expect(input(show({ fieldHeight: 121 })).style.blockSize).toContain('calc(')
    cleanup()
    expect(input(show({ fieldRadius: 300 })).style.borderRadius).toBe(input(show({})).style.borderRadius)
  })

  it('a field that names a height and several lines does not read the height', () => {
    const area = input(show({ lines: 3, fieldHeight: 56 }))
    expect(area.tagName).toBe('TEXTAREA')
    expect(area.style.blockSize).toContain('3lh')
  })

  it('a token the theme does not know is skipped: the built-in value stays', () => {
    const plain = input(show({}))
    cleanup()
    const skipped = input(show({ fieldRadius: 'roundNope', fieldBackground: 'paperNope', fieldBorderColor: { token: 'inkNope', opacity: 0.5 } }))
    expect(skipped.style.borderRadius).toBe(plain.style.borderRadius)
    expect(skipped.style.backgroundColor).toBe(plain.style.backgroundColor)
    expect(skipped.style.border).toBe(plain.style.border)
  })

  it('a counter without a limit, a «counter: false» and a plain string mark are not read', () => {
    for (const props of [{ counter: true }, { counter: false, maxLength: 10 }, { suffix: '₴' }]) {
      const container = show(props)
      expect(container.querySelector('[data-hl-counter]'), JSON.stringify(props)).toBeNull()
      expect(container.querySelector('[data-hl-affix]'), JSON.stringify(props)).toBeNull()
      cleanup()
    }
  })

  it('the named look reaches the box: the radius, the background, the colour and the width of the border, the height', () => {
    const box = input(show({ fieldRadius: 16, fieldBackground: { value: '#112233' }, fieldBorderColor: { value: '#445566' }, fieldBorderWidth: 2, fieldHeight: 56 }))
    expect(box.style.borderRadius).toBe('16px')
    expect(box.style.backgroundColor).toBe('rgb(17, 34, 51)')
    expect(box.style.border).toContain('2px solid')
    expect(box.style.border).toContain('rgb(68, 85, 102)')
    expect(box.style.blockSize).toBe('56px')
  })
})
