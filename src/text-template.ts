/**
 * Text template, numbers and plurals (schema 9.4.0): a mirror of the contract reference
 * implementation (the template and binding-format modules; the package imports nothing from the
 * contract repository). The two copies are kept together by the shared case table
 * `contract/fixtures/template/template-cases.json`, and this file's numbers are compared with the
 * artifact's `x-template` block by `package.test.tsx`.
 *
 * The rule has six steps, and the order matters:
 *
 *  1. STRING: the translation in the effective language under the key `<place>.template`, else
 *     the one from the document (`missingTranslation`);
 *  2. PLACES: occurrences of `{name}`; if the name is an OWN key of `values` it is a value place,
 *     otherwise it is literal text with the braces (`undeclaredPlaceholder`). One pass: what is
 *     substituted is not parsed again. There is no escaping;
 *  2a. A WORD (`kind: 'text'`, since 9.6.0) is the place's text: the translation in the
 *     effective language under the key `<place>.values.<name>.text`, else the document's `text`;
 *  3. A VALUE FROM DATA becomes text the same way as a standalone binding: with no data, the
 *     fallback text of THIS value is shown and the rest of the sentence stays
 *     (`missingTemplateValue`);
 *  4. THE NUMBER FOR A PLURAL is the value of `of`, taken by absolute value and rounded to three
 *     fraction digits;
 *  5. THE PLURAL LANGUAGE is the language of the forms actually SHOWN (`pluralLanguage`): if
 *     `other` is translated into the effective language, its forms and rules apply; if not, the
 *     document's forms and the source language's rules. They must not be mixed: a Ukrainian rule
 *     over English forms would give "21 day";
 *  6. THE CATEGORY comes from the CLDR cardinal rules. `zero`, `one`, `two` are categories of the
 *     language, not exact numbers. No form, no number, or no language gives `other`.
 *
 * TRUST BOUNDARY. The template string, value names, forms and currency code arrive over the
 * network, so nothing here throws or hangs:
 *  - maps are read through `Object.hasOwn`: `{constructor}` is not a value, and `of: '__proto__'`
 *    finds no number;
 *  - substitution is LINEAR in the string length: one pass with a bounded quantifier, a value's
 *    text is computed once per name (ten thousand places of one value cost one `Intl` call), and
 *    `Intl` formatters come from a cache;
 *  - a plural never evaluates another plural: an `of` pointing at itself or at a word has no
 *    number (`pluralWithoutNumber`), so there is no recursion by construction;
 *  - a value the reader does not understand (not an object, an unknown kind, a known kind of the
 *    wrong shape) yields empty text for ITS place (`unknownTemplateValueKind: 'render-empty'`) and
 *    goes into the report (`ignored-input`);
 *  - the result is a STRING, which React puts in a text node. Nothing builds markup from it.
 *
 * This module does not import `react`: the server graph of the entry point re-exports it.
 */
import { COUNTABLE_FORMATS, numericBoundValue } from './binding-format'
import type { TextEnvironment } from './data'
import { boundPieces, valueAt } from './data'
import type { FormatPart, FormattedPiece } from './money'
import { MAX_LOCALE_TAG_LENGTH } from './locale'
import { isRecord } from './sanitize'
import type { IssueSink } from './shape'

/* ───────────────────── mirror of the `x-template` block ───────────────────── */

/** A template value name: `x-template.valueNamePattern`. */
export const TEMPLATE_VALUE_NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,23}$/

/** Most values in a template: `x-template.maxValues`. The reader does not reject beyond the limit: the extra value is simply there. */
export const MAX_TEMPLATE_VALUES = 8

/** CLDR plural categories: `x-template.pluralCategories`. */
export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const
export type PluralCategory = (typeof PLURAL_CATEGORIES)[number]

/**
 * The number for a plural: `x-template.pluralNumber`, by absolute value, up to three fraction
 * digits. `fallbackPattern` is the form of a fallback text that yields a number when there is no
 * data (`pluralNumberWithoutData`).
 */
export const PLURAL_NUMBER = { absolute: true, maximumFractionDigits: 3, fallbackPattern: '^-?\\d+(\\.\\d+)?$' } as const
const NUMERIC_FALLBACK = new RegExp(PLURAL_NUMBER.fallbackPattern)
// There is no length limit on the fallback text: `1.` and 45 zeros both mean 1. The pattern is linear, and a number that is too large gives `Infinity` and is rejected.

