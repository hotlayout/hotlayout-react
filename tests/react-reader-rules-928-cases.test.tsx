/**
 * THE READER RULES OF SCHEMA 9.28.0 THROUGH THE PACKAGE `@hotlayout/react`, on the four tables
 * the reference implementation is checked against (`reader-rules-928-cases.test.tsx`):
 *
 *  - the picture address: the default rule and «never an image» (`images.ts`);
 *  - the list budget of a screen: the plan for every row (`render/list-budget.ts`), and a real
 *    screen for the rows at the full budget — the instances on the screen and the report;
 *  - theme numbers out of bounds: a theme through `resolveTheme`, the number and the report;
 *  - transparent text: the name of a real pressable card.
 *
 * No row is skipped.
 */
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { imagePolicy } from '../src/images'
import { HotlayoutScreen, resolveTheme } from '../src/index'
import type { HotlayoutReport, UiDocument } from '../src/index'
import { LIST_BUDGET_RULES, listBudgetPlan } from '../src/render/list-budget'
import type { UiNode } from '../src/types'

interface UrlOfLength { readonly prefix: string; readonly pad: string; readonly length: number }
interface ImageTable {
  readonly defaultCases: readonly { readonly name: string; readonly url?: string; readonly urlOfLength?: UrlOfLength; readonly problem: string | null }[]
  readonly neverAnImageCases: readonly { readonly name: string; readonly url: string; readonly never: boolean }[]
}
interface BudgetRowList { readonly name: string; readonly records: number; readonly inside?: readonly BudgetRowList[] }
interface BudgetTable {
  readonly budgetCases: readonly { readonly name: string; readonly budget?: number; readonly lists: readonly BudgetRowList[]; readonly drawn: Readonly<Record<string, number>>; readonly total: number; readonly notDrawn: number }[]
}
interface Place { readonly dictionary: string; readonly token: string; readonly field?: string; readonly layer?: number; readonly stop?: number }
interface ThemeNumberRow { readonly name: string; readonly brightness: 'light' | 'dark'; readonly place: Place; readonly value: number | 'Infinity' | '-Infinity'; readonly expected: number; readonly replacedBy: 'built-in' | 'bound' | null }
interface ThemeTable { readonly numberCases: readonly ThemeNumberRow[] }
interface SilentTable {
  readonly silentCases: readonly { readonly name: string; readonly children: readonly unknown[]; readonly heard: readonly string[]; readonly silent: readonly string[]; readonly data?: Readonly<Record<string, unknown>> }[]
}

const urlOf = (row: { readonly url?: string; readonly urlOfLength?: UrlOfLength }): string =>
  row.url ?? (row.urlOfLength === undefined ? '' : row.urlOfLength.prefix.padEnd(row.urlOfLength.length, row.urlOfLength.pad))

/** JSON has no infinity: a row writes it as a word. */
const numberOf = (value: ThemeNumberRow['value']): number => (value === 'Infinity' ? Infinity : value === '-Infinity' ? -Infinity : value)

/** The name of an element as a screen reader composes it: its text without what is hidden (`aria-hidden`). */
function heardTextOf(element: Element): string {
  const parts: string[] = []
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      parts.push(node.textContent ?? '')
      return
    }
    if (!(node instanceof Element) || node.getAttribute('aria-hidden') === 'true') return
    for (const child of Array.from(node.childNodes)) walk(child)
  }
  walk(element)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** The card of a row: a column container with an action, the children of the row inside. */
const cardOf = (children: readonly unknown[]): unknown => ({ id: 'card', type: 'Container', props: { direction: 'column', action: { type: 'navigate', params: { screenId: 'details' } } }, children })

afterEach(cleanup)

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
const IMAGES = read('contract/fixtures/image-source/image-source-cases.json') as ImageTable
const BUDGET = read('contract/fixtures/repeater-filter/list-budget-cases.json') as BudgetTable
const THEME = read('contract/fixtures/theme-numbers/theme-number-cases.json') as ThemeTable
const SILENT = read('contract/fixtures/accessible-name/silent-text-cases.json') as SilentTable
const ARTIFACT = read('contract/screen-schema.json') as Readonly<Record<string, Readonly<Record<string, unknown>>>>
const THEME_ARTIFACT = read('contract/theme.json') as { readonly contract: Readonly<Record<string, unknown>> }

