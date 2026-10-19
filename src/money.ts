/**
 * Money as money (schema 9.19.0): the sign of the currency, the sign of the number and
 * the parts of an amount. The reference is the artifact block `x-money`; this file is its
 * reader, written out here because the package does not import from the contract repository. The
 * shared table is the group `moneyCases` of `contract/fixtures/template/template-cases.json`
 * and the groups `amountPartCases` and `amountPartStruts` of
 * `contract/fixtures/rich-text/rich-text-cases.json`.
 *
 * Three optional fields of a binding, each one word, none with a default:
 *  - `currencyDisplay: 'symbol'` — the sign of the currency instead of its code; only with
 *    `format: 'currency'`;
 *  - `currencyPosition: 'before'` — the currency BEFORE the amount; only with `currency`;
 *  - `sign: 'always'` — a plus before a positive number; with `number` and `currency`.
 * An unknown word, or a field on a format that does not read it, is no field.
 *
 * Without a readable field the text is exactly what 9.4.0 wrote: the number, U+00A0, the
 * code. With one, the binding is written COMPOSED, in one order in every language: the
 * sign of the number, the currency before, the amount, the currency after. The amount is
 * the absolute value written as the format writes it; the sign of the number is written
 * by the contract (U+2212 for a negative, U+002B for a positive with `sign: 'always'`),
 * not by the platform, and a number whose written digits are all zeros has no sign. The
 * sign of the currency comes from the closed table `x-money.symbols`, never from the
 * platform; a code the table does not have is shown as the code, in the same place. In
 * text shown right to left the composed form is wrapped in U+2066 … U+2069.
 *
 * A formatted number is a list of PIECES of one place: the sign and the integer digits
 * (the style of the place), the fraction (`fraction`: the decimal separator and the digits
 * after it) and the currency with its gap (`currency`). Pieces exist without the new fields
 * too. A fallback text and a value shown as it is are one piece without a part.
 *
 * No React in this file: the server graph of the entry reads it too.
 */
import { compactPartsOf, compactSuffixOf, readsCompactNotation } from './compact-number'
import { CURRENCY_FORMAT, currencyFractionDigits, formatBound, hasNumberLocaleData, NUMBER_FORMAT, numericBoundValue, usableLocale } from './binding-format'

/** The parts of a formatted number that `Text.spans[place].parts` can style. */
export const FORMAT_PARTS = ['fraction', 'currency'] as const
export type FormatPart = (typeof FORMAT_PARTS)[number]

/** Code to the sign of the currency — `x-money.symbols`. */
export const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  UAH: '₴',
  USD: '$',
  EUR: '€',
  GBP: '£',
  PLN: 'zł',
  JPY: '¥',
  CZK: 'Kč',
  TRY: '₺',
  INR: '₹',
  ILS: '₪',
  KZT: '₸',
  GEL: '₾',
}

/** The sign of the currency from the table; `undefined` — the code is not there and the code is shown. */
export function currencySymbolOf(code: string): string | undefined {
  return Object.hasOwn(CURRENCY_SYMBOLS, code) ? CURRENCY_SYMBOLS[code] : undefined
}

const SIGN_PLUS = '+'
/** U+2212: the same width as the plus, not broken by a line wrap. */
const SIGN_MINUS = '−'
const LTR_ISOLATE_OPEN = '⁦'
const LTR_ISOLATE_CLOSE = '⁩'

export interface MoneyLook {
  readonly currencyDisplay?: 'symbol'
  readonly currencyPosition?: 'before'
  readonly sign?: 'always'
}

/** The three fields as the reader reads them: an unknown word (a later minor) is no field. */
export function readMoneyLook(record: Readonly<Record<string, unknown>>): MoneyLook {
  return {
    ...(record.currencyDisplay === 'symbol' ? { currencyDisplay: 'symbol' as const } : {}),
    ...(record.currencyPosition === 'before' ? { currencyPosition: 'before' as const } : {}),
    ...(record.sign === 'always' ? { sign: 'always' as const } : {}),
  }
}

/** One piece of a formatted value: the text and the part it is (`undefined` — the style of the place). */
export interface FormattedPiece {
  readonly text: string
  readonly part?: FormatPart | undefined
}

export interface PieceOptions {
  /** The language of the format; `undefined` — the language of the device. */
  readonly locale: string | undefined
  /** The language of the shown text, when the engine does not accept the language of the format. */
  readonly fallbackLocale?: string | undefined
  readonly timeZone?: string | undefined
  /** «Now», milliseconds of the epoch, for `daysUntil`. */
  readonly now?: number | undefined
  /** The direction of the SHOWN text; without it — left to right. */
  readonly direction?: 'ltr' | 'rtl' | undefined
}

/* ──────────────────────────── formatters ──────────────────────────── */

