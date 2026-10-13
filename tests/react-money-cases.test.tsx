/**
 * MONEY AS MONEY THROUGH THE PACKAGE `@hotlayout/react` (schema 9.19.0):
 *  - `moneyCases` (73 rows) of `contract/fixtures/template/template-cases.json`;
 *  - `amountPartCases` (19) and `amountPartStruts` (5) of
 *    `contract/fixtures/rich-text/rich-text-cases.json`.
 *
 * The reference and the builder are checked by the builder's own test of the same table; this is the
 * third reader. The package does not import `src/`, so the rule is written a second time
 * (`money.ts`, `rich-text.ts`) and the shared table keeps the two copies together. Each
 * group goes twice: the pure functions of the package on EVERY row, and a real
 * `HotlayoutScreen`, where the text and the pieces are read from the drawn paragraph.
 *
 * NO ROW IS SKIPPED, `mayDiffer` and `readerOnly` included: the reference and the package run
 * on one `Intl`, so the signs are the same here too.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { boundPieces, boundText } from '../src/data'
import { HotlayoutScreen } from '../src/index'
import type { HotlayoutReport, UiDocument, UiNode } from '../src/index'
import { MONEY_FORMAT } from '../src/money'
import { activeTextSpans, readTextSpans, richTextStrut, spanRuns } from '../src/rich-text'
import type { TemplateLanguage } from '../src/text-template'
import { templateRuns, templateText } from '../src/text-template'

afterEach(cleanup)

interface MoneyCase {
  readonly name: string
  readonly value: Record<string, unknown>
  readonly sourceLocale: string
  readonly translationLocale: string
  readonly formattingLocale: string
  readonly direction: 'ltr' | 'rtl'
  readonly translations: Readonly<Record<string, string>>
  readonly data: Readonly<Record<string, unknown>>
  readonly now: string
  readonly expected: string
  readonly pieces?: readonly { readonly text: string; readonly part: string | null }[]
  readonly mayDiffer?: string
  readonly readerOnly?: string
}
interface PartCase {
  readonly name: string
  readonly content: Record<string, unknown>
  readonly spans: unknown
  readonly sourceLocale: string
  readonly translationLocale: string
  readonly formattingLocale: string
  readonly direction: 'ltr' | 'rtl'
  readonly translations: Readonly<Record<string, string>>
  readonly data: Readonly<Record<string, unknown>>
  readonly now: string
  readonly expected: { readonly text: string; readonly runs: readonly { readonly text: string; readonly span: string | null; readonly part: string | null }[]; readonly styles: unknown }
}
interface Metric {
  readonly fontSize: number
  readonly lineHeight: number
}
interface StrutCase {
  readonly name: string
  readonly base: Metric
  readonly spans: Readonly<Record<string, Metric>>
  readonly expected: { readonly span: string | null; readonly lineBlock: number }
}

const TEMPLATE_TABLE = JSON.parse(readFileSync('contract/fixtures/template/template-cases.json', 'utf8')) as { readonly moneyCases: readonly MoneyCase[] }
const RICH_TABLE = JSON.parse(readFileSync('contract/fixtures/rich-text/rich-text-cases.json', 'utf8')) as { readonly amountPartCases: readonly PartCase[]; readonly amountPartStruts: readonly StrutCase[] }
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as Record<string, unknown>

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)
const ownTranslation = (row: { readonly translations: Readonly<Record<string, string>> }, subPath: string): string | undefined => (Object.hasOwn(row.translations, subPath) ? row.translations[subPath] : undefined)

const environmentOf = (row: MoneyCase | PartCase): { scope: Readonly<Record<string, unknown>>; formattingLocale: string; now: number; direction: 'ltr' | 'rtl' } => ({
  scope: row.data,
  formattingLocale: row.formattingLocale,
  now: Date.parse(row.now),
  direction: row.direction,
})
const languageOf = (row: MoneyCase | PartCase): TemplateLanguage => ({ translationLocale: row.translationLocale, sourceLocale: row.sourceLocale, translated: (subPath) => ownTranslation(row, subPath) })

function textOf(row: MoneyCase): string {
  if (row.value.kind === 'binding') return boundText(row.value, environmentOf(row))
  return templateText(row.value, languageOf(row), environmentOf(row))
}

describe('money: the table', () => {
  it('has as many rows as were written by hand', () => {
    expect(TEMPLATE_TABLE.moneyCases).toHaveLength(73)
    expect(RICH_TABLE.amountPartCases).toHaveLength(19)
    expect(RICH_TABLE.amountPartStruts).toHaveLength(5)
    for (const group of [TEMPLATE_TABLE.moneyCases, RICH_TABLE.amountPartCases, RICH_TABLE.amountPartStruts]) expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
  })

  it('the block of the package is the block `x-money` of the artifact, whole', () => {
    expect(MONEY_FORMAT).toEqual(ARTIFACT['x-money'])
  })
})

describe('moneyCases: the pure functions of the package', () => {
  it.each(named(TEMPLATE_TABLE.moneyCases))('%s', (_name, row) => {
    expect(textOf(row)).toBe(row.expected)
  })

  it('the pieces of the rows that name them', () => {
    let checked = 0
    for (const row of TEMPLATE_TABLE.moneyCases) {
      if (row.pieces === undefined) continue
      checked += 1
      const pieces =
        row.value.kind === 'binding'
          ? boundPieces(row.value, environmentOf(row)).map((piece) => ({ text: piece.text, part: piece.part ?? null }))
          : templateRuns(row.value, languageOf(row), environmentOf(row)).map((run) => ({ text: run.text, part: run.part ?? null }))
      expect(pieces, row.name).toEqual(row.pieces)
      // Pieces joined are exactly the text on the screen.
      expect(pieces.map((piece) => piece.text).join(''), row.name).toBe(row.expected)
    }
    expect(checked).toBe(TEMPLATE_TABLE.moneyCases.filter((row) => row.pieces !== undefined).length)
    expect(checked).toBeGreaterThanOrEqual(10)
  })

  it('without the new fields every plain money row is the text of 9.4.0 (no isolation marks, the platform minus)', () => {
    const plain = TEMPLATE_TABLE.moneyCases.filter((row) => row.name.includes('WITHOUT'))
    expect(plain.length).toBeGreaterThan(0)
    for (const row of plain) expect(row.expected, row.name).not.toMatch(/[⁦⁩−]/)
  })
})

/* ---------------------------- a real screen ---------------------------- */