const named = <Row extends { readonly name: string }>(rows: readonly Row[]): readonly (readonly [string, Row])[] => rows.map((row) => [row.name, row] as const)

describe('the picture address', () => {
  it.each(named(IMAGES.defaultCases))('by default: %s', (_name, row) => {
    const url = urlOf(row)
    const loads = row.problem === null
    expect(imagePolicy(undefined).src(url, 'image', 'document') !== undefined).toBe(loads)
    expect(imagePolicy(undefined).src(url, 'image', 'data') !== undefined).toBe(loads)
    // The host is asked with the same verdict the reader would give without it.
    let allowedByDefault: boolean | undefined
    imagePolicy((_url, context) => {
      allowedByDefault = context.allowedByDefault
      return null
    }).src(url, 'image', 'document')
    // A script address is refused before the host is asked; every other address is put to the host with the default verdict.
    if (allowedByDefault !== undefined) expect(allowedByDefault, url).toBe(loads)
    else expect(url === '' || url.length > 2048 || /^javascript:/i.test(url), url).toBe(true)
  })

  it.each(named(IMAGES.neverAnImageCases))('never an image, whatever the host says: %s', (_name, row) => {
    expect(imagePolicy((url) => url).src(row.url, 'image', 'document') === undefined).toBe(row.never)
  })
})

/* ───────────────────────────── the list budget ───────────────────────────── */

/** A list of the row as a real `Repeater`: a collection per list, a column template holding the lists inside it. */
function repeaterOf(list: BudgetRowList): UiNode {
  return {
    id: `list-${list.name}`,
    type: 'Repeater',
    props: { source: `c-${list.name}`, item: `item${list.name}` },
    children: [{ id: `t-${list.name}`, type: 'Column', props: {}, children: (list.inside ?? []).map(repeaterOf) }],
  }
}

function collectionsOf(lists: readonly BudgetRowList[], into: Record<string, Record<string, unknown>[]> = {}): Record<string, Record<string, unknown>[]> {
  for (const list of lists) {
    into[`c-${list.name}`] = Array.from({ length: list.records }, (_, index) => ({ id: index }))
    collectionsOf(list.inside ?? [], into)
  }
  return into
}

const namesOf = (lists: readonly BudgetRowList[]): readonly string[] => lists.flatMap((list) => [list.name, ...namesOf(list.inside ?? [])])

describe('the list budget of a screen', () => {
  it('the budget of the package is the budget of the artifact', () => {
    expect(LIST_BUDGET_RULES.perScreen).toBe(ARTIFACT['x-listBudget']?.perScreen)
  })

  it.each(named(BUDGET.budgetCases))('the plan: %s', (_name, row) => {
    const root: UiNode = { id: 'root', type: 'Screen', props: {}, children: row.lists.map(repeaterOf) }
    const plan = listBudgetPlan(root, {}, collectionsOf(row.lists), row.budget)
    const drawn = Object.fromEntries(namesOf(row.lists).map((name) => [name, plan.drawnByList[`list-${name}`] ?? 0]))
    expect({ drawn, total: plan.total, notDrawn: plan.notDrawn }).toEqual({ drawn: row.drawn, total: row.total, notDrawn: row.notDrawn })
  })

  it.each(named(BUDGET.budgetCases.filter((row) => row.budget === undefined && row.total === LIST_BUDGET_RULES.perScreen)))('a real screen: %s', (_name, row) => {
    const reports: HotlayoutReport[] = []
    const document = {
      schemaVersion: '9.28.0',
      documentId: 'list-budget',
      name: 'list budget',
      initialScreenId: 's',
      screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children: row.lists.map(repeaterOf) } }],
    } as unknown as UiDocument
    const { container } = render(<HotlayoutScreen document={document} collections={collectionsOf(row.lists) as never} onReport={(report) => reports.push(report)} />)
    for (const name of namesOf(row.lists)) expect(container.querySelectorAll(`[data-hl-node="t-${name}"]`).length, name).toBe(row.drawn[name])
    const said = reports.filter((report) => report.kind === 'ignored-input' && report.reason.includes('list budget'))
    expect(said.length).toBe(row.notDrawn > 0 ? 1 : 0)
  })
})

