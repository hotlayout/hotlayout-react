/**
 * INPUT FIELDS (schema 9.13.0): text field, switch, checkbox.
 *
 * The rules are contract data (`x-style.layout.inputs`); the functions are a literal mirror of
 * the contract's reference implementation. The package does not import the builder's sources,
 * so the rule is written a second time; the two copies are held together by the shared case
 * table `contract/fixtures/inputs/input-cases.json` and by a check that the data block equals
 * the artifact.
 *
 * No React and no DOM in this file: the entry's server graph reads it too.
 */

/** The three leaf input widgets (9.13.0). */
export const INPUT_WIDGET_TYPES = ['TextField', 'Switch', 'Checkbox'] as const

export function isInputWidget(type: string): boolean {
  return (INPUT_WIDGET_TYPES as readonly string[]).includes(type)
}

/* ───────────────────────────── field value ───────────────────────────── */

/**
 * The field's path as the reader sees it, softer than the schema: an object with
 * `kind: 'binding'` and a non-empty string `path`. Extra keys beside it do not matter (a minor
 * that adds a field to the value must not switch writing off); anything else means "no path"
 * (the field works locally and writes nowhere).
 */
export function inputPathOf(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const { kind, path } = value as { readonly kind?: unknown; readonly path?: unknown }
  return kind === 'binding' && typeof path === 'string' && path !== '' ? path : undefined
}

/** Field text from a data-layer value: a string as is; anything else (missing, number, flag, object) is an empty field. */
export function readInputText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Flag from a data-layer value: on only for `true`. */
export function readInputFlag(value: unknown): boolean {
  return value === true
}

/* ───────────────────────── text field: limits and keyboard ───────────────────────── */

export const TEXT_FIELD_MAX_LENGTH_LIMIT = 10_000
export const TEXT_FIELD_MIN_LINES = 1
export const TEXT_FIELD_MAX_LINES = 8
export const TEXT_FIELD_DEFAULT_LINES = 1

/**
 * Trim input to the limit, counted in Unicode CODE POINTS (not UTF-16 units and not graphemes).
 * Trimming never splits a surrogate pair. A limit that is not a number, a fraction, or below
 * one means no limit. The platform `maxlength` is not set: it counts differently.
 */
export function clampInputText(text: string, maxLength: unknown): string {
  if (typeof maxLength !== 'number' || !Number.isInteger(maxLength) || maxLength < 1) return text
  const points = Array.from(text)
  return points.length <= maxLength ? text : points.slice(0, maxLength).join('')
}

/** Number of lines in the field: an integer within bounds is itself; otherwise one. */
export function inputLinesOf(lines: unknown): number {
  if (typeof lines !== 'number' || !Number.isInteger(lines)) return TEXT_FIELD_DEFAULT_LINES
  if (lines < TEXT_FIELD_MIN_LINES || lines > TEXT_FIELD_MAX_LINES) return TEXT_FIELD_DEFAULT_LINES
  return lines
}

export const INPUT_KEYBOARDS = ['text', 'email', 'number', 'phone', 'url'] as const
export type InputKeyboard = (typeof INPUT_KEYBOARDS)[number]
export const DEFAULT_INPUT_KEYBOARD: InputKeyboard = 'text'

/** Web equivalents of the keyboard intent are DATA (`textField.keyboards`), not advice. */
export const INPUT_KEYBOARD_WEB = {
  text: { type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'sentences', spellcheck: true },
  email: { type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'none', spellcheck: false },
  number: { type: 'text', inputmode: 'decimal', autocomplete: 'off', autocapitalize: 'none', spellcheck: false },
  phone: { type: 'tel', inputmode: 'tel', autocomplete: 'tel', autocapitalize: 'none', spellcheck: false },
  url: { type: 'url', inputmode: 'url', autocomplete: 'url', autocapitalize: 'none', spellcheck: false },
} as const

