/**
 * The parts of a text field (schema 9.19.0): the look of the BOX of the field itself, a mark at the start and
 * at the end of the box, a counter of characters. Rules: the artifact block `x-style.layout.inputParts`,
 * mirrored below whole; the shared rows are the groups `fieldBoxCases`, `affixRowCases`, `counterCases`,
 * `noteRowCases` and `partsDocumentCases` of `contract/fixtures/inputs/input-cases.json`.
 *
 * Everything here is optional and has no default in the schema: a field without the new props is drawn exactly
 * as before 9.19.0. The `style` of the node stays the box of the WHOLE widget (the label, the field, the note).
 */
import { clampInputText } from './input-rules'
/** The built-in look of the box of the field — the values of the box of 9.13.0. */
export const FIELD_LOOK_DEFAULTS = { radius: 'sm', background: 'surface', borderColor: 'border', borderWidth: 1 } as const

export const FIELD_BORDER_WIDTH_MIN = 1
export const FIELD_BORDER_WIDTH_MAX = 4
export const FIELD_HEIGHT_MIN = 32
export const FIELD_HEIGHT_MAX = 120

const inRange = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

/** The width of the border the reader draws: a whole number in 1…4, else the built-in 1. */
export function fieldBorderWidthOf(value: unknown): number {
  return inRange(value, FIELD_BORDER_WIDTH_MIN, FIELD_BORDER_WIDTH_MAX) ? value : FIELD_LOOK_DEFAULTS.borderWidth
}

/** The named height of the box: a whole number in 32…120 and only for a one-line field; otherwise the natural one. */
export function fieldHeightOf(value: unknown, lines: number): number | undefined {
  return lines === 1 && inRange(value, FIELD_HEIGHT_MIN, FIELD_HEIGHT_MAX) ? value : undefined
}

/** The height of the box: the named one (exact, the border does not add to it) or the natural one — two borders, two paddings and the lines. */
export function fieldBoxHeightOf(metrics: { readonly textLine: number; readonly paddingBlock: number }, input: { readonly lines: number; readonly height?: unknown; readonly borderWidth?: unknown }): number {
  const named = fieldHeightOf(input.height, input.lines)
  if (named !== undefined) return named
  return 2 * fieldBorderWidthOf(input.borderWidth) + 2 * metrics.paddingBlock + input.lines * metrics.textLine
}

/** The longest text of a mark, in code points; the reader draws the first ones. */
export const FIELD_AFFIX_TEXT_MAX = 8
/** The gap between a mark and the text of the field. */
export const FIELD_AFFIX_GAP = 'sm'

/** The text of a mark as drawn: not longer than the limit, the rest is dropped (code points, a surrogate pair is never torn). */
export function affixTextShown(text: string): string {
  return clampInputText(text, FIELD_AFFIX_TEXT_MAX)
}

/**
 * The row inside the box: the field, the mark at the start, a gap, the text, a gap, the mark at the end, the field. A mark
 * never shrinks; the text takes the rest (not less than zero). Starts are from the LOGICAL start of the box.
 */
export function affixRowOf(input: {
  readonly boxInline: number
  readonly border: number
  readonly paddingInline: number
  readonly gap: number
  readonly prefix?: number | undefined
  readonly suffix?: number | undefined
}): { readonly prefixStart: number | undefined; readonly textStart: number; readonly textInline: number; readonly suffixStart: number | undefined } {
  const edge = input.border + input.paddingInline
  const before = input.prefix === undefined ? 0 : input.prefix + input.gap
  const after = input.suffix === undefined ? 0 : input.suffix + input.gap
  const textStart = edge + before
  const textInline = Math.max(0, input.boxInline - 2 * edge - before - after)
  return {
    prefixStart: input.prefix === undefined ? undefined : edge,
    textStart,
    textInline,
    suffixStart: input.suffix === undefined ? undefined : textStart + textInline + input.gap,
  }
}

/** The separator of the counter: a slash with spaces, like the label of the ring (`3 / 4`). */
export const FIELD_COUNTER_SEPARATOR = ' / '

const validLimit = (maxLength: unknown): maxLength is number => typeof maxLength === 'number' && Number.isInteger(maxLength) && maxLength >= 1

/**
 * The text of the counter — `0 / 280`; `undefined` — no counter (the word is not exactly `true`, or there is no limit).
 * The count is in CODE POINTS of the shown text, by the same count that cuts the input; digits are ASCII without groups.
 */
export function inputCounterText(props: { readonly counter?: unknown; readonly maxLength?: unknown }, shown: string): string | undefined {
  if (props.counter !== true || !validLimit(props.maxLength)) return undefined
  const count = Array.from(clampInputText(shown, props.maxLength)).length
  return `${String(count)}${FIELD_COUNTER_SEPARATOR}${String(props.maxLength)}`
}

