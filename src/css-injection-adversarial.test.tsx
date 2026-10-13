/**
 * ADVERSARIAL: document and theme values that become CSS on the HOST page.
 *
 * The package writes appearance INLINE and theme values as CSS variables on the root. Both inputs
 * come from the network and the reader does not validate them. Three classes of attack here:
 *
 *  1. SERVER RENDER. `renderToString` builds the `style` attribute by concatenating
 *     `name:value;` and escapes only HTML. A semicolon in a value is a new declaration:
 *     `position:fixed;inset:0;z-index:…` on a node or on the package ROOT. Hydration does not
 *     repair the `style` attribute (React only warns in dev), so the injected markup stays on the
 *     page;
 *  2. A VALUE WITHIN ONE PROPERTY (also without the server): a "colour" that closes
 *     `linear-gradient(` and adds a `url(…)` layer makes a request to a foreign host from every
 *     user; a theme, which has no legitimate way to name an address, gets the same result;
 *  3. UNBOUNDED THEME NUMBERS. The theme schema limits spacing to 0…128 and shadow to ±64, the
 *     reader does not: a negative spacing pushes a node out of the package root over the host
 *     UI, a shadow with spread 100000 paints the whole page.
 *
 * Every test asserts the DESIRED outcome.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HotlayoutScreen, READER_SCHEMA_VERSION, READER_THEME_VERSION, resolveTheme } from './index'
import type { ThemeContract, UiDocument } from './index'
import { colorCss, gradientCss, shadowCss } from './resolve'
import { themeCssVariables } from './theme'
import type { GradientRef, ShadowRef } from './types'

const lit = (value: string): unknown => ({ kind: 'literal', value })

function documentWith(children: readonly unknown[], rootStyle?: unknown): UiDocument {
  return JSON.parse(
    JSON.stringify({
      schemaVersion: READER_SCHEMA_VERSION,
      documentId: 'doc',
      name: 'Doc',
      initialScreenId: 'a',
      screens: [{ screenId: 'a', name: 'A', root: { id: 'root', type: 'Screen', props: {}, style: rootStyle, children } }],
    }),
  ) as UiDocument
}

function themeWith(patch: Readonly<Record<string, unknown>>): ThemeContract {
  return JSON.parse(
    JSON.stringify({ themeContractVersion: READER_THEME_VERSION, defaultThemeId: 't', themes: { t: { id: 't', name: 'T', brightness: 'light', ...patch } } }),
  ) as ThemeContract
}

const ssr = (document: UiDocument, theme?: ThemeContract): string => renderToStaticMarkup(<HotlayoutScreen document={document} theme={theme} injectStyles={false} onReport={() => undefined} />)

/** All `style` attributes of the markup, decoded from HTML: exactly what a browser would parse. */
function stylesOf(html: string): readonly string[] {
  return [...html.matchAll(/style="([^"]*)"/g)].map((match) => (match[1] ?? '').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
}

