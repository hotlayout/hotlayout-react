/**
 * The parts of a date (schema 9.19.0): the optional field `dateParts` beside `format: 'date'` of a binding (alone or as the
 * value of a template).
 *
 * `date` gives one form: year, a short month, day. A promotion needs "until October 15", the heading of a day in a list of
 * operations — "Thursday, October 15", a page of a contract — a month in words with the year. The word names the INTENT —
 * which parts to show; the order, the separators and the case of the month come from CLDR for the formatting locale, as
 * for `date` itself.
 *
 * Each word is a set of EXPLICIT options of `Intl.DateTimeFormat` (never `dateStyle`, never an own pattern): the options
 * are data of the artifact (`x-dateParts.words`), and the other platform asks CLDR for the same set by a named constructor
 * (`cldrSkeleton`). Without the field the date is written exactly as before 9.19.0. The field is read on `date` only;
 * on every other format, on a number and without a format it is ignored. An unknown word, and a value that is not a
 * string, is "no field". Rules: the artifact block `x-dateParts`, mirrored below whole.
 */

/** The words the reader knows. */
export const DATE_PARTS_WORDS = ['dayMonth', 'weekdayDayMonth', 'dayMonthYear'] as const
export type DateParts = (typeof DATE_PARTS_WORDS)[number]

/** The options of `Intl.DateTimeFormat` of each word. */
export const DATE_PARTS_OPTIONS: Readonly<Record<DateParts, Intl.DateTimeFormatOptions>> = {
  dayMonth: { month: 'long', day: 'numeric' },
  weekdayDayMonth: { weekday: 'long', month: 'long', day: 'numeric' },
  dayMonthYear: { year: 'numeric', month: 'long', day: 'numeric' },
}

/** The word as the reader reads it: an unknown one (a later minor) or a non-string — there is no field. */
export function readDateParts(value: unknown): DateParts | undefined {
  return DATE_PARTS_WORDS.find((word) => word === value)
}

/** The block `x-dateParts` of the artifact, whole (a test compares it). */
export const DATE_PARTS_RULES = {
  prop: 'dateParts',
  format: 'date',
  words: {
    dayMonth: {
      options: {
        month: 'long',
        day: 'numeric',
      },
      cldrSkeleton: 'MMMMd',
    },
    weekdayDayMonth: {
      options: {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      },
      cldrSkeleton: 'MMMMEEEEd',
    },
    dayMonthYear: {
      options: {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      },
      cldrSkeleton: 'yMMMMd',
    },
  },
  withoutField: {
    options: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    },
    cldrSkeleton: 'yMMMd',
    is: 'exactly-as-before-9.19',
  },
  unknownWord: 'field-is-absent',
  fieldOnAnotherFormat: 'ignored',
  orderAndSeparators: 'cldr-of-the-formatting-locale',
  calendar: 'gregory',
  timeZone: 'of-the-device',
  dayOfWeek: 'of-the-day-in-the-time-zone-of-the-device',
  valueNotADate: 'x-compatibility.policy.unparsableBoundValue',
  localeWithoutData: 'shown-as-it-is',
  fallback: 'never-formatted',
  notInTheList: ['numeric-date', 'today-and-yesterday', 'own-pattern', 'parts-of-dateTime'],
  cases: 'contract/fixtures/template/template-cases.json',
} as const
