/**
 * The carousel case table through the `@hotlayout/react` package:
 * `contract/fixtures/carousel/carousel-cases.json` (schema 9.11.0) — the `carousel` field on a
 * scrollable row and on a data list laid out as a row.
 *
 * The reference implementation and the builder preview are checked by
 * the builder's own test of the same table; this is the package side. The package imports nothing from
 * `src/`, so the rule is written a second time there (`carousel.ts`) and this table keeps the two
 * copies together. Each group runs twice: through the package's pure function and through a REAL
 * `HotlayoutScreen`. jsdom computes no layout, so where sizes matter (stops, dots, the active stop)
 * they are stubbed as a browser would report them: visible area width, card widths, paddings and
 * gap. The CSS card width expression is evaluated as a NUMBER and compared with the table. What
 * jsdom drops (`scroll-snap-type`, `overscroll-behavior-x`) is read from the server markup.
 *
 * NO ROWS ARE SKIPPED, including those marked `readerOnly`.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { activeCarouselStop, carouselCardCss, carouselCardWidth, carouselDotCount, carouselIndicatorBlock, carouselOf, carouselStateKey, carouselStops, isCarouselHost, readCarousel } from '../src/carousel'
import { HotlayoutScreen } from '../src/index'
import type { UiDocument } from '../src/index'

afterEach(cleanup)

type Raw = Record<string, unknown>
interface Table {
  readonly theme: { readonly spacing: Record<string, number> }
  readonly defaults: { readonly peek: string }
  readonly hostCases: readonly { name: string; type: string; props: Raw; readerOnly?: boolean; expect: boolean }[]
  readonly readCases: readonly { name: string; value: unknown; readerOnly?: boolean; expect: { perView: number | null; peek: string | number | null; indicator: string } | null }[]
  readonly cardCases: readonly {
    name: string
    viewport: number
    paddingStart: string | number
    paddingEnd?: string | number
    gap: string | number
    peek: string | number | null
    perView: number
    readerOnly?: boolean
    expect: number | null
  }[]
  readonly stopCases: readonly {
    name: string
    viewport: number
    paddingStart: number
    paddingEnd: number
    gap: number
    cards: readonly number[]
    expect: { maxScroll: number; stops: readonly number[]; stopOfCard: readonly number[] }
  }[]
  readonly activeCases: readonly { name: string; stops: readonly number[]; offset: number; expect: number }[]
  readonly dotCases: readonly { name: string; indicator: string; stops: number; viewport: number; expect: { dots: number; block: number } }[]
  /** The area is derived from the place the parent gave, not from whether dots are drawn. */
  readonly areaCases: readonly { name: string; place: number; indicator: string; paddingStart: number; paddingEnd: number; gap: number; cards: readonly number[]; expect: { viewport: number; stops: readonly number[]; dots: number } }[]
  /** The state key is the node together with the chain of template instances. */
  readonly stateCases: readonly { name: string; a: { node: string; instance: readonly number[] }; b: { node: string; instance: readonly number[] }; sameState: boolean }[]
}

const TABLE = JSON.parse(readFileSync('contract/fixtures/carousel/carousel-cases.json', 'utf8')) as Table
const named = <TRow extends { readonly name: string }>(rows: readonly TRow[]): readonly (readonly [string, TRow])[] => rows.map((row) => [row.name, row] as const)
const SPACING = TABLE.theme.spacing
const lit = (value: string): Raw => ({ kind: 'literal', value })
const quiet = (): undefined => undefined

/** A token or a number to logical pixels by the table theme. */
const spacingPx = (ref: string | number): number => (typeof ref === 'number' ? ref : (SPACING[ref] ?? 0))
const text = (id: string): Raw => ({ id, type: 'Text', props: { content: lit(id), style: 'bodyM' } })

function documentOf(content: readonly Raw[], extra: Raw = {}): UiDocument {
  return {
    schemaVersion: '9.11.0',
    documentId: 'carousel-cases',
    name: 'cases',
    initialScreenId: 'a',
    screens: [{ screenId: 'a', name: 'a', root: { id: 'root', type: 'Screen', props: {}, children: content } }],
    ...extra,
  } as unknown as UiDocument
}

