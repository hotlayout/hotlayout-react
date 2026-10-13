/**
 * ADVERSARIAL INPUT FOR THE BAR/RING SCALE (9.7.0) AND RICH TEXT (9.6.0), package `@hotlayout/react`.
 *
 * Server markup is the strictest judge: there a `;` in a style value starts a new declaration and
 * `NaN` becomes text. Every hostile input is rendered with `renderToString` and the markup is
 * searched for traces.
 */
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { HotlayoutScreen } from './index'
import type { UiDocument } from './index'

const lit = (value: unknown) => ({ kind: 'literal', value })

function documentWith(children: readonly unknown[]): UiDocument {
  return { schemaVersion: '9.8.0', documentId: 'adv', name: 'adv', initialScreenId: 'a', screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children } }] } as unknown as UiDocument
}

function markup(children: readonly unknown[], data: Record<string, unknown> = {}): string {
  return renderToString(<HotlayoutScreen document={documentWith(children)} data={data} onReport={() => undefined} />)
}

const TRACES = /NaN|Infinity|undefined|url\(|javascript:|position:\s*fixed|expression\(|@import|<script|onerror/i
/** Markup without node texts: we look for traces in styles and attributes, not in labels. */
const stylesOf = (html: string): string => (html.match(/style="[^"]*"/g) ?? []).join('\n')

const HOSTILE_NUMBERS: readonly unknown[] = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0, -1, 1e308, -1e308, 5e-324, 1e9, 0.5, '12', '1e3', null, true, [], {}, { kind: 'literal', value: Number.NaN }, { kind: 'literal', value: '5' }, { kind: 'binding', path: 'n', fallback: Number.POSITIVE_INFINITY }]
const HOSTILE_COLORS: readonly unknown[] = ['red;position:fixed;inset:0', 'url(https://evil.example/x)', { value: '#ffffff;background:url(https://evil.example)' }, { value: 'url(javascript:alert(1))' }, { token: 'primary', opacity: Number.NaN }, { token: 'primary) , url(https://evil.example/x', opacity: 0.5 }, { token: '__proto__', opacity: 0.5 }, '__proto__', 'constructor', 5, null, []]

describe('GUARD 9.7.0: scale numbers do not become NaN / Infinity in a style', () => {
  for (const type of ['ProgressBar', 'CircularProgress']) {
    it(`${type}: value, max, thickness, sizes: each as a hostile number`, () => {
      for (const hostile of HOSTILE_NUMBERS) {
        for (const field of ['value', 'max', 'thickness'] as const) {
          const props = { value: lit(5), max: lit(7), color: 'primary', size: 'md', labelFormat: 'percent', thickness: 4, [field]: hostile }
          const html = markup([{ id: 'p', type, props, style: { width: 56, height: 56 } }], { n: Number.NaN })
          expect(stylesOf(html), `${field}=${JSON.stringify(hostile)}`).not.toMatch(TRACES)
        }
        for (const key of ['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'padding', 'opacity'] as const) {
          const html = markup([{ id: 'p', type, props: { value: lit(5), max: lit(7), thickness: 128, gradient: { angle: 90, stops: [{ color: 'warning', position: 0 }, { color: 'danger', position: 1 }] } }, style: { [key]: hostile } }])
          expect(stylesOf(html), `style.${key}=${JSON.stringify(hostile)}`).not.toMatch(TRACES)
        }
      }
    })

    it(`${type}: division by zero in the geometry: diameter 0, thickness 0, max 0`, () => {
      const html = markup([
        { id: 'a', type, props: { value: lit(0), max: lit(0), thickness: 0 }, style: { width: 0, height: 0 } },
        { id: 'b', type, props: { value: lit(1), max: lit(-0), thickness: 128 }, style: { width: 1, height: 1, padding: 64 } },
        { id: 'c', type, props: { value: lit(1e308), max: lit(5e-324) }, style: { minWidth: 400, maxWidth: 1 } },
      ])
      expect(stylesOf(html)).not.toMatch(TRACES)
    })
  }
})

describe('GUARD 9.7.0: gradient and track are a new path to `style` (`conic-gradient`, `linear-gradient`)', () => {
  const gradients: readonly unknown[] = [
    ...HOSTILE_COLORS.map((color) => ({ angle: 90, stops: [{ color, position: 0 }, { color: 'danger', position: 1 }] })),
    { angle: 90, stops: [] },
    { angle: 90, stops: [{ color: 'primary', position: 0 }] },
    { angle: 90, stops: Array.from({ length: 9 }, (_, index) => ({ color: 'primary', position: index / 8 })) },
    { angle: 90, stops: Array.from({ length: 5000 }, () => ({ color: 'primary', position: 0.5 })) },
    { angle: 90, stops: [{ color: 'primary', position: -1 }, { color: 'danger', position: 2 }] },
    { angle: 90, stops: [{ color: 'primary', position: Number.NaN }, { color: 'danger', position: Number.POSITIVE_INFINITY }] },
    { angle: 90, stops: [{ color: 'primary', position: '0%, red 50%, url(https://evil.example/x) 60' }, { color: 'danger', position: 1 }] },
    { angle: '90deg, red, url(https://evil.example/x)', stops: [{ color: 'primary', position: 0 }, { color: 'danger', position: 1 }] },
    { angle: 90, stops: { length: 2, 0: { color: 'primary', position: 0 }, 1: { color: 'danger', position: 1 } } },
    'brand); background-image: url(https://evil.example/x',
    '__proto__',
    'constructor',
    5,
    [],
  ]

  for (const type of ['ProgressBar', 'CircularProgress']) {
    it(`${type}: no hostile gradient or track colour reaches the style`, () => {
      for (const gradient of gradients) {
        const html = markup([{ id: 'p', type, props: { value: lit(5), max: lit(7), thickness: 4, gradient } }])
        expect(stylesOf(html), JSON.stringify(gradient).slice(0, 80)).not.toMatch(TRACES)
        expect(html).not.toContain('evil.example')
        expect(html.length).toBeLessThan(20_000)
      }
      for (const color of HOSTILE_COLORS) {
        for (const field of ['trackColor', 'color'] as const) {
          const html = markup([{ id: 'p', type, props: { value: lit(5), max: lit(7), thickness: 4, [field]: color } }])
          expect(stylesOf(html), `${field}=${JSON.stringify(color)}`).not.toMatch(TRACES)
          expect(html).not.toContain('evil.example')
        }
      }
    })
  }
})

describe('GUARD 9.6.0: a text span style reaches CSS only by its shape', () => {
  const content = { kind: 'template', template: '{amount} {unit}', values: { amount: { kind: 'binding', path: 'user.points', fallback: '0' }, unit: { kind: 'text', text: 'points' } } }

  it('a hostile colour, font and number in `spans` leave no trace in the style', () => {
    const typographies: readonly unknown[] = [
      { token: 'bodyS', fontSize: Number.NaN },
      { token: 'bodyS', fontSize: Number.POSITIVE_INFINITY, lineHeight: 0 },
      { token: 'bodyS', lineHeight: -1 },
      { token: 'bodyS', lineHeight: Number.NaN },
      { token: 'bodyS', fontWeight: '900;position:fixed' },
      { token: 'bodyS', letterSpacing: '1px;background:url(https://evil.example/x)' },
      { token: 'bodyS;font-family:url(https://evil.example/x)', fontSize: 20 },
      { token: '__proto__', fontSize: 20 },
      { token: 'bodyS', fontFamily: 'x;position:fixed' },
      'bodyS;position:fixed',
      'constructor',
    ]
    for (const color of HOSTILE_COLORS) {
      const html = markup([{ id: 't', type: 'Text', props: { content, spans: { amount: { color }, unit: { color: 'muted' } } } }], { 'user.points': 10 })
      expect(stylesOf(html), JSON.stringify(color)).not.toMatch(TRACES)
      expect(html).not.toContain('evil.example')
    }
    for (const typography of typographies) {
      const html = markup([{ id: 't', type: 'Text', props: { content, spans: { amount: { typography }, unit: { typography } } } }], { 'user.points': 10 })
      expect(stylesOf(html), JSON.stringify(typography)).not.toMatch(TRACES)
      expect(html).not.toContain('evil.example')
    }
  })

  it('place names `constructor`, `toString`, `hasOwnProperty`, `__proto__` do not read the prototype and do not crash the render', () => {
    const raw = JSON.parse(
      '{"kind":"template","template":"{constructor} {toString} {hasOwnProperty} {valueOf} {__proto__} {a}","values":{"__proto__":{"kind":"text","text":"P"},"a":{"kind":"text","text":"A"}}}',
    ) as unknown
    const spans = JSON.parse('{"constructor":{"color":"danger"},"toString":{"color":"danger"},"__proto__":{"color":"danger"},"a":{"color":"danger"}}') as unknown
    const html = markup([{ id: 't', type: 'Text', props: { content: raw, spans } }])
    expect(html).not.toMatch(/function |\[object|native code/)
    expect(html).toContain('A')
    expect(({} as Record<string, unknown>).color).toBeUndefined()
  })

  it('HTML in a span word stays text', () => {
    const hostile = { kind: 'template', template: '{a}', values: { a: { kind: 'text', text: '<img src=x onerror=alert(1)><script>alert(1)</script>' } } }
    const html = markup([{ id: 't', type: 'Text', props: { content: hostile, spans: { a: { color: 'danger' } } } }])
    expect(html).not.toMatch(/<img|<script/)
  })

  it('the parser is not quadratic: a 100 KB template, 10,000 places, 10,000 unclosed brackets', () => {
    const many = Array.from({ length: 10_000 }, (_, index) => `{p${String(index % 50)}}`).join(' ')
    const values = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`p${String(index)}`, { kind: 'text', text: 'x' }]))
    const spans = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`p${String(index)}`, { color: index % 2 === 0 ? 'danger' : 'muted' }]))
    const cases: readonly unknown[] = [
      { kind: 'template', template: many, values },
      { kind: 'template', template: '{'.repeat(100_000), values },
      { kind: 'template', template: '{a'.repeat(50_000), values },
      { kind: 'template', template: `${'{{'.repeat(25_000)}${'}}'.repeat(25_000)}`, values },
      { kind: 'template', template: '{p0}'.repeat(25_000), values },
    ]
    for (const hostile of cases) {
      const started = performance.now()
      const html = markup([{ id: 't', type: 'Text', props: { content: hostile, spans } }])
      const took = performance.now() - started
      expect(took, `parsing took ${String(Math.round(took))} ms`).toBeLessThan(1500)
      // Ten thousand places must not become ten thousand elements without a bound: there is one node, and the DOM is not.
      expect(html.length).toBeLessThan(3_000_000)
    }
  })
})
