/**
 * ADVERSARIAL: template text, plural forms, currency code and value names from the network
 * (schema 9.4.0).
 *
 * A template string has no length limit, the value map is open, `of` is an arbitrary name, and the
 * number comes from the host backend. The package makes three promises about untrusted input, and
 * each is asserted here BY BEHAVIOUR:
 *
 *  • DOES NOT THROW: a piece of the wrong shape gives empty text for ITS place, neighbours stay
 *    intact, the host does not crash, on the server too;
 *  • DOES NOT HANG: substitution is linear (a megabyte string, ten thousand places, a thousand
 *    values), a plural does not evaluate a plural (`of` pointing at itself is not a cycle);
 *  • DOES NOT ESCAPE THE TEXT: the result is a text node. Markup that arrived through a template,
 *    a translation, a form or a data value does not become an element, and nothing reaches
 *    `style`.
 *
 * The rule itself, sign for sign, is in the shared case table; here is only what an honest
 * document in the table never contains.
 */
import { cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatBound, numericBoundValue } from './binding-format'
import { boundText } from './data'
import { HotlayoutScreen, READER_SCHEMA_VERSION } from './index'
import type { HotlayoutReport, UiDocument } from './index'
import { NO_TEMPLATE_LANGUAGE, pluralCategoryOf, readerNow, templateText } from './text-template'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const NOW = Date.parse('2026-10-10T09:00:00.000Z')
const bound = (path: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ kind: 'binding', path, fallback: '—', ...extra })
const plural = (of: unknown, forms: unknown = { one: 'point', other: 'points' }): Record<string, unknown> => ({ kind: 'plural', of, forms })
const template = (line: unknown, values: unknown): Record<string, unknown> => ({ kind: 'template', template: line, values })

/** A document with one label and a neighbour; through JSON, exactly what would arrive from the network. */
function documentWith(content: unknown, localization?: unknown): UiDocument {
  const raw = {
    schemaVersion: READER_SCHEMA_VERSION,
    documentId: 'doc',
    name: 'Doc',
    initialScreenId: 's',
    screens: [{ screenId: 's', name: 'S', root: { id: 'root', type: 'Screen', props: {}, children: [{ id: 't', type: 'Text', props: { content } }, { id: 'ok', type: 'Text', props: { content: { kind: 'literal', value: 'ok' } } }] } }],
    ...(localization === undefined ? {} : { localization }),
  }
  return JSON.parse(JSON.stringify(raw)) as UiDocument
}

interface Drawn {
  readonly text: string
  readonly reports: readonly HotlayoutReport[]
  readonly container: HTMLElement
}

function draw(content: unknown, data: Record<string, unknown> = {}, options: { readonly localization?: unknown; readonly locale?: string } = {}): Drawn {
  const reports: HotlayoutReport[] = []
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const view = render(<HotlayoutScreen document={documentWith(content, options.localization)} data={data} locale={options.locale ?? 'en'} now={NOW} onReport={(report) => reports.push(report)} />)
  // The screen did not throw: the neighbour is drawn, the error boundary did not fire, React printed nothing.
  expect(view.container.querySelector('[data-hl-node="ok"]')?.textContent).toBe('ok')
  expect(reports.filter((report) => report.kind === 'render-error')).toEqual([])
  expect(errors).not.toHaveBeenCalled()
  return { text: view.container.querySelector('[data-hl-node="t"]')?.textContent ?? '', reports, container: view.container }
}

const ignored = (drawn: Drawn): readonly string[] => drawn.reports.flatMap((report) => (report.kind === 'ignored-input' ? [`${report.where} — ${report.reason}`] : []))

const EN = { defaultLocale: 'en', locales: ['en'], strings: {} }