/* ───────────────────────────── theme numbers ───────────────────────────── */

const clone = <T,>(value: T): T => structuredClone(value)

/** The built-in theme set with the row's value at the row's place, the row's brightness as the default. */
function themeOf(row: ThemeNumberRow): Record<string, unknown> {
  const contract = clone(THEME_ARTIFACT.contract) as { defaultThemeId: string; themes: Record<string, Record<string, unknown>> }
  const id = Object.keys(contract.themes).find((key) => contract.themes[key]?.brightness === row.brightness) ?? 'light'
  contract.defaultThemeId = id
  const theme = contract.themes[id] as Record<string, Record<string, unknown>>
  const value = numberOf(row.value)
  const { dictionary, token, field, layer, stop } = row.place
  const table = theme[dictionary] as Record<string, unknown>
  if (field === undefined) table[token] = value
  else if (dictionary === 'typography') table[token] = { ...(table[token] as object | undefined ?? (table.bodyM as object)), [field]: value }
  else if (dictionary === 'elevation') ((table[token] as Record<string, unknown>[])[layer ?? 0] as Record<string, unknown>)[field] = value
  else ((table[token] as { stops: Record<string, unknown>[] }).stops[stop ?? 0] as Record<string, unknown>)[field] = value
  return contract
}

function numberAt(theme: unknown, row: ThemeNumberRow): unknown {
  const { dictionary, token, field, layer, stop } = row.place
  const table = (theme as Record<string, Record<string, unknown>>)[dictionary] ?? {}
  const entry = table[token]
  if (field === undefined) return entry
  if (dictionary === 'elevation') return (entry as Record<string, unknown>[])[layer ?? 0]?.[field]
  if (dictionary === 'gradient') return (entry as { stops: Record<string, unknown>[] }).stops[stop ?? 0]?.[field]
  return (entry as Record<string, unknown>)[field]
}

describe('theme numbers out of bounds', () => {
  it.each(named(THEME.numberCases))('%s', (_name, row) => {
    const { theme, reports } = resolveTheme(themeOf(row))
    expect(numberAt(theme, row)).toBe(row.expected)
    const paths = reports.flatMap((report) => (report.kind === 'invalid-theme-values' ? report.paths : []))
    const said = paths.filter((path) => path.includes('out of bounds'))
    if (row.replacedBy === null) expect(said).toEqual([])
    else expect(said.some((path) => path.includes(row.replacedBy === 'built-in' ? 'built-in value' : 'nearest bound')), JSON.stringify(said)).toBe(true)
  })
})

/* ───────────────────────────── transparent text ───────────────────────────── */

describe('transparent text and the name of a card', () => {
  it.each(named(SILENT.silentCases))('%s', (_name, row) => {
    const document = {
      schemaVersion: '9.28.0',
      documentId: 'silent-text',
      name: 'silent text',
      initialScreenId: 's',
      screens: [
        { screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children: [cardOf(row.children)] } },
        { screenId: 'details', name: 'Details', root: { id: 'root-d', type: 'Screen', props: {}, children: [] } },
      ],
    } as unknown as UiDocument
    const { container } = render(<HotlayoutScreen document={document} data={row.data ?? {}} />)
    const card = container.querySelector('[data-hl-node="card"]')
    if (card === null) throw new Error('no card')
    expect(card.getAttribute('role')).toBe('button')
    const name = heardTextOf(card)
    for (const heard of row.heard) expect(name, `«${name}»`).toContain(heard)
    for (const silent of row.silent) expect(name, `«${name}»`).not.toContain(silent)
  })
})