/** Keyboard kind: a known word is itself; no field or an unknown word (`password` from a newer minor) means `text`. */
export function inputKeyboardOf(keyboard: unknown): InputKeyboard {
  return typeof keyboard === 'string' && Object.hasOwn(INPUT_KEYBOARD_WEB, keyboard) ? (keyboard as InputKeyboard) : DEFAULT_INPUT_KEYBOARD
}

/**
 * VALUE TYPE OF A TEXT FIELD (9.14.0, `TextField.valueType`): string or number. No field or an
 * unknown word (a newer minor) means `string` (`unknownInputValueType`). The type is NOT derived
 * from the data dictionary: the reader does not have it.
 */
export type TextFieldValueType = 'string' | 'number'

export function textFieldValueTypeOf(valueType: unknown): TextFieldValueType {
  return valueType === 'number' ? 'number' : 'string'
}

/** What goes to the reader's session and to the host: a string, a flag or (since 9.14.0) a number. */
export type InputWritten = string | boolean | number

/** Keyboard intent of the number field (`form.number.keyboard`). */
export const NUMBER_INPUT_KEYBOARD: InputKeyboard = 'number'

/**
 * The keyboard the field will really open with: a multi-line field does not read the intent,
 * and a NUMBER field (`valueType: 'number'`) is always single-line with a numeric keyboard; it
 * reads neither `keyboard` nor `lines` (`numberInputOptions`).
 */
export function effectiveKeyboardOf(keyboard: unknown, lines: unknown, valueType?: unknown): InputKeyboard | 'multiline' {
  if (textFieldValueTypeOf(valueType) === 'number') return NUMBER_INPUT_KEYBOARD
  return inputLinesOf(lines) > TEXT_FIELD_DEFAULT_LINES ? 'multiline' : inputKeyboardOf(keyboard)
}

/** How many lines the field really has: a number field has one, whatever `lines` says. */
export function effectiveLinesOf(lines: unknown, valueType?: unknown): number {
  return textFieldValueTypeOf(valueType) === 'number' ? TEXT_FIELD_DEFAULT_LINES : inputLinesOf(lines)
}

/** Content direction: email, phone, URL and number are always left-to-right; text and multi-line follow the screen. */
const CONTENT_DIRECTIONS: Readonly<Record<InputKeyboard | 'multiline', 'screen' | 'left-to-right'>> = {
  text: 'screen',
  multiline: 'screen',
  email: 'left-to-right',
  number: 'left-to-right',
  phone: 'left-to-right',
  url: 'left-to-right',
}

export function inputContentDirectionOf(keyboard: unknown, lines: unknown, valueType?: unknown): 'screen' | 'left-to-right' {
  return CONTENT_DIRECTIONS[effectiveKeyboardOf(keyboard, lines, valueType)]
}

export { inputErrorOf } from './shown-text'

/** Keyboard key: new line, "next" or "done". It NEVER runs an action. */
export type InputKeyAction = 'newline' | 'next' | 'done'

export interface FocusableInput {
  readonly multiline: boolean
  /** Shown (`visibleIf`) and not disabled (`disabledIf`). */
  readonly reachable: boolean
}

export function inputKeyActionOf(fields: readonly FocusableInput[], index: number): InputKeyAction {
  const field = fields[index]
  if (field === undefined) return 'done'
  if (field.multiline) return 'newline'
  return fields.slice(index + 1).some((later) => later.reachable) ? 'next' : 'done'
}

/** The next reachable field after this one; `undefined` when there is nowhere further. */
export function nextInputIndexOf(fields: readonly FocusableInput[], index: number): number | undefined {
  const found = fields.findIndex((later, at) => at > index && later.reachable)
  return found === -1 ? undefined : found
}

/* ───────────────────────── what the field shows and writes ───────────────────────── */

export interface TextInputState {
  readonly focused: boolean
  /** The person touched the field (focus or typing). Until then the field writes nothing. */
  readonly touched: boolean
  /** Character composition (IME) is in progress. */
  readonly composing: boolean
  /** What the person typed and what the layered value was at that moment; `released` means the layered value has changed since. */
  readonly held?: { readonly text: string; readonly from: string; readonly released?: boolean } | undefined
}

