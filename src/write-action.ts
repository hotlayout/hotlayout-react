/**
 * The write actions (schema 9.19.0): `setValue` puts a literal under a data path, `toggleValue` flips the
 * flag under it. The READER performs both, with the very write an input field makes: into the session of
 * the reader and to the host (`onWrite`) at the same moment, through the same gate (`writablePaths`).
 * Nothing goes to `onAction`, valid or not.
 *
 * Both the path and the value are LITERALS of the document: `paramBindings` and `carryRecord` are never
 * read. The only thing an action reads is the current value under its own path (to flip it, and not to
 * write the same value twice).
 *
 * The rules are the artifact blocks `x-actions.write` and `x-choice`, mirrored below whole (a test
 * compares them with the artifact); the shared rows are the `write…` groups of
 * `contract/fixtures/actions/action-cases.json` and the `choice…` groups of `inputs/input-cases.json`.
 */
import { parseInputNumber, readInputNumber } from './input-number'
import { readInputFlag } from './input-rules'
import type { InputWritten } from './input-rules'
import { isRecord } from './sanitize'

export const SET_VALUE_ACTION_TYPE = 'setValue'
export const TOGGLE_VALUE_ACTION_TYPE = 'toggleValue'

/** The longest path of a write: the common bound of a data path. */
export const WRITE_PATH_MAX = 128

/** The types a literal can be read as; the default is `string`. */
export const WRITE_VALUE_TYPES = ['string', 'boolean', 'number'] as const
export type WriteValueType = (typeof WRITE_VALUE_TYPES)[number]

/** Why a write action writes nothing. */
export type WriteProblem = 'missing-path' | 'path-too-long' | 'unknown-value-type' | 'not-a-flag' | 'not-a-number'

/** What a press of a node with a write action does. */
export type WriteStep =
  | { readonly kind: 'write'; readonly path: string; readonly value: InputWritten }
  | { readonly kind: 'same-value'; readonly path: string; readonly value: InputWritten }
  | { readonly kind: 'invalid'; readonly problem: WriteProblem }

/** A node that is an option or a toggle for the person; `on` is computed from the action and the data. */
export interface WriteControl {
  readonly role: 'option' | 'toggle'
  readonly path: string
  readonly on: boolean
}

export function isWriteAction(type: string): boolean {
  return type === SET_VALUE_ACTION_TYPE || type === TOGGLE_VALUE_ACTION_TYPE
}

/** An own string parameter of the action; anything else is "no parameter". */
function ownParam(action: { readonly params?: unknown }, name: string): string | undefined {
  const params = action.params
  if (!isRecord(params) || !Object.hasOwn(params, name)) return undefined
  const value = params[name]
  return typeof value === 'string' ? value : undefined
}

function writePathOf(action: { readonly params?: unknown }): { readonly path: string } | { readonly problem: WriteProblem } {
  const path = ownParam(action, 'path')
  if (path === undefined || path === '') return { problem: 'missing-path' }
  return path.length > WRITE_PATH_MAX ? { problem: 'path-too-long' } : { path }
}

/** What `setValue` puts: the literal read as its type. A type this reader does not know makes the action invalid. */
function writtenLiteralOf(action: { readonly params?: unknown }): { readonly value: InputWritten } | { readonly problem: WriteProblem } {
  const word = ownParam(action, 'valueType')
  const type = word === undefined ? 'string' : (WRITE_VALUE_TYPES as readonly string[]).includes(word) ? (word as WriteValueType) : undefined
  if (type === undefined) return { problem: 'unknown-value-type' }
  const literal = ownParam(action, 'value') ?? ''
  if (type === 'string') return { value: literal }
  if (type === 'boolean') return literal === 'true' ? { value: true } : literal === 'false' ? { value: false } : { problem: 'not-a-flag' }
  if (literal === '') return { value: '' }
  const number = parseInputNumber(literal)
  return number === undefined ? { problem: 'not-a-number' } : { value: number }
}

/**
 * Whether this very value lies under the path: equality by TYPE, no conversion. The empty string equals an
 * absent value (`undefined`, `null`): erased and not chosen are one thing to the person.
 */
export function holdsWritten(current: unknown, value: InputWritten): boolean {
  if (typeof value === 'number') return readInputNumber(current) === value
  if (typeof value === 'boolean') return current === value
  return value === '' ? current === '' || current === undefined || current === null : current === value
}

