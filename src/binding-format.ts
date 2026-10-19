/**
 * Format of a data-bound value: a mirror of the contract's reference implementation (the package
 * does not import from the builder's sources). The rule is the contract's rule of data-bound values;
 * `package.test.tsx` checks the numbers in this file against the artifact's `x-template` block,
 * and the shared case table `contract/fixtures/template/template-cases.json` checks the texts.
 *
 * The document names an INTENT, the locale supplies the look (CLDR through `Intl`):
 *
 *  - `date`, `dateTime`, `time` (8.20.0): an ISO 8601 string becomes a date; day/month order,
 *    month names and the 12/24-hour clock come from the locale;
 *  - `number` (9.4.0): the locale's group separators and decimal sign; groups ALWAYS, fraction
 *    of zero to three digits;
 *  - `currency` (9.4.0): number, NO-BREAK SPACE, ISO 4217 code from the sibling field. The
 *    composition is the same in every locale; `style: 'currency'` is NOT used because it places
 *    the code by locale custom ("JOD 120") and Dart has no such rule;
 *  - `daysUntil` (9.4.0): a date becomes the number of whole days until that instant,
 *    `max(0, ceil((instant - now) / 24h))`, written as a `number`. It rounds a DURATION, not a
 *    difference of calendar dates: no time zone enters the rule.
 *
 * `undefined` as an answer means "the format did not apply", and the value is then shown AS IS.
 * The policy rows say when:
 *  - `unknownBindingFormat`: this reader does not know the format (the document is newer);
 *  - `unparsableBoundValue`: the value is of the wrong type or cannot be parsed (the string
 *    "1850" is NOT a number; neither are `NaN` and infinity);
 *  - `dateValueForm`: a date only by the contract's expression (ISO 8601 with time and zone);
 *    "1850", `2026-10-14` and a numeric timestamp are not dates;
 *  - `numberBeyondSafeInteger`: a number whose absolute value exceeds 2^53 - 1;
 *  - `missingNumberLocaleData`: the engine has no number data for the locale;
 *  - `missingCurrencyCode`: the currency code is absent or not three capital letters.
 * An empty slot or "Invalid Date" would hide a value that is in the data.
 *
 * The module does not import `react`: the entry's server graph re-exports it.
 */
import { DATE_PARTS_OPTIONS, readDateParts } from './date-parts'
import { localeLookupChain, MAX_LOCALE_TAG_LENGTH } from './locale'

/* ───────────────────── mirror of the `x-template` block ───────────────────── */

/**
 * The `number` format, `x-template.number`: groups ALWAYS, fraction of 0..3 digits.
 * `maximumAbsoluteValue` is 2^53 - 1 (`numberBeyondSafeInteger`): beyond exact integers `Intl`
 * and Dart print different digits, so a larger number is neither formatted nor used to pick a
 * plural form; it is shown as is.
 */
export const NUMBER_FORMAT = { grouping: 'always', minimumFractionDigits: 0, maximumFractionDigits: 3, maximumAbsoluteValue: 9007199254740991 } as const

/**
 * What counts as a DATE, `x-template.dateTimePattern`, one form for all four formats
 * (`dateValueForm`): ISO 8601 with time and zone. The expression comes first, the engine's
 * parser second: `new Date('1850')` is the year 1850, and `2026-10-14` is read differently by
 * different platforms (UTC midnight here, local midnight in Dart). A string outside the
 * expression is "not a date": the value is shown as is.
 */
export const DATE_TIME_PATTERN = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d{1,9})?)?(Z|[+-]\\d{2}:\\d{2})$'
const DATE_TIME = new RegExp(DATE_TIME_PATTERN)
// Groups of the same expression, for the calendar check (`x-template.dateCalendarCheck`).
const DATE_TIME_GROUPS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2}))$/

/** Calendar of a date, `x-template.dateCalendar`: Gregorian in every locale (otherwise `th` would write 2569). */
export const DATE_CALENDAR = 'gregory'

