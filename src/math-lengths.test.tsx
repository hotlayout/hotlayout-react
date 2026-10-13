/**
 * THEME LENGTHS IN CSS MATH: a guard for a CLASS of bug.
 *
 * The spacing variable `--product-space-none` equals `0` WITHOUT a unit. Inside `calc()`, `max()`,
 * `min()`, `clamp()`, in an addition, a subtraction or a comparison with a length, a bare `0`
 * makes the WHOLE expression invalid, and an invalid declaration silently drops out: the computed
 * field is `0px` and no error shows it. This happened with `contentMaxWidth` (9.18) and with a
 * pulled first body child (`pull` with gap `none`).
 *
 * The rule: math gets the NUMBER from the theme in logical pixels (`spacingMathCss`), not
 * `var(--product-space-…)`. The guard reads every `style` the package writes on ALL contract
 * fixtures in the three width classes, and again on the same documents with EVERY spacing token
 * replaced by `none`, and fails if a spacing variable stands inside a math function. It catches the
 * class, not one string.
 */
import { cleanup } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { sampleData } from '../test-support/sample-data'

import { HotlayoutScreen } from './index'
import type { ThemeContract, UiDocument } from './index'
import { spacingMathCss } from './resolve'
import { resolveTheme } from './theme-resolve'
import { WIDTH_CLASSES } from './width-class'

afterEach(cleanup)

const FIXTURES = 'contract/fixtures'
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))
const silent = (): void => undefined

const MATH = /\b(?:calc|max|min|clamp)\(/g
const SPACE_VAR = /var\(\s*--product-space-/

/** Every outermost math expression that contains a spacing variable (brackets balanced). */
function mathUsesOfSpaceVar(style: string): string[] {
  const found: string[] = []
  let skipUntil = 0
  for (const start of style.matchAll(MATH)) {
    const from = start.index
    if (from < skipUntil) continue
    let depth = 1
    let index = from + start[0].length
    while (index < style.length && depth > 0) {
      if (style[index] === '(') depth += 1
      else if (style[index] === ')') depth -= 1
      index += 1
    }
    skipUntil = index
    const expression = style.slice(from, index)
    if (SPACE_VAR.test(expression)) found.push(expression)
  }
  return found
}

function stylesOf(html: string): string[] {
  const out: string[] = []
  for (const match of html.matchAll(/style="([^"]*)"/g)) out.push((match[1] ?? '').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&'))
  return out
}

const SPACING_WORDS = new Set(['xs', 'sm', 'md', 'lg', 'xl'])

/** The same document where every spacing token is `none` (the worst case for a bare `0`). */
function withNoneSpacing(value: unknown): unknown {
  if (typeof value === 'string') return SPACING_WORDS.has(value) ? 'none' : value
  if (Array.isArray(value)) return value.map(withNoneSpacing)
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withNoneSpacing(item)]))
  return value
}

describe('guard: a spacing variable does not stand in CSS math', () => {
  it('the parser itself sees both a good and a bad expression', () => {
    expect(mathUsesOfSpaceVar('margin:calc(-1 * max(0px, calc(56px - var(--product-space-none))))')).toHaveLength(1)
    expect(mathUsesOfSpaceVar('padding:var(--product-space-md);margin:calc(10px - 4px)')).toHaveLength(0)
    expect(mathUsesOfSpaceVar('a:calc(1px + var(--product-space-sm));b:min(1px, var(--product-space-xs))')).toHaveLength(2)
  })

  const { data, collections } = sampleData()
  const files = readdirSync(FIXTURES).filter((name) => name.endsWith('.json'))

  it.each(files)('%s (as is and with all spacings `none`)', (name) => {
    const document = read(join(FIXTURES, name)) as UiDocument
    const theme = name === 'rewards-showcase-screens.json' ? (read(join(FIXTURES, 'themes', 'rewards-showcase-theme.json')) as ThemeContract) : undefined
    for (const [label, source] of [
      ['as is', document],
      ['all none', withNoneSpacing(document) as UiDocument],
    ] as const) {
      const screens = (source as unknown as { screens?: readonly { screenId?: string }[] }).screens
      const ids = Array.isArray(screens) ? screens.map((entry: { screenId?: string }) => entry.screenId).filter((id): id is string => typeof id === 'string') : []
      for (const widthClass of WIDTH_CLASSES) {
        for (const screenId of ids.length === 0 ? [undefined] : ids) {
          const shown = screenId === undefined ? source : ({ ...source, initialScreenId: screenId } as UiDocument)
          const html = renderToStaticMarkup(<HotlayoutScreen document={shown} theme={theme} data={data} collections={collections} initialWidthClass={widthClass} injectStyles={false} onReport={silent} />)
          for (const style of stylesOf(html)) expect(mathUsesOfSpaceVar(style), `${name} ${label} ${screenId ?? ''} ${widthClass}`).toEqual([])
        }
      }
    }
  })
})