/** Top-level declarations (outside strings and brackets), as a CSS parser would split them. */
function declarationsOf(style: string): readonly string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | undefined
  let current = ''
  for (let index = 0; index < style.length; index += 1) {
    const char = style.charAt(index)
    if (quote !== undefined) {
      // An unterminated CSS string ends at a line break (bad-string); declarations resume after it.
      if (char === '\n') quote = undefined
      else if (char === '\\') {
        current += char + style.charAt(index + 1)
        index += 1
        continue
      } else if (char === quote) quote = undefined
    } else if (char === '"' || char === "'") quote = char
    else if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (char === ';' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  parts.push(current.trim())
  return parts.filter((part) => part !== '')
}

const PAYLOAD = 'position:fixed;inset:0;z-index:2147483647'

function expectNoSmuggledDeclaration(html: string): void {
  const smuggled = stylesOf(html).flatMap(declarationsOf).filter((declaration) => /^(?:position\s*:\s*fixed|inset\s*:|z-index\s*:)/.test(declaration))
  expect(smuggled).toEqual([])
}

describe('server render: a document value does not become a NEW declaration in style', () => {
  it('own text colour `{ value }`', () => {
    const html = ssr(documentWith([{ id: 't', type: 'Text', props: { content: lit('Sign in') }, style: { color: { value: `red;${PAYLOAD}` } } }]))
    expectNoSmuggledDeclaration(html)
  })

  it('own container background colour: a fixed full-page layer with an injected button', () => {
    const html = ssr(
      documentWith([
        {
          id: 'overlay',
          type: 'Container',
          props: {},
          style: { background: { kind: 'color', color: { value: `#ffffff;${PAYLOAD}` } } },
          children: [{ id: 'b', type: 'Button', props: { label: lit('Confirm transfer'), variant: 'primary', action: { type: 'submit' } } }],
        },
      ]),
    )
    expectNoSmuggledDeclaration(html)
  })

  it('border colour, shadow layer and gradient stop', () => {
    const color = { value: `red;${PAYLOAD};--x:` }
    const html = ssr(
      documentWith([
        { id: 'a', type: 'Container', props: {}, style: { border: { width: 1, color } } },
        { id: 'b', type: 'Container', props: {}, style: { shadow: [{ offsetX: 0, offsetY: 0, blur: 0, spread: 0, color }] } },
        { id: 'c', type: 'Container', props: {}, style: { background: { kind: 'gradient', gradient: { angle: 0, stops: [{ color, position: 0 }, { color: 'primary', position: 1 }] } } } },
      ]),
    )
    expectNoSmuggledDeclaration(html)
  })

  it('`Text.align`: an arbitrary string goes into text-align as is', () => {
    const html = ssr(documentWith([{ id: 't', type: 'Text', props: { content: lit('x'), align: `center;${PAYLOAD}` } }]))
    expectNoSmuggledDeclaration(html)
  })

  it('colour of a widget part in props (`Divider.color`, `ProgressBar.color`)', () => {
    const html = ssr(
      documentWith([
        { id: 'd', type: 'Divider', props: { color: { value: `red;${PAYLOAD}` } } },
        { id: 'p', type: 'ProgressBar', props: { value: 1, max: 2, color: { value: `red;${PAYLOAD}` } } },
      ]),
    )
    expectNoSmuggledDeclaration(html)
  })
})

describe('server render: a THEME value does not become a declaration on the package root', () => {
  const document = documentWith([{ id: 't', type: 'Text', props: { content: lit('x') } }])

  it('colour value', () => {
    expectNoSmuggledDeclaration(ssr(document, themeWith({ color: { primary: `#000000;${PAYLOAD}` } })))
  })

  it('token NAME (becomes a CSS variable name)', () => {
    expectNoSmuggledDeclaration(ssr(document, themeWith({ color: { [`x:1;${PAYLOAD};--y`]: '#000000' } })))
  })

  it('group and role name', () => {
    expectNoSmuggledDeclaration(ssr(document, themeWith({ roles: { [`g:1;${PAYLOAD};--y`]: { primary: { foreground: 'onPrimary' } } } })))
  })

  it('numeric string in spacing, radius and font style', () => {
    expectNoSmuggledDeclaration(ssr(document, themeWith({ spacing: { md: `0;${PAYLOAD};--y:1` } })))
    expectNoSmuggledDeclaration(ssr(document, themeWith({ radius: { md: `0;${PAYLOAD};--y:1` } })))
    expectNoSmuggledDeclaration(ssr(document, themeWith({ typography: { bodyM: { fontSize: 14, lineHeight: 1.4, fontWeight: `400;${PAYLOAD};--y:`, role: 'body' } } })))
  })

  it('font family name with a line break: quotes are escaped and the CSS string is broken the same way', () => {
    const family = { primary: `Inter\n;${PAYLOAD};--y:'`, fallback: [] }
    expectNoSmuggledDeclaration(ssr(document, themeWith({ fontFamilies: { body: family, heading: family } })))
  })
})

describe('without the server: the value stays WITHIN its property', () => {
  const theme = resolveTheme(undefined).theme
  const ATTACKER = 'http://attacker.test/pixel'

  it('own colour is a colour, not arbitrary CSS text', () => {
    expect(colorCss({ value: `url(${ATTACKER})` }, theme)).toBeUndefined()
    expect(colorCss({ value: 'red; position: fixed' }, theme)).toBeUndefined()
    expect(colorCss({ value: 'var(--bank-secret-color)' }, theme)).toBeUndefined()
  })

  it('an own gradient stop does not add a layer with a foreign address to the background', () => {
    const gradient = { angle: 0, stops: [{ color: { value: `#000 0%, #000 100%), url(${ATTACKER}), linear-gradient(#000` }, position: 0 }, { color: 'primary', position: 1 }] }
    expect(gradientCss(gradient as unknown as GradientRef, theme) ?? '').not.toContain('url(')
  })

  it('an own shadow layer does not exceed the contract through "colour"', () => {
    // The layer spread is clamped to 64, but a second layer with spread 100000px arrives inside the first layer's "colour".
    const shadow = [{ offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: { value: '#fff, 0 0 0 100000px #fff' } }]
    expect(shadowCss(shadow as unknown as ShadowRef, theme) ?? '').not.toContain('100000px')
  })

  it('a theme cannot name an address: no variable carries url()', () => {
    const hostile = resolveTheme(
      themeWith({
        color: { primary: `#000 0 50%, #000 50% 100%), url(${ATTACKER}?c), conic-gradient(#000` },
        gradient: { brandBackdrop: { angle: 0, stops: [{ color: `#000 0%, #000 100%), url(${ATTACKER}?g), linear-gradient(#000`, position: 0 }, { color: '#ffffff', position: 1 }] } },
      }),
    ).theme
    const withUrl = Object.entries(themeCssVariables(hostile)).filter(([, value]) => /url\(|image-set\(|@import/i.test(value))
    expect(withUrl).toEqual([])
  })
})

describe('theme numbers have schema bounds (0…128 spacing, ±64 shadow, 8…96 font size)', () => {
  const variables = (patch: Readonly<Record<string, unknown>>): Record<string, string> => themeCssVariables(resolveTheme(themeWith(patch)).theme)

  it('negative spacing: `margin: var(--product-space-md)` would push the node out of the root over the host page', () => {
    expect(variables({ spacing: { md: -4000 } })['--product-space-md']).not.toMatch(/^-/)
  })

  it('huge spacing and radius', () => {
    const vars = variables({ spacing: { xl: 1_000_000 }, radius: { md: 1_000_000 } })
    expect(Number.parseFloat(vars['--product-space-xl'] ?? '0')).toBeLessThanOrEqual(128)
    expect(Number.parseFloat(vars['--product-radius-md'] ?? '0')).toBeLessThanOrEqual(256)
  })

  it('theme shadow: spread and offset, a 100000px layer would paint the whole host page outside the root', () => {
    const vars = variables({ elevation: { low: [{ offsetX: 0, offsetY: 0, blur: 0, spread: 100_000, color: '#ffffff', opacity: 1 }] } })
    expect(vars['--product-elevation-low']).not.toContain('100000px')
  })

  it('theme font size', () => {
    const vars = variables({ typography: { bodyM: { fontSize: 100_000, lineHeight: 1.4, fontWeight: 400, role: 'body' } } })
    expect(Number.parseFloat(vars['--product-type-size-body-m'] ?? '0')).toBeLessThanOrEqual(96)
  })
})

describe('document numbers: grid', () => {
  it('`Grid.columns` and `Repeater.columns` are clamped (schema: 2…4), not passed to repeat() as is', () => {
    const html = ssr(
      documentWith([
        { id: 'g', type: 'Grid', props: { columns: 10_000_000 }, children: [{ id: 't', type: 'Text', props: { content: lit('x') } }] },
      ]),
    )
    expect(html).not.toContain('repeat(10000000')
  })
})