const text = (id: string, content: unknown): UiNode => ({ id, type: 'Text', props: { content } })

/** A document without localization when the format locale is foreign to the text and no translation was asked (as the template table does). */
function documentOf(row: MoneyCase): UiDocument {
  const root: UiNode = { id: 'root', type: 'Screen', props: {}, children: [text('t', row.value), text('neighbour', { kind: 'literal', value: 'neighbour' })] }
  const base = { schemaVersion: '9.19.0', documentId: 'money-case', name: 'Money case', initialScreenId: 's', screens: [{ screenId: 's', name: 'S', root }] }
  const foreignFormat = row.translationLocale === row.sourceLocale && !row.formattingLocale.toLowerCase().startsWith(row.sourceLocale.toLowerCase())
  if (foreignFormat) return base as unknown as UiDocument
  const translation = row.translationLocale !== row.sourceLocale ? row.translationLocale : undefined
  const table: Record<string, string> = { 's/neighbour/content': 'neighbour' }
  for (const [subPath, value] of Object.entries(row.translations)) table[subPath === '' ? 's/t/content' : `s/t/content.${subPath}`] = value
  return {
    ...base,
    localization: {
      defaultLocale: row.sourceLocale,
      locales: translation === undefined ? [row.sourceLocale] : [row.sourceLocale, translation],
      strings: translation === undefined ? {} : { [translation]: table },
    },
  } as unknown as UiDocument
}

describe('moneyCases: HotlayoutScreen draws the same', () => {
  it.each(named(TEMPLATE_TABLE.moneyCases))('%s', (_name, row) => {
    const reports: HotlayoutReport[] = []
    const view = render(<HotlayoutScreen document={documentOf(row)} data={row.data} locale={row.formattingLocale} now={Date.parse(row.now)} onReport={(report) => reports.push(report)} />)
    expect(view.container.querySelector('[data-hl-node="t"]')?.textContent).toBe(row.expected)
    expect(view.container.querySelector('[data-hl-node="neighbour"]')).not.toBeNull()
    expect(reports.filter((report) => report.kind === 'render-error')).toEqual([])
  })

  it('the isolation marks stay in the drawn text and in the text of the accessible name', () => {
    const row = TEMPLATE_TABLE.moneyCases.find((item) => item.name.startsWith('rtl: the piece inside an Arabic sentence'))
    if (row === undefined) throw new Error('no such row')
    const view = render(<HotlayoutScreen document={documentOf(row)} data={row.data} locale={row.formattingLocale} now={Date.parse(row.now)} />)
    const shown = view.container.querySelector('[data-hl-node="t"]')?.textContent ?? ''
    expect(shown).toContain('⁦')
    expect(shown).toContain('⁩')
    // Direction of the amount is carried by the marks only: no bidi element, no `unicode-bidi`.
    expect(view.container.querySelector('bdi')).toBeNull()
    expect(view.container.innerHTML).not.toContain('unicode-bidi')
  })
})

/* ---------------------------- parts of an amount ---------------------------- */

