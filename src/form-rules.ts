/**
 * SCREEN FORM (schema 9.14.0): a "required" field, whether the form is filled, a button that is
 * disabled until the form is filled or while a condition holds, and a choice in a group that is
 * written like input into a field.
 *
 * The rules are contract data (`x-style.layout.form`); the functions here follow the contract's
 * reference implementation in substance. The package does not import the builder's sources, so
 * the rule is written a second time; the two copies are held together by the shared case table
 * `contract/fixtures/inputs/input-cases.json` and by a check that the data block equals the
 * artifact.
 *
 * THREE STATEMENTS:
 *  1. "filled" is a question about the VALUE under the field's path, read through the data
 *     layers (record -> session -> host scope -> data), not about widget state;
 *  2. the form is filled when every required field of the SCREEN that a person can fill
 *     (shown and not disabled) is filled;
 *  3. a button is disabled when `requiresFilled` is set on an unfilled form OR `disabledIf`
 *     holds.
 *
 * No React and no DOM in this file: the entry's server graph reads it too.
 */
import { valueAt } from './data'
import type { DataScope } from './data'
import { isDisabledBy, isNodeVisible } from './conditions'
import { inputPathOf, readInputFlag, readInputText, textFieldValueTypeOf } from './input-rules'
import { readInputNumber } from './input-number'
import { isSilentText } from './layout-rules'
import type { UiNode } from './types'
import { showsOnWidthClass } from './width-class'
import type { WidthClass } from './width-class'

/** What "filled" asks about: text, number, flag or a choice in a group. */
export type FilledKind = 'text' | 'number' | 'flag' | 'choice'

/**
 * WHETHER A FIELD IS FILLED, by the value under its path:
 *  - text and choice: a string that can be HEARD (whitespace and `Cf` characters do not count);
 *  - number: a finite number within the safe-integer range (`"12"` and `""` do not count);
 *  - flag: exactly `true`.
 * A choice is NOT checked against the group's options.
 */
export function isFilledValue(kind: FilledKind, value: unknown): boolean {
  switch (kind) {
    case 'text':
    case 'choice':
      return !isSilentText(readInputText(value))
    case 'number':
      return readInputNumber(value) !== undefined
    case 'flag':
      return readInputFlag(value)
  }
}

/** Widgets that read `required` (not `Switch` and the rest: a switch always has a value). */
const REQUIRED_WIDGETS: readonly string[] = ['TextField', 'Checkbox', 'ChoiceGroup']
/** Widgets that can be disabled: button and icon button (not a list row or a navigation item). */
const DISABLABLE_WIDGETS: readonly string[] = ['Button', 'IconButton']

/** Whether the field is marked required: only the literal `true`, and only on a widget that has the field (`unreadableRequired`). */
export function isRequired(node: { readonly type: string; readonly props: Readonly<Record<string, unknown>> }): boolean {
  return REQUIRED_WIDGETS.includes(node.type) && node.props.required === true
}

/** Whether the button waits for a filled form: only the literal `true` on a button (`unreadableRequiresFilled`). */
export function requiresFilled(node: { readonly type: string; readonly props: Readonly<Record<string, unknown>> }): boolean {
  return DISABLABLE_WIDGETS.includes(node.type) && node.props.requiresFilled === true
}

/** Whether this is a button that can be disabled. */
export function isPressDisablable(type: string): boolean {
  return DISABLABLE_WIDGETS.includes(type)
}

/** A required screen field, with just enough to answer "is it filled and does it count". */
export interface RequiredField {
  readonly nodeId: string
  readonly kind: FilledKind
  /** Path under which the value lies; `undefined` is a field with no path: it is never filled. */
  readonly path: string | undefined
  /** `visibleIf` of the node itself and all its ancestors: if any fails, the field is not on the screen. */
  readonly visibleIf: readonly unknown[]
  readonly disabledIf: unknown
  /** Fallback text of the CHOICE GROUP binding: without data it shows the option with this name as selected. */
  readonly fallback?: string | undefined
}

function valueOf(node: UiNode): { readonly kind: FilledKind; readonly value: unknown } {
  if (node.type === 'ChoiceGroup') return { kind: 'choice', value: node.props.value }
  if (node.type === 'Checkbox') return { kind: 'flag', value: node.props.value }
  return { kind: textFieldValueTypeOf(node.props.valueType) === 'number' ? 'number' : 'text', value: node.props.value }
}

/**
 * REQUIRED FIELDS OF A SCREEN, in document order. A SCREEN is the root of one `screens[]` entry
 * (app bar, body, pinned block and navigation bar together; a modal layer is a separate entry).
 * The subtree of a data list (`Repeater`) is not walked; a field in a tab that is not open is
 * included. The walk is iterative: `guards.ts` already bounds the tree depth, but the stack must
 * not depend on a foreign document.
 */