describe('a template of the wrong shape: an empty place, a report, neighbours intact', () => {
  const shapes: readonly (readonly [string, unknown, string])[] = [
    ['template string is a number', template(42, {}), ''],
    ['template string is null', template(null, {}), ''],
    ['template string is an object', template({ toString: 'x' }, {}), ''],
    ['no template string', { kind: 'template', values: {} }, ''],
    ['values — null', template('{a} b', null), '{a} b'],
    ['values is an array', template('{a} b', [bound('x')]), '{a} b'],
    ['values is a string', template('{a} b', 'a'), '{a} b'],
    ['no values', { kind: 'template', template: '{a} b' }, '{a} b'],
    ['value is null', template('[{a}]', { a: null }), '[]'],
    ['value is a string', template('[{a}]', { a: 'text' }), '[]'],
    ['value is an array', template('[{a}]', { a: [1] }), '[]'],
    ['value of an unknown kind', template('[{a}]', { a: { kind: 'markdown', source: '**x**' } }), '[]'],
    ['value without a kind', template('[{a}]', { a: { path: 'x', fallback: 'f' } }), '[]'],
    // A known kind of the wrong shape gives the same empty place as an unknown kind (`unknownTemplateValueKind`).
    ['binding without a path', template('[{a}]', { a: { kind: 'binding', fallback: 'f' } }), '[]'],
    ['binding with an object path', template('[{a}]', { a: { kind: 'binding', path: { x: 1 }, fallback: 'f' } }), '[]'],
    ['binding without fallback text', template('[{a}]', { a: { kind: 'binding', path: 'n' } }), '[]'],
    ['plural without of', template('[{n} {u}]', { n: bound('n'), u: { kind: 'plural', forms: { one: 'point', other: 'points' } } }), '[1 ]'],
    ['plural with a numeric of', template('[{n} {u}]', { n: bound('n'), u: plural(7) }), '[1 ]'],
    ['fallback text is an object', template('[{a}]', { a: { kind: 'binding', path: 'x', fallback: { html: '<b>' } } }), '[]'],
    ['forms is null', template('[{n} {u}]', { n: bound('n'), u: plural('n', null) }), '[1 ]'],
    ['forms is a string', template('[{n} {u}]', { n: bound('n'), u: plural('n', 'points') }), '[1 ]'],
    ['forms without other', template('[{n} {u}]', { n: bound('n'), u: plural('n', { few: 'x' }) }), '[1 ]'],
    ['a form is an object', template('[{n} {u}]', { n: bound('n'), u: plural('n', { one: { text: 'point' }, other: 'points' }) }), '[1 points]'],
    ['other is a number', template('[{n} {u}]', { n: bound('n'), u: plural('n', { one: 'point', other: 7 }) }), '[1 ]'],
    ['a plural agreeing with a value of the wrong shape gives `other`', template('[{a}{u}]', { a: { kind: 'binding', fallback: '1' }, u: plural('a') }), '[points]'],
  ]

  it.each(shapes)('%s', (_name, content, expected) => {
    const drawn = draw(content, { n: 1 }, { localization: EN })
    expect(drawn.text).toBe(expected)
  })

  it('what was ignored is named in the report: node, field and reason', () => {
    expect(ignored(draw(template(42, {})))).toEqual(['node “t”: content: template — the template is not a string; the text is drawn empty'])
    expect(ignored(draw(template('{a}', null)))[0]).toContain('node “t”: content: values')
    expect(ignored(draw(template('{a}', { a: 'text' })))[0]).toContain('node “t”: content: values.a')
    expect(ignored(draw(template('{a}', { a: { kind: 'markdown' } })))[0]).toContain('unknown kind')
    expect(ignored(draw(template('{n} {u}', { n: bound('n'), u: plural('n', null) }), { n: 1 }))[0]).toContain('node “t”: content: values.u — a template value of kind “plural” does not have the shape of that kind')
    expect(ignored(draw(template('{a}', { a: { kind: 'binding', fallback: 'f' } })))[0]).toContain('of kind “binding” does not have the shape')
    // An honest template gives no reports: a place without a value and a value without a place are not errors.
    expect(draw(template('{a} {typo}', { a: bound('x'), unused: bound('y') }), { x: 1 }).reports).toEqual([])
  })

  it('the same on the server: markup is produced, no exception', () => {
    for (const [, content] of shapes) {
      const html = renderToString(<HotlayoutScreen document={documentWith(content, EN)} data={{ n: 1 }} now={NOW} onReport={() => undefined} />)
      expect(html).toContain('data-hl-node="ok"')
    }
  })
})

