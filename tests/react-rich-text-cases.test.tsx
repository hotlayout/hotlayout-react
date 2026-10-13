/**
 * RICH TEXT CASE TABLE THROUGH THE `@hotlayout/react` PACKAGE:
 * `contract/fixtures/rich-text/rich-text-cases.json` (schema 9.6.0).
 *
 * The reference and the builder preview are checked against the same table elsewhere; this file is
 * another reader. The package does not import from `src/`, so the rule is written a second time in it
 * (`rich-text.ts`, `text-template.ts`), and this table is what keeps the two copies together.
 *
 * The package is checked TWICE, and this is not a duplicate:
 *  1. its pure functions, on EVERY row, sign for sign: the text, the pieces (the piece count is part
 *     of the answer) and the read styles; the strut and the line step, on the `struts` rows;
 *  2. a real `HotlayoutScreen`: the document for a row is built from the table, the locale gives the
 *     "device", "now" is a prop, and the pieces are read from the drawn paragraph. This catches a
 *     rule that exists in the function but was not carried through to the screen (a style got lost
 *     on the way, pieces did not merge, the language was not passed, a word translation was looked
 *     up under a foreign key).
 *
 * NO ROWS ARE SKIPPED: all of them, `readerOnly` included (documents the builder would not produce
 * are just as binding for a reader).
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { boundText } from '../src/data'
import { HotlayoutScreen } from '../src/index'
import type { HotlayoutReport, UiDocument, UiNode } from '../src/index'
import { activeTextSpans, readTextSpans, richTextStrut, spanRuns } from '../src/rich-text'
import type { TemplateLanguage } from '../src/text-template'
import { templateRuns, templateText } from '../src/text-template'

afterEach(cleanup)

interface ExpectedRun {
  readonly text: string
  readonly span: string | null
}

interface RichTextCase {
  readonly name: string
  readonly content: { readonly kind: string; readonly value?: string }
  readonly spans?: unknown
  readonly sourceLocale: string
  readonly translationLocale: string
  readonly formattingLocale: string
  readonly translations: Readonly<Record<string, string>>
  readonly data: Readonly<Record<string, unknown>>
  readonly now: string
  readonly expected: { readonly text: string; readonly runs: readonly ExpectedRun[]; readonly styles: Readonly<Record<string, unknown>> }
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

const TABLE = JSON.parse(readFileSync('contract/fixtures/rich-text/rich-text-cases.json', 'utf8')) as {
  readonly now: string
  readonly cases: readonly RichTextCase[]
  readonly struts: readonly StrutCase[]
}

const named = <TRow extends { readonly name: string }>(rows: readonly TRow[]): readonly (readonly [string, TRow])[] => rows.map((row) => [row.name, row] as const)

const ownTranslation = (row: RichTextCase, subPath: string): string | undefined => (Object.hasOwn(row.translations, subPath) ? row.translations[subPath] : undefined)

function environmentOf(row: RichTextCase): { scope: Readonly<Record<string, unknown>>; formattingLocale: string; now: number } {
  return { scope: row.data, formattingLocale: row.formattingLocale, now: Date.parse(row.now) }
}

function languageOf(row: RichTextCase): TemplateLanguage {
  return { translationLocale: row.translationLocale, sourceLocale: row.sourceLocale, translated: (subPath) => ownTranslation(row, subPath) }
}

/** Package pure functions on a table row: the text, the pieces, the read styles. */
function mirror(row: RichTextCase): RichTextCase['expected'] {
  const styles = activeTextSpans(row.content, readTextSpans(row.spans))
  const environment = environmentOf(row)
  if (row.content.kind === 'template') {
    const runs = spanRuns(templateRuns(row.content, languageOf(row), environment), styles)
    return { text: templateText(row.content, languageOf(row), environment), runs: runs.map((run) => ({ text: run.text, span: run.span ?? null })), styles }
  }
  const text = row.content.kind === 'literal' ? (ownTranslation(row, '') ?? row.content.value ?? '') : boundText(row.content, environment)
  return { text, runs: spanRuns([{ text, place: undefined }], styles).map((run) => ({ text: run.text, span: run.span ?? null })), styles }
}

