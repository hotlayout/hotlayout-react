/**
 * TRUST BOUNDARY OF THE PACKAGE: the package's own tests (they complement the adversarial
 * tests that looked for holes; these keep the fix in place).
 *
 *  1. mirror: the patterns and bounds of `sanitize.ts` equal those in the schema artifacts;
 *  2. GUARD: no leaf of the document or theme, replaced by a hostile string or number, reaches
 *     `style` or `src`, i.e. no path bypasses the sanitization layer, not only the paths already
 *     known;
 *  3. source guard: an address (`url(`) is composed only in `sanitize.ts`;
 *  4. error boundary: a screen that threw does not unmount the host tree, on the server too;
 *  5. writes, action parameters, image addresses: what reaches the host;
 *  6. a condition on a collection path sees the collection.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { contractFile, SRC_DIR } from '../test-support/paths'
import { COLLECTION_PATHS, sampleData } from '../test-support/sample-data'

import { HotlayoutScreen, READER_SCHEMA_VERSION, READER_THEME_VERSION, resolveTheme } from './index'
import type { Collections, DataScope, HotlayoutAction, HotlayoutReport, ThemeContract, UiDocument } from './index'
import { imagePolicy } from './images'
import type { ResolveImageUrl } from './images'
import { localeLookupChain, MAX_LOCALE_TAG_LENGTH, normalizeLocaleTag, wellFormedLocaleTag } from './locale'
import { MAX_COLLECTION_ITEMS, writablePathOf } from './render'
import { LITERAL_BOUNDS } from './resolve'
import {
  COLOR_VALUE_PATTERN,
  cssNumber,
  cssUrl,
  isHttpsUrl,
  lookup,
  MAX_CUSTOM_TOKENS,
  MAX_IMAGE_URL_LENGTH,
  MAX_PARAM_KEY_LENGTH,
  PROP_BOUNDS,
  safeColor,
  safeDataPath,
  safeFontFamily,
  safeIdent,
  safeInteger,
  safeNumber,
  safeParams,
  THEME_BOUNDS,
  TOKEN_NAME_PATTERN,
} from './sanitize'
import { shapeRoot } from './shape'
import { WIDTH_CLASSES } from './width-class'
import type { WidthClass } from './width-class'
import { themeCssVariables } from './theme'
import { MAX_GRADIENT_STOPS, MAX_SHADOW_LAYERS, sanitizeTheme } from './theme-shape'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// The type parameter here documents "what lies in the file" at the call site.
 
const json = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

interface SchemaNode {
  readonly pattern?: string
  readonly minimum?: number
  readonly maximum?: number
  readonly maxLength?: number
  readonly maxItems?: number
  readonly properties?: Readonly<Record<string, SchemaNode>>
  readonly anyOf?: readonly SchemaNode[]
  readonly oneOf?: readonly SchemaNode[]
  readonly items?: SchemaNode
  readonly propertyNames?: SchemaNode
  readonly additionalProperties?: SchemaNode
}

const SCHEMA = json<{ $defs: Record<string, SchemaNode>; 'x-tokens': { namePattern: string; maxCustomPerDictionary: number } }>(contractFile('screen-schema.json'))
const THEME_ARTIFACT = json<{ 'x-schema': { $defs: Record<string, SchemaNode> }; contract: ThemeContract }>(contractFile('theme.json'))
const DATA_ARTIFACT = json<{ 'x-delivery': { maxCollectionItems: number } }>(contractFile('data-contract.json'))
const THEME_DEFS = THEME_ARTIFACT['x-schema'].$defs

const range = (node: SchemaNode | undefined): readonly [number, number] => [node?.minimum ?? Number.NaN, node?.maximum ?? Number.NaN]
const lit = (value: string): unknown => ({ kind: 'literal', value })

function documentWith(children: readonly unknown[], extra: Readonly<Record<string, unknown>> = {}): UiDocument {
  return JSON.parse(
    JSON.stringify({
      schemaVersion: READER_SCHEMA_VERSION,
      documentId: 'doc',
      name: 'Doc',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'A', root: { id: 'root', type: 'Screen', props: {}, children } }],
      ...extra,
    }),
  ) as UiDocument
}

describe('mirror: the patterns and bounds of the sanitization layer equal those in the artifacts', () => {
  it('token name = x-tokens.namePattern and propertyNames of the theme dictionaries', () => {
    expect(TOKEN_NAME_PATTERN).toBe(SCHEMA['x-tokens'].namePattern)
    expect(TOKEN_NAME_PATTERN).toBe(SCHEMA.$defs.ColorToken?.pattern)
    for (const dictionary of ['spacing', 'radius', 'color', 'typography', 'elevation', 'gradient']) {
      expect(THEME_DEFS.Theme?.properties?.[dictionary]?.propertyNames?.pattern).toBe(TOKEN_NAME_PATTERN)
    }
    expect(MAX_CUSTOM_TOKENS).toBe(SCHEMA['x-tokens'].maxCustomPerDictionary)
  })

  it('colour = the theme colour pattern; a document’s own colour is its subset', () => {
    expect(COLOR_VALUE_PATTERN).toBe(THEME_DEFS.Theme?.properties?.color?.additionalProperties?.pattern)
    expect(COLOR_VALUE_PATTERN).toBe(THEME_DEFS.ThemeGradientStop?.properties?.color?.pattern)
    const literal = SCHEMA.$defs.ColorRef?.anyOf?.find((form) => form.properties?.value !== undefined)?.properties?.value?.pattern
    expect(literal).toBe('^#[0-9a-f]{6}$')
    // Whatever the document schema admits, the reader admits; and nothing with other characters.
    for (const color of ['#000000', '#a1b2c3', '#ffffff']) {
      expect(new RegExp(literal ?? '').test(color)).toBe(true)
      expect(safeColor(color)).toBe(color)
    }
    expect(safeColor('#A1B2C3')).toBe('#a1b2c3')
    for (const notColor of ['red', '#fff', '#12345', '#1234567', '#gggggg', ' #000000', '#000000 ', '#000000;x', 'rgb(0,0,0)', 'var(--x)', 'url(x)', '', 7, null, undefined, {}]) {
      expect(safeColor(notColor)).toBeUndefined()
    }
  })

  it('theme number bounds = minimum / maximum of the theme schema', () => {
    const typography = THEME_DEFS.ThemeTypography?.properties
    const shadow = THEME_DEFS.ThemeShadow?.properties
    expect([...THEME_BOUNDS.spacing]).toEqual(range(THEME_DEFS.Theme?.properties?.spacing?.additionalProperties))
    expect([...THEME_BOUNDS.radius]).toEqual(range(THEME_DEFS.Theme?.properties?.radius?.additionalProperties))
    expect([...THEME_BOUNDS.fontSize]).toEqual(range(typography?.fontSize))
    expect([...THEME_BOUNDS.fontWeight]).toEqual(range(typography?.fontWeight))
    expect([...THEME_BOUNDS.lineHeight]).toEqual(range(typography?.lineHeight))
    expect([...THEME_BOUNDS.letterSpacing]).toEqual(range(typography?.letterSpacing))
    expect([...THEME_BOUNDS.shadowOffset]).toEqual(range(shadow?.offsetX))
    expect([...THEME_BOUNDS.shadowOffset]).toEqual(range(shadow?.offsetY))
    expect([...THEME_BOUNDS.shadowBlur]).toEqual(range(shadow?.blur))
    expect([...THEME_BOUNDS.shadowSpread]).toEqual(range(shadow?.spread))
    expect([...THEME_BOUNDS.opacity]).toEqual(range(shadow?.opacity))
    expect([...THEME_BOUNDS.gradientPosition]).toEqual(range(THEME_DEFS.ThemeGradientStop?.properties?.position))
    // A theme cannot say more than a document's own value: the bounds are the same.
    for (const kind of ['spacing', 'radius', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'shadowOffset', 'shadowBlur', 'shadowSpread', 'opacity', 'gradientPosition'] as const) {
      expect([...THEME_BOUNDS[kind]]).toEqual([...LITERAL_BOUNDS[kind]])
    }
  })

  it('integer prop bounds = the widget schema', () => {
    expect([...PROP_BOUNDS.gridColumns]).toEqual(range(SCHEMA.$defs.GridProps?.properties?.columns))
    expect([...PROP_BOUNDS.gridColumns]).toEqual(range(SCHEMA.$defs.RepeaterProps?.properties?.columns))
    expect([...PROP_BOUNDS.repeaterLimit]).toEqual(range(SCHEMA.$defs.RepeaterProps?.properties?.limit))
    expect([...PROP_BOUNDS.textMaxLines]).toEqual(range(SCHEMA.$defs.TextProps?.properties?.maxLines))
    expect([...PROP_BOUNDS.weight]).toEqual(range(SCHEMA.$defs.NodeWeight))
    expect(MAX_COLLECTION_ITEMS).toBe(DATA_ARTIFACT['x-delivery'].maxCollectionItems)
    expect(MAX_IMAGE_URL_LENGTH).toBe(SCHEMA.$defs.ImageSource?.oneOf?.find((form) => form.properties?.url !== undefined)?.properties?.url?.maxLength)
    expect(MAX_PARAM_KEY_LENGTH).toBe(SCHEMA.$defs.ButtonAction?.properties?.params?.propertyNames?.maxLength)
  })

  it('the reader takes at least as many shadow layers and gradient stops as the schema allows', () => {
    expect(MAX_SHADOW_LAYERS).toBeGreaterThanOrEqual(SCHEMA.$defs.ShadowRef?.anyOf?.find((form) => form.maxItems !== undefined)?.maxItems ?? Number.NaN)
    expect(MAX_GRADIENT_STOPS).toBeGreaterThanOrEqual(SCHEMA.$defs.CustomGradient?.properties?.stops?.maxItems ?? Number.NaN)
    expect(MAX_GRADIENT_STOPS).toBeGreaterThanOrEqual(THEME_DEFS.ThemeGradient?.properties?.stops?.maxItems ?? Number.NaN)
  })
})

describe('parsing by shape: individual functions', () => {
  it('a number is only a finite number; bounds clamp it', () => {
    expect(safeNumber('12', 0, 100)).toBeUndefined()
    expect(safeNumber('0;position:fixed', 0, 100)).toBeUndefined()
    expect(safeNumber(Number.NaN, 0, 100)).toBeUndefined()
    expect(safeNumber(Number.POSITIVE_INFINITY, 0, 100)).toBeUndefined()
    expect(safeNumber(-5, 0, 100)).toBe(0)
    expect(safeNumber(1e9, 0, 100)).toBe(100)
    expect(safeInteger(2.9, 2, 4)).toBe(2)
    expect(safeInteger(10_000_000, 2, 4)).toBe(4)
    expect(cssNumber(1e-9)).not.toMatch(/e/i)
    expect(cssNumber(35.00000000000001)).toBe('35.00000000000001')
  })

  it('name: only the token pattern', () => {
    expect(safeIdent('brandCoral')).toBe('brandCoral')
    for (const bad of ['x:1;position:fixed;--y', 'a-b', 'A', '', '1a', 'a b', '__proto__', 'a'.repeat(41), 7, null]) expect(safeIdent(bad)).toBeUndefined()
  })

  it('font family: words, not CSS text; an allow-list of characters', () => {
    expect(safeFontFamily('Inter')).toBe('Inter')
    expect(safeFontFamily('system-ui')).toBe('system-ui')
    expect(safeFontFamily('Noto Sans Arabic')).toBe("'Noto Sans Arabic'")
    expect(safeFontFamily('Шрифт 2.0')).toBe("'Шрифт 2.0'")
    expect(safeFontFamily("O'Reilly Sans")).toBe("'O\\'Reilly Sans'")
    const bad = ['Inter' + String.fromCharCode(10) + ';position:fixed', 'a' + String.fromCharCode(0) + 'b', 'a' + String.fromCharCode(13) + 'b', 'a' + String.fromCharCode(0x2028) + 'b', 'A' + String.fromCharCode(92) + 'B', 'a"b', 'a;b', 'a(b)', 'a{b}', ' Inter', '', 'x'.repeat(101), 7]
    for (const name of bad) expect(safeFontFamily(name)).toBeUndefined()
  })

  it('image address: only absolute https', () => {
    expect(isHttpsUrl('https://cdn.example/a.png')).toBe(true)
    for (const bad of ['http://a.test/x', 'data:image/png;base64,AA', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' https://a.test/x', 'https:\\\\a.test', '//a.test/x', '/x.png', 'blob:https://a.test/1', 'file:///etc/passwd', 'https://', '', 7, null]) {
      expect(isHttpsUrl(bad)).toBe(false)
    }
    // Escaping is the second lock: a quote or a bracket does not close the string.
    expect(cssUrl('https://a.test/x")y')).toBe('url("https://a.test/x\\22 \\29 y")')
  })

  it('image policy: the host decision is final, except script addresses', () => {
    const refused: string[] = []
    const localhost = imagePolicy((url, context) => (context.allowedByDefault || url.startsWith('http://localhost:') ? url : null), (url) => refused.push(url))
    expect(localhost.src('http://localhost:5173/a.png', 'image')).toBe('http://localhost:5173/a.png')
    expect(localhost.src('http://attacker.test/a.png', 'image')).toBeUndefined()
    expect(localhost.src('https://cdn.example/a.png', 'image')).toBe('https://cdn.example/a.png')
    expect(refused).toEqual(['http://attacker.test/a.png'])

    const careless = imagePolicy((url) => url)
    expect(careless.src('javascript:alert(1)', 'image')).toBeUndefined()
    expect(careless.css('vbscript:x', 'background')).toBeUndefined()
    // A host that threw is a refusal, not a screen crash.
    expect(
      imagePolicy(() => {
        throw new Error('boom')
      }).src('https://cdn.example/a.png', 'image'),
    ).toBeUndefined()
    // Proxy: the host rewrites the address, the reader takes the answer.
    expect(imagePolicy((url) => `https://img.bank.example/?u=${encodeURIComponent(url)}`).css('https://cdn.example/a.png', 'background')).toBe(
      'url("https://img.bank.example/?u=https%3A%2F%2Fcdn.example%2Fa.png")',
    )
  })

  it('write path and action parameters', () => {
    expect(safeDataPath('item.selectedId')).toBe('item.selectedId')
    for (const bad of ['__proto__', '__proto__.x', 'a.constructor.b', 'a.prototype', 'a..b', '.a', 'a.', 'a b', 'a[0]', '', 'x'.repeat(129), 7]) expect(safeDataPath(bad)).toBeUndefined()

    expect(writablePathOf('item.selectedId', undefined)).toBe('item.selectedId')
    expect(writablePathOf('item.selectedId', ['item.selectedId'])).toBe('item.selectedId')
    expect(writablePathOf('user.isAdmin', ['item.selectedId'])).toBeUndefined()
    expect(writablePathOf('user.isAdmin', (path) => path.startsWith('item.'))).toBeUndefined()
    // A forbidden segment is not rescued by the host list either.
    expect(writablePathOf('__proto__.x', ['__proto__.x'])).toBeUndefined()
    expect(writablePathOf('a.constructor', () => true)).toBeUndefined()

    const { params, dropped } = safeParams(JSON.parse('{"id":"7","__proto__":{"x":1},"constructor":"x","nested":{"a":1},"n":5,"ok-key":"v"}'))
    expect(params).toEqual({ id: '7', 'ok-key': 'v' })
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype)
    expect([...dropped].sort()).toEqual(['__proto__', 'constructor', 'n', 'nested'])
  })

  it('tables are read by own key', () => {
    const table = { a: 1 }
    expect(lookup(table, 'a')).toBe(1)
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty', undefined, null, {}]) expect(lookup(table, key)).toBeUndefined()
  })
})

/* ───────────────────────────── guard: every leaf ───────────────────────────── */