/** The row under the box: the note from the start takes the rest, the counter at the end never shrinks. */
export function noteRowOf(input: { readonly rowInline: number; readonly gap: number; readonly counter?: number | undefined }): { readonly noteInline: number; readonly counterStart: number | undefined } {
  if (input.counter === undefined) return { noteInline: input.rowInline, counterStart: undefined }
  return { noteInline: Math.max(0, input.rowInline - input.gap - input.counter), counterStart: Math.max(0, input.rowInline - input.counter) }
}

/** The block `x-style.layout.inputParts` of the artifact, whole (a test compares it). */
export const INPUT_PARTS_LAYOUT = {
  field: {
    appliesTo: 'the-box-of-the-field-not-the-box-of-the-node',
    nodeStyle: 'unchanged-the-box-of-the-whole-widget-inputs.textField.style',
    radius: {
      prop: 'fieldRadius',
      default: 'sm',
      value: 'token-or-number',
    },
    background: {
      prop: 'fieldBackground',
      default: 'surface',
      value: 'colour-token-or-own-colour',
    },
    borderColor: {
      prop: 'fieldBorderColor',
      default: 'border',
      states: 'the-colours-of-focus-and-error-replace-it-as-before',
    },
    borderWidth: {
      prop: 'fieldBorderWidth',
      default: 1,
      min: 1,
      max: 4,
      outOfRange: 'default',
      states: 'the-same-width-in-every-state',
      focusRing: 'unchanged-inside-the-border',
    },
    height: {
      prop: 'fieldHeight',
      min: 32,
      max: 120,
      is: 'exact-height-of-the-box-with-its-border',
      absent: 'border-plus-padding-plus-the-line',
      outOfRange: 'absent',
      content: 'centred-the-block-padding-is-not-applied',
      multiline: 'not-read-the-height-comes-from-lines',
      multilineDocument: 'not-published',
    },
    unknownToken: 'the-prop-is-skipped-the-built-in-value',
    textColorAndTypography: 'not-fields-of-9.19',
    switchAndCheckbox: 'no-such-props',
  },
  affix: {
    props: {
      start: 'prefix',
      end: 'suffix',
    },
    kinds: ['text', 'icon'],
    place: 'inside-the-box-between-its-inline-padding-and-the-text',
    sides: 'logical-by-the-direction-of-the-screen-not-of-the-content',
    contentDirection: 'unchanged-inputs.textField.box.contentDirection',
    gap: 'sm',
    shrinks: 'never-the-text-of-the-field-takes-the-rest',
    text: {
      typography: 'bodyM',
      color: 'muted',
      lines: 'one-not-wrapped',
      empty: 'no-affix-no-gap',
      translated: 'like-every-text-of-the-field',
      maxLength: 8,
      counted: 'code-points-of-the-shown-text',
      longer: {
        reader: 'draws-the-first-code-points-up-to-the-limit',
        document: 'not-published-a-literal-or-a-fallback-longer-than-the-limit',
      },
    },
    icon: {
      glyph: 'font-size-of-the-field-typography',
      box: 'one-line-of-the-field-typography',
      color: 'muted',
      unknown: 'empty-box-of-the-same-size-the-gap-stays',
    },
    crossAlign: {
      singleLine: 'centre',
      multiline: 'first-line',
    },
    value: 'not-part-of-the-value-never-written',
    placeholder: 'shown-beside-the-affix',
    press: 'focuses-the-field-never-an-action',
    disabled: 'fades-with-the-whole-widget',
    heard: {
      text: 'part-of-the-description-of-the-field',
      icon: 'not-heard',
    },
    olderReader: 'skips-the-props-the-field-without-a-mark',
  },
  counter: {
    prop: 'counter',
    needs: 'maxLength',
    withoutLimit: 'not-drawn',
    format: '{count} / {max}',
    separator: ' / ',
    digits: 'ascii-without-grouping',
    count: 'unicode-code-points-of-the-shown-text',
    countRule: 'inputs.textField.maxLength.unit',
    composing: 'counts-what-is-shown',
    typography: 'bodyS',
    color: 'muted',
    atLimit: 'the-same-colour',
    place: 'row-under-the-box-at-the-logical-end',
    row: {
      gap: 'sm',
      note: 'from-the-start-takes-the-rest-and-wraps',
      counter: 'one-line-never-shrinks',
      withoutNote: 'the-row-holds-the-counter-alone',
    },
    direction: 'one-string-in-the-direction-of-the-screen-like-progressLabel-valueOfMax',
    whiteSpace: 'kept-not-a-text-for-the-shownText-rule',
    heard: 'part-of-the-description-read-with-the-field-never-announced-on-change',
    numberField: 'counts-the-shown-text',
  },
  cases: 'contract/fixtures/inputs/input-cases.json',
} as const