describe('prototype names are not values, forms or numbers', () => {
  const names = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'prototype']

  it('a place named after a prototype member that is absent from values stays literal text', () => {
    for (const name of names) expect(draw(template(`a {${name}} b`, {})).text).toBe(`a {${name}} b`)
  })

  it('an own `__proto__` key in values is dropped as an entry: the rest of the template is drawn, the prototype is not replaced', () => {
    // `JSON.parse` makes `__proto__` an ORDINARY own key; in a JS literal it would replace the prototype.
    const content = JSON.parse('{"kind":"template","template":"{a} {constructor}","values":{"a":{"kind":"binding","path":"x","fallback":"f"},"__proto__":{"constructor":{"kind":"binding","path":"x","fallback":"POLLUTED"}}}}') as unknown
    expect(draw(content, { x: 1 }).text).toBe('1 {constructor}')
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('`constructor` as a DECLARED value is an ordinary value (the name shape allows it)', () => {
    expect(draw(JSON.parse('{"kind":"template","template":"[{constructor}]","values":{"constructor":{"kind":"binding","path":"x","fallback":"f"}}}'), { x: 7 }).text).toBe('[7]')
  })

  it('`of` naming a prototype member finds no number: `other`, no exception', () => {
    for (const name of names) expect(draw(template('{n} {u}', { n: bound('n'), u: plural(name) }), { n: 1 }, { localization: EN }).text).toBe('1 points')
    // A non-string in place of `of` is a plural of the wrong shape: an empty place, the sentence intact.
    for (const of of [null, 1, {}, ['n'], true]) expect(draw(template('{n} {u}', { n: bound('n'), u: plural(of) }), { n: 1 }, { localization: EN }).text).toBe('1 ')
  })

  it('form keys from the prototype are not forms; a data path from the prototype means "no data"', () => {
    const forms = JSON.parse('{"other":"points","constructor":"X","toString":"Y","__proto__":{"one":"POLLUTED"}}') as unknown
    expect(draw(template('{n} {u}', { n: bound('n'), u: plural('n', forms) }), { n: 1 }, { localization: EN }).text).toBe('1 points')
    for (const path of names) expect(draw(template('[{a}]', { a: bound(path) })).text).toBe('[—]')
  })

  it('a translation from the table prototype is not a translation', () => {
    const localization = { defaultLocale: 'en', locales: ['en', 'uk'], strings: { uk: { 's/ok/content': 'ок' } } }
    const content = template('{n} {u}', { n: bound('n'), u: plural('n') })
    const reports: HotlayoutReport[] = []
    const view = render(<HotlayoutScreen document={documentWith(content, localization)} data={{ n: 1 }} locale="uk" now={NOW} onReport={(report) => reports.push(report)} />)
    // Neither `…template` nor `…forms.other` exists in the table: the document string and forms, the source language rules.
    expect(view.container.querySelector('[data-hl-node="t"]')?.textContent).toBe('1 point')
  })
})

describe('a plural does not evaluate a plural: there are no cycles by construction', () => {
  it('`of` pointing at itself, at another plural, or in a ring gives `other` immediately', () => {
    expect(draw(template('{u}', { u: plural('u') }), {}, { localization: EN }).text).toBe('points')
    expect(draw(template('{a} {b}', { a: plural('b', { other: 'A' }), b: plural('a', { other: 'B' }) }), {}, { localization: EN }).text).toBe('A B')
    const ring = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`v${String(index)}`, plural(`v${String((index + 1) % 8)}`, { other: String(index) })]))
    expect(draw(template('{v0}{v1}{v2}{v3}{v4}{v5}{v6}{v7}', ring), {}, { localization: EN }).text).toBe('01234567')
  })
})

