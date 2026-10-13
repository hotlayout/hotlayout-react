/**
 * The text field (`TextField`, schema 9.13.0 and 9.19.0): the value is a PATH of the data dictionary. It is read
 * through the layers (record → session → host → data) and WRITTEN to the session of the reader and to the host at
 * the same moment (`InputWriteContext`). Without a path the field works locally and writes nothing.
 *
 * Schema 9.19.0 gave the field parts (`x-style.layout.inputParts`): the look of the BOX of the field itself
 * (`fieldRadius`, `fieldBackground`, `fieldBorderColor`, `fieldBorderWidth`, `fieldHeight`), a mark at the start
 * and at the end of the box (`prefix`, `suffix`) and a counter of characters (`counter`). The pure answers are in
 * `input-parts.ts`. A field without them is drawn exactly as before.
 */
import { useContext, useEffect, useId, useRef, useState } from 'react'
import type { ChangeEvent, CompositionEvent, CSSProperties, FocusEvent, KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react'

import { shownTextOf } from '../shown-text'
import { isRequired } from '../form-rules'
import { effectiveKeyboardOf, effectiveLinesOf, INITIAL_TEXT_INPUT, INPUT_KEYBOARD_WEB, inputContentDirectionOf, inputErrorOf, readInputText, shownInputText, stepTextInput, syncTextInput, TEXT_FIELD_DEFAULT_LINES, textFieldValueTypeOf } from '../input-rules'
import { INPUTS_LAYOUT } from '../inputs-layout'
import { numberInputInvalid, shownNumberInput, stepNumberInput } from '../input-number'
import type { TextInputEvent, TextInputState } from '../input-rules'
import { colorCss, radiusCss, typographyCss } from '../resolve'
import { cssPx, isRecord } from '../sanitize'
import { AutofillContext, InputWriteContext } from '../runtime'
import { typographyToCss } from '../style'
import type { Theme } from '../theme'
import { FIELD_CLASS } from '../styles'
import { productVar } from '../theme'
import { valueAt } from '../data'
import { readColorRef, readRadiusRef } from '../part-style'
import { affixTextShown, fieldBorderWidthOf, fieldHeightOf, FIELD_AFFIX_GAP, inputCounterText } from '../input-parts'
import { Glyph } from './icon'
import { disabledLook, RequiredMark, useInputDisabled, useInputPath } from './input-shared'
import { asCss, mathToken } from './prop-tokens'
import { useText } from './use-text'
import type { WidgetProps } from './widget-props'
import { useData, useTheme } from './contexts'

/** The mark of a text field in the markup: "next" uses it to find the next field of the screen. */
const TEXT_INPUT_ATTRIBUTE = 'data-hl-input'

/** What a touch can land on without clearing focus: controls, labels and anything with focus of its own. */
const OWN_FOCUS_TARGETS = 'input, textarea, select, button, a, label, [tabindex], [role="button"], [role="switch"], [role="checkbox"]'

/** The next reachable text field of the same screen, in document order; disabled ones are not a target in the markup. */
function nextTextInput(from: HTMLElement): HTMLElement | undefined {
  const screen = from.closest('[data-hl-type="Screen"]')
  if (screen === null) return undefined
  const fields = Array.from(screen.querySelectorAll<HTMLElement>(`[${TEXT_INPUT_ATTRIBUTE}]`)).filter((field) => !(field as HTMLInputElement).disabled)
  const at = fields.indexOf(from)
  return at === -1 ? undefined : fields[at + 1]
}

/* ─────────────── the state of the field: what is held, what is written ─────────────── */

interface FieldState {
  readonly state: TextInputState
  readonly send: (event: TextInputEvent) => void
  readonly stateRef: RefObject<TextInputState>
  readonly element: RefObject<(HTMLInputElement & HTMLTextAreaElement) | null>
  readonly hintKey: () => void
  readonly stopWatchingTaps: () => void
  readonly tapOutside: RefObject<(() => void) | undefined>
}

interface FieldInput {
  readonly path: string | undefined
  readonly boundRaw: unknown
  readonly bound: string
  readonly numeric: boolean
  readonly disabled: boolean
  readonly multiline: boolean
  readonly maxLength: unknown
}

/**
 * What the person typed and what is written. The value of the layers changed (a write arrived, the host put another
 * one) — what was typed is no longer held. A number field compares NUMBERS at show time, so it needs no such event.
 */
function useFieldState(input: FieldInput): FieldState {
  const { path, boundRaw, bound, numeric, disabled, multiline, maxLength } = input
  const write = useContext(InputWriteContext)
  const element = useRef<(HTMLInputElement & HTMLTextAreaElement) | null>(null)
  const [state, setState] = useState<TextInputState>(INITIAL_TEXT_INPUT)
  const synced = numeric ? state : syncTextInput(state, bound)
  if (synced !== state) setState(synced)
  // Events read the state from a ref, not from the closure: otherwise two events of one frame would both apply to the same stale state.
  const stateRef = useRef(synced)
  useEffect(() => {
    stateRef.current = synced
  })

  const send = (event: TextInputEvent): void => {
    const options = { maxLength, disabled, hasPath: path !== undefined }
    const step = numeric ? stepNumberInput(stateRef.current, event, boundRaw, options) : stepTextInput(stateRef.current, event, bound, options)
    stateRef.current = step.state
    setState(step.state)
    if (step.write !== undefined && path !== undefined) write?.(path, step.write)
  }
  const latestSend = useRef(send)
  useEffect(() => {
    latestSend.current = send
  })

  // A field that lost focus because it was disabled drops its held value.
  useEffect(() => {
    const held = stateRef.current
    if (disabled && held !== INITIAL_TEXT_INPUT && (held.focused || held.held !== undefined)) latestSend.current({ type: 'blur' })
  }, [disabled])

  // The keyboard button ("next" or "done") follows the screen markup; an effect sets the attribute, not React (SSR and hydration do not know it).
  const hintKey = (): void => {
    const el = element.current
    if (el === null) return
    el.setAttribute('enterkeyhint', multiline ? 'enter' : nextTextInput(el) === undefined ? 'done' : 'next')
  }
  useEffect(() => {
    hintKey()
  })

  // A touch outside a control clears focus (on iOS a touch on an empty spot does not clear it by itself).
  const tapOutside = useRef<(() => void) | undefined>(undefined)
  const stopWatchingTaps = (): void => {
    tapOutside.current?.()
    tapOutside.current = undefined
  }
  useEffect(() => stopWatchingTaps, [])

  return { state: synced, send, stateRef, element, hintKey, stopWatchingTaps, tapOutside }
}

/** The events of the field: focus, blur, composition, change and the key of the keyboard. */
function fieldEvents(field: FieldState, multiline: boolean): Record<string, unknown> {
  const { send, stateRef, hintKey, stopWatchingTaps, tapOutside } = field
  return {
    onFocus: (event: FocusEvent<HTMLElement>): void => {
      hintKey()
      send({ type: 'focus' })
      const root = event.currentTarget.ownerDocument
      const onPointerDown = (tap: PointerEvent): void => {
        const target = tap.composedPath()[0]
        if (target instanceof Element && target.closest(OWN_FOCUS_TARGETS) === null && root.activeElement instanceof HTMLElement) root.activeElement.blur()
      }
      stopWatchingTaps()
      root.addEventListener('pointerdown', onPointerDown, true)
      tapOutside.current = () => {
        root.removeEventListener('pointerdown', onPointerDown, true)
      }
    },
    onBlur: (): void => {
      stopWatchingTaps()
      send({ type: 'blur' })
    },
    onCompositionStart: (): void => {
      send({ type: 'compositionStart' })
    },
    onCompositionEnd: (event: CompositionEvent<HTMLElement>): void => {
      send({ type: 'compositionEnd', text: (event.currentTarget as HTMLInputElement).value })
    },
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
      // A change before the person's first touch comes from the platform (autofill): it is neither kept nor written.
      send({ type: stateRef.current.touched ? 'input' : 'platformFill', text: event.target.value })
    },
    // Enter is the keyboard button: "next" goes to the next field of the screen, or "done". It runs no action and there is no form.
    onKeyDown: (event: KeyboardEvent<HTMLElement>): void => {
      if (event.key !== 'Enter' || multiline || event.nativeEvent.isComposing) return
      event.preventDefault()
      const next = nextTextInput(event.currentTarget)
      if (next === undefined) event.currentTarget.blur()
      else next.focus()
    },
  }
}

