/**
 * The guard that no path bypasses the sanitization layer: every leaf of every fixture document and
 * of the theme, replaced by a hostile string or number, must not reach `style` or `src`.
 *
 * The sweeps are cut into slices (`shard.ts`) that `hardening.<k>.deep.test.tsx` run in parallel;
 * `hardening.test.tsx` holds the controls and the rest of the trust-boundary tests, which share the
 * fixtures and helpers below.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HotlayoutScreen, resolveTheme } from '../src/index'
import type { ThemeContract, UiDocument } from '../src/index'
import { themeCssVariables } from '../src/theme'
import { WIDTH_CLASSES } from '../src/width-class'
import type { WidthClass } from '../src/width-class'
import { contractFile } from './paths'
import { sampleData } from './sample-data'
import { shardOf } from './shard'

/** How many files the sweeps are cut into: `hardening.<1..N>.deep.test.tsx`. */
export const GUARD_SLICE_COUNT = 8

// The type parameter documents what lies in the file at the call site.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const json = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

export const THEME_ARTIFACT = json<{ contract: ThemeContract }>(contractFile('theme.json'))

export const MARK = 'attacker.test'
export const HOSTILE_STRING = `#000"');},url(http://${MARK}/x);position:fixed;inset:0;z-index:9;--y:`
export const HOSTILE_NUMBER = 123_456_789

export type Path = readonly (string | number)[]

/** Paths to all leaves (strings, numbers, booleans) and to all object keys. */
export function leavesOf(value: unknown, path: Path = [], out: Path[] = []): Path[] {
  if (Array.isArray(value)) value.forEach((item, index) => leavesOf(item, [...path, index], out))
  else if (typeof value === 'object' && value !== null) for (const [key, item] of Object.entries(value)) leavesOf(item, [...path, key], out)
  else out.push(path)
  return out
}

export function replaced(value: unknown, path: Path, next: unknown): unknown {
  const copy: unknown = structuredClone(value)
  let cursor = copy as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (last !== undefined) cursor[last] = next
  return copy
}

/** The same tree where the key at the path is renamed to a hostile string. */
export function renamedKey(value: unknown, path: Path, next: string): unknown {
  const copy: unknown = structuredClone(value)
  let cursor = copy as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (last === undefined || Array.isArray(cursor)) return copy
  cursor[next] = cursor[last]
  Reflect.deleteProperty(cursor, last)
  return copy
}

export function decode(text: string): string {
  return text.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
}

/**
 * What in the markup is CSS and addresses: the `style` and `src` attributes. Node text and
 * `data-hl-*` are of no interest here: they are document data, which React escapes as HTML.
 */
export function sinksOf(html: string): readonly string[] {
  return [...html.matchAll(/\s(?:style|src|srcset|href)="([^"]*)"/g)].map((match) => decode(match[1] ?? ''))
}

