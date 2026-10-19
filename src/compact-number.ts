/**
 * Compact number (schema 9.23.0): `notation: 'compact'` beside `format: 'number'` writes 48 200 as
 * «48.2K» in English or the Ukrainian thousands suffix after a no-break space. A mirror of the contract's reference rule; the
 * shared table is the `compactCases` group of `contract/fixtures/template/template-cases.json`,
 * and `package.test.tsx` checks the numbers against the artifact block `x-compactNumber`.
 *
 * Not `Intl` compact: CLDR writes different numbers in different engines. The arithmetic and the
 * suffixes are data of the contract:
 *
 *  - a magnitude below 1 000 is written exactly as `number` writes it;
 *  - the largest step (thousand, million, billion) not above the magnitude divides it; billions
 *    do not become trillions (they are written with groups);
 *  - the mantissa has at most one fraction digit, rounded half up on the MAGNITUDE after the
 *    quotient is cut to six digits (so 48 250 / 1 000 is not 48.24999…); a mantissa that reaches
 *    1 000 is written with the next step;
 *  - the suffix comes from a closed table by the first subtag of the formatting locale;
 *  - a plural word agrees with the FULL value, never with the mantissa (that is the job of
 *    `numericBoundValue`, which this file does not touch).
 *
 * No React in this file: the server graph of the entry reads it too.
 */

/** The words of `notation` this reader knows; an unknown one is no field. */
export const NUMBER_NOTATIONS = ['compact'] as const

/** Steps by growth: the name and the magnitude it starts from. */
export const COMPACT_STEPS = [
  { name: 'thousand', from: 1_000 },
  { name: 'million', from: 1_000_000 },
  { name: 'billion', from: 1_000_000_000 },
] as const

export type CompactStep = (typeof COMPACT_STEPS)[number]['name']

/** Suffixes by language: the gap before the suffix (U+00A0 in Ukrainian) and the suffix itself. */
export const COMPACT_SUFFIXES = {
  en: { gap: '', thousand: 'K', million: 'M', billion: 'B' },
  uk: { gap: '\u00a0', thousand: 'тис.', million: 'млн', billion: 'млрд' },
} as const

type CompactLanguage = keyof typeof COMPACT_SUFFIXES

/** The language of the suffix: the first subtag of the formatting locale; any language the table lacks is `en`. */
export function compactLanguageOf(locale: string | undefined): CompactLanguage {
  const language = (locale ?? 'en').split(/[-_]/)[0]?.toLowerCase() ?? 'en'
  return language === 'uk' ? 'uk' : 'en'
}

/** The digits of the quotient kept before rounding. */
const PRECISION = 1e6

/** Whether the binding asks for the compact form: the word `compact` beside the format `number`. */
export function readsCompactNotation(binding: Readonly<Record<string, unknown>>): boolean {
  return binding.format === 'number' && binding.notation === NUMBER_NOTATIONS[0]
}

export interface CompactParts {
  /** The magnitude over the step, rounded to tenths. */
  readonly mantissa: number
  readonly step: CompactStep
}

/** The step and the mantissa of a number; `undefined` below 1 000 (written as `number`). */
export function compactPartsOf(value: number): CompactParts | undefined {
  const magnitude = Math.abs(value)
  if (!Number.isFinite(magnitude) || magnitude < COMPACT_STEPS[0].from) return undefined
  let index = COMPACT_STEPS.length - 1
  while (index > 0 && magnitude < (COMPACT_STEPS[index]?.from ?? 0)) index -= 1
  const tenthsAt = (at: number): number => Math.floor(Math.round(((magnitude * 10) / (COMPACT_STEPS[at]?.from ?? 1)) * PRECISION) / PRECISION + 0.5)
  let tenths = tenthsAt(index)
  if (tenths >= 10_000 && index < COMPACT_STEPS.length - 1) {
    index += 1
    tenths = tenthsAt(index)
  }
  return { mantissa: tenths / 10, step: COMPACT_STEPS[index]?.name ?? 'thousand' }
}

/** The suffix with its gap for the formatting locale. */
export function compactSuffixOf(step: CompactStep, locale: string | undefined): string {
  const table = COMPACT_SUFFIXES[compactLanguageOf(locale)]
  return `${table.gap}${table[step]}`
}

/** `x-compactNumber` of the artifact, whole; a test compares the two. */
export const COMPACT_NUMBER_RULES = {
  prop: 'notation',
  words: [...NUMBER_NOTATIONS],
  formats: ['number'],
  below: { magnitude: COMPACT_STEPS[0].from, written: 'as-format-number-every-digit' },
  steps: COMPACT_STEPS.map((step) => ({ ...step })),
  beyondTheLastStep: 'billions-with-groups',
  mantissa: {
    is: 'magnitude / step',
    fractionDigits: { min: 0, max: 1 },
    rounding: 'half-up-of-the-magnitude-after-rounding-the-quotient-to-6-digits',
    trailingZero: 'dropped',
    reachesNextStep: 'written-with-the-next-step',
  },
  suffixes: structuredClone(COMPACT_SUFFIXES),
  suffixLanguage: 'the-first-subtag-of-the-formatting-locale-other-languages-en',
  gapCodePoint: { uk: 'U+00A0', en: 'none' },
  decimalSeparatorAndDigits: 'of-the-formatting-locale-as-format-number',
  grouping: 'always-as-format-number',
  sign: { withoutField: 'negative-as-format-number', always: 'composed-x-money.signs-the-suffix-follows-the-number' },
  plural: 'agrees-with-the-full-value-not-the-mantissa',
  parts: { fraction: 'the-decimal-separator-and-the-fraction-digit', suffix: 'in-the-style-of-the-place' },
  localeWithoutData: 'the-format-does-not-apply-the-value-as-it-is',
  olderReader: 'the-field-is-skipped-every-digit',
  cases: 'contract/fixtures/template/template-cases.json#compactCases',
} as const