/** A scrollable row with a carousel: `cards` texts, the `carousel` field, start and end paddings. */
function carouselRow(carousel: unknown, options: { cards?: number; padding?: { start: string | number; end: string | number }; gap?: string | number; extra?: Raw } = {}): Raw {
  const cards = Array.from({ length: options.cards ?? 3 }, (_unused, index) => text(`card-${String(index)}`))
  const padding = options.padding === undefined ? undefined : { top: 0, bottom: 0, start: options.padding.start, end: options.padding.end }
  return {
    id: 'row',
    type: 'Row',
    props: { scrollable: true, ...(options.gap === undefined ? {} : { gap: options.gap }), ...(carousel === undefined ? {} : { carousel }) },
    ...(padding === undefined ? {} : { style: { padding } }),
    children: cards,
    ...options.extra,
  }
}

const serverMarkup = (document: UiDocument, dir: 'ltr' | 'rtl' = 'ltr'): string => renderToStaticMarkup(<HotlayoutScreen document={document} dir={dir} />)

/* ───────────────────── stubbing browser sizes ───────────────────── */

interface Layout {
  readonly viewport: number
  readonly cards: readonly number[]
  readonly paddingStart: number
  readonly paddingEnd: number
  readonly gap: number
}

/**
 * Stubs the widths a browser layout would give: the visible area of the scrolling element, the
 * (outer) card widths, paddings and gap. Returns `restore`. Everything is read from what the
 * package itself wrote into `style`.
 */
function withLayout(layout: Layout): () => void {
  const originalClient = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  const originalOffset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  const originalComputed = window.getComputedStyle.bind(window)
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'list' ? layout.viewport : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'listitem' ? (layout.cards[[...(this.parentElement?.children ?? [])].indexOf(this)] ?? 0) : 0
    },
  })
  window.getComputedStyle = ((element: Element) => {
    const base = originalComputed(element)
    if (element.getAttribute('role') !== 'list') return base
    // Only the three properties the package reads; the real style snapshot supplies the rest.
    const resolved: Record<string, string> = { paddingInlineStart: `${String(layout.paddingStart)}px`, paddingInlineEnd: `${String(layout.paddingEnd)}px`, columnGap: `${String(layout.gap)}px` }
    return new Proxy(base, { get: (target, key) => (typeof key === 'string' && key in resolved ? resolved[key] : (Reflect.get(target, key) as unknown)) })
  })
  return () => {
    if (originalClient !== undefined) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClient)
    if (originalOffset !== undefined) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffset)
    window.getComputedStyle = originalComputed
  }
}

/** A CSS expression made of `calc`, `var(--product-space-...)`, `px` and `100%` to a number; `100%` is the scroll content. */
function evaluate(css: string, percentBase: number): number {
  const numeric = css
    .replace(/var\(--product-space-([a-z]+)\)/g, (_match, token: string) => String(SPACING[token] ?? 0))
    .replace(/([0-9.]+)px/g, '$1')
    .replace(/100%/g, String(percentBase))
    .replace(/calc/g, '')
  if (!/^[0-9.+\-*/() ]+$/.test(numeric)) throw new Error(`expression is not numbers only: ${numeric}`)
  return arithmetic(numeric)
}

/**
 * Evaluates an expression made only of numbers, `+ - * /` and parentheses by parsing, without
 * `eval`. The string has already been checked against this alphabet.
 */
function arithmetic(source: string): number {
  const tokens = source.match(/[0-9.]+|[+\-*/()]/g) ?? []
  let position = 0
  const expression = (): number => {
    let value = term()
    while (tokens[position] === '+' || tokens[position] === '-') value = tokens[position++] === '+' ? value + term() : value - term()
    return value
  }
  const term = (): number => {
    let value = factor()
    while (tokens[position] === '*' || tokens[position] === '/') value = tokens[position++] === '*' ? value * factor() : value / factor()
    return value
  }
  const factor = (): number => {
    const token = tokens[position++]
    if (token === '(') {
      const inner = expression()
      position += 1
      return inner
    }
    if (token === '-') return -factor()
    return Number(token)
  }
  return expression()
}

const scrollerOf = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('[role="list"]')!
const dotsOf = (container: HTMLElement): HTMLElement | null => container.querySelector<HTMLElement>('[data-hl-dots]')

