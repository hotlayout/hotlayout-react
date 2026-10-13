/**
 * Hostile values in EVERY leaf of a document that uses the newer fields (schema 9.9-9.11).
 *
 * The guard in `hardening.test.tsx` substitutes one string and one number (`123456789`) into the
 * leaves of the FIXTURES and inspects only the server markup of the default mode. Here the
 * document is assembled on purpose from all the newer fields in all their variants (fixtures lack
 * some of them: an own aspect ratio, a numeric offset, `currentColor` with opacity, a third app
 * bar action), a wider set of values (`NaN`, infinity, `1e308`, `-0`, a fraction, a negative
 * number, an array, an object, `null`) and three anatomies: a page, a screen with its own height,
 * and a modal layer on top.
 *
 * Nothing but values of the schema shape may reach `style`, and no substitution may crash the
 * screen (the offending piece is ignored).
 */
import { cleanup, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { HotlayoutReport, UiDocument } from './index'

afterEach(cleanup)

const MARK = 'attacker.test'
const lit = (value: unknown): unknown => ({ kind: 'literal', value })

const HOSTILE: readonly (readonly [string, unknown])[] = [
  ['string with a declaration', `0;position:fixed;inset:0;background:url(http://${MARK}/x);--y:`],
  ['calc', `calc(100vw * 99)`],
  ['var with a fallback', `var(--x, 0;position:fixed)`],
  ['numeric string', '128'],
  ['giant', 123_456_789],
  ['1e308', 1e308],
  ['-1e308', -1e308],
  ['1e-9', 1e-9],
  ['negative zero', -0],
  ['fraction', 0.5],
  ['negative', -5],
  ['NaN', Number.NaN],
  ['infinity', Number.POSITIVE_INFINITY],
  ['null', null],
  ['true', true],
  ['array', [`1;position:fixed`]],
  ['object', { toString: `x;position:fixed`, token: `x;position:fixed`, by: `url(http://${MARK})`, width: `1;position:fixed`, height: 0 }],
  ['empty object', {}],
]

const icon = (id: string): unknown => ({ id, type: 'IconButton', props: { icon: 'info', label: lit(id), variant: 'ghost', size: 'md', action: { type: 'none' } } })
const text = (id: string, extra: Record<string, unknown> = {}): unknown => ({ id, type: 'Text', props: { content: lit(id), align: 'start' }, ...extra })
const card = (id: string): unknown => ({ id, type: 'Container', props: { direction: 'column', gap: 'sm' }, style: { padding: 'md', margin: { start: 'sm', end: 4 } }, children: [text(`${id}-t`)] })

function attackDocument(): Record<string, unknown> {
  return {
    schemaVersion: READER_SCHEMA_VERSION,
    documentId: 'attack',
    name: 'Attack',
    initialScreenId: 'main',
    screens: [
      {
        screenId: 'main',
        name: 'Main',
        statusBarIcons: 'light',
        root: {
          id: 'root',
          type: 'Screen',
          props: { gap: 'sm' },
          style: { padding: { top: 'lg', bottom: 8, start: 'md', end: 'md' }, background: { kind: 'color', color: 'surface' } },
          children: [
            { id: 'bar', type: 'AppBar', props: { title: lit('Title'), subtitle: lit('Sub'), showBack: true }, style: { padding: { top: 'sm', bottom: 'sm' } }, children: [icon('a1'), icon('a2'), icon('a3')] },
            { id: 'pulled', type: 'Container', props: { direction: 'column', gap: 'none' }, style: { margin: { top: 'sm' }, padding: 'md' }, pull: 'xl', children: [text('pulled-t')] },
            { id: 'pulledNumber', type: 'Container', props: { direction: 'row', gap: 8 }, pull: 24, children: [text('pn-1'), text('pn-2', { pull: 12 }), text('pn-3', { pull: 'sm', weight: 2 })] },
            { id: 'img', type: 'Image', props: { source: { kind: 'url', url: 'https://example.com/a.png' }, aspectRatio: { width: 21, height: 9 }, fit: 'cover' }, style: { radius: 'md' } },
            { id: 'img2', type: 'Image', props: { source: { kind: 'url', url: 'https://example.com/a.png' }, aspectRatio: '16:9', fit: 'contain' }, style: { width: 120 } },
            {
              id: 'stack',
              type: 'Stack',
              props: { alignHorizontal: 'center', alignVertical: 'center' },
              style: { padding: 'md' },
              children: [
                card('base'),
                { id: 'filled', type: 'Container', props: { direction: 'column', gap: 'none' }, fill: true, weight: 2, pull: 'md', layer: { alignHorizontal: 'end' } },
                { id: 'layerToken', type: 'Badge', props: { label: lit('×2'), tone: 'danger' }, layer: { alignHorizontal: 'end', alignVertical: 'start', offset: { x: { toward: 'end', by: 'sm' }, y: { toward: 'top', by: 'sm' } }, rotate: 12 } },
                { id: 'layerNumber', type: 'Badge', props: { label: lit('n'), tone: 'accent' }, style: { maxWidth: 80, margin: 4 }, layer: { alignHorizontal: 'start', alignVertical: 'end', offset: { x: { toward: 'start', by: 128 }, y: { toward: 'bottom', by: 64 } }, rotate: -180 } },
              ],
            },
            { id: 'row', type: 'Row', props: { gap: 'sm', align: 'start', scrollable: true, carousel: { perView: 3, peek: 24, indicator: 'dots' } }, style: { padding: { start: 'lg', end: 12 } }, children: [card('c1'), card('c2'), card('c3'), card('c4')] },
            { id: 'list', type: 'Repeater', props: { source: 'items', item: 'item', direction: 'row', gap: 12, carousel: { perView: 1, peek: 'xl', indicator: 'none' } }, style: { padding: { start: 'lg', end: 'lg' } }, children: [card('tpl')] },
            {
              id: 'steps',
              type: 'ProgressBar',
              props: { value: lit(2), max: lit(6), color: 'primary', trackColor: 'muted', thickness: 8, labelFormat: 'none', segments: 6, currentColor: { token: 'primary', opacity: 0.35 }, gradient: { angle: 90, stops: [{ color: 'primary', position: 0 }, { color: 'accent', position: 1 }] } },
            },
            { id: 'steps2', type: 'ProgressBar', props: { value: { kind: 'binding', path: 'user.progress', fallback: 1 }, max: lit(5), color: 'primary', segments: 12, currentColor: 'accent' } },
            { id: 'open', type: 'Button', props: { label: lit('open'), variant: 'primary', action: { type: 'navigate', params: { screenId: 'window' } } } },
          ],
        },
      },
      { screenId: 'window', name: 'Window', presentation: 'modal', modalPlacement: 'center', statusBarIcons: 'dark', root: { id: 'wroot', type: 'Screen', props: { gap: 'sm' }, style: { padding: 'lg', radius: 'lg', background: { kind: 'color', color: 'surface' }, shadow: 'medium' }, children: [{ id: 'wbar', type: 'AppBar', props: { title: lit('W') } }, text('w1', { pull: 'lg' })] } },
      { screenId: 'sheet', name: 'Sheet', presentation: 'modal', modalPlacement: 'bottom', root: { id: 'sroot', type: 'Screen', props: { gap: 'sm' }, children: [text('s1')] } },
    ],
  }
}

type Path = readonly (string | number)[]

/** Paths to EVERYTHING, leaves and nested objects alike: a whole shape can be substituted too. */
function pathsOf(value: unknown, path: Path = [], out: Path[] = []): Path[] {
  if (path.length > 0) out.push(path)
  if (Array.isArray(value)) value.forEach((item, index) => pathsOf(item, [...path, index], out))
  else if (typeof value === 'object' && value !== null) for (const [key, item] of Object.entries(value)) pathsOf(item, [...path, key], out)
  return out
}

function replaced(value: unknown, path: Path, next: unknown): unknown {
  const copy = structuredClone(value)
  let cursor = copy as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string | number, unknown>
  const last = path[path.length - 1]
  if (last !== undefined) cursor[last] = next
  return copy
}

const decode = (value: string): string => value.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
const sinksOf = (html: string): readonly string[] => [...html.matchAll(/\s(?:style|src|srcset|href)="([^"]*)"/g)].map((match) => decode(match[1] ?? ''))

/** What must never appear in a style, whatever the document contained. */
function dirtOf(sink: string): string | undefined {
  if (sink.startsWith('https://example.com/')) return undefined
  // The icon set is the package's own data, not the document.
  // Theme variables on the root (the theme here is our own, clean) and hex colours (`#1d4e89` is not an exponent) are out of scope.
  const css = sink
    .replaceAll(/url\("data:image\/svg\+xml,[^"]*"\)/g, 'url(icon)')
    .replaceAll(/--product-[a-z0-9-]+:[^;]*;?/g, '')
    .replaceAll(/#[0-9a-f]{6,8}\b/gi, '#hex')
  if (css.includes(MARK)) return 'attacker marker'
  if (/position\s*:\s*fixed/.test(css)) return 'position: fixed'
  if (/url\((?!icon\))/.test(css)) return 'url('
  if (/NaN|Infinity|undefined|\[object|\bnull\b|\btrue\b|\bfalse\b/.test(css)) return 'non-number in style'
  // `1e-9px` is how jsdom serialises a tiny number (the server writes a decimal fraction); a large exponent is a number out of range.
  if (/\d(?:\.\d+)?e\+?\d/i.test(css)) return 'exponential notation'
  if (/(?<![.\d])\d{5,}(?:\.\d+)?(?:px|deg|%)/.test(css)) return 'number far out of range'
  if (/100vw|\bvar\(--x/.test(css)) return 'expression from the document'
  if (/[\n\r]/.test(css)) return 'line break'
  // A layer angle is whole degrees, -180..180.
  for (const match of css.matchAll(/(?:^|;)rotate:(-?[\d.]+)deg/g)) {
    const angle = Number(match[1])
    if (!Number.isInteger(angle) || Math.abs(angle) > 180) return `angle ${String(match[1])}`
  }
  // A layer offset and a pull are at most 128 in either direction.
  for (const match of css.matchAll(/(?:inset-inline-start|inset-block-start|margin-block-start|margin-inline-start):(-?[\d.]+)px/g)) {
    if (Math.abs(Number(match[1])) > 128) return `offset ${String(match[1])}`
  }
  return undefined
}

const SKIP_KEYS = new Set(['schemaVersion', 'documentId', 'initialScreenId', 'screenId'])
const UNAVAILABLE = 'This screen is not available right now.'

const DATA = { 'user.progress': 3 }
const COLLECTIONS = { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] }

describe('9.9-9.11: hostile values at every document path, with all the newer fields', () => {
  const document = attackDocument()
  const paths = pathsOf(document).filter((path) => !SKIP_KEYS.has(String(path[path.length - 1])))

  it('the clean document is drawn in every anatomy and the guard passes it', () => {
    expect(paths.length).toBeGreaterThan(300)
    for (const entry of ['main', 'window', 'sheet']) {
      for (const scroll of ['page', 'screen'] as const) {
        const html = renderToStaticMarkup(<HotlayoutScreen document={{ ...document, initialScreenId: entry } as unknown as UiDocument} data={DATA} collections={COLLECTIONS} scroll={scroll} injectStyles={false} onReport={() => undefined} />)
        expect(html).not.toContain(UNAVAILABLE)
        for (const sink of sinksOf(html)) expect(dirtOf(sink), sink).toBeUndefined()
      }
    }
    // The newer fields do reach the style; otherwise the tests below would check nothing.
    const html = renderToStaticMarkup(<HotlayoutScreen document={document as unknown as UiDocument} data={DATA} collections={COLLECTIONS} injectStyles={false} onReport={() => undefined} />)
    expect(html).toMatch(/rotate:12deg/)
    expect(html).toMatch(/inset-inline-start:-128px/)
    expect(html).toMatch(/aspect-ratio:2\.3333/)
    expect(html).toMatch(/position:sticky/)
    expect(html).toMatch(/scroll-snap-type/)
    expect(html).toMatch(/data-hl-step/)
  })

  it('server: no substitution reaches the style or crashes the screen (page / screen / static app bar)', () => {
    const dirty: string[] = []
    const crashed: string[] = []
    for (const path of paths) {
      for (const [name, value] of HOSTILE) {
        const attacked = replaced(document, path, value) as UiDocument
        for (const anatomy of [{ scroll: 'page' }, { scroll: 'screen' }, { scroll: 'page', chrome: 'static' }] as const) {
          let html: string
          try {
            html = renderToStaticMarkup(<HotlayoutScreen document={attacked} data={DATA} collections={COLLECTIONS} {...anatomy} injectStyles={false} onReport={() => undefined} />)
          } catch (error) {
            crashed.push(`${path.join('.')} ← ${name}: THREW ${String(error).slice(0, 120)}`)
            continue
          }
          if (html.includes(UNAVAILABLE)) crashed.push(`${path.join('.')} ← ${name}: placeholder instead of the screen`)
          for (const sink of sinksOf(html)) {
            const dirt = dirtOf(sink)
            if (dirt !== undefined) dirty.push(`${path.join('.')} ← ${name}: ${dirt} — ${sink.slice(0, 160)}`)
          }
        }
      }
    }
    expect([...new Set(dirty)].slice(0, 40)).toEqual([])
    expect([...new Set(crashed)].slice(0, 40)).toEqual([])
  }, 240_000)

  it('browser (jsdom): the same in the DOM, and with a modal layer on top; the screen does not throw', () => {
    const dirty: string[] = []
    const crashed: string[] = []
    for (const path of paths) {
      for (const [name, value] of HOSTILE) {
        const attacked = replaced(document, path, value) as UiDocument
        const reports: HotlayoutReport[] = []
        let view: ReturnType<typeof render>
        try {
          view = render(<HotlayoutScreen document={attacked} data={DATA} collections={COLLECTIONS} injectStyles={false} onReport={(report) => reports.push(report)} />)
        } catch (error) {
          crashed.push(`${path.join('.')} ← ${name}: THREW ${String(error).slice(0, 120)}`)
          cleanup()
          continue
        }
        // Open the modal layer on top if the button survived.
        const open = view.container.querySelector<HTMLElement>('[data-hl-node="open"]')
        try {
          open?.click()
        } catch (error) {
          crashed.push(`${path.join('.')} ← ${name}: click THREW ${String(error).slice(0, 120)}`)
        }
        if (reports.some((report) => report.kind === 'render-error')) crashed.push(`${path.join('.')} ← ${name}: render-error`)
        for (const sink of sinksOf(view.container.innerHTML)) {
          const dirt = dirtOf(sink)
          if (dirt !== undefined) dirty.push(`${path.join('.')} ← ${name}: ${dirt} — ${sink.slice(0, 160)}`)
        }
        cleanup()
      }
    }
    expect([...new Set(dirty)].slice(0, 40)).toEqual([])
    expect([...new Set(crashed)].slice(0, 40)).toEqual([])
  }, 480_000)
})