/* ─────────────── the box of the field ─────────────── */

interface BoxInput {
  readonly props: Readonly<Record<string, unknown>>
  readonly theme: Theme
  readonly lines: number
  readonly multiline: boolean
  readonly affixed: boolean
  readonly invalid: boolean
  readonly focused: boolean
}

/** The colour of the border: error stronger than focus, both stronger than the named colour, which is stronger than the built-in one. */
function borderColorOf(input: BoxInput): string {
  const states = INPUTS_LAYOUT.textField.states
  if (input.invalid) return productVar('color', states.error.borderColor)
  if (input.focused) return productVar('color', states.focused.borderColor)
  return colorCss(readColorRef(input.props.fieldBorderColor), input.theme) ?? productVar('color', INPUTS_LAYOUT.textField.box.border.color)
}

/**
 * The box: border, padding and `lines` lines of the typed text (`box.height`), so the neighbours do not move with the
 * focus. What the document names lays over the built-in look (9.19.0); a token the theme does not know is skipped. A
 * named height is exact and the vertical padding then does not apply. With a mark the box is the wrapper of the field.
 */
function boxStyleOf(input: BoxInput): CSSProperties {
  const { props, theme, lines, multiline, affixed, invalid, focused } = input
  const layout = INPUTS_LAYOUT.textField
  const borderWidth = fieldBorderWidthOf(props.fieldBorderWidth)
  const namedHeight = fieldHeightOf(props.fieldHeight, lines)
  const ringColor = invalid ? layout.states.error.borderColor : layout.states.focused.ring.color
  return {
    boxSizing: 'border-box',
    display: affixed ? 'flex' : 'block',
    ...(affixed ? { alignItems: multiline ? 'flex-start' : 'center', gap: productVar('spacing', FIELD_AFFIX_GAP) } : {}),
    inlineSize: '100%',
    blockSize: namedHeight === undefined ? `calc(${String(lines)} * 1lh + 2 * ${mathToken(layout.box.paddingBlock, theme)} + 2 * ${cssPx(borderWidth)})` : cssPx(namedHeight),
    margin: 0,
    paddingBlock: namedHeight === undefined ? productVar('spacing', layout.box.paddingBlock) : 0,
    paddingInline: productVar('spacing', layout.box.paddingInline),
    border: `${cssPx(borderWidth)} solid ${borderColorOf(input)}`,
    borderRadius: radiusCss(readRadiusRef(props.fieldRadius), theme) ?? productVar('radius', layout.box.radius),
    backgroundColor: colorCss(readColorRef(props.fieldBackground), theme) ?? productVar('color', layout.box.background),
    color: productVar('color', layout.box.color),
    ...asCss(typographyToCss(typographyCss(layout.box.typography, theme))),
    // The ring is INSIDE the box: the size does not change; an error beats focus.
    boxShadow: focused ? `inset 0 0 0 ${cssPx(layout.states.focused.ring.width)} ${productVar('color', ringColor)}` : undefined,
    // A long word scrolls instead of pushing the box wider; a multi-line field wraps, a single-line one scrolls sideways.
    overflow: multiline && !affixed ? 'auto' : 'hidden',
    whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
    overflowWrap: multiline ? 'anywhere' : undefined,
    resize: 'none',
    outline: 'none',
    // A touch landing on the field does not widen the touch target: the field is taller than 40 anyway.
    scrollMarginBlockEnd: `calc(var(--hl-sticky-clear-end, 0px) + ${mathToken(layout.gap, theme)} + 1lh)`,
  }
}