/** Field bounds of a date, `x-template.dateCalendarCheck`; the day is counted separately (`daysInMonth`). */
export const DATE_CALENDAR_CHECK = {
  month: { min: 1, max: 12 },
  hour: { min: 0, max: 23 },
  minute: { min: 0, max: 59 },
  second: { min: 0, max: 59 },
  offsetHour: { min: 0, max: 23 },
  offsetMinute: { min: 0, max: 59 },
  day: 'one-to-days-in-this-month-of-this-year-gregorian-leap-rule',
} as const

/** Rounding of numbers, `x-template.rounding`; `Intl.NumberFormat` does the work (shortest decimal form). */
export const NUMBER_ROUNDING = { mode: 'half-away-from-zero', over: 'shortest-round-trip-decimal-string' } as const

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/**
 * Calendar check over the expression groups, BEFORE `Date.parse`: V8 reads February 30 as March
 * 2, other engines as "not a date", so the engine's parser cannot be trusted for this.
 */
function isCalendarMoment(value: string): boolean {
  const match = DATE_TIME_GROUPS.exec(value)
  if (match === null) return false
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0] = [1, 2, 3, 4, 5].map((i) => Number(match[i]))
  const second = match[6] === undefined ? 0 : Number(match[6])
  const offsetHour = match[7] === undefined ? 0 : Number(match[7])
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8])
  const c = DATE_CALENDAR_CHECK
  return (
    month >= c.month.min && month <= c.month.max && day >= 1 && day <= daysInMonth(year, month) &&
    hour <= c.hour.max && minute <= c.minute.max && second <= c.second.max &&
    offsetHour <= c.offsetHour.max && offsetMinute <= c.offsetMinute.max
  )
}
// The longest string the expression accepts is 35 characters; a longer one is not a date, and the expression is not run on it.
const MAX_DATE_TIME_LENGTH = 40

/** The `currency` format, `x-template.currency`: number, U+00A0, code. */
export const CURRENCY_FORMAT = {
  codePattern: '^[A-Z]{3}$',
  order: 'amount-separator-code',
  separator: '\u00A0',
  separatorCodePoint: 'U+00A0',
  grouping: 'always',
  fractionDigits: 'of-the-currency',
  integerFractionDigits: 0,
  unknownCurrencyFractionDigits: 2,
} as const

/** The `daysUntil` format, `x-template.daysUntil`: a day is exactly 24 hours, round UP, never below zero. */
export const DAYS_UNTIL = { dayMilliseconds: 86_400_000, rounding: 'ceil', minimum: 0, shownAs: 'number' } as const

/** Formats under which the value is a NUMBER for plural selection, `x-template.countableFormats`. */
export const COUNTABLE_FORMATS = ['number', 'currency', 'daysUntil', 'countdownPart'] as const

/** Every binding format this reader supports, `$defs.BindingFormat`. */
export const READER_BINDING_FORMATS = ['date', 'dateTime', 'time', 'number', 'currency', 'daysUntil', 'countdownPart'] as const

/**
 * The `countdownPart` format (9.21.0, `x-countdown`): one part of the time left until a date —
 * whole days, hours 0–23, minutes 0–59 or seconds 0–59; the parts round DOWN and a past moment
 * gives zeros. The part is written like `number`; `pad: 2` asks for at least two digits. The part
 * is computed at render, from the moment the caller gives (`countdown.ts` and the clock of the
 * screen make it tick).
 */
const COUNTDOWN_SECONDS: ReadonlyMap<string, readonly [seconds: number, wrap: number | undefined]> = new Map([
  ['days', [86_400, undefined]],
  ['hours', [3_600, 24]],
  ['minutes', [60, 60]],
  ['seconds', [1, 60]],
])