export const INITIAL_TEXT_INPUT: TextInputState = { focused: false, touched: false, composing: false }

export type TextInputEvent =
  | { readonly type: 'focus' }
  | { readonly type: 'blur' }
  | { readonly type: 'input'; readonly text: string }
  | { readonly type: 'compositionStart' }
  | { readonly type: 'compositionEnd'; readonly text: string }
  /** The platform filled in a value WITHOUT the person (autofill before the first touch). */
  | { readonly type: 'platformFill'; readonly text: string }

export interface TextInputOptions {
  readonly maxLength?: unknown
  readonly disabled?: boolean
  /** A field without a path works locally and writes nowhere. */
  readonly hasPath?: boolean
}

export interface TextInputStep {
  readonly state: TextInputState
  readonly write?: string
}

/** What the field shows: while focused, the typed text; unfocused, the typed text until the layered value changes. */
export function shownInputText(state: TextInputState, bound: string): string {
  const held = state.held
  if (held === undefined) return bound
  if (state.focused) return held.text
  return held.released === true || held.from !== bound ? bound : held.text
}

/**
 * One step of the text field: event -> new state and (maybe) a write. It writes on EVERY change
 * by the person, immediately; the same text is not written twice; a disabled field does not
 * write, nor does intermediate character-composition text or a value inserted by the platform
 * before the first touch.
 */
export function stepTextInput(state: TextInputState, event: TextInputEvent, bound: string, options: TextInputOptions = {}): TextInputStep {
  if (options.disabled === true) return { state: { ...INITIAL_TEXT_INPUT, touched: state.touched } }
  const writes = options.hasPath !== false
  const shown = shownInputText(state, bound)
  const accept = (raw: string): TextInputStep => {
    const text = clampInputText(raw, options.maxLength)
    const next: TextInputState = { ...state, touched: true, composing: false, held: { text, from: bound } }
    return text === shown || !writes ? { state: next } : { state: next, write: text }
  }

  switch (event.type) {
    case 'focus':
      return { state: { ...state, focused: true, touched: true, held: state.held ?? { text: shown, from: bound } } }
    case 'blur':
      return { state: { ...state, focused: false, composing: false, held: state.held?.released === true ? undefined : state.held } }
    case 'compositionStart':
      return { state: { ...state, composing: true } }
    case 'input':
      if (state.composing) return { state: { ...state, touched: true, held: { text: event.text, from: bound } } }
      return accept(event.text)
    case 'compositionEnd':
      return accept(event.text)
    case 'platformFill':
      return state.touched ? accept(event.text) : { state }
  }
}

/**
 * The layered value changed: the reader calls this whenever a different value appears under the
 * field's path. Without this step the "until it changes" rule could not tell "did not change"
 * from "changed and came back" (A -> B -> A).
 */
export function syncTextInput(state: TextInputState, bound: string): TextInputState {
  const held = state.held
  if (held === undefined || held.released === true || held.from === bound) return state
  return state.focused ? { ...state, held: { ...held, released: true } } : { ...state, held: undefined }
}

export interface ToggleState {
  readonly held?: { readonly on: boolean; readonly from: boolean } | undefined
}

export const INITIAL_TOGGLE: ToggleState = {}

export function shownToggle(state: ToggleState, bound: boolean): boolean {
  if (state.held === undefined) return bound
  return state.held.from === bound ? state.held.on : bound
}

export function syncToggle(state: ToggleState, bound: boolean): ToggleState {
  return state.held === undefined || state.held.from === bound ? state : INITIAL_TOGGLE
}

/** Press: the value flips from the SHOWN one and is written at once. A disabled one neither flips nor writes. */
export function pressToggle(state: ToggleState, bound: boolean, options: { readonly disabled?: boolean; readonly hasPath?: boolean } = {}): { readonly state: ToggleState; readonly write?: boolean } {
  if (options.disabled === true) return { state }
  const on = !shownToggle(state, bound)
  const next: ToggleState = { held: { on, from: bound } }
  return options.hasPath === false ? { state: next } : { state: next, write: on }
}