export function requiredFieldsOf(root: UiNode, widthClass: WidthClass = 'compact'): readonly RequiredField[] {
  const found: RequiredField[] = []
  const pending: { readonly node: UiNode; readonly inherited: readonly unknown[] }[] = [{ node: root, inherited: [] }]
  while (pending.length > 0) {
    const entry = pending.pop()
    if (entry === undefined) break
    const { node } = entry
    // A field hidden by the width class (its own `showOn` or an ancestor's) does not count in the form, just like one hidden by a condition.
    if (!showsOnWidthClass(node, widthClass)) continue
    const own = node.visibleIf === undefined ? entry.inherited : [...entry.inherited, node.visibleIf]
    if (isRequired(node)) {
      const { kind, value } = valueOf(node)
      const fallback = kind === 'choice' && typeof value === 'object' && value !== null ? (value as { readonly fallback?: unknown }).fallback : undefined
      found.push({
        nodeId: node.id,
        kind,
        path: inputPathOf(value),
        visibleIf: own,
        disabledIf: node.props.disabledIf,
        ...(typeof fallback === 'string' ? { fallback } : {}),
      })
    }
    if (node.type === 'Repeater') continue
    const children = node.children ?? []
    // Pop from the end: children are pushed in reverse so findings keep document order.
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      if (child !== undefined) pending.push({ node: child, inherited: own })
    }
  }
  return found
}

/**
 * The value that "filled" asks about. For a choice group, an empty string and a missing value
 * give the binding's fallback text (`emptyBoundString`), which is exactly the option the group
 * shows as selected.
 */
function shownValueOf(field: RequiredField, value: unknown): unknown {
  if (field.kind !== 'choice' || field.fallback === undefined) return value
  return readInputText(value) === '' ? field.fallback : value
}

/**
 * WHETHER THE SCREEN FORM IS FILLED. A field counts if a person can fill it: it is shown (every
 * `visibleIf` from the root holds; an unintelligible condition means the node is shown) and not
 * disabled by its own `disabledIf` (an unintelligible condition means not disabled). A field
 * without a path is never filled. With no required fields the form is filled.
 * `scope` is the data layers of the SCREEN (record -> session -> host scope -> data).
 */
export function isFormFilled(root: UiNode, scope: DataScope, widthClass: WidthClass = 'compact'): boolean {
  return requiredFieldsOf(root, widthClass).every((field) => {
    if (!field.visibleIf.every((condition) => isNodeVisible(condition as Parameters<typeof isNodeVisible>[0], scope))) return true
    if (field.disabledIf !== undefined && isDisabledBy(field.disabledIf, scope)) return true
    return field.path !== undefined && isFilledValue(field.kind, shownValueOf(field, valueAt(scope, field.path)))
  })
}

/**
 * WHETHER A BUTTON IS DISABLED: AT LEAST ONE of two holds, `disabledIf` or `requiresFilled` on
 * an unfilled form. `formFilled` is a function: the form is evaluated only for a button that
 * asks about it. A non-button is never disabled, whatever the document says.
 */
export function pressDisabledOf(node: UiNode, scope: DataScope, formFilled: () => boolean): boolean {
  if (!isPressDisablable(node.type)) return false
  if (node.props.disabledIf !== undefined && isDisabledBy(node.props.disabledIf, scope)) return true
  return requiresFilled(node) && !formFilled()
}

/**
 * WHAT A CHOICE IN A GROUP WRITES: the value at the binding path, to the reader's session and to
 * the host at the same moment as input into a field. A group value that is not a binding is
 * written nowhere. An option that is ALREADY shown as selected (`shown`) is not written again.
 */
export function choiceWriteOf(value: unknown, picked: string, shown: string | undefined): { readonly path: string; readonly value: string } | undefined {
  const path = inputPathOf(value)
  return path === undefined || picked === shown ? undefined : { path, value: picked }
}

/** The "required" mark: an asterisk after the label. */
export const REQUIRED_MARK = '*'