describe('amountPartCases: the pure functions of the package', () => {
  it.each(named(RICH_TABLE.amountPartCases))('%s', (_name, row) => {
    const styles = activeTextSpans(row.content, readTextSpans(row.spans))
    const runs = spanRuns(templateRuns(row.content, languageOf(row), environmentOf(row)), styles)
    expect({
      text: templateText(row.content, languageOf(row), environmentOf(row)),
      runs: runs.map((run) => ({ text: run.text, span: run.span ?? null, part: run.part ?? null })),
      styles,
    }).toEqual(row.expected)
  })

  it.each(named(RICH_TABLE.amountPartStruts))('strut: %s', (_name, row) => {
    const strut = richTextStrut(row.base, row.spans)
    expect({ span: strut.span ?? null, lineBlock: strut.lineBlock }).toEqual(row.expected)
    // The order of keys in JSON does not decide the strut.
    expect(richTextStrut(row.base, Object.fromEntries(Object.entries(row.spans).reverse()))).toEqual(strut)
  })

  it('a style of a part on a format that gives no such part never applies', () => {
    const content = { kind: 'template', template: '{a}', values: { a: { kind: 'binding', path: 'x', fallback: '0', format: 'number' } } }
    const spans = readTextSpans({ a: { parts: { currency: { color: 'muted' }, fraction: { color: 'muted' } } } })
    const runs = spanRuns(templateRuns(content, { translationLocale: 'en', sourceLocale: 'en', translated: () => undefined }, { scope: { x: 12.5 }, formattingLocale: 'en' }), activeTextSpans(content, spans))
    expect(runs.map((run) => [run.text, run.part ?? null])).toEqual([['12', null], ['.5', 'fraction']])
  })

  it('the parts are read tolerantly: `parts` that is not an object, an unknown part, a style without a readable field', () => {
    expect(readTextSpans({ a: { color: 'muted', parts: 'fraction' } })).toEqual({ a: { color: 'muted' } })
    expect(readTextSpans({ a: { color: 'muted', parts: { integer: { color: 'muted' }, fraction: { bold: true } } } })).toEqual({ a: { color: 'muted' } })
    expect(readTextSpans({ a: { parts: { fraction: { color: 'muted' } } } })).toEqual({ a: { parts: { fraction: { color: 'muted' } } } })
    expect(readTextSpans({ a: { parts: { constructor: { color: 'muted' } } } })).toEqual({})
  })
})

describe('amountPartCases: HotlayoutScreen draws the same', () => {
  function partDocument(row: PartCase): UiDocument {
    const root: UiNode = {
      id: 'root',
      type: 'Screen',
      props: {},
      children: [
        { id: 't', type: 'Text', props: { content: row.content, spans: row.spans } },
        text('neighbour', { kind: 'literal', value: 'neighbour' }),
      ],
    }
    const translation = row.translationLocale !== row.sourceLocale ? row.translationLocale : undefined
    const table: Record<string, string> = { 's/neighbour/content': 'neighbour' }
    for (const [subPath, value] of Object.entries(row.translations)) table[subPath === '' ? 's/t/content' : `s/t/content.${subPath}`] = value
    return {
      schemaVersion: '9.19.0',
      documentId: 'amount-part-case',
      name: 'Amount part case',
      initialScreenId: 's',
      screens: [{ screenId: 's', name: 'S', root }],
      localization: {
        defaultLocale: row.sourceLocale,
        locales: translation === undefined ? [row.sourceLocale] : [row.sourceLocale, translation],
        strings: translation === undefined ? {} : { [translation]: table },
      },
    } as unknown as UiDocument
  }

  it.each(named(RICH_TABLE.amountPartCases))('%s', (_name, row) => {
    const reports: HotlayoutReport[] = []
    const view = render(<HotlayoutScreen document={partDocument(row)} data={row.data} locale={row.formattingLocale} now={Date.parse(row.now)} onReport={(report) => reports.push(report)} />)
    const paragraph = view.container.querySelector('[data-hl-node="t"]')
    expect(paragraph?.textContent).toBe(row.expected.text)
    expect([...(paragraph?.childNodes ?? [])].map((node) => node.textContent)).toEqual(row.expected.runs.map((run) => run.text))
    expect(view.container.querySelector('[data-hl-node="neighbour"]')).not.toBeNull()
    expect(reports.filter((report) => report.kind === 'render-error')).toEqual([])
  })

  it('a part with its own font changes the strut of the paragraph, and a part with a font the theme does not know keeps the font of its place', () => {
    const content = { kind: 'template', template: '{a}', values: { a: { kind: 'binding', path: 'x', fallback: '0', format: 'currency', currency: 'USD', currencyDisplay: 'symbol' } } }
    const draw = (spans: unknown): HTMLElement => {
      const document = {
        schemaVersion: '9.19.0',
        documentId: 'd',
        name: 'd',
        initialScreenId: 's',
        screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children: [{ id: 't', type: 'Text', props: { content, spans } }] } }],
      } as unknown as UiDocument
      return render(<HotlayoutScreen document={document} data={{ x: 5.25 }} locale="en" />).container.querySelector<HTMLElement>('[data-hl-node="t"]')!
    }
    const taller = draw({ a: { parts: { fraction: { typography: 'displayL' } } } })
    const plain = draw({ a: { color: 'muted' } })
    expect(taller.style.fontSize).not.toBe(plain.style.fontSize)
    cleanup()
    const unknown = draw({ a: { typography: 'titleM', parts: { currency: { typography: 'doesNotExist', color: 'muted' } } } })
    const place = draw({ a: { typography: 'titleM' } })
    // The unknown font of the part leaves the font of the place: the strut is the place.
    expect(unknown.style.fontSize).toBe(place.style.fontSize)
  })
})