/** With a mark the box is a wrapper and the field inside is bare: the border, the background and the padding are the wrapper's. */
function bareStyleOf(multiline: boolean): CSSProperties {
  return {
    flex: 1,
    minInlineSize: 0,
    boxSizing: 'border-box',
    blockSize: '100%',
    margin: 0,
    padding: 0,
    border: 'none',
    background: 'none',
    color: 'inherit',
    font: 'inherit',
    letterSpacing: 'inherit',
    whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
    overflow: multiline ? 'auto' : 'hidden',
    overflowWrap: multiline ? 'anywhere' : undefined,
    resize: 'none',
    outline: 'none',
  }
}

/** A press on a mark puts the focus in the field (`affix.press`); a mark has no action. */
function focusField(event: MouseEvent<HTMLElement>): void {
  const field = event.currentTarget.querySelector<HTMLElement>(`[${TEXT_INPUT_ATTRIBUTE}]`)
  if (field === null || event.target === field) return
  event.preventDefault()
  field.focus()
}

/* ─────────────── the view ─────────────── */

/** What the platform gets from the intent of the keyboard: the type, the input mode, the capitals, the hints. */
function platformOf(props: Readonly<Record<string, unknown>>): (typeof INPUT_KEYBOARD_WEB)[keyof typeof INPUT_KEYBOARD_WEB] {
  const keyboard = effectiveKeyboardOf(props.keyboard, props.lines, props.valueType)
  return INPUT_KEYBOARD_WEB[keyboard === 'multiline' ? 'text' : keyboard]
}