export function expectClean(html: string, what: string): void {
  for (const sink of sinksOf(html)) {
    if (sink.includes(MARK) || /position\s*:\s*fixed/.test(sink) || /\d{7,}px/.test(sink) || /repeat\(\s*\d{2,}/.test(sink) || /url\((?!"data:image\/svg\+xml,)/.test(sink) || /[\n\r]/.test(sink)) {
      throw new Error(`${what}: hostile value reached a style or an address — ${sink.slice(0, 200)}`)
    }
  }
}

export const FIXTURES_DIR = contractFile('fixtures')
export const SHOWCASE = json<UiDocument>(join(FIXTURES_DIR, 'rewards-showcase-screens.json'))
export const SHOWCASE_THEME = json<ThemeContract>(join(FIXTURES_DIR, 'themes', 'rewards-showcase-theme.json'))
export const CATALOG = json<UiDocument>(join(FIXTURES_DIR, 'full-catalog-screen.json'))
// 9.5.0: icon in a button and badge, button sizes, icon button: every field of these nodes is also a leaf from the network.
export const BUTTONS = json<UiDocument>(join(FIXTURES_DIR, 'buttons-chips-screens.json'))
// 9.6.0: `Text.spans` (map of part styles) and the template word; 9.7.0: `thickness`, `trackColor`, `gradient` of bar and ring.
export const RICH_TEXT = json<UiDocument>(join(FIXTURES_DIR, 'rich-text-screens.json'))
export const PROGRESS = json<UiDocument>(join(FIXTURES_DIR, 'progress-screens.json'))
// 9.8.0: actions (address, parameter from data, analytics event, `carryRecord`) are leaves from the network too.
export const ACTIONS = json<UiDocument>(join(FIXTURES_DIR, 'actions-screens.json'))
// 9.9.0: image ratio, app bar actions, layer placement; 9.10.0: `layer` (offset, rotation) and `pull`: each value is a network leaf too.
export const MEDIA_CHROME = json<UiDocument>(join(FIXTURES_DIR, 'media-chrome-screens.json'))
export const OFFSET = json<UiDocument>(join(FIXTURES_DIR, 'offset-screens.json'))
// 9.11.0: `carousel` (perView, peek, indicator) and `segments` / `currentColor` of the bar are network leaves too.
export const CAROUSEL_STEPS = json<UiDocument>(join(FIXTURES_DIR, 'carousel-steps-screens.json'))
// 9.13.0: input fields: label, placeholder, helper, error and value are network leaves too.
export const INPUTS = json<UiDocument>(join(FIXTURES_DIR, 'inputs-screens.json'))
// 9.18.0: `showOn`, `styleOn`, `propsOn` and `contentMaxWidth` are network leaves too; they are drawn in all three width classes.
export const ADAPTIVE = json<UiDocument>(join(FIXTURES_DIR, 'adaptive-screens.json'))

export const silent = (): void => undefined
const { data, collections } = sampleData()

/**
 * Each screen of the document as a separate page: modal and unreachable ones must also
 * be rendered. `only` is the number of the screen the substitution concerns: the rest need
 * no rendering, they equal the clean document.
 */
export function eachScreen(document: UiDocument, theme: ThemeContract | undefined, what: string, only?: number, widthClass?: WidthClass): void {
  const screens: unknown = (document as { screens?: unknown }).screens
  const all = Array.isArray(screens) ? (screens as readonly { screenId?: unknown }[]).map((entry) => entry.screenId) : []
  const ids = (only === undefined ? all : [all[only]]).filter((id): id is string => typeof id === 'string')
  for (const screenId of ids.length === 0 ? [undefined] : ids) {
    const shown = screenId === undefined ? document : ({ ...document, initialScreenId: screenId } as UiDocument)
    expectClean(renderToStaticMarkup(<HotlayoutScreen document={shown} theme={theme} data={data} collections={collections} initialWidthClass={widthClass} injectStyles={false} onReport={silent} />), what)
  }
}

/** The documents swept leaf by leaf, with the theme each is drawn in and how many leaves it MUST have (the guard is not empty). */
export const GUARD_DOCUMENTS = [
  // The 9.6 and 9.7 fixtures are smaller than the catalog.
  ['widget catalog', CATALOG, undefined, 200],
  ['showcase', SHOWCASE, SHOWCASE_THEME, 200],
  ['buttons and chips', BUTTONS, undefined, 200],
  ['rich text', RICH_TEXT, undefined, 150],
  ['bar and ring', PROGRESS, undefined, 150],
  ['actions', ACTIONS, undefined, 150],
  ['image, app bar, layer', MEDIA_CHROME, undefined, 100],
  ['offset stacking', OFFSET, undefined, 100],
  ['carousel and steps', CAROUSEL_STEPS, undefined, 100],
  ['input fields', INPUTS, undefined, 60],
] as const

/** The leaves a substitution may touch: not the version, the widget type or the screen address (without them a different tree is drawn, not this value). */
export function sweptLeaves(document: unknown): Path[] {
  return leavesOf(document).filter((path) => {
    const key = path[path.length - 1]
    return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
  })
}

export interface LeafCase {
  readonly name: string
  readonly document: UiDocument
  readonly theme: ThemeContract | undefined
  readonly path: Path
  readonly widthClass?: WidthClass
}

/** Every leaf of every fixture document plus every leaf of the adaptive document in every width class. */
export function leafCases(): LeafCase[] {
  const out: LeafCase[] = []
  for (const widthClass of WIDTH_CLASSES) for (const path of sweptLeaves(ADAPTIVE)) out.push({ name: `adaptive ${widthClass}`, document: ADAPTIVE, theme: undefined, path, widthClass })
  for (const [name, document, theme] of GUARD_DOCUMENTS) for (const path of sweptLeaves(document)) out.push({ name, document, theme, path })
  return out
}

const KIND_TYPE_DOCUMENTS = [CATALOG, RICH_TEXT, PROGRESS, ACTIONS, MEDIA_CHROME, OFFSET, CAROUSEL_STEPS, INPUTS]

/** Every `type` and `kind` of the documents: strings from the network too. */
export function kindTypeCases(): { document: UiDocument; path: Path }[] {
  return KIND_TYPE_DOCUMENTS.flatMap((document) => leavesOf(document).filter((path) => ['type', 'kind'].includes(String(path[path.length - 1]))).map((path) => ({ document, path })))
}

export const GUARD_THEMES = [
  ['showcase', SHOWCASE_THEME],
  ['built-in', THEME_ARTIFACT.contract],
] as const

export const themeLeavesOf = (theme: ThemeContract): Path[] => leavesOf(theme).filter((path) => path[path.length - 1] !== 'themeContractVersion' && path[path.length - 1] !== 'defaultThemeId')

/** Every prefix (from depth 2) of every theme leaf path: the keys that can be renamed. */
export function themeKeysOf(theme: ThemeContract): Path[] {
  const keys = new Map<string, Path>()
  for (const path of themeLeavesOf(theme)) for (let depth = 2; depth <= path.length; depth += 1) keys.set(path.slice(0, depth).join('\u0000'), path.slice(0, depth))
  return [...keys.values()]
}

export interface ThemeCase {
  readonly name: string
  readonly theme: ThemeContract
  readonly path: Path
  readonly kind: 'leaf' | 'key'
}

/** Every theme leaf (replaced by three hostile values) and every renamable theme key. */
export function themeGuardCases(): ThemeCase[] {
  const out: ThemeCase[] = []
  for (const [name, theme] of GUARD_THEMES) {
    for (const path of themeLeavesOf(theme)) out.push({ name, theme, path, kind: 'leaf' })
    // Keys of the themes themselves (`themes.light`) are theme identifiers: they do not go into CSS, but there is no theme without them.
    for (const path of themeKeysOf(theme)) if (!(path.length === 2 && path[0] === 'themes')) out.push({ name, theme, path, kind: 'key' })
  }
  return out
}

/* ------------------------------------------------------------------ the sweeps */

function itLeaves(shard: number): void {
  it(`slice ${String(shard)}: each leaf of the documents in turn, a hostile string and a hostile number`, () => {
    for (const { name, document, theme, path, widthClass } of shardOf(leafCases(), shard, GUARD_SLICE_COUNT)) {
      const where = `${name}: ${path.join('.')}`
      const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
      eachScreen(replaced(document, path, HOSTILE_STRING) as UiDocument, theme, where, only, widthClass)
      eachScreen(replaced(document, path, HOSTILE_NUMBER) as UiDocument, theme, where, only, widthClass)
    }
  }, 240_000 / GUARD_SLICE_COUNT + 60_000)
}

function itKindType(shard: number): void {
  it(`slice ${String(shard)}: document \`kind\` and \`type\` are also strings from the network`, () => {
    for (const { document, path } of shardOf(kindTypeCases(), shard, GUARD_SLICE_COUNT)) eachScreen(replaced(document, path, HOSTILE_STRING) as UiDocument, undefined, path.join('.'))
  }, 60_000)
}

function itThemes(shard: number): void {
  it(`slice ${String(shard)}: theme, each leaf and each KEY in turn`, () => {
    for (const { name, theme, path, kind } of shardOf(themeGuardCases(), shard, GUARD_SLICE_COUNT)) {
      if (kind === 'key') {
        const mutated = renamedKey(theme, path, `x:1;position:fixed;inset:0;--y`) as ThemeContract
        eachScreen(CATALOG, mutated, `theme key ${name}: ${path.join('.')}`)
        continue
      }
      const where = `theme ${name}: ${path.join('.')}`
      for (const hostile of [HOSTILE_STRING, HOSTILE_NUMBER, -HOSTILE_NUMBER]) {
        const mutated = replaced(theme, path, hostile) as ThemeContract
        eachScreen(CATALOG, mutated, where)
        // And what is attached to the root directly: no variable value carries an address or a semicolon.
        for (const themeId of Object.keys(mutated.themes)) {
          for (const [variable, value] of Object.entries(themeCssVariables(resolveTheme(mutated, themeId).theme))) {
            expect(variable, where).toMatch(/^--product-[a-z0-9-]+$/)
            expect(value, where).not.toMatch(/[;{}]|url\(|@import|image-set|\d{7,}/i)
          }
        }
      }
    }
  }, 120_000 / GUARD_SLICE_COUNT + 60_000)
}

/** The sweeps over one slice of their cases (`hardening.<shard>.deep.test.tsx` calls this). */
export function describeGuardSlice(shard: number): void {
  describe(`guard: no path bypasses the sanitization layer (slice ${String(shard)} of ${String(GUARD_SLICE_COUNT)})`, () => {
    itLeaves(shard)
    itKindType(shard)
    itThemes(shard)
  })
}