/** Translation keys inside a place: `x-template.translationKeys`. */
export const TEMPLATE_TEXT_SUBPATH = 'template'
/** The translation key of a word (`kind: 'text'`) inside a place: `x-template.translationKeys.word`. */
export function wordTextSubpath(name: string): string {
  return `values.${name}.text`
}
export function pluralFormSubpath(name: string, category: PluralCategory): string {
  return `values.${name}.forms.${category}`
}

/* ─────────────────────────── environment ─────────────────────────── */

/** The language of a template's text: the answers of the 9.1.0 locale rule and a place's translation table. */
export interface TemplateLanguage {
  /** The effective translation language (`translation`); `undefined` for a document without localization. */
  readonly translationLocale: string | undefined
  /** The document's source language (`localization.defaultLocale`). */
  readonly sourceLocale: string | undefined
  /** The translation in the effective language by a path INSIDE the value (`template`, `values.unit.forms.few`). */
  readonly translated: (subPath: string) => string | undefined
}

export const NO_TEMPLATE_LANGUAGE: TemplateLanguage = { translationLocale: undefined, sourceLocale: undefined, translated: () => undefined }

/* ─────────────────────────────── plural ─────────────────────────────── */

const MAX_CACHED_RULES = 32
const pluralRules = new Map<string, Intl.PluralRules | null>()

/** Plural rules for a language, or `null` if the engine does not know it (cached: a document has few languages). */
function rulesOf(locale: string): Intl.PluralRules | null {
  const cached = pluralRules.get(locale)
  if (cached !== undefined) return cached
  let rules: Intl.PluralRules | null = null
  try {
    /*
     * `Intl.PluralRules` silently replaces an unknown tag with the ENVIRONMENT's locale, so the
     * same document would agree differently on a server and in a browser. The fraction bounds are
     * named explicitly: they are what rounds 1.0004 to 1.
     */
    if (Intl.PluralRules.supportedLocalesOf(locale).length > 0) {
      rules = new Intl.PluralRules(locale, { type: 'cardinal', minimumFractionDigits: 0, maximumFractionDigits: PLURAL_NUMBER.maximumFractionDigits })
    }
  } catch {
    rules = null
  }
  if (pluralRules.size >= MAX_CACHED_RULES) pluralRules.clear()
  pluralRules.set(locale, rules)
  return rules
}

/**
 * A number's plural category in a language: the CLDR cardinal rules
 * (`pluralCategory: 'cldr-cardinal-categories-not-exact-numbers'`). No language, a language the
 * engine does not know, or a non-finite number gives `other`.
 */
export function pluralCategoryOf(count: number, locale: string | undefined): PluralCategory {
  // The rules' language is a translation-table key as the document writes it: a string from the network, so its length is bounded.
  if (typeof locale !== 'string' || locale === '' || locale.length > MAX_LOCALE_TAG_LENGTH || !Number.isFinite(count)) return 'other'
  const rules = rulesOf(locale)
  if (rules === null) return 'other'
  try {
    const category = rules.select(Math.abs(count))
    return (PLURAL_CATEGORIES as readonly string[]).includes(category) ? category : 'other'
  } catch {
    return 'other'
  }
}

/** The forms of ONE plural as they are shown, and the language whose rules select a form. */
interface PluralText {
  readonly forms: Readonly<Partial<Record<PluralCategory, string>>>
  readonly other: string
  readonly locale: string | undefined
}