function countdownPart(moment: number, now: number, unit: unknown): number | undefined {
  const entry = typeof unit === 'string' ? COUNTDOWN_SECONDS.get(unit) : undefined
  if (entry === undefined) return undefined
  const whole = Math.floor(Math.floor(Math.max(0, moment - now) / 1000) / entry[0])
  return entry[1] === undefined ? whole : whole % entry[1]
}

const CURRENCY_CODE = new RegExp(CURRENCY_FORMAT.codePattern)

/* ─────────────────────────────── dates ─────────────────────────────── */

const DATE_PARTS: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
const TIME_PARTS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }

// A `Map`, not an object: the format name is a string from the document, and `FORMATS['constructor']` is not a format.
const DATE_FORMAT_PARTS: ReadonlyMap<string, Intl.DateTimeFormatOptions> = new Map([
  ['date', DATE_PARTS],
  ['time', TIME_PARTS],
  ['dateTime', { ...DATE_PARTS, ...TIME_PARTS }],
])

/** Instant of an ISO 8601 string in epoch milliseconds, or `undefined` if it is not a date. */
function momentOf(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length > MAX_DATE_TIME_LENGTH || !DATE_TIME.test(value) || !isCalendarMoment(value)) return undefined
  const moment = Date.parse(value)
  return Number.isNaN(moment) ? undefined : moment
}

/* ─────────────────────────────── numbers ─────────────────────────────── */

/**
 * The NUMBER a value becomes under this format. The format prints it and the plural form is
 * chosen from it (`text-template.ts`). `undefined` means there is no number: the value is not
 * a number (the string "12" is NOT one; the backend must send numbers as numbers), it is `NaN`
 * or infinite, it exceeds 2^53 - 1 (`numberBeyondSafeInteger`), it is a date that is malformed
 * or unparsable, the format is not numeric, or "now" was not given. Without a format a number
 * from the data stays itself, so "{count} {unit}" agrees even where separators were not asked for.
 */
export function numericBoundValue(value: unknown, format: unknown, now: number | undefined, unit?: unknown): number | undefined {
  if (format === 'countdownPart') {
    const moment = momentOf(value)
    if (moment === undefined || typeof now !== 'number' || !Number.isFinite(now)) return undefined
    return countdownPart(moment, now, unit)
  }
  if (format === 'daysUntil') {
    const moment = momentOf(value)
    if (moment === undefined || typeof now !== 'number' || !Number.isFinite(now)) return undefined
    return Math.max(DAYS_UNTIL.minimum, Math.ceil((moment - now) / DAYS_UNTIL.dayMilliseconds))
  }
  if (format === undefined || format === 'number' || format === 'currency') {
    return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= NUMBER_FORMAT.maximumAbsoluteValue ? value : undefined
  }
  return undefined
}

/**
 * Whether the engine has number data for the locale (`missingNumberLocaleData`). Without the
 * check `Intl.NumberFormat` silently falls back to the environment locale for an unknown one,
 * and the same document would print a number differently on the server and in the browser. If
 * nobody named a locale (`undefined`), the device locale is used and the format applies.
 */
function hasDateLocaleData(locale: string | undefined): boolean {
  if (locale === undefined) return true
  try {
    return Intl.DateTimeFormat.supportedLocalesOf(locale).length > 0
  } catch {
    return false
  }
}

export function hasNumberLocaleData(locale: string | undefined): boolean {
  if (locale === undefined) return true
  try {
    return Intl.NumberFormat.supportedLocalesOf(locale).length > 0
  } catch {
    return false
  }
}

/*
 * FORMATTER CACHE. A screen has a handful of locales but hundreds of numbers (a list row times
 * fifty records times three values), and `new Intl.NumberFormat` is the most expensive step of
 * the rule. The cache is bounded: the host names the locale and the document names the currency
 * code, and without a bound a foreign document with a thousand codes would grow page memory.
 */
const MAX_CACHED = 64
const numberFormats = new Map<string, Intl.NumberFormat>()
const currencyDigits = new Map<string, number>()