/** The step of a press; `undefined` — the action does not write. `read` reads a path with the data scope of the node. */
export function writeStepOf(action: { readonly type: string; readonly params?: unknown }, read: (path: string) => unknown): WriteStep | undefined {
  if (!isWriteAction(action.type)) return undefined
  const target = writePathOf(action)
  if ('problem' in target) return { kind: 'invalid', problem: target.problem }
  if (action.type === TOGGLE_VALUE_ACTION_TYPE) return { kind: 'write', path: target.path, value: !readInputFlag(read(target.path)) }
  const literal = writtenLiteralOf(action)
  if ('problem' in literal) return { kind: 'invalid', problem: literal.problem }
  return { kind: holdsWritten(read(target.path), literal.value) ? 'same-value' : 'write', path: target.path, value: literal.value }
}

/**
 * What the node is for the person: an option (`setValue` with a non-empty value, chosen when its value
 * lies under the path), a toggle (`toggleValue`, on when `true` lies there) — or `undefined`, a plain
 * button: not a write, an invalid write, or a `setValue` that clears.
 */
export function writeControlOf(action: { readonly type: string; readonly params?: unknown }, read: (path: string) => unknown): WriteControl | undefined {
  if (!isWriteAction(action.type)) return undefined
  const target = writePathOf(action)
  if ('problem' in target) return undefined
  if (action.type === TOGGLE_VALUE_ACTION_TYPE) return { role: 'toggle', path: target.path, on: readInputFlag(read(target.path)) }
  const literal = writtenLiteralOf(action)
  if ('problem' in literal || literal.value === '') return undefined
  return { role: 'option', path: target.path, on: holdsWritten(read(target.path), literal.value) }
}

/** The path an option writes its choice to; `undefined` — the action is not an option. Reads no data. */
export function optionPathOf(action: { readonly type: string; readonly params?: unknown } | undefined): string | undefined {
  if (action?.type !== SET_VALUE_ACTION_TYPE) return undefined
  const target = writePathOf(action)
  const literal = writtenLiteralOf(action)
  return 'problem' in target || 'problem' in literal || literal.value === '' ? undefined : target.path
}

/** The place of an option in its group: the number from one, and how many options the group has. */
export interface ChoicePlace {
  readonly position: number
  readonly size: number
}

/**
 * The place of an option: the group is the SHOWN options among the children of one parent (by the document)
 * that write the same path; nodes between them do not break it; one option has no place.
 * `actionOf` reads the action of a sibling, `isShown` answers "shown" (class of width and condition).
 */
export function choicePlaceIn<Node extends { readonly id: string }>(
  siblings: readonly Node[],
  node: Node,
  actionOf: (node: Node) => { readonly type: string; readonly params?: unknown } | undefined,
  isShown: (node: Node) => boolean,
): ChoicePlace | undefined {
  const path = optionPathOf(actionOf(node))
  if (path === undefined) return undefined
  // By id, not by identity: the reader draws the tree resolved for the class of width.
  const group = siblings.filter((sibling) => optionPathOf(actionOf(sibling)) === path && isShown(sibling))
  const at = group.findIndex((sibling) => sibling.id === node.id)
  return at === -1 || group.length < 2 ? undefined : { position: at + 1, size: group.length }
}

/** The block `x-actions.write` of the artifact, whole (a test compares it). */
export const WRITE_ACTION_RULES = {
  types: {
    set: 'setValue',
    toggle: 'toggleValue',
  },
  executor: 'reader',
  mechanism: 'the-write-of-an-input-x-style.layout.inputs.rules.write',
  to: 'session-of-the-reader-and-the-host-at-the-same-moment',
  gate: 'the-writable-paths-of-the-host-like-every-input',
  refusedPath: 'writes-nothing-to-the-session-and-nothing-to-the-host-reports',
  path: {
    param: 'path',
    is: 'a-literal-of-the-document-never-read-from-data',
    maxLength: 128,
    type: 'exactly-the-value-type-checked-by-the-builder-against-the-data-contract',
  },
  value: {
    param: 'value',
    is: 'a-literal-of-the-document-never-read-from-data',
    typeParam: 'valueType',
    types: ['string', 'boolean', 'number'],
    defaultType: 'string',
    unknownType: 'the-action-is-invalid',
    string: 'as-is-absent-is-the-empty-string',
    boolean: {
      words: ['true', 'false'],
      anythingElse: 'the-action-is-invalid',
    },
    number: {
      parse: 'x-style.layout.form.number.parse',
      publishedPattern: '^(?:0|-?[1-9][0-9]*|-?(?:0|[1-9][0-9]*)\\.[0-9]*[1-9])$',
      publishedForm: 'one-number-one-spelling-no-leading-zeros-no-trailing-zeros-of-the-fraction-no-minus-zero',
      empty: 'writes-the-empty-string-like-a-cleared-number-field',
      notANumber: 'the-action-is-invalid',
    },
    hostValue: 'string-boolean-or-number-the-typed-literal',
  },
  toggle: {
    writes: 'the-negation-of-what-is-shown',
    shown: 'on-only-when-true',
    absent: 'writes-true',
  },
  sameValue: {
    set: 'not-written-again',
    equality: 'by-type-no-conversion-the-empty-string-equals-an-absent-value',
    toggle: 'always-writes',
  },
  reads: 'only-the-current-value-under-its-own-path-with-the-data-scope-of-the-node',
  order: ['track', 'write'],
  track: 'once-per-press-also-when-nothing-is-written',
  host: {
    onWrite: 'path-and-typed-value',
    onAction: 'not-called',
    record: 'not-handed-the-write-carries-no-source',
  },
  after: 'nothing-the-action-does-not-navigate-one-action-per-node',
  disabledControl: 'writes-nothing-no-track',
  invalid: 'writes-nothing-hands-nothing-to-the-host-reports',
  problems: ['missing-path', 'path-too-long', 'unknown-value-type', 'not-a-flag', 'not-a-number'],
  ignoredFields: ['paramBindings', 'carryRecord'],
  insideDataList: {
    document: 'not-published',
    reader: 'writes-as-everywhere-every-instance-writes-the-same-path',
  },
  noData: 'the-same-rule-the-session-is-read',
  olderReader: {
    leaf: 'hands-the-action-to-the-host-as-an-application-action-with-its-params',
    container: 'x-style.layout.composition.pressable.olderReader',
  },
} as const