describe('substitution is linear: a large input does not hang', () => {
  const language = { translationLocale: 'en', sourceLocale: 'en', translated: () => undefined }
  const environment = { scope: { n: 1850, when: '2026-10-14T09:00:00.000Z' }, formattingLocale: 'en', now: NOW }
  /** Time of one call, ms. The bounds are orders of magnitude above the expected: the test catches a square, not milliseconds. */
  const timed = (run: () => string): { readonly text: string; readonly ms: number } => {
    const started = performance.now()
    const text = run()
    return { text, ms: performance.now() - started }
  }

  it('a megabyte string without places', () => {
    const line = 'a'.repeat(1_048_576)
    const { text, ms } = timed(() => templateText(template(line, { n: bound('n') }), language, environment))
    expect(text).toHaveLength(line.length)
    expect(ms).toBeLessThan(1000)
  })

  it('a megabyte of open brackets and near-places: each position is constant work', () => {
    for (const unit of ['{', '{a', '{{', '{aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '}{', '{n ']) {
      const line = unit.repeat(Math.ceil(1_048_576 / unit.length))
      const { text, ms } = timed(() => templateText(template(line, { n: bound('n') }), language, environment))
      expect(text, unit).toBe(line)
      expect(ms, unit).toBeLessThan(1000)
    }
  })

  it('ten thousand places of one value: the value text is computed ONCE', () => {
    // The read counter is a getter on an own data key: a value is read exactly as many times as it is formatted.
    let reads = 0
    const scope: Record<string, unknown> = {}
    Object.defineProperty(scope, 'n', { enumerable: true, get: () => ((reads += 1), 1850) })
    const line = '{n} '.repeat(10_000)
    const { text, ms } = timed(() => templateText(template(line, { n: bound('n', { format: 'number' }) }), language, { ...environment, scope }))
    expect(text).toBe('1,850 '.repeat(10_000))
    expect(ms).toBeLessThan(1000)
    expect(reads).toBe(1)
  })

  it('ten thousand places of a plural with `daysUntil`: days are counted once per name', () => {
    const line = '{d} {u}, '.repeat(10_000)
    const values = { d: bound('when', { format: 'daysUntil' }), u: plural('d', { one: 'day', other: 'days' }) }
    const { text, ms } = timed(() => templateText(template(line, values), language, environment))
    expect(text.startsWith('4 days, 4 days, ')).toBe(true)
    expect(ms).toBeLessThan(1000)
  })

  it('a thousand values (the schema allows eight): the reader does not crash and does not grow quadratically', () => {
    const values: Record<string, unknown> = {}
    let line = ''
    for (let index = 0; index < 1000; index += 1) {
      const name = `v${String(index)}`
      values[name] = index % 2 === 0 ? bound('n', { format: 'currency', currency: 'USD' }) : plural(`v${String(index - 1)}`)
      line += `{${name}} `
    }
    const { text, ms } = timed(() => templateText(template(line, values), language, environment))
    expect(text.startsWith('1,850\u00A0USD points 1,850\u00A0USD points ')).toBe(true)
    expect(ms).toBeLessThan(2000)
  })

  it('a large template on a real screen: it is drawn, the neighbour is intact', () => {
    const line = `${'{n} · '.repeat(5000)}${'x'.repeat(200_000)}`
    const drawn = draw(template(line, { n: bound('n', { format: 'number' }) }), { n: 1850 })
    expect(drawn.text).toHaveLength(5000 * '1,850 · '.length + 200_000)
  })

  it('a megabyte plural language and a thousand foreign tags: `other`, no exception and no unbounded cache', () => {
    expect(pluralCategoryOf(1, 'x'.repeat(1_048_576))).toBe('other')
    for (let index = 0; index < 1000; index += 1) expect(pluralCategoryOf(1, `zz-x-${String(index)}`)).toBe('other')
    for (const locale of ['', 'not a tag', 'en_US', '-', 'ja_JP_JP', '\u0000']) expect(pluralCategoryOf(1, locale), locale).toBe('other')
    expect(pluralCategoryOf(1, 'en')).toBe('one')
    expect(pluralCategoryOf(1, undefined)).toBe('other')
  })
})

describe('numbers the format does not accept: the value as is, nothing throws', () => {
  const strange: readonly (readonly [string, unknown])[] = [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['numeric string', '1850'],
    ['string with spaces', ' 12 '],
    ['empty array', []],
    ['object with valueOf', { valueOf: 1 }],
    ['flag', true],
  ]

  it.each(strange)('%s: number, currency and daysUntil do not apply', (_name, value) => {
    // A string under `daysUntil` is separate, below: `Date` parses "1850" too (a year), and that is a question about dates, not numbers.
    for (const format of typeof value === 'string' ? ['number', 'currency'] : ['number', 'currency', 'daysUntil']) {
      expect(formatBound(value, format, 'en', 'UTC', undefined, { currency: 'USD', now: NOW }), format).toBeUndefined()
      expect(numericBoundValue(value, format, NOW), format).toBeUndefined()
    }
  })

  it('on screen: NaN and infinity are shown as is, the word takes `other`; an object gives the fallback text', () => {
    const content = template('{n} {u}', { n: bound('n', { format: 'number' }), u: plural('n') })
    expect(draw(content, { n: Number.NaN }, { localization: EN }).text).toBe('NaN points')
    expect(draw(content, { n: Number.POSITIVE_INFINITY }, { localization: EN }).text).toBe('Infinity points')
    expect(draw(content, { n: '1' }, { localization: EN }).text).toBe('1 points')
    expect(draw(content, { n: { valueOf: 1 } }, { localization: EN }).text).toBe('— points')
    expect(draw(content, { n: 1 }, { localization: EN }).text).toBe('1 point')
  })

  it('a number within 2^53 − 1: tiny, negative zero and the limit itself are written without an exception', () => {
    for (const value of [5e-324, -0, Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 0.1 + 0.2]) {
      expect(typeof formatBound(value, 'number', 'en'), String(value)).toBe('string')
      expect(typeof formatBound(value, 'currency', 'en', undefined, undefined, { currency: 'JOD' }), String(value)).toBe('string')
      expect(numericBoundValue(value, undefined, NOW)).toBe(value)
    }
    expect(formatBound(Number.MAX_SAFE_INTEGER, 'number', 'en')).toBe('9,007,199,254,740,991')
  })

  it('a number beyond 2^53 − 1 (`numberBeyondSafeInteger`): as is, the word is `other`, the same in a template', () => {
    for (const value of [Number.MAX_SAFE_INTEGER + 3, -(Number.MAX_SAFE_INTEGER + 3), 1e21, -1e21, 1e308, Number.MAX_VALUE]) {
      expect(formatBound(value, 'number', 'en'), String(value)).toBeUndefined()
      expect(formatBound(value, 'currency', 'en', undefined, undefined, { currency: 'JOD' }), String(value)).toBeUndefined()
      for (const format of [undefined, 'number', 'currency']) expect(numericBoundValue(value, format, NOW)).toBeUndefined()
    }
    const content = template('{n} {u}', { n: bound('n', { format: 'number' }), u: plural('n', { one: 'ONE', few: 'FEW', many: 'MANY', other: 'other' }) })
    expect(draw(content, { n: 1e21 }, { localization: EN }).text).toBe('1e+21 other')
    // A fallback-text number beyond the limit gives nothing either.
    expect(draw(template('{n} {u}', { n: { kind: 'binding', path: 'none', fallback: '9007199254740993' }, u: plural('n', { one: 'ONE', other: 'other' }) }), {}, { localization: EN }).text).toBe('9007199254740993 other')
  })

  it('a date only by the contract expression (`dateValueForm`): the rest is the value as is, with no delay on a long string', () => {
    const notDates: readonly unknown[] = ['1850', '2026-10-14', '2026-10-14T09:00:00', '2026-10-14 09:00:00Z', '2026-10-14T09:00:00+0300', '+275760-09-13T00:00:00.000Z', ' 2026-10-14T09:00:00Z', '2026-10-14T09:00:00Z\n', '2026-10-14T09:00:00.1234567890Z', 1791968400000, true, null, {}, ['2026-10-14T09:00:00Z']]
    for (const value of notDates) {
      for (const format of ['date', 'dateTime', 'time', 'daysUntil']) expect(formatBound(value, format, 'en', 'UTC', undefined, { now: NOW }), `${String(value)} / ${format}`).toBeUndefined()
      expect(numericBoundValue(value, 'daysUntil', NOW)).toBeUndefined()
    }
    // A date by shape, but the engine cannot parse it (there is no month 13): also "not a date".
    expect(formatBound('2026-13-45T99:99:99Z', 'daysUntil', 'en', undefined, undefined, { now: NOW })).toBeUndefined()
    for (const value of ['2026-10-14T09:00Z', '2026-10-14T09:00:00Z', '2026-10-14T12:00:00.000000000+03:00']) expect(formatBound(value, 'daysUntil', 'en', undefined, undefined, { now: NOW })).toBe('4')
    for (const long of ['2'.repeat(1_048_576), `2026-10-14T09:00:00.${'1'.repeat(1_048_576)}Z`, '2026-10-14T09:00:00Z'.repeat(50_000)]) {
      const started = performance.now()
      expect(formatBound(long, 'daysUntil', 'en', undefined, undefined, { now: NOW })).toBeUndefined()
      expect(formatBound(long, 'date', 'en')).toBeUndefined()
      expect(performance.now() - started).toBeLessThan(500)
    }
  })

  it('daysUntil: a "now" that is not a number means the format does not apply; a distant instant gives a number with separators', () => {
    for (const now of [undefined, Number.NaN, Number.POSITIVE_INFINITY, '2026' as unknown as number]) {
      expect(formatBound('2026-10-14T09:00:00.000Z', 'daysUntil', 'en', undefined, undefined, { now })).toBeUndefined()
    }
    expect(formatBound('9999-12-31T23:59:59Z', 'daysUntil', 'en', undefined, undefined, { now: NOW })).toMatch(/^[\d,]+$/)
  })

  it('a platform without language data (`missingNumberLocaleData`): number and amount as is, days in plain digits', () => {
    expect(formatBound(1850, 'number', 'tlh')).toBeUndefined()
    expect(formatBound(1850.5, 'currency', 'tlh', undefined, undefined, { currency: 'USD' })).toBeUndefined()
    expect(formatBound('2030-11-18T09:00:00.000Z', 'daysUntil', 'tlh', undefined, undefined, { now: NOW })).toBe('1500')
    // Nobody named a locale: the device language, the format applies.
    expect(typeof formatBound(1850, 'number', undefined)).toBe('string')
    expect(typeof formatBound(1850, 'number', '')).toBe('string')
  })

  it('numeric fallback text for a plural: only the number shape, with no delay on a megabyte of digits', () => {
    const count = (fallback: unknown, data: Record<string, unknown> = {}): string => draw(template('{n}|{u}', { n: { kind: 'binding', path: 'n', fallback }, u: plural('n', { one: 'ONE', other: 'other' }) }), data, { localization: EN }).text.split('|')[1] ?? ''
    expect(count('1')).toBe('ONE')
    expect(count('-1')).toBe('ONE')
    expect(count('1.0004')).toBe('ONE')
    for (const fallback of ['1 ', ' 1', '+1', '1e0', '0x1', '１', '1,0', '.5', '1.', 'Infinity', 'NaN', '']) expect(count(fallback), JSON.stringify(fallback)).toBe('other')
    // The fallback text is shown for `""`, `null` and an object in the data too, as a number from it; data that EXISTS but is not a number is not.
    expect(count('1', { n: '' })).toBe('ONE')
    expect(count('1', { n: null })).toBe('ONE')
    expect(count('1', { n: { x: 1 } })).toBe('ONE')
    expect(count('1', { n: 'many' })).toBe('other')
    expect(count('1', { n: ' ' })).toBe('other')
    expect(count('1', { n: 5 })).toBe('other')
    const started = performance.now()
    expect(templateText(template('{n}|{u}', { n: { kind: 'binding', path: 'n', fallback: '1'.repeat(1_048_576) }, u: plural('n', { one: 'ONE', other: 'other' }) }), { translationLocale: 'en', sourceLocale: 'en', translated: () => undefined }, { scope: {}, formattingLocale: 'en' }).endsWith('|other')).toBe(true)
    expect(performance.now() - started).toBeLessThan(500)
  })

  it('the reader "now": a number and a `Date` as is, anything else falls back to the clock', () => {
    expect(readerNow(NOW)).toBe(NOW)
    expect(readerNow(new Date(NOW))).toBe(NOW)
    vi.useFakeTimers({ now: 1234, toFake: ['Date'] })
    try {
      for (const now of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, '2026-10-10', {}, new Date('x'), { getTime: () => 5 }]) expect(readerNow(now)).toBe(1234)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('currency code from the network: three capital Latin letters or nothing', () => {
  const hostile: readonly unknown[] = ['usd', 'US', 'USDT', 'U$D', '   ', '', 'ÙSD', 'USD\n', '<b>', "USD';", '__proto__', 'constructor', 42, null, true, {}, ['USD'], { toString: 'USD' }]

  it.each(hostile.map((code) => [JSON.stringify(code), code] as const))('code %s: the format does not apply, the number as is', (_name, code) => {
    expect(formatBound(120.5, 'currency', 'en', undefined, undefined, { currency: code })).toBeUndefined()
    expect(draw(template('{p}', { p: bound('p', { format: 'currency', currency: code }) }), { p: 120.5 }).text).toBe('120.5')
  })

  it('a well-formed code the platform does not know gives two characters; a thousand such codes do not inflate the cache', () => {
    expect(formatBound(12.5, 'currency', 'en', undefined, undefined, { currency: 'XQQ' })).toBe('12.50\u00A0XQQ')
    const letters = 'ABCDEFGHIJ'
    for (const a of letters) for (const b of letters) for (const c of letters) expect(formatBound(1.5, 'currency', 'en', undefined, undefined, { currency: `${a}${b}${c}` })).toMatch(/^[\d.]+\u00A0[A-Z]{3}$/)
    expect(formatBound(1850.5, 'currency', 'en', undefined, undefined, { currency: 'USD' })).toBe('1,850.50\u00A0USD')
  })

  it('a format locale the engine does not accept: a shorter tag, then the text language, then the value as is', () => {
    expect(formatBound(1850, 'number', 'en-x-private-zzz')).toBe('1,850')
    expect(formatBound(1850, 'number', 'ja_JP_JP')).toBe('1,850')
    expect(formatBound(1850, 'number', '!!', undefined, 'uk')).toBe('1\u00A0850')
    expect(formatBound(1850, 'number', '!!')).toBeUndefined()
    expect(boundText(bound('n', { format: 'number' }), { scope: { n: 1850 }, formattingLocale: '!!' })).toBe('1850')
    expect(formatBound(1850, 'number', 'x'.repeat(100_000))).toBeUndefined()
  })

  it('a format that is not a string or comes from the prototype means "unknown format": the value as is', () => {
    for (const format of ['constructor', 'toString', '__proto__', 'Number', 'NUMBER', 42, null, {}, ['number']]) {
      expect(formatBound(1850, format, 'en', undefined, undefined, { currency: 'USD', now: NOW })).toBeUndefined()
      expect(draw(template('{n}', { n: bound('n', { format }) }), { n: 1850 }).text).toBe('1850')
    }
  })
})

describe('text goes into the DOM only as text', () => {
  const MARKUP = '<img src=x onerror="globalThis.pwned=1"><script>globalThis.pwned=1</script><b style="position:fixed;inset:0">'
  const CSS = 'red;position:fixed;inset:0;background:url(https://evil.example/x)'

  /** No element the package does not draw itself, and no trace in styles. */
  const expectInert = (drawn: Drawn): void => {
    expect(drawn.container.querySelector('img, script, b, iframe, a, svg')).toBeNull()
    for (const element of drawn.container.querySelectorAll<HTMLElement>('[style]')) {
      expect(element.getAttribute('style')).not.toContain('evil.example')
      expect(element.style.position).not.toBe('fixed')
    }
    expect((globalThis as Record<string, unknown>).pwned).toBeUndefined()
  }

  it('markup in a template string, in fallback text, in a form and in a data value is visible text', () => {
    const content = template(`${MARKUP}{a}{u}{f}`, { a: bound('a'), u: plural('n', { other: MARKUP }), f: { kind: 'binding', path: 'missing', fallback: MARKUP } })
    const drawn = draw(content, { a: MARKUP })
    expect(drawn.text).toBe(MARKUP.repeat(4))
    expectInert(drawn)
  })

  it('markup in a TRANSLATION of a string and of forms is text too', () => {
    const localization = { defaultLocale: 'en', locales: ['en', 'uk'], strings: { uk: { 's/t/content.template': `${MARKUP}{n}{u}`, 's/t/content.values.u.forms.other': CSS, 's/t/content.values.u.forms.one': MARKUP } } }
    const drawn = draw(template('{n} {u}', { n: bound('n'), u: plural('n') }), { n: 21 }, { localization, locale: 'uk' })
    expect(drawn.text).toBe(`${MARKUP}21${MARKUP}`)
    expectInert(drawn)
  })

  it('"CSS" in a template, a value name and a currency code does not reach style', () => {
    const drawn = draw(template(`${CSS}{a}`, { a: bound('a', { format: 'currency', currency: CSS }) }), { a: 5 })
    expect(drawn.text).toBe(`${CSS}5`)
    expectInert(drawn)
  })

  it('on the server the template markup is escaped', () => {
    const html = renderToString(<HotlayoutScreen document={documentWith(template(`${MARKUP}{a}`, { a: bound('a') }))} data={{ a: MARKUP }} now={NOW} onReport={() => undefined} />)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;img')
  })

  it('a template where the string is NOT human text selects nothing and writes nothing', () => {
    const writes: string[] = []
    const value = template('{a}', { a: bound('a') })
    const root = {
      id: 'root',
      type: 'Screen',
      props: {},
      children: [{ id: 'group', type: 'ChoiceGroup', props: { value }, children: [{ id: 'opt', type: 'ListTile', props: { title: { kind: 'literal', value: 'M' }, leading: { kind: 'none' }, trailing: { kind: 'radio', optionValue: 'm' } } }] }],
    }
    const document = JSON.parse(JSON.stringify({ schemaVersion: READER_SCHEMA_VERSION, documentId: 'd', name: 'D', initialScreenId: 's', screens: [{ screenId: 's', name: 'S', root }] })) as UiDocument
    const view = render(<HotlayoutScreen document={document} data={{ a: 'm' }} onWrite={(path) => writes.push(path)} onReport={() => undefined} />)
    const option = view.container.querySelector('[role="radio"]')
    expect(option?.getAttribute('aria-checked')).toBe('false')
    ;(option as HTMLElement).click()
    // A template has no write path: the choice stays local.
    expect(writes).toEqual([])
  })
})

describe('a pure template without an environment', () => {
  it('without a language and without data: the document string, fallback texts, `other`', () => {
    const content = template('{n} {u} {x}', { n: bound('n'), u: plural('n') })
    expect(templateText(content, NO_TEMPLATE_LANGUAGE, { scope: {}, formattingLocale: undefined })).toBe('— points {x}')
    // Data of the wrong shape (the host gave `null`): "no data", without an exception.
    expect(templateText(content, NO_TEMPLATE_LANGUAGE, { scope: null as unknown as Record<string, unknown>, formattingLocale: undefined })).toBe('— points {x}')
    for (const value of [null, undefined, 'text', 42, [], true]) expect(templateText(value, NO_TEMPLATE_LANGUAGE, { scope: {}, formattingLocale: undefined })).toBe('')
  })

  it('a translation that throws or returns a non-string is never called by the reader outside its own table: a fake language does not crash the template', () => {
    const language = { translationLocale: 'uk', sourceLocale: 'en', translated: (): string | undefined => undefined }
    expect(templateText(template('{n} {u}', { n: bound('n'), u: plural('n') }), language, { scope: { n: 21 }, formattingLocale: 'uk' })).toBe('21 points')
  })
})