function remember<Value>(cache: Map<string, Value>, key: string, value: Value): Value {
  if (cache.size >= MAX_CACHED) cache.clear()
  cache.set(key, value)
  return value
}

/** A number in a locale: groups always, fraction within the named bounds. Throws if the engine rejects the locale. */
function numberText(value: number, locale: string | undefined, minimumFractionDigits: number, maximumFractionDigits: number): string {
  const key = `${locale ?? ''}|${String(minimumFractionDigits)}|${String(maximumFractionDigits)}`
  const format =
    numberFormats.get(key) ??
    remember(
      numberFormats,
      key,
      new Intl.NumberFormat(locale, {
        /*
         * Exactly `'always'`: the default `auto` follows CLDR `minimumGroupingDigits` and writes "1850"
         * in Spanish, while Dart has no such rule and writes "1.850". The type is widened only through
         * the package `lib` (ES2022 knows just the boolean here); an engine older than ES2023 reads the
         * string as `true`.
         */
        useGrouping: NUMBER_FORMAT.grouping as unknown as boolean,
        minimumFractionDigits,
        maximumFractionDigits,
      }),
    )
  return format.format(value)
}

/**
 * Fraction digits of a currency, from platform data (ISO 4217 as CLDR carries it): USD 2, JOD 3,
 * JPY 0. The contract keeps no table of its own. A code the platform does not know gets two.
 */
export function currencyFractionDigits(code: string): number {
  const known = currencyDigits.get(code)
  if (known !== undefined) return known
  let digits: number = CURRENCY_FORMAT.unknownCurrencyFractionDigits
  try {
    // `style: 'currency'` is used ONLY to ask for the digit count; the amount text is not written with it.
    digits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? digits
  } catch {
    // A code the engine rejects is treated as an unknown currency.
  }
  return remember(currencyDigits, code, digits)
}

/* ─────────────────────────────── format ─────────────────────────────── */

/** Sibling binding fields and "now", needed by the numeric formats of 9.4.0. */
export interface NumberFormatInput {
  /** Currency code, the `currency` field of the binding. Without it `currency` does not apply. */
  readonly currency?: unknown
  /** "Now" for `daysUntil`, epoch milliseconds. Without it the format does not apply. */
  readonly now?: number | undefined
  /** The binding's `dateParts` word (9.19.0): only `date` reads it, other formats ignore it. */
  readonly dateParts?: unknown
  /** The binding's `unit` and `pad` (9.21.0): only `countdownPart` reads them. */
  readonly unit?: unknown
  readonly pad?: unknown
}

/**
 * Text of a bound value under a format, or `undefined` for "the format did not apply here, show
 * the value as is".
 *
 * @param fallbackLocale language of the SHOWN text, for when the engine rejects the format
 *   locale even after parts are dropped.
 */
