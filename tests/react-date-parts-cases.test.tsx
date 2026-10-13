/**
 * THE PARTS OF A DATE THROUGH THE PACKAGE `@hotlayout/react` (schema 9.19.0): the group `datePartsCases` (37 rows) of
 * `contract/fixtures/template/template-cases.json`.
 *
 * The reference and the builder are checked by the builder's own test of the same table; this is the third reader.
 * Every row goes twice — through the pure functions of the package and through a real `HotlayoutScreen`. NO ROW
 * IS SKIPPED. A row with `mayDiffer` names a place where CLDR versions of platforms write a different sign (the
 * space before the Ukrainian year suffix, the digits of Arabic, the comma after the day of the week); the reader and the reference run
 * on one `Intl` here, so the text is compared exactly, and the same text with the named signs unified is the
 * weaker form that the other platform is held to.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { boundText } from '../src/data'
import { DATE_PARTS_RULES, DATE_PARTS_WORDS, readDateParts } from '../src/date-parts'
import { HotlayoutScreen } from '../src/index'
import type { UiDocument, UiNode } from '../src/index'
import type { TemplateLanguage } from '../src/text-template'
import { templateText } from '../src/text-template'

afterEach(cleanup)

interface Row {
  readonly name: string
  readonly value: Record<string, unknown>
  readonly sourceLocale: string
  readonly translationLocale: string
  readonly formattingLocale: string
  readonly translations: Readonly<Record<string, string>>
  readonly data: Readonly<Record<string, unknown>>
  readonly now: string
  readonly timeZone?: string
  readonly expected: string
  readonly mayDiffer?: string
  readonly readerOnly?: string
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/template/template-cases.json', 'utf8')) as { readonly datePartsCases: readonly Row[] }
const ARTIFACT = JSON.parse(readFileSync('contract/screen-schema.json', 'utf8')) as Record<string, unknown>

const named = <Item extends { readonly name: string }>(rows: readonly Item[]): readonly (readonly [string, Item])[] => rows.map((row) => [row.name, row] as const)
const ownTranslation = (row: Row, subPath: string): string | undefined => (Object.hasOwn(row.translations, subPath) ? row.translations[subPath] : undefined)
const languageOf = (row: Row): TemplateLanguage => ({ translationLocale: row.translationLocale, sourceLocale: row.sourceLocale, translated: (subPath) => ownTranslation(row, subPath) })
const environmentOf = (row: Row): { scope: Readonly<Record<string, unknown>>; formattingLocale: string; now: number; timeZone?: string } => ({
  scope: row.data,
  formattingLocale: row.formattingLocale,
  now: Date.parse(row.now),
  ...(row.timeZone === undefined ? {} : { timeZone: row.timeZone }),
})

function textOf(row: Row): string {
  if (row.value.kind === 'binding') return boundText(row.value, environmentOf(row))
  return templateText(row.value, languageOf(row), environmentOf(row))
}

describe('datePartsCases: the table and the block', () => {
  it('has as many rows as were written by hand, with names that do not repeat', () => {
    expect(TABLE.datePartsCases).toHaveLength(37)
    expect(new Set(TABLE.datePartsCases.map((row) => row.name)).size).toBe(37)
  })

  it('the block of the package is the block `x-dateParts` of the artifact, whole', () => {
    expect(DATE_PARTS_RULES).toEqual(ARTIFACT['x-dateParts'])
    expect([...DATE_PARTS_WORDS]).toEqual(Object.keys(DATE_PARTS_RULES.words))
  })

  it('the word is read as the reader reads it: an unknown one and a non-string are «no field»', () => {
    for (const word of DATE_PARTS_WORDS) expect(readDateParts(word)).toBe(word)
    for (const hostile of ['relative', '', 'DAYMONTH', 7, null, undefined, {}, ['dayMonth']]) expect(readDateParts(hostile)).toBeUndefined()
  })
})

describe('datePartsCases: the pure functions of the package', () => {
  it.each(named(TABLE.datePartsCases))('%s', (_name, row) => {
    expect(textOf(row)).toBe(row.expected)
  })

  it('the options of the words are exactly the options of the artifact; no dateStyle anywhere', () => {
    const words = DATE_PARTS_RULES.words
    expect(Object.fromEntries(Object.entries(words).map(([word, entry]) => [word, entry.options]))).toEqual({
      dayMonth: { month: 'long', day: 'numeric' },
      weekdayDayMonth: { weekday: 'long', month: 'long', day: 'numeric' },
      dayMonthYear: { year: 'numeric', month: 'long', day: 'numeric' },
    })
    expect(JSON.stringify(DATE_PARTS_RULES)).not.toContain('dateStyle')
  })
})

/* ---------------------------- a real screen ---------------------------- */

const text = (id: string, content: unknown): UiNode => ({ id, type: 'Text', props: { content } })

function documentOf(row: Row): UiDocument {
  const root: UiNode = { id: 'root', type: 'Screen', props: {}, children: [text('t', row.value), text('neighbour', { kind: 'literal', value: 'neighbour' })] }
  const base = { schemaVersion: '9.19.0', documentId: 'date-parts-case', name: 'Date parts', initialScreenId: 's', screens: [{ screenId: 's', name: 'S', root }] }
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

describe('datePartsCases: HotlayoutScreen draws the same', () => {
  it.each(named(TABLE.datePartsCases))('%s', (_name, row) => {
    const view = render(<HotlayoutScreen document={documentOf(row)} data={row.data} locale={row.formattingLocale} now={Date.parse(row.now)} {...(row.timeZone === undefined ? {} : { timeZone: row.timeZone })} />)
    expect(view.container.querySelector('[data-hl-node="t"]')?.textContent).toBe(row.expected)
  })

  it('the field next to another format is ignored: dateTime and time are written as before', () => {
    const when = '2026-10-15T12:30:00.000Z'
    for (const format of ['dateTime', 'time'] as const) {
      const withWord = boundText({ kind: 'binding', path: 'x', fallback: '—', format, dateParts: 'dayMonth' }, { scope: { x: when }, formattingLocale: 'en', timeZone: 'UTC' })
      const without = boundText({ kind: 'binding', path: 'x', fallback: '—', format }, { scope: { x: when }, formattingLocale: 'en', timeZone: 'UTC' })
      expect(withWord, format).toBe(without)
    }
  })
})
