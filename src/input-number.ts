/** The number field (9.14.0): its own parser of a typed number, what the field shows and what it writes. */
import { INITIAL_TEXT_INPUT, clampInputText } from './input-rules'
import type { TextInputEvent, TextInputOptions, TextInputState } from './input-rules'

/** Digits the number field accepts: the zeros of three ranges are ASCII, Arabic-Indic (U+0660) and extended (U+06F0). */
export const NUMBER_INPUT_DIGIT_ZEROS = [0x30, 0x660, 0x6f0] as const
/** Decimal separator: dot, comma and Arabic U+066B. */
export const NUMBER_INPUT_SEPARATORS = ['.', ',', '\u066b'] as const
/** Minus: the keyboard hyphen-minus and typographic U+2212. */
export const NUMBER_INPUT_MINUS = ['-', '\u2212'] as const
/** What is trimmed from the ends of typed text: space, no-break and narrow no-break space, tab. */
export const NUMBER_INPUT_TRIMMED = [' ', '\u00a0', '\u202f', '\t'] as const
/** Maximum digits in a number, zeros included; fifteen is what double precision holds without loss. */
export const NUMBER_INPUT_MAX_DIGITS = 15

function digitOf(char: string): number | undefined {
  const code = char.codePointAt(0)
  if (code === undefined) return undefined
  for (const zero of NUMBER_INPUT_DIGIT_ZEROS) {
    if (code >= zero && code <= zero + 9) return code - zero
  }
  return undefined
}

/** The range of the characters without the trimmed edges: `[start, end)`. */
function trimmedRange(chars: readonly string[]): [number, number] {
  const trimmed: readonly string[] = NUMBER_INPUT_TRIMMED
  let start = 0
  let end = chars.length
  while (start < end && trimmed.includes(chars[start] ?? '')) start += 1
  while (end > start && trimmed.includes(chars[end - 1] ?? '')) end -= 1
  return [start, end]
}

/**
 * TYPED TEXT -> NUMBER, or `undefined` for "not a number" (`form.number.parse`).
 *
 * A RULE OF ITS OWN, not `Number()` / `parseFloat`: they accept `"1e5"`, `"0x10"` and the empty
 * string (zero!), and do not know the comma or Arabic digits. Shape: ends trimmed; optional
 * minus; digits; an optional SINGLE separator and digits; at least one digit, at most fifteen in
 * all. There are no digit groups and no exponent: "1,200" is 1.2. One pass, no backtracking
 * regular expression. Minus zero is zero.
 */
export function parseInputNumber(text: string): number | undefined {
  const minus: readonly string[] = NUMBER_INPUT_MINUS
  const separators: readonly string[] = NUMBER_INPUT_SEPARATORS
  const chars = Array.from(text)
  const [from, end] = trimmedRange(chars)
  let start = from

  let negative = false
  if (start < end && minus.includes(chars[start] ?? '')) {
    negative = true
    start += 1
  }

  let whole = ''
  let fraction = ''
  let separated = false
  for (let index = start; index < end; index += 1) {
    const char = chars[index] ?? ''
    const digit = digitOf(char)
    if (digit !== undefined) {
      if (separated) fraction += String(digit)
      else whole += String(digit)
      continue
    }
    if (!separated && separators.includes(char)) {
      separated = true
      continue
    }
    return undefined
  }

  const digits = whole.length + fraction.length
  if (digits === 0 || digits > NUMBER_INPUT_MAX_DIGITS) return undefined
  const value = Number(`${whole === '' ? '0' : whole}${fraction === '' ? '' : `.${fraction}`}`)
  if (value === 0) return 0
  return negative ? -value : value
}

/**
 * NUMBER FROM A LAYERED VALUE: a finite number within the safe-integer range is itself;
 * everything else (missing, `null`, a string, even `"12"`, a flag) means "no number". The field
 * does not convert a string to a number (`numberInputValueOfOtherType`).
 */