export function formatBound(value: unknown, format: unknown, locale: string | undefined, timeZone?: string, fallbackLocale?: string, input: NumberFormatInput = {}): string | undefined {
  if (typeof format !== 'string') return undefined
  try {
    if (format === 'number' || format === 'daysUntil') {
      const number = numericBoundValue(value, format, input.now)
      if (number === undefined) return undefined
      const language = usableLocale(locale, fallbackLocale)
            // No locale data: `number` shows the value as is, and counted days are plain digits without separators
            // (an ISO string in the middle of "... days left" is worse than "1500").
      if (language === null || !hasNumberLocaleData(language)) return format === 'daysUntil' ? String(number) : undefined
      return numberText(number, language, NUMBER_FORMAT.minimumFractionDigits, NUMBER_FORMAT.maximumFractionDigits)
    }
    if (format === 'countdownPart') {
      const part = numericBoundValue(value, format, input.now, input.unit)
      if (part === undefined) return undefined
      const digits = input.pad === 2 ? 2 : 1
      const language = usableLocale(locale, fallbackLocale)
      if (language === null || !hasNumberLocaleData(language)) return String(part).padStart(digits, '0')
      return new Intl.NumberFormat(language, { useGrouping: NUMBER_FORMAT.grouping as unknown as boolean, minimumIntegerDigits: digits, maximumFractionDigits: 0 }).format(part)
    }
    if (format === 'currency') {
      const number = numericBoundValue(value, format, input.now)
      const code = input.currency
      if (number === undefined || typeof code !== 'string' || !CURRENCY_CODE.test(code)) return undefined
      const language = usableLocale(locale, fallbackLocale)
      if (language === null || !hasNumberLocaleData(language)) return undefined
      // A whole amount has no cents; otherwise exactly as many digits as the currency has.
      const digits = Number.isInteger(number) ? CURRENCY_FORMAT.integerFractionDigits : currencyFractionDigits(code)
      return `${numberText(number, language, digits, digits)}${CURRENCY_FORMAT.separator}${code}`
    }
  } catch {
    // A locale or code the engine did not accept: the format does not apply and the value is shown as is.
    return undefined
  }

  // Date parts (9.19.0): only the word is read; without it (or if unknown) the parts are exactly those used before 9.19.0.
  const word = format === 'date' ? readDateParts(input.dateParts) : undefined
  const parts = word === undefined ? DATE_FORMAT_PARTS.get(format) : DATE_PARTS_OPTIONS[word]
  if (parts === undefined) return undefined
  const moment = momentOf(value)
  if (moment === undefined) return undefined
  /*
   * The time zone is the DEVICE's: a moment is shown the way a person will live it. The HOST
   * names `timeZone` (the component prop), and it is needed for exactly one reason: a page
   * rendered on the server in UTC and hydrated in a browser in Kyiv would otherwise produce TWO
   * different texts for the same date, and React discards the server markup with a hydration
   * error.
   * A document without localization names no language (empty string); then the locale is the
   * device's too.
   */
  const language = usableLocale(locale, fallbackLocale)
  // A locale without date data (`dv`, `la`) shows the value as is, not a date in the machine's language (`missingDateLocaleData`).
  if (language === null || !hasDateLocaleData(language)) return undefined
  try {
    return new Intl.DateTimeFormat(language, { ...parts, calendar: DATE_CALENDAR, timeZone }).format(moment)
  } catch {
    if (timeZone === undefined) return undefined
  }
  // A time zone the environment does not know is a host error, not a data error: the date stays a date, in the device zone.
  try {
    return new Intl.DateTimeFormat(language, { ...parts, calendar: DATE_CALENDAR }).format(moment)
  } catch {
    return undefined
  }
}

/**
 * LOCALE THE ENGINE ACCEPTS.
 *
 * `resolveLocale` already returns a format locale of the right SHAPE, but the engine may
 * understand shapes more narrowly than the rule does (and the host may call `formatBound`
 * directly). So an engine refusal does not mean "show the ISO string": parts are dropped from
 * the end by the same chain as the translation lookup until the engine accepts; then the language
 * of the shown text; and only if that is refused too, the value as is (`null`). An empty string
 * and `undefined` mean "nobody named a language": the device language.
 */
export function usableLocale(locale: string | undefined, fallbackLocale: string | undefined): string | undefined | null {
  if (typeof locale !== 'string' || locale === '') return undefined
  const chain = (tag: string): readonly string[] => localeLookupChain(tag.slice(0, MAX_LOCALE_TAG_LENGTH).replaceAll('_', '-'))
  for (const candidate of [...chain(locale), ...(typeof fallbackLocale === 'string' ? chain(fallbackLocale) : [])]) {
    try {
      // A tag of the wrong shape throws `RangeError` here; a language the engine lacks does not (it uses its own).
      Intl.DateTimeFormat.supportedLocalesOf(candidate)
      return candidate
    } catch {
      // The engine rejects this tag: try the next, shorter one.
    }
  }
  return null
}