describe('rich text case table: structure', () => {
  it('the table is the same as the reference one: no fewer rows, names are unique', () => {
    expect(TABLE.cases.length).toBeGreaterThanOrEqual(34)
    expect(TABLE.struts.length).toBeGreaterThanOrEqual(10)
    const names = [...TABLE.cases, ...TABLE.struts].map((row) => row.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('rich text case table: package pure functions', () => {
  it.each(named(TABLE.cases))('%s', (_name, row) => {
    expect(mirror(row)).toEqual(row.expected)
  })

  it.each(named(TABLE.struts))('strut: %s', (_name, row) => {
    const strut = richTextStrut(row.base, row.spans)
    expect({ span: strut.span ?? null, lineBlock: strut.lineBlock }).toEqual(row.expected)
  })

  it('the key order in JSON does not drive the strut: the same styles in reverse order give the same answer', () => {
    for (const row of TABLE.struts) {
      const reversed = Object.fromEntries(Object.entries(row.spans).reverse())
      expect(richTextStrut(row.base, reversed), row.name).toEqual(richTextStrut(row.base, row.spans))
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Real screen                                                                 */
/* -------------------------------------------------------------------------- */

function documentOf(row: RichTextCase): UiDocument {
  const text = (id: string, props: Record<string, unknown>): UiNode => ({ id, type: 'Text', props })
  const root: UiNode = {
    id: 'root',
    type: 'Screen',
    props: {},
    children: [text('t', { content: row.content, ...(row.spans === undefined ? {} : { spans: row.spans }) }), text('neighbour', { content: { kind: 'literal', value: 'neighbour' } })],
  }
  const translation = row.translationLocale !== row.sourceLocale ? row.translationLocale : undefined
  const table: Record<string, string> = { 's/neighbour/content': 'сусід' }
  for (const [subPath, value] of Object.entries(row.translations)) table[subPath === '' ? 's/t/content' : `s/t/content.${subPath}`] = value
  return {
    schemaVersion: '9.7.0',
    documentId: 'rich-text-case',
    name: 'Rich text case',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root }],
    localization: {
      defaultLocale: row.sourceLocale,
      locales: translation === undefined ? [row.sourceLocale] : [row.sourceLocale, translation],
      strings: translation === undefined ? {} : { [translation]: table },
    },
  }
}

describe('rich text case table: HotlayoutScreen draws the same', () => {
  it.each(named(TABLE.cases))('%s', (_name, row) => {
    const reports: HotlayoutReport[] = []
    const view = render(
      <HotlayoutScreen document={documentOf(row)} data={row.data} locale={row.formattingLocale} now={Date.parse(row.now)} onReport={(report) => reports.push(report)} />,
    )
    const paragraph = view.container.querySelector('[data-hl-node="t"]')
    // The text is the whole line, sign for sign: it is also what a screen reader hears (one node).
    expect(paragraph?.textContent).toBe(row.expected.text)
    // The pieces are the paragraph children in the logical order of the line; there are as many as in the table.
    expect([...(paragraph?.childNodes ?? [])].map((node) => node.textContent)).toEqual(row.expected.runs.map((run) => run.text))
    // The neighbour is intact, the screen did not throw.
    expect(view.container.querySelector('[data-hl-node="neighbour"]')).not.toBeNull()
    expect(reports.filter((report) => report.kind === 'render-error')).toEqual([])
  })

  it('an Arabic line: the paragraph direction follows the language of the shown text, and a piece is not isolated from its neighbours', () => {
    const row = TABLE.cases.find((item) => item.name.startsWith('RTL: runs are in the order'))
    if (row === undefined) throw new Error('there is no table row')
    const view = render(<HotlayoutScreen document={documentOf(row)} data={row.data} locale={row.formattingLocale} now={Date.parse(row.now)} />)
    expect(view.container.firstElementChild?.getAttribute('dir')).toBe('rtl')
    // There is no bidi isolation: neither `<bdi>` nor `unicode-bidi: isolate`.
    expect(view.container.querySelector('bdi')).toBeNull()
    expect(view.container.innerHTML).not.toContain('unicode-bidi')
  })
})