/**
 * What the intent of the keyboard gives the element: the direction of the CONTENT (a mail, a phone, an address and a
 * number go left to right in every language; the alignment stays the screen's, `.hl-field`), the hints, and the autofill
 * the host may switch off with the prop `autofill`.
 */
function platformAttributes(props: Readonly<Record<string, unknown>>, autofill: boolean): Record<string, unknown> {
  const platform = platformOf(props)
  return {
    dir: inputContentDirectionOf(props.keyboard, props.lines, props.valueType) === 'left-to-right' ? 'ltr' : undefined,
    autoCapitalize: platform.autocapitalize,
    spellCheck: platform.spellcheck,
    autoCorrect: platform.spellcheck ? 'on' : 'off',
    autoComplete: autofill ? platform.autocomplete : 'off',
  }
}

/** The ids of the notes that describe the field, joined; none — no attribute. */
function describedByOf(ids: readonly (string | undefined)[]): string | undefined {
  const present = ids.filter((id) => id !== undefined)
  return present.length === 0 ? undefined : present.join(' ')
}

/** The texts of the field. All four are SHOWN text (`x-style.layout.shownText`); the attribute `placeholder` CSS does not collapse, so it is done here. */
function useFieldTexts(props: Readonly<Record<string, unknown>>): { readonly label: string; readonly placeholder: string; readonly helper: string; readonly error: string | undefined } {
  const label = shownTextOf(useText(props.label, 'label'))
  const placeholder = shownTextOf(useText(props.placeholder, 'placeholder'))
  const helper = shownTextOf(useText(props.helper, 'helper'))
  const error = inputErrorOf(useText(props.error, 'error'))
  return { label, placeholder, helper, error }
}

export function TextFieldView({ node, props, css, mark }: WidgetProps): ReactNode {
  const theme = useTheme()
  const scope = useData()
  const autofill = useContext(AutofillContext)
  const layout = INPUTS_LAYOUT.textField
  const { label, placeholder, helper, error } = useFieldTexts(props)
  const path = useInputPath(props.value, node.id)
  const boundRaw = path === undefined ? undefined : valueAt(scope, path)
  const bound = readInputText(boundRaw)
  const disabled = useInputDisabled(props.disabledIf)
  // A numeric field (schema 9.14.0): single-line, with a numeric keyboard; it does not read the document's `keyboard` and `lines`.
  const numeric = textFieldValueTypeOf(props.valueType) === 'number'
  const lines = effectiveLinesOf(props.lines, props.valueType)
  const multiline = lines > TEXT_FIELD_DEFAULT_LINES
  const fieldId = useId()
  const noteId = useId()
  const counterId = useId()
  const prefix = useAffix(props.prefix, 'prefix.text')
  const suffix = useAffix(props.suffix, 'suffix.text')
  const field = useFieldState({ path, boundRaw, bound, numeric, disabled, multiline, maxLength: props.maxLength })
  const { state } = field

  const shown = numeric ? shownNumberInput(state, boundRaw) : shownInputText(state, bound)
  // A non-number in an unfocused numeric field is the same error state as `error` from the data, but without text.
  const invalid = error !== undefined || (numeric && numberInputInvalid(state, boundRaw))
  const affixed = prefix !== undefined || suffix !== undefined
  const boxStyle = boxStyleOf({ props, theme, lines, multiline, affixed, invalid, focused: state.focused })

  // The error text replaces the hint only when it is GIVEN; a non-number without `error` keeps the hint (what to type) and its colour.
  const noteText = error ?? (helper === '' ? undefined : helper)
  // The counter (`counter` with a `maxLength`): the count of code points of the SHOWN text, one line under the box at the logical end.
  const counter = inputCounterText(props, shown)
  // The description of the field for assistive technology: the note, the text of the marks and the counter are read with it, never announced on every key.
  const describedBy = describedByOf([noteText === undefined ? undefined : noteId, prefix?.describedBy, suffix?.describedBy, counter === undefined ? undefined : counterId])
  const platform = platformOf(props)

  const common = {
    id: fieldId,
    ref: field.element,
    className: FIELD_CLASS,
    style: affixed ? bareStyleOf(multiline) : boxStyle,
    value: shown,
    disabled,
    placeholder: placeholder === '' ? undefined : placeholder,
    'aria-invalid': invalid ? true : undefined,
    'aria-required': isRequired(node) ? true : undefined,
    'aria-describedby': describedBy,
    ...platformAttributes(props, autofill),
    [TEXT_INPUT_ATTRIBUTE]: 'text',
    ...fieldEvents(field, multiline),
  }
  const control = multiline ? <textarea {...common} rows={lines} /> : <input {...common} type={platform.type} inputMode={platform.inputmode} />

  return (
    <div {...mark} style={{ display: 'flex', flexDirection: 'column', minInlineSize: 0, ...css }}>
      <div style={{ display: 'flex', flexDirection: 'column', minInlineSize: 0, ...disabledLook(disabled) }}>
        <label
          htmlFor={fieldId}
          style={{
            display: 'block',
            marginBlockEnd: productVar('spacing', layout.gap),
            overflowWrap: 'anywhere',
            ...asCss(typographyToCss(typographyCss(layout.label.typography, theme))),
            color: productVar('color', layout.label.color),
          }}
        >
          {label}
          {isRequired(node) ? <RequiredMark /> : null}
        </label>
        {affixed ? (
          <div data-hl-field-box="" style={boxStyle} onMouseDown={focusField}>
            <AffixView affix={prefix} />
            {control}
            <AffixView affix={suffix} />
          </div>
        ) : (
          control
        )}
        <NoteRow noteId={noteId} text={noteText} isError={error !== undefined} counter={counter} counterId={counterId} />
      </div>
    </div>
  )
}