const MAX_CACHED = 64
const partFormats = new Map<string, Intl.NumberFormat>()
const zeroFormats = new Map<string, Intl.NumberFormat>()

function cached(cache: Map<string, Intl.NumberFormat>, key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  const known = cache.get(key)
  if (known !== undefined) return known
  const format = make()
  if (cache.size >= MAX_CACHED) cache.clear()
  cache.set(key, format)
  return format
}

interface Digits {
  readonly minimumFractionDigits: number
  readonly maximumFractionDigits: number
}

/** The number cut before the decimal separator. A sign the platform writes stays in the integer part. */
function numberText(value: number, locale: string | undefined, digits: Digits): { readonly integer: string; readonly fraction: string } {
  const key = `${locale ?? ''}|${String(digits.minimumFractionDigits)}|${String(digits.maximumFractionDigits)}`
  // Groups ALWAYS: the default `auto` writes «1850» in Spanish, and the other platform writes «1.850».
  const format = cached(partFormats, key, () => new Intl.NumberFormat(locale, { useGrouping: NUMBER_FORMAT.grouping as unknown as boolean, ...digits }))
  const parts = format.formatToParts(value)
  const cut = parts.findIndex((part) => part.type === 'decimal')
  const join = (slice: readonly Intl.NumberFormatPart[]): string => slice.map((part) => part.value).join('')
  return cut === -1 ? { integer: join(parts), fraction: '' } : { integer: join(parts.slice(0, cut)), fraction: join(parts.slice(cut)) }
}

/** Whether every WRITTEN digit is zero. Asked in Latin digits: an Arabic-Indic zero is not found by `[1-9]`. */
function writtenAsZero(magnitude: number, digits: Digits): boolean {
  const key = `${String(digits.minimumFractionDigits)}|${String(digits.maximumFractionDigits)}`
  const format = cached(zeroFormats, key, () => new Intl.NumberFormat('en', { useGrouping: false, numberingSystem: 'latn', ...digits }))
  return !/[1-9]/.test(format.format(magnitude))
}

/** The fraction digits of a compact mantissa: none, or one. */
const COMPACT_DIGITS: Digits = { minimumFractionDigits: 0, maximumFractionDigits: 1 }

/** Fraction digits by the rule of the format of 9.4.0: a number — 0…3; money — the digits of the currency; a whole amount — none. */
function fractionDigitsOf(number: number, code: string | undefined): Digits {
  if (code === undefined) return { minimumFractionDigits: NUMBER_FORMAT.minimumFractionDigits, maximumFractionDigits: NUMBER_FORMAT.maximumFractionDigits }
  const digits = Number.isInteger(number) ? CURRENCY_FORMAT.integerFractionDigits : currencyFractionDigits(code)
  return { minimumFractionDigits: digits, maximumFractionDigits: digits }
}

/* ──────────────────────────── the pieces ──────────────────────────── */

/** Empty pieces dropped, neighbours of one part joined. */
function mergedPieces(pieces: readonly FormattedPiece[]): FormattedPiece[] {
  const result: FormattedPiece[] = []
  for (const piece of pieces) {
    if (piece.text === '') continue
    const last = result[result.length - 1]
    if (last !== undefined && last.part === piece.part) result[result.length - 1] = { ...last, text: last.text + piece.text }
    else result.push(piece.part === undefined ? { text: piece.text } : piece)
  }
  return result
}

function isolated(pieces: FormattedPiece[]): FormattedPiece[] {
  const first = pieces[0]
  if (first === undefined) return pieces
  pieces[0] = { ...first, text: LTR_ISOLATE_OPEN + first.text }
  const last = pieces[pieces.length - 1] ?? first
  pieces[pieces.length - 1] = { ...last, text: last.text + LTR_ISOLATE_CLOSE }
  return pieces
}

const CODE_PATTERN = new RegExp(CURRENCY_FORMAT.codePattern)

/** The currency on both sides of the amount: a sign sits flush, a code goes through U+00A0. */
function currencyAround(code: string | undefined, look: MoneyLook): { readonly before: string; readonly after: string } {
  if (code === undefined) return { before: '', after: '' }
  const symbol = look.currencyDisplay === 'symbol' ? currencySymbolOf(code) : undefined
  if (look.currencyPosition !== 'before') return { before: '', after: `${CURRENCY_FORMAT.separator}${symbol ?? code}` }
  return { before: symbol ?? `${code}${CURRENCY_FORMAT.separator}`, after: '' }
}

function signOf(number: number, digits: Digits, look: MoneyLook): string {
  if (writtenAsZero(Math.abs(number), digits)) return ''
  if (number < 0) return SIGN_MINUS
  return look.sign === 'always' ? SIGN_PLUS : ''
}