describe('spacingMathCss: a length for math always has a unit', () => {
  const { theme } = resolveTheme(undefined)
  it('none, a theme token, a number, unknown', () => {
    expect(spacingMathCss('none', theme)).toBe('0px')
    expect(spacingMathCss('md', theme)).toMatch(/^\d+(\.\d+)?px$/)
    expect(spacingMathCss(56, theme)).toBe('56px')
    expect(spacingMathCss(0, theme)).toBe('0px')
    expect(spacingMathCss('nonexistent', theme)).toBeUndefined()
    expect(spacingMathCss(undefined, theme)).toBeUndefined()
  })
})

/** A screen with an app bar and a pulled first body child (`pull`) at a given gap. */
function pulledScreen(gap: string, pull: string | number): UiDocument {
  return {
    schemaVersion: '9.18.0',
    documentId: 'pulled',
    name: 'pulled',
    initialScreenId: 'main',
    screens: [
      {
        screenId: 'main',
        name: 'main',
        root: {
          id: 'root',
          type: 'Screen',
          props: { gap },
          children: [
            { id: 'bar', type: 'AppBar', props: { title: { kind: 'literal', value: 'T' }, showBack: false } },
            { id: 'hero', type: 'Container', props: { gap: 'none' }, pull, children: [{ id: 't', type: 'Text', props: { content: { kind: 'literal', value: 'x' } } }] },
          ],
        },
      },
    ],
  }
}

describe('a pulled first child lifts the body: overlap = pull − gap, in theme numbers', () => {
  const { theme } = resolveTheme(undefined)
  const px = (token: string | number): number => (typeof token === 'number' ? token : token === 'none' ? 0 : (theme.spacing[token] ?? 0))
  const cases: readonly (readonly [string, string | number])[] = [
    ['none', 56],
    ['sm', 56],
    ['md', 56],
    ['md', 'xl'],
    ['none', 'md'],
    ['md', 4],
    ['none', 'none'],
  ]
  it.each(cases)('gap %s, pull %s', (gap, pull) => {
    // Markup, not DOM: jsdom drops nested `max(calc())` from the style and the test would see nothing.
    const html = renderToStaticMarkup(<HotlayoutScreen document={pulledScreen(gap, pull)} scroll="screen" injectStyles={false} onReport={silent} />)
    const body = /data-hl-zone="body" style="([^"]*)"/.exec(html)?.[1]
    if (body === undefined) throw new Error('there is no body zone')
    // Values with a unit: no variable and no bare zero, otherwise the browser silently drops the declaration.
    const overlap = `max(0px, calc(${String(px(pull))}px - ${String(px(gap))}px))`
    expect(body).toContain(`padding-block-start:${overlap}`)
    expect(body).toContain(`margin-block-start:calc(-1 * ${overlap})`)
  })

  it('the gap that decides the layout (--hl-gap) also has no bare variable', () => {
    const doc = withNoneSpacing(pulledScreen('sm', 4)) as UiDocument
    const html = renderToStaticMarkup(<HotlayoutScreen document={doc} injectStyles={false} onReport={silent} />)
    expect(html).not.toMatch(/--hl-gap:\s*var\(/)
  })
})