/** An object's own string under a key, or `undefined`. */
function ownString(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  if (!Object.hasOwn(record, key)) return undefined
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function pluralTextOf(name: string, entry: Readonly<Record<string, unknown>>, language: TemplateLanguage): PluralText {
  const showsSource = language.translationLocale === language.sourceLocale
  const translatedOther = showsSource ? undefined : language.translated(pluralFormSubpath(name, 'other'))

  if (translatedOther !== undefined) {
    // Forms of THIS language, each under its own key; the document's forms are not mixed in.
    const forms: Partial<Record<PluralCategory, string>> = {}
    for (const category of PLURAL_CATEGORIES) {
      if (category === 'other') continue
      const form = language.translated(pluralFormSubpath(name, category))
      if (form !== undefined) forms[category] = form
    }
    return { forms, other: translatedOther, locale: language.translationLocale }
  }

  // No translation of `other`: the document's forms with the SOURCE language's rules, even if other forms were translated.
  // That `forms` is an object with a string `other` has already been checked (`readableKind`).
  const documentForms = isRecord(entry.forms) ? entry.forms : {}
  const forms: Partial<Record<PluralCategory, string>> = {}
  for (const category of PLURAL_CATEGORIES) {
    if (category === 'other') continue
    const form = ownString(documentForms, category)
    if (form !== undefined) forms[category] = form
  }
  return { forms, other: ownString(documentForms, 'other') ?? '', locale: language.sourceLocale }
}

/* ─────────────────────────────── template ─────────────────────────────── */

/** `{name}` uses the same name pattern, without anchors and with a capture group: one source. The quantifier is bounded, so the search is linear. */
const PLACEHOLDER = new RegExp(`\\{(${TEMPLATE_VALUE_NAME_PATTERN.source.replace(/^\^|\$$/g, '')})\\}`, 'g')

const NO_REPORT: IssueSink = () => undefined

/**
 * A piece of a template's text: what is written and from which DECLARED place. `place:
 * undefined` is the string's literal text (and a place the template does not declare: `{pts}`
 * stays in it together with its braces).
 */
export interface TemplateRun {
  readonly text: string
  readonly place: string | undefined
  /** Part of a formatted number this piece is (9.19.0): `fraction` or `currency`; no field — the style of the place. */
  readonly part?: FormatPart | undefined
}

/**
 * A template's text as PIECES (composed text, since 9.6.0): the same as `templateText`, before
 * joining, in the LOGICAL order of the effective language's string, i.e. the order the
 * translation chose. There is one parser: there is no second one for part styles.
 *
 * There may be any number of empty pieces here (an empty place, an empty literal gap); `spanRuns`
 * drops and merges them.
 *
 * @param where the location for the report, e.g. `node “hero”: content`.
 */
export function templateRuns(value: unknown, language: TemplateLanguage, environment: TextEnvironment, report: IssueSink = NO_REPORT, where = 'template'): readonly TemplateRun[] {
  if (!isRecord(value)) return []
  const documentTemplate: unknown = value.template
  const showsSource = language.translationLocale === language.sourceLocale
  const template = (showsSource ? undefined : language.translated(TEMPLATE_TEXT_SUBPATH)) ?? documentTemplate
  if (typeof template !== 'string') {
    // No string: a string of an unfamiliar shape, drawn as an empty place (`unknownStringKind: 'render-empty'`).
    report({ where: `${where}: template`, reason: 'the template is not a string; the text is drawn empty' })
    return []
  }
  // The commonest case, a string without any place, is used as is, without parsing.
  if (!template.includes('{')) return [{ text: template, place: undefined }]

  const rawValues: unknown = value.values
  if (!isRecord(rawValues)) report({ where: `${where}: values`, reason: 'the values of a template are not an object; every placeholder is drawn as plain text' })
  const values: Readonly<Record<string, unknown>> = isRecord(rawValues) ? rawValues : {}

  // A value's pieces are computed ONCE per name: a place may repeat thousands of times.
  const pieces = new Map<string, readonly FormattedPiece[]>()
  const piecesOf = (name: string): readonly FormattedPiece[] => {
    const known = pieces.get(name)
    if (known !== undefined) return known
    const made = valuePieces(name, values, { language, environment, report, where })
    pieces.set(name, made)
    return made
  }

  const runs: TemplateRun[] = []
  let cursor = 0
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1]
    // Only an OWN key of `values` is a value place; anything else stays literal text, braces included.
    if (name === undefined || !Object.hasOwn(values, name)) continue
    runs.push({ text: template.slice(cursor, match.index), place: undefined })
    for (const piece of piecesOf(name)) runs.push(piece.part === undefined ? { text: piece.text, place: name } : { text: piece.text, place: name, part: piece.part })
    cursor = match.index + match[0].length
  }
  runs.push({ text: template.slice(cursor), place: undefined })
  return runs
}

/**
 * A template's text: the string in the effective language with the values substituted.
 *
 * @param where the location for the report, e.g. `node “hero”: content`.
 */
export function templateText(value: unknown, language: TemplateLanguage, environment: TextEnvironment, report: IssueSink = NO_REPORT, where = 'template'): string {
  return templateRuns(value, language, environment, report, where)
    .map((run) => run.text)
    .join('')
}

/**
 * A template value the reader UNDERSTANDS: a binding with string `path` and `fallback`, a plural
 * with a string `of` and forms whose `other` is a string, or a word (`kind: 'text'`, since 9.6.0)
 * with a string `text`. Anything else (an unknown kind, a non-object, a known kind of the wrong
 * shape) leaves the place DECLARED but empty (`unknownTemplateValueKind: 'render-empty'`):
 * literal braces would be untrue here, and the sentence must remain.
 */
function readableKind(entry: unknown): 'binding' | 'plural' | 'text' | undefined {
  if (!isRecord(entry)) return undefined
  if (entry.kind === 'text') return typeof entry.text === 'string' ? 'text' : undefined
  if (entry.kind === 'binding') return typeof entry.path === 'string' && typeof entry.fallback === 'string' ? 'binding' : undefined
  if (entry.kind === 'plural') return typeof entry.of === 'string' && isRecord(entry.forms) && typeof ownString(entry.forms, 'other') === 'string' ? 'plural' : undefined
  return undefined
}