export function readInputNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) return undefined
  return value === 0 ? 0 : value
}

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/

/**
 * What the number field shows for a number from the data: ASCII digits, a dot, no groups and no
 * locale; the shortest form that reads back as the same number, an integer without `.0`. A
 * number that would need an exponent, and "no number", give an empty field.
 */
export function numberInputText(value: unknown): string {
  const number = readInputNumber(value)
  if (number === undefined) return ''
  const text = String(number)
  return PLAIN_DECIMAL.test(text) ? text : ''
}

/** What the number field writes to the host and the session: a number, or an empty string for "no number". */
export type NumberWritten = number | ''

export interface NumberInputStep {
  readonly state: TextInputState
  readonly write?: NumberWritten
}

function writtenNumberOf(text: string): NumberWritten {
  return parseInputNumber(text) ?? ''
}

/**
 * What the number field shows: while focused, the typed text; unfocused, the typed text AS LONG
 * AS ITS NUMBER equals what the layers give ("36,6" stays for 36.6), otherwise the layers'
 * number. NUMBERS are compared, not texts.
 */
export function shownNumberInput(state: TextInputState, bound: unknown): string {
  const held = state.held
  if (held === undefined) return numberInputText(bound)
  if (state.focused) return held.text
  return writtenNumberOf(held.text) === (readInputNumber(bound) ?? '') ? held.text : numberInputText(bound)
}

/**
 * A NUMBER FIELD WITH A NON-NUMBER IS AN ERROR STATE (9.14.0 clarification). The field is NOT
 * focused and the shown text is non-empty and not a number by `parseInputNumber`: the same look
 * as a non-empty `error` from the data, plus `aria-invalid`. While focused there is no such
 * state (it does not flash on "-" or "1,"). What counts is the SHOWN text: if a number from the
 * data replaced the typed text, there is no error. Text made only of parse-trim characters is
 * treated as empty. The reader adds no text: `helper` says what to type. Mirror of the
 * reference `numberInputInvalid`.
 */
export function numberInputInvalid(state: TextInputState, bound: unknown): boolean {
  if (state.focused) return false
  const shown = shownNumberInput(state, bound)
  const trimmed: readonly string[] = NUMBER_INPUT_TRIMMED
  if (Array.from(shown).every((char) => trimmed.includes(char))) return false
  return parseInputNumber(shown) === undefined
}

/**
 * One step of the number field, a mirror of `stepTextInput`. A number is written when the typed
 * text is a number, and an EMPTY STRING when the field was cleared or the typed text is not a
 * number (the field keeps the typed text). The same value is not written twice: "5" -> "5." ->
 * "5.0" is one write.
 */
export function stepNumberInput(state: TextInputState, event: TextInputEvent, bound: unknown, options: TextInputOptions = {}): NumberInputStep {
  if (options.disabled === true) return { state: { ...INITIAL_TEXT_INPUT, touched: state.touched } }
  const writes = options.hasPath !== false
  const shown = shownNumberInput(state, bound)
  const accept = (raw: string): NumberInputStep => {
    const text = clampInputText(raw, options.maxLength)
    const next: TextInputState = { ...state, touched: true, composing: false, held: { text, from: shown } }
    const value = writtenNumberOf(text)
    return value === writtenNumberOf(shown) || !writes ? { state: next } : { state: next, write: value }
  }

  switch (event.type) {
    case 'focus':
      return { state: { ...state, focused: true, touched: true, held: state.held ?? { text: shown, from: shown } } }
    case 'blur':
      return { state: { ...state, focused: false, composing: false } }
    case 'compositionStart':
      return { state: { ...state, composing: true } }
    case 'input':
      if (state.composing) return { state: { ...state, touched: true, held: { text: event.text, from: shown } } }
      return accept(event.text)
    case 'compositionEnd':
      return accept(event.text)
    case 'platformFill':
      return state.touched ? accept(event.text) : { state }
  }
}