/**
 * The row under the box: the note (or the error) from the start and the counter at the end. The live region of the
 * note is always there: the announcement of a text inserted together with the region is skipped by some screen readers.
 * The counter is not in it — it is read with the field, not announced on every key.
 */
function NoteRow({ noteId, text, isError, counter, counterId }: { readonly noteId: string; readonly text: string | undefined; readonly isError: boolean; readonly counter: string | undefined; readonly counterId: string }): ReactNode {
  const theme = useTheme()
  const layout = INPUTS_LAYOUT.textField
  const note =
    text === undefined ? null : (
      <span
        id={noteId}
        style={{
          display: 'block',
          marginBlockStart: productVar('spacing', layout.gap),
          overflowWrap: 'anywhere',
          ...asCss(typographyToCss(typographyCss(layout.note.typography, theme))),
          color: productVar('color', isError ? layout.note.errorColor : layout.note.helperColor),
        }}
      >
        {text}
      </span>
    )
  if (counter === undefined) {
    return (
      <div aria-live="polite" style={{ display: 'block' }}>
        {note}
      </div>
    )
  }
  return (
    <div data-hl-note-row="" style={{ display: 'flex', alignItems: 'flex-start', gap: productVar('spacing', FIELD_AFFIX_GAP) }}>
      <div aria-live="polite" style={{ display: 'block', flex: 1, minInlineSize: 0 }}>
        {note}
      </div>
      <span
        id={counterId}
        data-hl-counter=""
        style={{ flex: 'none', marginBlockStart: productVar('spacing', layout.gap), whiteSpace: 'pre', ...asCss(typographyToCss(typographyCss(layout.note.typography, theme))), color: productVar('color', layout.note.helperColor) }}
      >
        {counter}
      </span>
    </div>
  )
}

/* ─────────────── the marks ─────────────── */

/** A mark of the field as drawn: a short shown text or an icon. */
interface Affix {
  readonly kind: 'text' | 'icon'
  readonly text?: string
  readonly icon?: unknown
  readonly describedBy?: string
}

/** The mark of one side: the text is translated like every text of the field and cut to the limit; an empty one is no mark at all. */
function useAffix(value: unknown, field: string): Affix | undefined {
  const text = useText(isRecord(value) && value.kind === 'text' ? value.text : undefined, field)
  const id = useId()
  if (!isRecord(value)) return undefined
  if (value.kind === 'icon') return { kind: 'icon', icon: value.icon }
  if (value.kind !== 'text') return undefined
  const shown = affixTextShown(shownTextOf(text))
  return shown === '' ? undefined : { kind: 'text', text: shown, describedBy: id }
}

/** A mark inside the box: it never shrinks, one line, quiet colour. It is not part of the value and never written. */
function AffixView({ affix }: { readonly affix: Affix | undefined }): ReactNode {
  if (affix === undefined) return null
  if (affix.kind === 'icon') {
    return (
      <span aria-hidden="true" data-hl-affix="icon" style={{ flex: 'none', display: 'flex', alignItems: 'center', color: productVar('color', 'muted') }}>
        <Glyph name={affix.icon} />
      </span>
    )
  }
  return (
    <span id={affix.describedBy} data-hl-affix="text" style={{ flex: 'none', whiteSpace: 'nowrap', color: productVar('color', 'muted') }}>
      {affix.text}
    </span>
  )
}