/** A place's value as pieces: a binding with a number or amount gives several (since 9.19.0), anything else gives one piece without a part. */
function valuePieces(name: string, values: Readonly<Record<string, unknown>>, context: { readonly language: TemplateLanguage; readonly environment: TextEnvironment; readonly report: IssueSink; readonly where: string }): readonly FormattedPiece[] {
  const entry = values[name]
  if (readableKind(entry) === 'binding') return boundPieces(entry, context.environment)
  return [{ text: valueText(name, values, context.language, context.environment, context.report, context.where) }]
}

function valueText(name: string, values: Readonly<Record<string, unknown>>, language: TemplateLanguage, environment: TextEnvironment, report: IssueSink, where: string): string {
  const entry = values[name]
  const kind = readableKind(entry)
  if (kind === undefined || !isRecord(entry)) {
    const known = isRecord(entry) && (entry.kind === 'binding' || entry.kind === 'plural' || entry.kind === 'text')
    report({
      where: `${where}: values.${name}`,
      reason: !isRecord(entry)
        ? 'a template value is not an object; its place is drawn empty'
        : known
          ? `a template value of kind “${String(entry.kind)}” does not have the shape of that kind; its place is drawn empty`
          : 'a template value of an unknown kind; its place is drawn empty',
    })
    return ''
  }
  if (kind === 'text') {
    // A word is translated on its own: with no translation the document's text is used, and the rest of the sentence stays translated.
    const showsSource = language.translationLocale === language.sourceLocale
    return (showsSource ? undefined : language.translated(wordTextSubpath(name))) ?? (typeof entry.text === 'string' ? entry.text : '')
  }

  const plural = pluralTextOf(name, entry, language)
  /*
   * The number comes from the value named by `of`, and only a BINDING of the same template that
   * the reader understands. An `of` pointing at itself, at another plural, at a value of an
   * unknown kind, at a name from the prototype or at nothing has no number
   * (`pluralWithoutNumber: 'use-other'`): a plural does not evaluate a plural.
   */
  const target = typeof entry.of === 'string' && Object.hasOwn(values, entry.of) ? values[entry.of] : undefined
  const count = readableKind(target) === 'binding' && isRecord(target) ? countOf(target, environment) : undefined
  if (count === undefined) return plural.other
  // No form for this category gives `other`, never a neighbouring form (`missingPluralForm`).
  return plural.forms[pluralCategoryOf(count, plural.locale)] ?? plural.other
}

function countOf(binding: Readonly<Record<string, unknown>>, environment: TextEnvironment): number | undefined {
  const raw = valueAt(environment.scope, binding.path)
  /*
   * NO DATA: the FALLBACK TEXT is on screen, and the word agrees with what is shown
   * (`pluralNumberWithoutData`): a fallback "0" under Ukrainian rules gets the many-form of the word, not the fraction form.
   * The condition is the same one under which `boundText` shows the fallback. The value's format
   * does not matter here: a fallback text is not formatted, so for `daysUntil` a fallback "3" is 3.
   * A fallback "—" yields no number.
   *
   * Data that EXISTS but is not a number ("many"): the fallback is not shown, and gives no number.
   */
  if (raw === undefined || raw === null || raw === '' || (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean')) {
    const fallback = binding.fallback
    if (typeof fallback !== 'string' || !NUMERIC_FALLBACK.test(fallback)) return undefined
    return numericBoundValue(Number(fallback), undefined, undefined)
  }
  // An unknown format yields no number: the reader does not know what the value becomes under it.
  if (binding.format !== undefined && !(COUNTABLE_FORMATS as readonly unknown[]).includes(binding.format)) return undefined
  return numericBoundValue(raw, binding.format, environment.now, binding.unit)
}

/* ─────────────────────────── the reader's "now" ─────────────────────────── */

/**
 * The reader's "now" (`readerClock: 'injectable-read-at-render'`): a moment from the host, or the
 * clock of whoever renders. A moment of the wrong shape (`NaN`, a string, an invalid `Date`) falls
 * back to the clock: a "days left" screen must not disappear because of a host mistake.
 */
export function readerNow(now: unknown): number {
  if (typeof now === 'number' && Number.isFinite(now)) return now
  if (now instanceof Date) {
    const moment = now.getTime()
    if (!Number.isNaN(moment)) return moment
  }
  return Date.now()
}