/** The block `x-choice` of the artifact, whole (a test compares it). */
export const CHOICE_RULES = {
  from: 'any-node-that-performs-a-write-action-on-press-a-button-or-a-pressable-container',
  widget: 'none-the-option-is-a-role-of-a-node-not-a-widget',
  option: {
    is: 'a-node-whose-action-is-setValue-with-a-non-empty-value',
    selected: 'the-value-under-its-path-equals-its-value-x-actions.write.sameValue.equality',
    clearing: 'setValue-with-an-empty-value-is-a-plain-button',
    pressSelected: 'writes-nothing-the-option-cannot-be-unselected-by-pressing-it',
  },
  toggle: {
    is: 'a-node-whose-action-is-toggleValue',
    on: 'the-value-under-its-path-is-true',
  },
  invalidAction: 'a-plain-button-that-writes-nothing',
  state: {
    computedBy: 'the-reader-from-the-action-and-the-data-layers',
    prop: 'none',
    recomputed: 'on-every-write-and-every-change-of-the-data',
    look: 'styleWhen-of-the-node-the-reader-adds-no-look-of-its-own',
  },
  group: {
    is: 'the-shown-options-among-the-children-of-one-parent-that-write-the-same-path',
    node: 'none',
    prop: 'none',
    order: 'document-order',
    nodesBetween: 'do-not-break-the-group',
    hidden: 'not-counted',
    single: 'no-position',
    acrossParents: 'no-group-each-option-keeps-its-state',
    exclusive: 'by-the-data-one-path-holds-one-value',
    sameValueTwice: 'not-published-two-options-of-one-group-with-one-value-would-both-be-selected',
  },
  semantics: {
    option: {
      web: 'role-radio-aria-checked',
      flutter: 'Semantics-inMutuallyExclusiveGroup-checked',
    },
    toggle: {
      web: 'role-button-aria-pressed',
      flutter: 'Semantics-button-toggled',
    },
    position: {
      web: 'aria-posinset-aria-setsize',
      flutter: 'not-promised',
    },
    groupRole: 'none',
    name: 'as-of-a-button-or-a-pressable-container',
    disabled: 'x-style.layout.form.button.semantics',
  },
  keyboard: {
    activate: ['Enter', 'Space'],
    focus: 'every-option-is-a-stop-in-the-document-order',
    arrows: 'not-promised',
    autoRepeat: 'x-actions.keyAutoRepeat',
  },
  form: {
    filled: 'x-style.layout.form.required.filled-asks-the-value-under-the-path-whoever-wrote-it',
    requiredOnOptions: 'none-use-disabledIf-isEmpty-on-the-button',
  },
  multiple: {
    is: 'one-boolean-path-and-one-toggleValue-per-option',
    atLeastOne: 'not-expressible',
    setUnderOnePath: 'none',
  },
  choiceGroup: 'unchanged-rows-with-a-radio-slot',
  writeActionOnChoiceGroupOption: 'not-published-the-press-already-writes-the-choice',
  editor: 'selects-the-node-never-writes',
  olderReader: 'x-actions.write.olderReader',
  cases: 'contract/fixtures/inputs/input-cases.json',
} as const