describe('carousel case table: structure', () => {
  it('the row counts equal those of the reference; names within a group are unique', () => {
    expect(TABLE.hostCases).toHaveLength(8)
    expect(TABLE.readCases).toHaveLength(17)
    expect(TABLE.cardCases).toHaveLength(18)
    expect(TABLE.stopCases).toHaveLength(10)
    expect(TABLE.activeCases).toHaveLength(10)
    expect(TABLE.dotCases).toHaveLength(10)
    expect(TABLE.areaCases).toHaveLength(4)
    expect(TABLE.stateCases).toHaveLength(6)
    for (const group of [TABLE.hostCases, TABLE.readCases, TABLE.cardCases, TABLE.stopCases, TABLE.activeCases, TABLE.dotCases, TABLE.areaCases, TABLE.stateCases]) {
      expect(new Set(group.map((row) => row.name)).size).toBe(group.length)
    }
  })
})

/* ──────────────────────── who is the host, how it is read ──────────────────────── */

describe('carousel: who is the host', () => {
  it.each(named(TABLE.hostCases))('function: %s', (_name, row) => {
    expect(isCarouselHost({ type: row.type, props: row.props })).toBe(row.expect)
    expect(carouselOf({ type: row.type, props: { ...row.props, carousel: {} } }) !== undefined).toBe(row.expect)
  })

  it.each(named(TABLE.hostCases))('real screen: %s', (_name, row) => {
    const children = row.type === 'Repeater' ? [{ id: 'tpl', type: 'Text', props: { content: lit('x'), style: 'bodyM' } }] : [text('a'), text('b')]
    const node = { id: 'host', type: row.type, props: { ...row.props, carousel: {}, ...(row.type === 'Repeater' ? { source: 'items', item: 'it' } : {}) }, children }
    const view = render(<HotlayoutScreen document={documentOf([node])} collections={{ items: [{ 'it.id': 1 }, { 'it.id': 2 }] }} onReport={quiet} />)
    // The field is read only on a host; elsewhere it is skipped and the node is drawn as it was.
    expect(view.container.querySelector('[data-hl-carousel]') !== null).toBe(row.expect)
    expect(view.container.querySelector('[data-hl-node="host"]')).not.toBeNull()
  })

  it('a Repeater laid out as a row WITHOUT the `carousel` field does not scroll as a side effect', () => {
    const node = { id: 'host', type: 'Repeater', props: { source: 'items', item: 'it', direction: 'row' }, children: [text('tpl')] }
    const markup = serverMarkup(documentOf([node]))
    expect(markup).not.toContain('overflow-x')
    expect(markup).not.toContain('role="list"')
  })
})

describe('carousel: reading the value', () => {
  it.each(named(TABLE.readCases))('function: %s', (_name, row) => {
    const read = readCarousel(row.value)
    if (row.expect === null) {
      expect(read).toBeUndefined()
      return
    }
    expect(read).toEqual({ perView: row.expect.perView ?? undefined, peek: row.expect.peek ?? undefined, indicator: row.expect.indicator })
  })

  it.each(named(TABLE.readCases))('real screen: %s', (_name, row) => {
    const document = documentOf([carouselRow(row.value)])
    const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
    const scroller = view.container.querySelector<HTMLElement>('[data-hl-node="row"]')!
    if (row.expect === null) {
      // Not an object means no carousel: the row scrolls as in 9.10, with no snapping, roles or dots.
      expect(scroller.hasAttribute('data-hl-carousel')).toBe(false)
      expect(scroller.getAttribute('role')).toBeNull()
      expect(serverMarkup(document)).not.toContain('scroll-snap')
      return
    }
    expect(scroller.getAttribute('data-hl-carousel')).toBe(row.expect.perView === null ? 'natural' : 'cards')
    expect(scroller.getAttribute('data-hl-per-view')).toBe(row.expect.perView === null ? null : String(row.expect.perView))
    expect(scroller.getAttribute('role')).toBe('list')
  })
})

/* ──────────────────────────── card width ──────────────────────────── */