const MARK = 'attacker.test'
const HOSTILE_STRING = `#000"');},url(http://${MARK}/x);position:fixed;inset:0;z-index:9;--y:`
const HOSTILE_NUMBER = 123_456_789

type Path = readonly (string | number)[]

/** Paths to all leaves (strings, numbers, booleans) and to all object keys. */
function leavesOf(value: unknown, path: Path = [], out: Path[] = []): Path[] {
  if (Array.isArray(value)) value.forEach((item, index) => leavesOf(item, [...path, index], out))
  else if (typeof value === 'object' && value !== null) for (const [key, item] of Object.entries(value)) leavesOf(item, [...path, key], out)
  else out.push(path)
  return out
}

function replaced(value: unknown, path: Path, next: unknown): unknown {
  const copy: unknown = structuredClone(value)
  let cursor = copy as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (last !== undefined) cursor[last] = next
  return copy
}

/** The same tree where the key at the path is renamed to a hostile string. */
function renamedKey(value: unknown, path: Path, next: string): unknown {
  const copy: unknown = structuredClone(value)
  let cursor = copy as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (last === undefined || Array.isArray(cursor)) return copy
  cursor[next] = cursor[last]
  Reflect.deleteProperty(cursor, last)
  return copy
}

function decode(text: string): string {
  return text.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
}