/** Mirror of the artifact block `x-style.layout.form` (`cases` is the path of the shared table); equality is checked by a test. Not edited by hand. */
export const FORM_RULES = {
  cases: 'contract/fixtures/inputs/input-cases.json',
  numberInvalid: {
    field: 'TextField-with-valueType-number',
    when: 'the-field-is-not-focused-and-the-shown-text-is-not-empty-and-is-not-a-number',
    whileFocused: 'never-the-state-appears-only-after-focus-is-lost',
    shownText: 'the-text-the-field-shows-not-the-typed-text-when-the-bound-number-took-over',
    empty: 'only-the-trimmed-characters-of-number.parse.trimmed',
    look: 'the-error-state-of-the-field-the-same-as-a-non-empty-error-from-the-data',
    semantics: {
      web: 'aria-invalid',
      flutter: 'the-error-state-of-the-field-without-a-text',
    },
    text: 'none-the-reader-adds-no-text-the-helper-of-the-field-says-what-to-type',
    clears: 'the-moment-the-text-is-a-number-or-empty',
  },
  required: {
    field: 'required',
    value: 'literal-true-anything-else-is-not-required',
    on: ['TextField', 'Checkbox', 'ChoiceGroup'],
    notOn: {
      Switch: 'a-switch-always-has-a-value-there-is-nothing-to-require',
    },
    filled: {
      asks: 'the-value-under-the-path-of-the-field-read-through-the-data-layers',
      text: 'a-string-that-can-be-heard',
      number: 'a-number',
      flag: 'true',
      choice: 'a-string-that-can-be-heard-the-bound-value-or-the-fallback-of-the-binding-not-checked-against-the-options',
      silent: 'x-accessibleName.silentCharacters',
      withoutPath: 'never-filled',
    },
    counted: {
      hidden: 'not-counted-own-visibleIf-or-of-any-ancestor',
      disabled: 'not-counted',
      inactiveTab: 'counted',
      insideDataList: 'not-counted',
    },
    mark: {
      text: '*',
      place: 'after-the-label-text-in-the-same-line-logical',
      gap: 'xs',
      color: 'danger',
      typography: 'of-the-label',
      on: ['TextField', 'Checkbox'],
      choiceGroup: 'none-the-group-has-no-label-of-its-own',
      readAloud: 'no-the-mark-is-hidden-from-the-screen-reader',
    },
    semantics: {
      state: 'required',
      web: {
        textField: 'aria-required',
        checkbox: 'aria-required',
        choiceGroup: 'aria-required-on-the-radiogroup',
      },
      flutter: 'Semantics-isRequired-where-the-sdk-has-it',
    },
    message: 'none-the-reader-shows-no-text-of-its-own',
  },
  filled: {
    of: 'the-screen-entry-the-control-stands-on-app-bar-body-pinned-block-and-nav-bar-together',
    modalLayer: 'its-own-screen-entry-its-own-form',
    is: 'every-counted-required-field-is-filled',
    noRequiredFields: 'filled',
    reads: 'record-of-the-screen-then-session-then-host-then-data',
    recomputed: 'on-every-write-and-every-change-of-the-data',
  },
  button: {
    requiresFilled: {
      field: 'requiresFilled',
      value: 'literal-true-anything-else-is-not-read',
      on: ['Button', 'IconButton'],
      disabledWhile: 'the-form-of-its-screen-is-not-filled',
    },
    disabledIf: {
      field: 'disabledIf',
      on: ['Button', 'IconButton'],
      condition: 'same-form-and-rules-as-visibleIf',
      unknownOp: 'enabled',
      missingValue: 'as-missingConditionValue',
    },
    both: 'disabled-when-either-holds',
    look: {
      opacity: 0.5,
      appliesTo: 'the-whole-widget',
      role: 'unchanged-no-disabled-role-in-the-theme',
    },
    press: 'nothing-no-action-no-track-no-press-feedback',
    focus: 'stays-in-the-focus-order',
    semantics: {
      state: 'disabled',
      web: 'aria-disabled-true-not-the-disabled-attribute',
      flutter: 'Semantics-enabled-false-onPressed-null',
    },
    reason: 'none-the-reader-does-not-say-why',
  },
  number: {
    field: 'valueType',
    values: ['string', 'number'],
    default: 'string',
    unknown: 'string',
    pathType: ['number'],
    keyboard: 'number',
    notRead: ['keyboard', 'lines'],
    parse: {
      trimmed: [32, 160, 8239, 9],
      minus: [45, 8722],
      digitZeros: [48, 1632, 1776],
      separators: [46, 44, 1643],
      shape: 'optional-minus-digits-optional-one-separator-digits-at-least-one-digit',
      maxDigits: 15,
      groups: 'none-a-comma-is-a-decimal-separator',
      exponent: 'none',
      negativeZero: 'zero',
    },
    write: {
      number: 'json-number-a-whole-value-without-a-fraction',
      notANumber: 'empty-string-the-field-keeps-the-typed-text',
      cleared: 'empty-string',
      sameValue: 'not-written-again-numbers-are-compared-not-texts',
    },
    read: {
      number: 'finite-and-within-the-safe-integer',
      anythingElse: 'empty-field-a-string-is-never-converted',
    },
    shown: {
      fromData: 'ascii-digits-dot-no-groups-no-locale-shortest-round-trip',
      needsExponent: 'empty-field',
      focused: 'what-the-person-typed',
      unfocused: 'what-the-person-typed-while-its-number-is-the-bound-number-then-the-bound-number',
      format: 'the-number-format-of-a-binding-does-not-apply',
    },
    maxLength: 'of-the-typed-text-in-code-points',
  },
  choice: {
    write: 'to-the-session-of-the-reader-and-the-host-at-the-same-moment-like-every-input',
    sameOption: 'not-written-again',
    literalValue: 'state-of-the-group-written-nowhere',
  },
} as const