describe('carousel: card width', () => {
  const peekOf = (row: Table['cardCases'][number]): number => {
    // Without the field, and for a token the theme does not know, the token is `lg`.
    if (row.peek === null) return spacingPx(TABLE.defaults.peek)
    if (typeof row.peek === 'string' && SPACING[row.peek] === undefined) return spacingPx(TABLE.defaults.peek)
    return spacingPx(row.peek)
  }

  it.each(named(TABLE.cardCases))('function: %s', (_name, row) => {
    const width = carouselCardWidth({ viewport: row.viewport, paddingStart: spacingPx(row.paddingStart), gap: spacingPx(row.gap), peek: peekOf(row), perView: row.perView })
    if (row.expect === null) expect(width).toBeUndefined()
    else expect(width).toBeCloseTo(row.expect, 9)
  })

  /*
   * The CSS expression the package puts on the element: a child's percentage is computed against
   * the scroll CONTENT box, so the end padding is added back. The numbers are substituted and
   * compared with the table.
   */
  it.each(named(TABLE.cardCases.filter((row) => row.expect !== null)))('CSS expression on a real screen: %s', (_name, row) => {
    const carousel: Raw = { perView: row.perView, ...(row.peek === null ? {} : { peek: row.peek }) }
    const document = documentOf([carouselRow(carousel, { padding: { start: row.paddingStart, end: row.paddingEnd ?? 0 }, gap: row.gap })])
    const markup = serverMarkup(document)
    const css = /--hl-carousel-card:([^;"]+)/.exec(markup)?.[1]
    expect(css, 'card width variable').toBeDefined()
    const content = row.viewport - spacingPx(row.paddingStart) - spacingPx(row.paddingEnd ?? 0)
    expect(evaluate(css ?? '', content)).toBeCloseTo(row.expect ?? Number.NaN, 9)
    // A card takes its width from the carousel; its own width limits do not apply.
    const view = render(<HotlayoutScreen document={documentOf([carouselRow(carousel, { padding: { start: row.paddingStart, end: row.paddingEnd ?? 0 }, extra: { children: [{ ...text('wide'), style: { width: 400, minWidth: 300, maxWidth: 500 } }] } })])} onReport={quiet} />)
    const card = view.container.querySelector<HTMLElement>('[data-hl-node="wide"]')!
    // The list wrapper is a direct child of the scroller: card width plus its margins from the variable; the card box is the rest of the wrapper.
    expect(card.parentElement?.getAttribute('role')).toBe('listitem')
    expect(card.parentElement?.style.inlineSize).toMatch(/^calc\(var\(--hl-carousel-card\) \+ 0px( \+ 0px)?\)$/)
    // jsdom folds `0px - 0px` into `0px`.
    expect(card.style.inlineSize).toMatch(/^calc\(100% - 0px( - 0px)?\)$/)
    for (const key of ['width', 'minWidth', 'maxWidth'] as const) expect(card.style[key], key).toBe('')
    expect(card.style.flex).toBe('0 0 auto')
  })

  it.each(named(TABLE.cardCases.filter((row) => row.expect === null)))('narrower than the smallest card — `perView` is not read, the width is natural: %s', (_name, row) => {
    const document = documentOf([carouselRow({ perView: row.perView, peek: row.peek ?? undefined }, { padding: { start: row.paddingStart, end: row.paddingEnd ?? 0 }, gap: row.gap })])
    const restore = withLayout({ viewport: row.viewport, cards: [0, 0, 0], paddingStart: spacingPx(row.paddingStart), paddingEnd: spacingPx(row.paddingEnd ?? 0), gap: spacingPx(row.gap) })
    try {
      const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
      const scroller = scrollerOf(view.container)
      expect(scroller.getAttribute('data-hl-carousel')).toBe('natural')
      expect(view.container.querySelector<HTMLElement>('[data-hl-node="card-0"]')!.parentElement?.style.inlineSize ?? '').not.toContain('--hl-carousel-card')
    } finally {
      restore()
    }
  })

  it('a card `margin` lies ON TOP of the width: the wrapper is the card plus margins, the box is the card', () => {
    const margined = { ...text('m'), style: { margin: { top: 0, bottom: 0, start: 'sm', end: 'md' } } }
    const view = render(<HotlayoutScreen document={documentOf([carouselRow({ perView: 2 }, { cards: 0, extra: { children: [margined] } })])} onReport={quiet} />)
    const card = view.container.querySelector<HTMLElement>('[data-hl-node="m"]')!
    expect(card.parentElement?.style.inlineSize).toBe('calc(var(--hl-carousel-card) + 8px + 12px)')
    expect(card.style.inlineSize).toBe('calc(100% - 20px)')
  })

  it('carouselCardCss: zero and empty give `0px`; the percentage is not rounded', () => {
    expect(carouselCardCss(2, '0', '', '0')).toBe('calc((100% + 0px - 0px - 2 * 0px) / 2)')
    expect(carouselCardCss(3, 'var(--product-space-sm)', 'var(--product-space-xl)', '16px')).toBe('calc((100% + 16px - var(--product-space-xl) - 3 * var(--product-space-sm)) / 3)')
  })
})

/* ───────────────────────────── stops ───────────────────────────── */

describe('carousel: stops and snapping', () => {
  it.each(named(TABLE.stopCases))('function: %s', (_name, row) => {
    const result = carouselStops({ viewport: row.viewport, paddingStart: row.paddingStart, paddingEnd: row.paddingEnd, gap: row.gap, cards: row.cards })
    expect(result.maxScroll).toBeCloseTo(row.expect.maxScroll, 9)
    expect(result.stops).toHaveLength(row.expect.stops.length)
    row.expect.stops.forEach((stop, index) => {
      expect(result.stops[index]).toBeCloseTo(stop, 9)
    })
    expect([...result.stopOfCard]).toEqual([...row.expect.stopOfCard])
  })

  /*
   * Snapping is up to the browser: the package puts `scroll-snap-type: x mandatory` on the scrolling
   * element, `scroll-snap-align: start` on the cards and `scroll-padding-inline-start` equal to the
   * start padding. The browser clamps the scroll end itself, which is what yields the stops. There
   * are as many dots as stops.
   */
  it.each(named(TABLE.stopCases))('real screen: %s', (_name, row) => {
    const document = documentOf([carouselRow({}, { cards: row.cards.length, padding: { start: row.paddingStart, end: row.paddingEnd }, gap: row.gap })])
    const markup = serverMarkup(document)
    expect(markup).toContain('scroll-snap-type:x mandatory')
    expect(markup).toContain(`scroll-padding-inline-start:${String(row.paddingStart)}px`)
    expect((markup.match(/scroll-snap-align:start/g) ?? []).length).toBe(row.cards.length)
    const restore = withLayout({ viewport: row.viewport, cards: row.cards, paddingStart: row.paddingStart, paddingEnd: row.paddingEnd, gap: row.gap })
    try {
      const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
      const stops = new Set(row.expect.stops).size
      expect(dotsOf(view.container)?.children.length ?? 0).toBe(carouselDotCount('dots', stops, { viewport: row.viewport, dotSize: SPACING.sm ?? 0, dotGap: SPACING.sm ?? 0 }))
    } finally {
      restore()
    }
  })

  it('right-to-left writing: the offset is negative and its absolute value is used; cards and dots follow reading order', () => {
    const row = TABLE.stopCases[0]
    if (row === undefined) throw new Error('no table row')
    const document = documentOf([carouselRow({}, { cards: row.cards.length, padding: { start: row.paddingStart, end: row.paddingEnd }, gap: row.gap })])
    const restore = withLayout({ viewport: row.viewport, cards: row.cards, paddingStart: row.paddingStart, paddingEnd: row.paddingEnd, gap: row.gap })
    try {
      const view = render(<HotlayoutScreen document={document} dir="rtl" onReport={quiet} />)
      expect(view.container.firstElementChild?.getAttribute('dir')).toBe('rtl')
      const scroller = scrollerOf(view.container)
      scroller.scrollLeft = -row.expect.stops[1]!
      fireEvent.scroll(scroller)
      expect(dotsOf(view.container)?.getAttribute('data-hl-active-dot')).toBe('1')
    } finally {
      restore()
    }
  })

  it('no `scroll-behavior: smooth` and no programmatic scrolling: "reduce motion" is satisfied by construction', () => {
    const markup = serverMarkup(documentOf([carouselRow({ perView: 1 })]))
    expect(markup).not.toMatch(/(?<!over)scroll-behavior/)
    // A gesture along the row does not propagate beyond the carousel.
    expect(markup).toContain('overscroll-behavior-x:contain')
  })
})

/* ───────────────────────── active stop, dots ───────────────────────── */

describe('carousel: the active stop', () => {
  it.each(named(TABLE.activeCases))('function: %s', (_name, row) => {
    expect(activeCarouselStop(row.stops, row.offset)).toBe(row.expect)
  })

  // Rows with stops `[0, 280, 540]` run on a real screen: three cards of 268 on 320.
  it.each(named(TABLE.activeCases.filter((row) => row.stops.length === 3)))('real screen, the dot follows: %s', (_name, row) => {
    const restore = withLayout({ viewport: 320, cards: [268, 268, 268], paddingStart: 16, paddingEnd: 16, gap: 12 })
    try {
      const view = render(<HotlayoutScreen document={documentOf([carouselRow({}, { padding: { start: 16, end: 16 }, gap: 12 })])} onReport={quiet} />)
      const scroller = scrollerOf(view.container)
      scroller.scrollLeft = row.offset
      fireEvent.scroll(scroller)
      expect(dotsOf(view.container)?.getAttribute('data-hl-active-dot')).toBe(String(row.expect))
    } finally {
      restore()
    }
  })
})

describe('carousel: dots', () => {
  it.each(named(TABLE.dotCases))('function: %s', (_name, row) => {
    const dots = carouselDotCount(row.indicator === 'none' ? 'none' : 'dots', row.stops, { viewport: row.viewport, dotSize: SPACING.sm ?? 0, dotGap: SPACING.sm ?? 0 })
    expect(dots).toBe(row.expect.dots)
    // Node height: an `sm` gap plus an `sm` dot when dots exist; otherwise nothing.
    expect(carouselIndicatorBlock(dots, SPACING.sm ?? 0, SPACING.sm ?? 0)).toBe(row.expect.block)
  })

  it.each(named(TABLE.dotCases))('real screen: %s', (_name, row) => {
    // `stops` stops: that many cards as wide as the area (`row.viewport`), without paddings or a gap.
    const cards = Array.from({ length: row.stops }, () => row.viewport)
    const document = documentOf([carouselRow({ indicator: row.indicator }, { cards: row.stops })])
    const restore = withLayout({ viewport: row.viewport, cards, paddingStart: 0, paddingEnd: 0, gap: 0 })
    try {
      const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
      const dots = dotsOf(view.container)
      expect(dots?.children.length ?? 0).toBe(row.expect.dots)
      if (row.expect.dots === 0) {
        // No dots means no room for them either, but the shell is the same box as with dots.
        const shell = view.container.querySelector<HTMLElement>('[data-hl-carousel-shell]')!
        expect(shell.style.display).toBe('flex')
        expect(shell.style.inlineSize).toBe('100%')
        return
      }
      // Decoration: not a control and absent from the accessibility tree; an inactive dot is the active colour at opacity 0.3.
      expect(dots?.getAttribute('aria-hidden')).toBe('true')
      expect(dots?.querySelectorAll('button, [role], [tabindex]')).toHaveLength(0)
      const [first, second] = [...(dots?.children ?? [])] as HTMLElement[]
      expect(first?.style.backgroundColor).toBe(second?.style.backgroundColor)
      expect(first?.style.opacity).toBe('1')
      expect(second?.style.opacity).toBe('0.3')
      expect(first?.style.inlineSize).toBe('var(--product-space-sm)')
      expect(first?.style.borderRadius).toBe('var(--product-radius-pill)')
    } finally {
      restore()
    }
  })

  /*
   * The area is the width of the place the parent gave, with or without dots. The number of stops
   * and dots is a consequence of that width, not its cause.
   */
  it.each(named(TABLE.areaCases))('function: %s', (_name, row) => {
    const result = carouselStops({ viewport: row.place, paddingStart: row.paddingStart, paddingEnd: row.paddingEnd, gap: row.gap, cards: row.cards })
    expect([...result.stops]).toEqual([...row.expect.stops])
    expect(row.place).toBe(row.expect.viewport)
    expect(carouselDotCount(row.indicator === 'none' ? 'none' : 'dots', result.stops.length, { viewport: row.place, dotSize: SPACING.sm ?? 0, dotGap: SPACING.sm ?? 0 })).toBe(row.expect.dots)
  })

  it.each(named(TABLE.areaCases))('real screen: %s', (_name, row) => {
    const document = documentOf([carouselRow({ indicator: row.indicator }, { cards: row.cards.length, padding: { start: row.paddingStart, end: row.paddingEnd }, gap: row.gap })])
    const restore = withLayout({ viewport: row.place, cards: row.cards, paddingStart: row.paddingStart, paddingEnd: row.paddingEnd, gap: row.gap })
    try {
      const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
      expect(dotsOf(view.container)?.children.length ?? 0).toBe(row.expect.dots)
      // The shell is the same box with and without dots: a block of the place width, not `display: contents`.
      const shell = view.container.querySelector<HTMLElement>('[data-hl-carousel-shell]')!
      expect(shell.style.display).toBe('flex')
      expect(shell.style.flexDirection).toBe('column')
      expect(shell.style.inlineSize).toBe('100%')
      expect(shell.style.minInlineSize).toBe('0px')
    } finally {
      restore()
    }
  })

  it('accessibility: a list with card items; the row takes focus and scrolls with the arrow keys', () => {
    const view = render(<HotlayoutScreen document={documentOf([carouselRow({}, { cards: 4 })])} onReport={quiet} />)
    const scroller = scrollerOf(view.container)
    expect(scroller.getAttribute('tabindex')).toBe('0')
    expect(scroller.querySelectorAll(':scope > [role="listitem"]')).toHaveLength(4)
  })
})

/* ─────────────────── data list, state, nested scrollers ─────────────────── */

describe('carousel: a data list as a row, reader state, nested scrollers', () => {
  const repeater = (extra: Raw = {}): Raw => ({
    id: 'list',
    type: 'Repeater',
    props: { source: 'tasks', item: 'task', direction: 'row', gap: 'md', carousel: { perView: 1, peek: 'xl' }, ...extra },
    children: [{ id: 'tpl', type: 'Text', props: { content: { kind: 'binding', path: 'task.title' }, style: 'bodyM' } }],
  })
  const tasks = [{ 'task.title': 'First' }, { 'task.title': 'Second' }, { 'task.title': 'Third' }]

  it('a list laid out as a row with the field scrolls: a card per record, each with its own record scope', () => {
    const view = render(<HotlayoutScreen document={documentOf([repeater()])} collections={{ tasks }} onReport={quiet} />)
    const scroller = scrollerOf(view.container)
    expect(scroller.getAttribute('data-hl-node')).toBe('list')
    expect([...scroller.querySelectorAll('[role="listitem"]')].map((item) => item.textContent)).toEqual(['First', 'Second', 'Third'])
  })

  it('the `limit` bound applies here too', () => {
    const view = render(<HotlayoutScreen document={documentOf([repeater({ limit: 2 })])} collections={{ tasks }} onReport={quiet} />)
    expect(view.container.querySelectorAll('[role="listitem"]')).toHaveLength(2)
  })

  it('a card hidden by a condition leaves no empty list item', () => {
    const row = carouselRow({}, { cards: 0, extra: { children: [text('a'), { ...text('b'), visibleIf: { path: 'x.never', op: 'isTrue' } }, text('c')] } })
    const view = render(<HotlayoutScreen document={documentOf([row])} onReport={quiet} />)
    expect(view.container.querySelectorAll('[role="listitem"]')).toHaveLength(2)
  })

  /*
   * STATE (`carouselState`): starts at the first stop and is kept while the screen is on the stack,
   * so going "back" to the screen restores the same card.
   */
  it('returning back to the screen shows the same card', () => {
    const go: Raw = { id: 'go', type: 'Button', props: { label: lit('open'), variant: 'primary', fullWidth: false, action: { type: 'navigate', params: { screenId: 'b' } } } }
    const back: Raw = { id: 'back', type: 'Button', props: { label: lit('back'), variant: 'primary', fullWidth: false, action: { type: 'navigate.back' } } }
    const document = {
      schemaVersion: '9.11.0',
      documentId: 'carousel-state',
      name: 'cases',
      initialScreenId: 'a',
      screens: [
        { screenId: 'a', name: 'a', root: { id: 'root-a', type: 'Screen', props: {}, children: [carouselRow({}, { padding: { start: 16, end: 16 }, gap: 12 }), go] } },
        { screenId: 'b', name: 'b', root: { id: 'root-b', type: 'Screen', props: {}, children: [back] } },
      ],
    } as unknown as UiDocument
    const restore = withLayout({ viewport: 320, cards: [268, 268, 268], paddingStart: 16, paddingEnd: 16, gap: 12 })
    try {
      const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
      expect(dotsOf(view.container)?.getAttribute('data-hl-active-dot')).toBe('0')
      const scroller = scrollerOf(view.container)
      scroller.scrollLeft = 280
      fireEvent.scroll(scroller)
      expect(dotsOf(view.container)?.getAttribute('data-hl-active-dot')).toBe('1')
      act(() => {
        fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
      })
      expect(view.container.querySelector('[role="list"]')).toBeNull()
      act(() => {
        fireEvent.click(view.container.querySelector('[data-hl-node="back"]')!)
      })
      const again = scrollerOf(view.container)
      expect(again.scrollLeft).toBe(280)
      expect(dotsOf(view.container)?.getAttribute('data-hl-active-dot')).toBe('1')
    } finally {
      restore()
    }
  })

  /*
   * The state key is the node TOGETHER with the chain of template instances. Two instances of one
   * node are two keys.
   */
  it.each(named(TABLE.stateCases))('state key: %s', (_name, row) => {
    expect(carouselStateKey(row.a.node, row.a.instance) === carouselStateKey(row.b.node, row.b.instance)).toBe(row.sameState)
  })

  it('a screen popped off the stack forgets its card: shown again, it starts at the first', () => {
    const go: Raw = { id: 'go', type: 'Button', props: { label: lit('open'), variant: 'primary', fullWidth: false, action: { type: 'navigate', params: { screenId: 'b' } } } }
    const back: Raw = { id: 'back', type: 'Button', props: { label: lit('back'), variant: 'primary', fullWidth: false, action: { type: 'navigate.back' } } }
    const document = {
      schemaVersion: '9.11.0',
      documentId: 'carousel-state-2',
      name: 'cases',
      initialScreenId: 'a',
      screens: [
        { screenId: 'a', name: 'a', root: { id: 'root-a', type: 'Screen', props: {}, children: [go] } },
        { screenId: 'b', name: 'b', root: { id: 'root-b', type: 'Screen', props: {}, children: [carouselRow({}, { padding: { start: 16, end: 16 }, gap: 12 }), back, { ...go, id: 'go-b', props: { ...(go.props as Raw), action: { type: 'navigate', params: { screenId: 'a' } } } }] } },
      ],
    } as unknown as UiDocument
    const restore = withLayout({ viewport: 320, cards: [268, 268, 268], paddingStart: 16, paddingEnd: 16, gap: 12 })
    try {
      const view = render(<HotlayoutScreen document={document} onReport={quiet} />)
      act(() => {
        fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
      })
      const scroller = scrollerOf(view.container)
      scroller.scrollLeft = 280
      fireEvent.scroll(scroller)
      // The screen with the carousel is closed and opened again.
      act(() => {
        fireEvent.click(view.container.querySelector('[data-hl-node="back"]')!)
      })
      act(() => {
        fireEvent.click(view.container.querySelector('[data-hl-node="go"]')!)
      })
      expect(scrollerOf(view.container).scrollLeft).toBe(0)
    } finally {
      restore()
    }
  })

  it('nested scrollers: a scrollable row inside a carousel is drawn and its own gesture stays internal', () => {
    const inner: Raw = { id: 'inner', type: 'Row', props: { scrollable: true }, children: [text('i1'), text('i2')] }
    const view = render(<HotlayoutScreen document={documentOf([carouselRow({}, { cards: 0, extra: { children: [{ id: 'card', type: 'Container', props: { direction: 'column' }, children: [inner] }] } })])} onReport={quiet} />)
    const innerEl = view.container.querySelector<HTMLElement>('[data-hl-node="inner"]')!
    expect(innerEl.style.overflowX).toBe('auto')
    expect(innerEl.getAttribute('role')).toBeNull()
  })
})