/**
 * What in the markup is CSS and addresses: the `style` and `src` attributes. Node text and
 * `data-hl-*` are of no interest here: they are document data, which React escapes as HTML.
 */
function sinksOf(html: string): readonly string[] {
  return [...html.matchAll(/\s(?:style|src|srcset|href)="([^"]*)"/g)].map((match) => decode(match[1] ?? ''))
}

function expectClean(html: string, what: string): void {
  for (const sink of sinksOf(html)) {
    if (sink.includes(MARK) || /position\s*:\s*fixed/.test(sink) || /\d{7,}px/.test(sink) || /repeat\(\s*\d{2,}/.test(sink) || /url\((?!"data:image\/svg\+xml,)/.test(sink) || /[\n\r]/.test(sink)) {
      throw new Error(`${what}: hostile value reached a style or an address — ${sink.slice(0, 200)}`)
    }
  }
}

const FIXTURES_DIR = contractFile('fixtures')
const SHOWCASE = json<UiDocument>(join(FIXTURES_DIR, 'rewards-showcase-screens.json'))
const SHOWCASE_THEME = json<ThemeContract>(join(FIXTURES_DIR, 'themes', 'rewards-showcase-theme.json'))
const CATALOG = json<UiDocument>(join(FIXTURES_DIR, 'full-catalog-screen.json'))
// 9.5.0: icon in a button and badge, button sizes, icon button: every field of these nodes is also a leaf from the network.
const BUTTONS = json<UiDocument>(join(FIXTURES_DIR, 'buttons-chips-screens.json'))
// 9.6.0: `Text.spans` (map of part styles) and the template word; 9.7.0: `thickness`, `trackColor`, `gradient` of bar and ring.
const RICH_TEXT = json<UiDocument>(join(FIXTURES_DIR, 'rich-text-screens.json'))
const PROGRESS = json<UiDocument>(join(FIXTURES_DIR, 'progress-screens.json'))
// 9.8.0: actions (address, parameter from data, analytics event, `carryRecord`) are leaves from the network too.
const ACTIONS = json<UiDocument>(join(FIXTURES_DIR, 'actions-screens.json'))
// 9.9.0: image ratio, app bar actions, layer placement; 9.10.0: `layer` (offset, rotation) and `pull`: each value is a network leaf too.
const MEDIA_CHROME = json<UiDocument>(join(FIXTURES_DIR, 'media-chrome-screens.json'))
const OFFSET = json<UiDocument>(join(FIXTURES_DIR, 'offset-screens.json'))
// 9.11.0: `carousel` (perView, peek, indicator) and `segments` / `currentColor` of the bar are network leaves too.
const CAROUSEL_STEPS = json<UiDocument>(join(FIXTURES_DIR, 'carousel-steps-screens.json'))
// 9.13.0: input fields: label, placeholder, helper, error and value are network leaves too.
const INPUTS = json<UiDocument>(join(FIXTURES_DIR, 'inputs-screens.json'))
// 9.18.0: `showOn`, `styleOn`, `propsOn` and `contentMaxWidth` are network leaves too; they are drawn in all three width classes.
const ADAPTIVE = json<UiDocument>(join(FIXTURES_DIR, 'adaptive-screens.json'))

describe('guard: no path bypasses the sanitization layer', () => {
  const silent = (): void => undefined
  const { data, collections } = sampleData()

  /**
   * Each screen of the document as a separate page: modal and unreachable ones must also
   * be rendered. `only` is the number of the screen the substitution concerns: the rest need
   * no rendering, they equal the clean document.
   */
  function eachScreen(document: UiDocument, theme: ThemeContract | undefined, what: string, only?: number, widthClass?: WidthClass): void {
    const screens: unknown = (document as { screens?: unknown }).screens
    const all = Array.isArray(screens) ? (screens as readonly { screenId?: unknown }[]).map((entry) => entry.screenId) : []
    const ids = (only === undefined ? all : [all[only]]).filter((id): id is string => typeof id === 'string')
    for (const screenId of ids.length === 0 ? [undefined] : ids) {
      const shown = screenId === undefined ? document : ({ ...document, initialScreenId: screenId } as UiDocument)
      expectClean(renderToStaticMarkup(<HotlayoutScreen document={shown} theme={theme} data={data} collections={collections} initialWidthClass={widthClass} injectStyles={false} onReport={silent} />), what)
    }
  }

  it('the guard lets clean fixtures through (otherwise it would catch itself)', () => {
    eachScreen(CATALOG, undefined, 'catalog')
    eachScreen(SHOWCASE, SHOWCASE_THEME, 'showcase')
    eachScreen(BUTTONS, undefined, 'buttons and chips')
    eachScreen(RICH_TEXT, undefined, 'rich text')
    eachScreen(PROGRESS, undefined, 'bar and ring')
    eachScreen(ACTIONS, undefined, 'actions')
    eachScreen(MEDIA_CHROME, undefined, 'image, app bar, layer')
    eachScreen(OFFSET, undefined, 'offset stacking')
    eachScreen(CAROUSEL_STEPS, undefined, 'carousel and steps')
    eachScreen(INPUTS, undefined, 'input fields')
    for (const widthClass of WIDTH_CLASSES) eachScreen(ADAPTIVE, undefined, `adaptive, ${widthClass}`, undefined, widthClass)
  })

  // 9.18.0: every leaf of the new fields (`showOn`, `styleOn`, `propsOn`, `contentMaxWidth`): a hostile string and number in EVERY width class.
  it.each(WIDTH_CLASSES)('document "adaptive", class %s: each leaf in turn, a hostile string and a hostile number', (widthClass) => {
    const leaves = leavesOf(ADAPTIVE).filter((path) => {
      const key = path[path.length - 1]
      return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
    })
    expect(leaves.length).toBeGreaterThan(500)
    // The leaves of the new fields exist in the fixture: otherwise the guard would be empty for them.
    for (const field of ['showOn', 'styleOn', 'propsOn', 'contentMaxWidth']) expect(leaves.some((path) => path.includes(field)), field).toBe(true)
    for (const path of leaves) {
      const where = `adaptive ${widthClass}: ${path.join('.')}`
      const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
      eachScreen(replaced(ADAPTIVE, path, HOSTILE_STRING) as UiDocument, undefined, where, only, widthClass)
      eachScreen(replaced(ADAPTIVE, path, HOSTILE_NUMBER) as UiDocument, undefined, where, only, widthClass)
    }
  }, 240_000)

  it('hostile `showOn` / `styleOn` / `propsOn` / `contentMaxWidth` as a whole (a shape, not a leaf): no hostile value in the style, in any class', () => {
    const hostileShapes: unknown[] = [HOSTILE_STRING, HOSTILE_NUMBER, [HOSTILE_STRING], { [HOSTILE_STRING]: { padding: HOSTILE_STRING } }, { medium: HOSTILE_STRING, expanded: { color: HOSTILE_STRING, padding: HOSTILE_NUMBER, width: HOSTILE_NUMBER, gap: HOSTILE_STRING, columns: HOSTILE_NUMBER, perView: HOSTILE_NUMBER, carousel: { perView: HOSTILE_STRING }, direction: HOSTILE_STRING } }]
    const root = (extra: Record<string, unknown>, props: Record<string, unknown>): UiDocument =>
      ({ schemaVersion: '9.18.0', documentId: 'h', name: 'h', initialScreenId: 'a', screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props, children: [{ id: 'g', type: 'Grid', props: { columns: 2, gap: 'sm' }, ...extra, children: [{ id: 'c', type: 'Column', props: {}, ...extra, children: [] }] }] } }] })
    for (const widthClass of WIDTH_CLASSES) {
      for (const hostile of hostileShapes) {
        for (const key of ['showOn', 'styleOn', 'propsOn']) eachScreen(root({ [key]: hostile }, {}), undefined, `${widthClass}: ${key}`, undefined, widthClass)
        eachScreen(root({}, { contentMaxWidth: hostile }), undefined, `${widthClass}: contentMaxWidth`, undefined, widthClass)
        eachScreen(root({}, { gap: 'sm', contentMaxWidth: 1000 }), undefined, `${widthClass}: control`, undefined, widthClass)
      }
    }
  })

  /*
   * 9.18.0, step 2: new leaves from the network: `NavBar.widePlacement`, the `modalPlacement` of a modal
   * screen and the corner radii of its root (a sheet that became a window REWRITES the corner with
   * `sheetWindowRadius`: the corner value reaches the style by a new path). The top bar and the layer
   * are drawn in a wide class, in the DOM (the layer is opened by a click), because static markup
   * cannot click.
   */
  it('hostile `widePlacement`, `modalPlacement` and sheet-window corner radii do not reach the style in any class', () => {
    const hostileWords: unknown[] = [HOSTILE_STRING, HOSTILE_NUMBER, [HOSTILE_STRING], { [HOSTILE_STRING]: HOSTILE_STRING }, null, true]
    const document = (placement: unknown, widePlacement: unknown, radius: unknown): UiDocument =>
      ({
        schemaVersion: '9.18.0',
        documentId: 'h',
        name: 'h',
        initialScreenId: 'a',
        screens: [
          {
            screenId: 'a',
            name: 'a',
            root: {
              id: 'a-root',
              type: 'Screen',
              props: {},
              children: [
                { id: 'open', type: 'Button', props: { label: { kind: 'literal', value: 'Open' }, action: { type: 'navigate', params: { screenId: 'm' } } } },
                { id: 'nav', type: 'NavBar', props: { widePlacement }, children: [{ id: 'item', type: 'NavItem', props: { icon: 'home', label: { kind: 'literal', value: 'Home' }, action: { type: 'none' } } }] },
              ],
            },
          },
          {
            screenId: 'm',
            name: 'm',
            presentation: 'modal',
            modalPlacement: placement,
            root: { id: 'm-root', type: 'Screen', props: {}, style: { radius }, children: [{ id: 'm-text', type: 'Text', props: { content: { kind: 'literal', value: 'x' } } }] },
          },
        ],
      }) as unknown as UiDocument
    const radii: unknown[] = [HOSTILE_STRING, HOSTILE_NUMBER, { topStart: HOSTILE_STRING, topEnd: HOSTILE_NUMBER }, { topStart: 'lg', bottomEnd: HOSTILE_STRING }, { [HOSTILE_STRING]: 'lg', topEnd: 'lg' }]
    const probe = (placement: unknown, widePlacement: unknown, radius: unknown, widthClass: WidthClass, what: string): void => {
      const { container, unmount } = render(<HotlayoutScreen document={document(placement, widePlacement, radius)} initialWidthClass={widthClass} injectStyles={false} onReport={() => undefined} />)
      fireEvent.click(container.querySelector('[data-hl-node="open"]')!)
      expectClean(container.innerHTML, what)
      // A word that is not a field word reads as the default: the layer has the shape, not a hostile string.
      expect(['sheet', 'window', 'sheetWindow']).toContain(container.querySelector('[data-hl-presentation="modal"]')?.getAttribute('data-hl-shape'))
      unmount()
    }
    for (const widthClass of WIDTH_CLASSES) {
      for (const hostile of hostileWords) {
        probe(hostile, 'top', 'lg', widthClass, `${widthClass}: modalPlacement`)
        const { container, unmount } = render(<HotlayoutScreen document={document(undefined, hostile, 'lg')} initialWidthClass={widthClass} injectStyles={false} onReport={() => undefined} />)
        expectClean(container.innerHTML, `${widthClass}: widePlacement`)
        // An unknown word is the default: on a wide class the bar is at the top (own strip), on `compact` at the bottom.
        expect(container.querySelector('[data-hl-zone="navTop"]') !== null, `${widthClass}: ${typeof hostile}`).toBe(widthClass !== 'compact')
        unmount()
      }
      for (const radius of radii) probe(undefined, 'top', radius, widthClass, `${widthClass}: radius`)
    }
  })

    it.each([
    // The last number is how many leaves the document MUST have (the guard is not empty): the 9.6 and 9.7 fixtures are smaller than the catalog.
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
  ] as const)('document "%s": each leaf in turn, a hostile string and a hostile number', (name, document, theme, atLeast) => {
    const leaves = leavesOf(document).filter((path) => {
      // We do not touch the version, the widget type and the screen address: without them a different tree is drawn, not this value.
      const key = path[path.length - 1]
      return key !== 'schemaVersion' && key !== 'type' && key !== 'screenId' && key !== 'initialScreenId' && key !== 'kind'
    })
    expect(leaves.length).toBeGreaterThan(atLeast)
    for (const path of leaves) {
      const where = `${name}: ${path.join('.')}`
      const only = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : undefined
      eachScreen(replaced(document, path, HOSTILE_STRING) as UiDocument, theme, where, only)
      eachScreen(replaced(document, path, HOSTILE_NUMBER) as UiDocument, theme, where, only)
    }
  }, 120_000)

  it('document: `kind` and `type` are also strings from the network', () => {
    for (const document of [CATALOG, RICH_TEXT, PROGRESS, ACTIONS, MEDIA_CHROME, OFFSET, CAROUSEL_STEPS, INPUTS]) {
      for (const path of leavesOf(document).filter((candidate) => ['type', 'kind'].includes(String(candidate[candidate.length - 1])))) {
        eachScreen(replaced(document, path, HOSTILE_STRING) as UiDocument, undefined, path.join('.'))
      }
    }
  }, 60_000)

  it.each([
    ['showcase', SHOWCASE_THEME],
    ['built-in', THEME_ARTIFACT.contract],
  ] as const)('theme "%s": each leaf and each KEY in turn', (name, theme) => {
    const leaves = leavesOf(theme).filter((path) => path[path.length - 1] !== 'themeContractVersion' && path[path.length - 1] !== 'defaultThemeId')
    expect(leaves.length).toBeGreaterThan(100)
    const keys = new Map<string, Path>()
    for (const path of leaves) for (let depth = 2; depth <= path.length; depth += 1) keys.set(path.slice(0, depth).join('\u0000'), path.slice(0, depth))

    for (const path of leaves) {
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
    for (const path of keys.values()) {
      // Keys of the themes themselves (`themes.light`) are theme identifiers: they do not go into CSS, but there is no theme without them.
      if (path.length === 2 && path[0] === 'themes') continue
      const mutated = renamedKey(theme, path, `x:1;position:fixed;inset:0;--y`) as ThemeContract
      eachScreen(CATALOG, mutated, `theme key ${name}: ${path.join('.')}`)
    }
  }, 120_000)

  it('host data and collections: an image address from data is only https', () => {
    const hostile: Record<string, unknown> = {}
    for (const key of Object.keys(data)) hostile[key] = `javascript:alert(1)//${HOSTILE_STRING}`
    const records = Object.fromEntries(Object.entries(collections).map(([name, list]) => [name, list.map((record) => Object.fromEntries(Object.keys(record).map((key) => [key, `http://${MARK}/${key}.png`])))]))
    for (const document of [CATALOG, SHOWCASE]) {
      const ids = document.screens.map((entry) => entry.screenId)
      for (const screenId of ids) {
        expectClean(renderToStaticMarkup(<HotlayoutScreen document={{ ...document, initialScreenId: screenId }} data={hostile} collections={records} injectStyles={false} onReport={silent} />), `data: ${screenId}`)
      }
    }
  })

  /*
   * THE READER OPENS NOTHING ITSELF (schema 9.8.0). An address from the document, opened
   * without the app's word, is a phishing page in one published file. The only place in the package
   * where `window.open` is allowed is the standard-action helper called by the HOST
   * (`openInNewTab`); the render path has neither it, nor a page navigation, nor a link with a
   * document address.
   */
  it('sources: `window.open`, `location` and `<a href>` only in the standard-action helper', () => {
    const dir = SRC_DIR
    const sources = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.'))
    const code = (file: string): string =>
      readFileSync(join(dir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
    const FORBIDDEN = [/\bwindow\.open\b/, /\bopen\(\s*[^)]*['"]_(?:blank|self|top|parent)['"]/, /\blocation\s*\.\s*(?:assign|replace|href|reload)\b/, /\blocation\s*=[^=]/, /\bnavigation\.navigate\b/, /<a[\s>]/, /createElement\(\s*['"]a['"]/, /\.click\(\)/]
    for (const file of sources) {
      for (const pattern of FORBIDDEN) {
        if (file === 'standard-actions.ts' && (pattern === FORBIDDEN[0] || pattern === FORBIDDEN[1])) continue
        expect(code(file), `${file}: ${String(pattern)}`).not.toMatch(pattern)
      }
    }
    // The helper is the only one, and exactly in `openInNewTab`, which the host plugs in deliberately.
    expect(code('standard-actions.ts').match(/window\.open/g)).toHaveLength(1)
  })

  it('sources: `url(` is composed only by sanitize.ts, and JSON.stringify does not go into a style', () => {
    const dir = SRC_DIR
    const sources = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => /\.tsx?$/.test(file) && !file.includes('.test.'))
    const code = (file: string): string =>
      readFileSync(join(dir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
    for (const file of sources) {
      if (file === 'sanitize.ts') continue
      expect(code(file), file).not.toMatch(/url\(/)
    }
    for (const file of ['resolve.ts', 'theme.ts', 'style.ts', 'style-box.ts', 'style-roles.ts', 'layout-rules.ts', 'render.tsx', ...sources.filter((name) => name.startsWith('render/'))]) {
      // A raw string into a style: `JSON.stringify(value)` and a prop cast to a CSS property type.
      expect(code(file), file).not.toMatch(/JSON\.stringify\(/)
      expect(code(file), file).not.toMatch(/as CSSProperties\[/)
      // A table indexed by a document value is read through `lookup`, not with brackets.
      expect(code(file), file).not.toMatch(/\[(?:props|node\.props|source|value|slot)\.[A-Za-z]+\]/)
    }
  })
})

/* ───────────────────────────── shape ───────────────────────────── */

describe('tree shape', () => {
  it('what is not a node is dropped with a report; the rest stays', () => {
    const issues: string[] = []
    const shaped = shapeRoot(JSON.parse('{"id":"r","type":"Column","props":{},"children":[null,7,{"id":"t","type":"Text","props":{"content":{"kind":"literal","value":"x"}}},{"type":"Row","children":{}}]}'), (issue) => issues.push(issue.where))
    expect(shaped.kind).toBe('ok')
    if (shaped.kind !== 'ok') return
    expect(shaped.root.children?.map((child) => child.type)).toEqual(['Text', 'Row'])
    expect(shaped.root.children?.[1]?.props).toEqual({})
    expect(issues.length).toBeGreaterThanOrEqual(4)
  })

  it('a tree deeper than the limit is refused, not a stack overflow; traversal is not recursive', () => {
    let node: Record<string, unknown> = { id: 'leaf', type: 'Column', props: {} }
    for (let depth = 0; depth < 50_000; depth += 1) node = { id: `n${String(depth)}`, type: 'Column', props: {}, children: [node] }
    expect(shapeRoot(node)).toEqual({ kind: 'rejected', reason: 'max_depth_exceeded' })
  })

  it('an own colour that is not a colour is named in the report', () => {
    const reports: HotlayoutReport[] = []
    const document = documentWith([{ id: 't', type: 'Text', props: { content: lit('x') }, style: { color: { value: 'red;position:fixed' }, background: { kind: 'color', color: { value: '#ffffff' } } } }])
    render(<HotlayoutScreen document={document} onReport={(report) => reports.push(report)} />)
    const ignored = reports.filter((report) => report.kind === 'ignored-input')
    expect(ignored).toHaveLength(1)
    expect(ignored[0]).toMatchObject({ where: 'node “t”: style' })
  })

  it('theme: dropped entries are listed in the report, the core is completed by the built-in theme', () => {
    const contract = JSON.parse(
      JSON.stringify({
        themeContractVersion: READER_THEME_VERSION,
        defaultThemeId: 't',
        themes: { t: { id: 't', name: 'T', brightness: 'dark', color: { primary: 'red', brandCoral: '#ff7f50', 'x;y': '#000000' }, spacing: { md: '16', xl: 1e9 } } },
      }),
    ) as ThemeContract
    const { theme, reports } = resolveTheme(contract)
    expect(reports).toEqual([{ kind: 'invalid-theme-values', paths: ['spacing.md', 'spacing.xl (out of bounds: built-in value)', 'color.primary', 'color.x;y'] }])
    const dark = THEME_ARTIFACT.contract.themes.dark
    expect(theme.color.primary).toBe(dark?.color.primary)
    expect(theme.color.brandCoral).toBe('#ff7f50')
    expect(theme.spacing.md).toBe(dark?.spacing.md)
    // Out of bounds (`x-themeNumbers`): the same token of the built-in theme of the same brightness, not the bound.
    expect(theme.spacing.xl).toBe(dark?.spacing.xl)
    expect(Object.keys(theme.color)).not.toContain('x;y')
  })

  it('a well-formed theme passes parsing unchanged and without a report', () => {
    for (const contract of [THEME_ARTIFACT.contract, SHOWCASE_THEME]) {
      for (const [id, theme] of Object.entries(contract.themes)) {
        const { theme: shaped, dropped } = sanitizeTheme(theme, id)
        expect(dropped).toEqual([])
        for (const dictionary of ['spacing', 'radius', 'color', 'typography', 'elevation', 'gradient', 'roles', 'fontFamilies'] as const) expect(shaped[dictionary]).toEqual(theme[dictionary])
      }
    }
  })

  it('a theme with a hundred thousand tokens does not become a hundred thousand variables on the root', () => {
    const color: Record<string, string> = {}
    for (let index = 0; index < 100_000; index += 1) color[`c${String(index)}`] = '#000000'
    const { theme, reports } = resolveTheme({ themeContractVersion: READER_THEME_VERSION, defaultThemeId: 't', themes: { t: { id: 't', name: 'T', brightness: 'light', color } } })
    expect(Object.keys(themeCssVariables(theme)).length).toBeLessThan(400)
    expect(reports.some((report) => report.kind === 'invalid-theme-values')).toBe(true)
  })
})

/* ───────────────────────────── error boundary ───────────────────────────── */

/** A document that throws DURING render: a getter on a field the widget reads. It cannot be legal JSON; it stands for something the defensive read did not foresee. */
function throwingDocument(): UiDocument {
  const document = documentWith([{ id: 't', type: 'Text', props: { content: lit('visible text') } }])
  const text = document.screens[0]?.root.children?.[0]
  if (text !== undefined) {
    Object.defineProperty(text.props, 'maxLines', {
      enumerable: true,
      get: () => {
        throw new Error('boom from the document')
      },
    })
  }
  return document
}

describe('error boundary around the screen', () => {
  it('in the browser: a render exception does not reach the host; a notice and a report', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reports: HotlayoutReport[] = []
    const view = render(
      <main>
        <button type="button">Bank transfer</button>
        <HotlayoutScreen document={throwingDocument()} onReport={(report) => reports.push(report)} />
      </main>,
    )
    // The host tree is intact.
    expect(screen.getByRole('button', { name: 'Bank transfer' })).toBeDefined()
    expect(screen.getByRole('alert').textContent).toBe('This screen is not available right now.')
    expect(view.container.textContent).not.toContain('visible text')
    expect(reports).toContainEqual({ kind: 'render-error', screenId: 'a', message: 'boom from the document' })
  })

  it('renderError replaces the notice; the report about the same error is one, however many times the host re-renders', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reports: HotlayoutReport[] = []
    const document = throwingDocument()
    const element = (): React.ReactElement => (
      <HotlayoutScreen document={document} onReport={(report) => reports.push(report)} renderError={({ screenId, message }) => <p data-testid="own">{`${screenId}: ${message}`}</p>} />
    )
    const view = render(element())
    view.rerender(element())
    view.rerender(element())
    expect(screen.getByTestId('own').textContent).toBe('a: boom from the document')
    expect(reports.filter((report) => report.kind === 'render-error')).toHaveLength(1)
  })

  it('another document is a new attempt: the notice does not stay forever', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(<HotlayoutScreen document={throwingDocument()} onReport={() => undefined} />)
    expect(screen.getByRole('alert')).toBeDefined()
    view.rerender(<HotlayoutScreen document={{ ...documentWith([{ id: 't', type: 'Text', props: { content: lit('repaired') } }]), documentId: 'other' }} onReport={() => undefined} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('repaired')).toBeDefined()
  })

  it('on the server: renderToString does not throw; the markup has the notice, the rest of the page is intact', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let html = ''
    expect(() => {
      html = renderToString(
        <main>
          <h1>Bank</h1>
          <HotlayoutScreen document={throwingDocument()} onReport={() => undefined} />
        </main>,
      )
    }).not.toThrow()
    expect(html).toContain('<h1>Bank</h1>')
    expect(html).toContain('This screen is not available right now.')
    expect(html).not.toContain('visible text')
  })

  it('on the server: renderToStaticMarkup, the same', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let html = ''
    expect(() => {
      html = renderToStaticMarkup(<HotlayoutScreen document={throwingDocument()} onReport={() => undefined} renderError={() => <p>own notice</p>} />)
    }).not.toThrow()
    expect(html).toContain('own notice')
  })

  it('what arrived instead of a document is a refusal, not a crash', () => {
    for (const notDocument of [null, undefined, 'x', 7, [], true]) {
      const reports: HotlayoutReport[] = []
      expect(() => render(<HotlayoutScreen document={notDocument as unknown as UiDocument} onReport={(report) => reports.push(report)} />)).not.toThrow()
      expect(reports.map((report) => report.kind)).toContain('incompatible-document')
      expect(() => renderToString(<HotlayoutScreen document={notDocument as unknown as UiDocument} onReport={() => undefined} />)).not.toThrow()
      cleanup()
    }
  })

  it('host data and collections of the wrong shape do not crash the screen either', () => {
    const document = documentWith([
      { id: 'r', type: 'Repeater', props: { source: 'items', item: 'item' }, children: [{ id: 't', type: 'Text', props: { content: { kind: 'binding', path: 'item.name', fallback: '—' } } }] },
    ])
    for (const collections of [null, 7, { items: 'oops' }, { items: [null, 7, 'x', { name: { a: 1 } }, { name: 'ok' }] }]) {
      expect(() => render(<HotlayoutScreen document={document} data={null as unknown as DataScope} collections={collections as unknown as Collections} onReport={() => undefined} />)).not.toThrow()
      cleanup()
    }
  })
})

/* ───────────────────────────── host boundaries ───────────────────────────── */

describe('what reaches the host', () => {
  const group = (path: string): unknown => ({
    id: 'group',
    type: 'ChoiceGroup',
    props: { value: { kind: 'binding', path, fallback: '' } },
    children: [{ id: 'opt', type: 'ListTile', props: { title: lit('Accept'), leading: { kind: 'none' }, trailing: { kind: 'radio', optionValue: 'yes' } } }],
  })

  it('writablePaths: writes only along the listed paths; a refusal goes into the report', () => {
    const onWrite = vi.fn()
    const reports: HotlayoutReport[] = []
    const view = render(<HotlayoutScreen document={documentWith([group('user.isAdmin')])} onWrite={onWrite} writablePaths={['item.selectedId']} onReport={(report) => reports.push(report)} />)
    fireEvent.click(screen.getByRole('radio'))
    expect(onWrite).not.toHaveBeenCalled()
    // The choice stays local group state, as for a group without a binding.
    expect(screen.getByRole('radio').getAttribute('aria-checked')).toBe('true')
    // The report delivers the effect of the next commit.
    view.rerender(<HotlayoutScreen document={documentWith([group('user.isAdmin')])} onWrite={onWrite} writablePaths={['item.selectedId']} onReport={(report) => reports.push(report)} />)
    expect(reports.some((report) => report.kind === 'ignored-input' && report.where === 'onWrite path')).toBe(true)
    view.unmount()

    render(<HotlayoutScreen document={documentWith([group('item.selectedId')])} onWrite={onWrite} writablePaths={['item.selectedId']} onReport={() => undefined} />)
    fireEvent.click(screen.getByRole('radio'))
    expect(onWrite).toHaveBeenCalledWith('item.selectedId', 'yes')
  })

  it('without writablePaths: a dictionary-shaped path gets through, the rest does not', () => {
    const onWrite = vi.fn()
    render(<HotlayoutScreen document={documentWith([group('item.selectedId')])} onWrite={onWrite} onReport={() => undefined} />)
    fireEvent.click(screen.getByRole('radio'))
    expect(onWrite).toHaveBeenCalledWith('item.selectedId', 'yes')
    cleanup()

    const refused = vi.fn()
    render(<HotlayoutScreen document={documentWith([group('a[0].b')])} onWrite={refused} onReport={() => undefined} />)
    fireEvent.click(screen.getByRole('radio'))
    expect(refused).not.toHaveBeenCalled()
  })

  it('action: the host gets exactly `type` and string parameters; `navigate` works as before', () => {
    const received: HotlayoutAction[] = []
    const document = documentWith([
      { id: 'b', type: 'Button', props: { label: lit('go'), variant: 'primary', action: { type: 'open', params: { id: '7', deep: { a: 1 }, n: 5 }, extra: { constructor: { prototype: {} } } } } },
    ])
    render(<HotlayoutScreen document={document} onAction={(action) => received.push(action)} onReport={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(received).toEqual([{ type: 'open', params: { id: '7' } }])
  })

  it('resolveImageUrl: the host allows its own host and localhost; the rest is a placeholder and a report', () => {
    const reports: HotlayoutReport[] = []
    const image = (id: string, url: string): unknown => ({ id, type: 'Image', props: { source: { kind: 'url', url }, aspectRatio: '1:1', alt: id } })
    const document = documentWith([image('own', 'https://cdn.bank.example/a.png'), image('dev', 'http://localhost:5173/a.png'), image('foreign', 'https://attacker.test/pixel.gif')])
    const view = render(
      <HotlayoutScreen
        document={document}
        resolveImageUrl={(url) => (url.startsWith('https://cdn.bank.example/') || url.startsWith('http://localhost:') ? url : null)}
        onReport={(report) => reports.push(report)}
      />,
    )
    const srcOf = (id: string): string | null => view.container.querySelector(`[data-hl-node="${id}"]`)?.getAttribute('src') ?? null
    expect(srcOf('own')).toBe('https://cdn.bank.example/a.png')
    expect(srcOf('dev')).toBe('http://localhost:5173/a.png')
    expect(srcOf('foreign')).toBeNull()
    expect(view.container.querySelector('[data-hl-node="foreign"]')?.getAttribute('role')).toBe('img')
    expect(reports.filter((report) => report.kind === 'ignored-input' && report.where.includes('attacker.test'))).toHaveLength(1)
  })

  it('background image: `http:` and `data:` do not become background-image', () => {
    const box = (id: string, url: string): unknown => ({ id, type: 'Container', props: {}, style: { background: { kind: 'image', source: { kind: 'url', url }, fit: 'cover' } } })
    const html = renderToStaticMarkup(
      <HotlayoutScreen document={documentWith([box('a', 'http://attacker.test/x.png'), box('b', 'data:image/svg+xml,<svg/>'), box('c', 'https://cdn.example/ok.png')])} injectStyles={false} onReport={() => undefined} />,
    )
    expect(html).not.toContain('attacker.test')
    expect(html).not.toContain('data:image/svg+xml,&lt;svg/')
    expect(decode(html)).toContain('background-image:url("https://cdn.example/ok.png")')
  })
})

/* ───────────────────────────── root ───────────────────────────── */

describe('package root', () => {
  it('clips and isolates content; the host `style` has the last word', () => {
    const document = documentWith([{ id: 't', type: 'Text', props: { content: lit('x') } }])
    const view = render(<HotlayoutScreen document={document} onReport={() => undefined} />)
    const root = view.container.querySelector<HTMLElement>('[data-hotlayout]')
    expect(root?.style.overflow).toBe('clip')
    expect(root?.style.contain).toBe('layout paint')
    view.unmount()

    const scrolling = render(<HotlayoutScreen document={document} style={{ overflow: 'auto', blockSize: 300 }} onReport={() => undefined} />)
    const own = scrolling.container.querySelector<HTMLElement>('[data-hotlayout]')
    expect(own?.style.overflow).toBe('auto')
    // Clipping from `contain` stays.
    expect(own?.style.contain).toBe('layout paint')
  })
})

/* ───────────────────────────── conditions and collections ───────────────────────────── */

describe('a condition on a collection path sees the collection (`absentCollection: empty`)', () => {
  const { data, collections } = sampleData()
  const EMPTY_STATES = ['New missions arrive every Monday']

  /** Texts of document nodes shown only under an `isEmpty` condition on a collection path. */
  function emptyStateTexts(document: UiDocument): readonly string[] {
    const names = new Set(COLLECTION_PATHS)
    const found: string[] = []
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return
      const record = node as { visibleIf?: { path?: string; op?: string }; props?: { content?: { kind?: string; value?: string } }; children?: unknown[] }
      if (record.visibleIf?.op === 'isEmpty' && names.has(record.visibleIf.path ?? '')) {
        const texts: string[] = []
        const collect = (inner: unknown): void => {
          if (typeof inner !== 'object' || inner === null) return
          const item = inner as { props?: { content?: { kind?: string; value?: string } }; children?: unknown[] }
          if (item.props?.content?.kind === 'literal' && typeof item.props.content.value === 'string') texts.push(item.props.content.value)
          for (const child of item.children ?? []) collect(child)
        }
        collect(node)
        found.push(...texts)
      }
      for (const child of record.children ?? []) walk(child)
    }
    for (const entry of document.screens) walk(entry.root)
    return found
  }

  it('the showcase has empty states bound to collections (otherwise the test below checks nothing)', () => {
    expect(emptyStateTexts(SHOWCASE)).toEqual(expect.arrayContaining(EMPTY_STATES))
    expect(emptyStateTexts(SHOWCASE).length).toBeGreaterThanOrEqual(2)
  })

  it.each(SHOWCASE.screens.map((entry) => entry.screenId))('showcase, screen "%s": empty states are hidden with data and shown without data', (screenId) => {
    const texts = emptyStateTexts({ ...SHOWCASE, screens: SHOWCASE.screens.filter((entry) => entry.screenId === screenId) })
    const shown = { ...SHOWCASE, initialScreenId: screenId }

    const withData = render(<HotlayoutScreen document={shown} theme={SHOWCASE_THEME} data={data} collections={collections} onReport={() => undefined} />)
    for (const text of texts) expect(withData.queryByText(text), `with data: "${text}"`).toBeNull()
    withData.unmount()

    const withoutData = render(<HotlayoutScreen document={shown} theme={SHOWCASE_THEME} onReport={() => undefined} />)
    for (const text of texts) expect(withoutData.queryAllByText(text).length, `without data: "${text}"`).toBeGreaterThan(0)
    withoutData.unmount()

    // The collection exists but is empty: the same as having none.
    const emptied = render(<HotlayoutScreen document={shown} theme={SHOWCASE_THEME} data={data} collections={Object.fromEntries(Object.keys(collections).map((name) => [name, []]))} onReport={() => undefined} />)
    for (const text of texts) expect(emptied.queryAllByText(text).length, `empty collection: "${text}"`).toBeGreaterThan(0)
  })

  it('`isNotEmpty` on a collection is the mirror; a value from `data` at the same path wins', () => {
    const document = documentWith([
      { id: 'has', type: 'Text', props: { content: lit('has items') }, visibleIf: { path: 'items', op: 'isNotEmpty' } },
      { id: 'none', type: 'Text', props: { content: lit('no items') }, visibleIf: { path: 'items', op: 'isEmpty' } },
    ])
    const view = render(<HotlayoutScreen document={document} collections={{ items: [{ name: 'a' }] }} onReport={() => undefined} />)
    expect(view.queryByText('has items')).not.toBeNull()
    expect(view.queryByText('no items')).toBeNull()
    view.rerender(<HotlayoutScreen document={document} collections={{ items: [{ name: 'a' }] }} data={{ items: [] }} onReport={() => undefined} />)
    expect(view.queryByText('has items')).toBeNull()
    expect(view.queryByText('no items')).not.toBeNull()
  })
})

/* ───────────────────────────── locale ───────────────────────────── */

describe('format locale is a well-formed tag', () => {
  it('the engine accepts everything the rule calls well-formed', () => {
    const languages = ['en', 'ar', 'zh', 'ckb', 'sr', 'abcde']
    const scripts = ['', 'Hant', 'Latn', 'Arab']
    const regions = ['', 'US', 'EG', '419']
    const variants = ['', 'valencia', '1996']
    const extensions = ['', 'u-ca-gregory', 'u-nu-latn', 'x-private']
    let checked = 0
    for (const language of languages)
      for (const script of scripts)
        for (const region of regions)
          for (const variant of variants)
            for (const extension of extensions) {
              const tag = [language, script, region, variant, extension].filter((part) => part !== '').join('-')
              const normalized = normalizeLocaleTag(tag)
              expect(wellFormedLocaleTag(normalized), tag).toBe(normalized)
              expect(() => new Intl.DateTimeFormat(normalized), tag).not.toThrow()
              checked += 1
            }
    expect(checked).toBeGreaterThan(1000)
  })

  it.each([
    ['ja_JP_JP', 'ja-JP'],
    ['th_TH_TH', 'th-TH'],
    ['ar-EG-u', 'ar-EG'],
    ['ar-EG-EG', 'ar-EG'],
    ['en-US-u-ca-gregory', 'en-US-u-ca-gregory'],
    ['zh-Hant-TW', 'zh-Hant-TW'],
    ['abcd', undefined],
  ])('%s → %s', (requested, expected) => {
    expect(wellFormedLocaleTag(normalizeLocaleTag(requested))).toBe(expected)
  })

  it('the lookup chain takes the same steps as before; a string over the limit is not a tag', () => {
    expect(localeLookupChain('zh-Hant-TW')).toEqual(['zh-Hant-TW', 'zh-Hant', 'zh'])
    expect(localeLookupChain('en-US-u-ca-gregory')).toEqual(['en-US-u-ca-gregory', 'en-US-u-ca', 'en-US', 'en'])
    expect(localeLookupChain('en-a-b-c')).toEqual(['en-a-b-c', 'en'])
    expect(localeLookupChain('en')).toEqual(['en'])
    expect(normalizeLocaleTag(`ar${'-bb'.repeat(40)}`)).toBeUndefined()
    expect(localeLookupChain('a'.repeat(MAX_LOCALE_TAG_LENGTH + 1))).toEqual([])
  })
})

/*
 * IMAGE ADDRESS FROM DATA: the 2048 bound is a document field; for data the host's word comes
 * first, then the 512 KB ceiling, and whatever becomes `src` still passes the policy.
 */
describe('image address from data: the host word, the ceiling, hostile schemes', () => {
  const big = `data:image/webp;base64,${'A'.repeat(9000)}`
  const reports: string[] = []
  const policy = (resolve?: ResolveImageUrl) => imagePolicy(resolve, (_url, reason) => reports.push(reason))

  it('without a host word: the default rule is https up to 2048; a large data: is rejected', () => {
    const p = policy()
    expect(p.src(big, 'image', 'data')).toBeUndefined()
    expect(p.src(`https://x.test/${'a'.repeat(3000)}`, 'image', 'data')).toBeUndefined()
    expect(p.src('https://x.test/a.png', 'image', 'data')).toBe('https://x.test/a.png')
  })

  it('with a host word: a nine-kilobyte address from data passes, a document literal does not', () => {
    const p = policy((url) => url)
    expect(p.src(big, 'image', 'data')).toBe(big)
    expect(p.src(big, 'image', 'document')).toBeUndefined()
  })

  it('512 KB ceiling for an address from data and for a host answer', () => {
    const p = policy((url) => url)
    expect(p.src(`data:image/webp;base64,${'A'.repeat(512 * 1024)}`, 'image', 'data')).toBeUndefined()
    expect(policy(() => `data:image/webp;base64,${'A'.repeat(512 * 1024)}`).src('https://x.test/a.png', 'image', 'data')).toBeUndefined()
  })

  it('javascript: and vbscript: are never images, even when the host approved everything', () => {
    const p = policy((url) => url)
    for (const url of ['javascript:alert(1)', ' JavaScript:alert(1)', 'vbscript:x']) {
      expect(p.src(url, 'image', 'data'), url).toBeUndefined()
      expect(p.css(url, 'background', 'data'), url).toBeUndefined()
    }
  })

  it('without a host word, data:text/html, data:image/svg+xml and javascript: from data give a placeholder', () => {
    const p = policy()
    for (const url of ['data:text/html,<script>alert(1)</script>', 'data:image/svg+xml,<svg onload=alert(1)/>', 'javascript:alert(1)']) expect(p.src(url, 'image', 'data'), url).toBeUndefined()
  })

  it('an address from data in a background goes through cssUrl: quote and bracket are escaped', () => {
    const css = policy((url) => url).css('data:image/webp;base64,AA")};x{', 'background', 'data')
    expect(css).toBeDefined()
    expect(css).not.toContain('")};')
  })
})