function numberPieces(value: unknown, binding: Readonly<Record<string, unknown>>, options: PieceOptions): readonly FormattedPiece[] | undefined {
  const money = binding.format === 'currency'
  const number = numericBoundValue(value, binding.format, options.now)
  if (number === undefined) return undefined
  const language = usableLocale(options.locale, options.fallbackLocale)
  if (language === null || !hasNumberLocaleData(language)) return undefined
  const code = money && typeof binding.currency === 'string' && CODE_PATTERN.test(binding.currency) ? binding.currency : undefined
  if (money && code === undefined) return undefined

  const look = readMoneyLook(binding)
  // Compact (9.23.0): the mantissa is written as a number with at most one fraction digit, and the suffix follows it.
  const compact = readsCompactNotation(binding) ? compactPartsOf(number) : undefined
  const digits = compact === undefined ? fractionDigitsOf(number, code) : COMPACT_DIGITS
  const composed = look.sign === 'always' || (money && (look.currencyDisplay === 'symbol' || look.currencyPosition === 'before'))
  const shown = compact === undefined ? number : Math.sign(number) * compact.mantissa
  const amount = numberText(composed ? Math.abs(shown) : shown, language, digits)
  const currency = currencyAround(code, look)
  const pieces = mergedPieces([
    { text: composed ? signOf(number, digits, look) : '' },
    { text: currency.before, part: 'currency' },
    { text: amount.integer },
    { text: amount.fraction, part: 'fraction' },
    { text: compact === undefined ? '' : compactSuffixOf(compact.step, language) },
    { text: currency.after, part: 'currency' },
  ])
  return composed && options.direction === 'rtl' ? isolated(pieces) : pieces
}

/**
 * The text of a bound value by its format, in pieces. Pieces joined are exactly the text on
 * the screen. `undefined` — the format did not apply (the same reasons as for the text of
 * 9.4.0), and the one who asks shows the value as it is.
 */
export function boundValuePieces(value: unknown, binding: Readonly<Record<string, unknown>>, options: PieceOptions): readonly FormattedPiece[] | undefined {
  if (typeof binding.format !== 'string') return undefined
  try {
    if (binding.format === 'number' || binding.format === 'currency') return numberPieces(value, binding, options)
  } catch {
    // A language or a code the engine does not accept: the format does not apply.
    return undefined
  }
  const text = formatBound(value, binding.format, options.locale, options.timeZone, options.fallbackLocale, { currency: binding.currency, now: options.now, dateParts: binding.dateParts, unit: binding.unit, pad: binding.pad })
  return text === undefined ? undefined : [{ text }]
}

/* ───────────────────── the rule as data (mirror of the artifact) ───────────────────── */

/** `x-money` of the artifact, whole; a test compares the two. */
export const MONEY_FORMAT = {
  fields: {
    currencyDisplay: { words: ['symbol'], formats: ['currency'], withoutField: 'code' },
    currencyPosition: { words: ['before'], formats: ['currency'], withoutField: 'after' },
    sign: { words: ['always'], formats: ['number', 'currency'], withoutField: 'as-before-9.19' },
  },
  unknownWord: 'field-is-absent',
  fieldOnAnotherFormat: 'ignored',
  composedWhen: 'any-readable-field-on-its-format',
  withoutFields: 'exactly-as-before-9.19',
  order: ['sign', 'currencyBefore', 'amount', 'currencyAfter'],
  amount: 'absolute-value-as-the-format-writes-it',
  signs: {
    positive: '+',
    positiveCodePoint: 'U+002B',
    positiveWhen: 'sign-always',
    negative: '−',
    negativeCodePoint: 'U+2212',
    negativeWhen: 'always',
    zero: '',
    zeroIs: 'every-written-digit-is-zero',
  },
  symbols: { ...CURRENCY_SYMBOLS },
  symbolMissing: 'code',
  gap: { after: ' ', beforeCode: ' ', beforeSymbol: '', codePoint: 'U+00A0' },
  isolation: {
    appliesTo: 'composed-form',
    when: 'shown-text-is-right-to-left',
    direction: 'ltr',
    open: '⁦',
    openCodePoint: 'U+2066',
    close: '⁩',
    closeCodePoint: 'U+2069',
    notWrapped: ['fallback', 'value-as-it-is'],
  },
  parts: {
    names: ['fraction', 'currency'],
    formats: { fraction: ['number', 'currency'], currency: ['currency'] },
    fraction: 'decimal-separator-and-fraction-digits',
    currency: 'symbol-or-code-with-its-gap',
    rest: 'sign-and-integer-digits-in-the-style-of-the-place',
    withoutFields: 'the-same-pieces',
    isolationMarks: 'inside-the-first-and-the-last-piece',
    notSplit: ['fallback', 'value-as-it-is', 'date-formats', 'daysUntil'],
  },
  cases: 'contract/fixtures/template/template-cases.json#moneyCases',
} as const
