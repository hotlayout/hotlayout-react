/**
 * Conditions: one shape, one check.
 *
 * `visibleIf` and `styleWhen[].when` share the same structure, so there is a single function
 * for both. That guarantees visibility and style states never drift apart in interpretation.
 */
import type { DataScope } from './data'
import { valueAt } from './data'
import { isRecord } from './sanitize'
import type { VisibilityCondition } from './types'

/**
 * Operators THIS reader knows.
 *
 * The list is not for speed: it answers "do I understand this condition at all" BEFORE the data
 * is looked at. Without it an unknown operator and a missing value would both land in `default`,
 * and whichever rule happened to be written first in the code would win, so order would decide
 * the outcome instead of the contract.
 */
const KNOWN_OPS: ReadonlySet<string> = new Set([
  'isTrue',
  'isFalse',
  'isEmpty',
  'isNotEmpty',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
])

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  return false
}

/**
 * Text of a value. An object here is broken data, not emptiness, so it stays a non-empty
 * string: an "is not empty" condition on such a field must hold, otherwise a backend error would
 * look like a missing value.
 */
function asText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return '[object]'
}

function equals(left: unknown, right: unknown): boolean {
  // Comparison without type coercion: the contract guarantees the operand has the path's type,
  // and loose coercion would make `0 == false` true.
  if (typeof left === typeof right) return left === right
  // A date in the contract is an ISO string, so text comparison is legitimate here.
  return asText(left) === asText(right)
}

/**
 * Number for order comparison. An empty string (or only whitespace) is NOT a number: `Number('')`
 * is zero, and the number field (9.14.0) writes an empty string when cleared, so a cleared age
 * must not satisfy `lt 16`. An empty string under a number path never satisfies order
 * conditions.
 */
function comparable(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() === '') return Number.NaN
  return Number(value)
}

function compare(left: unknown, right: unknown, op: 'gt' | 'gte' | 'lt' | 'lte'): boolean {
  const a = comparable(left)
  const b = comparable(right)
  if (Number.isNaN(a) || Number.isNaN(b)) return false

  switch (op) {
    case 'gt':
      return a > b
    case 'gte':
      return a >= b
    case 'lt':
      return a < b
    case 'lte':
      return a <= b
  }
}

/**
 * Whether the condition holds on this data.
 *
 * Unknown operator -> `true`, i.e. the node is VISIBLE. This is a contract rule, not
 * leniency: hiding content because of an operator THIS reader does not know would silently eat
 * part of the screen. An extra visible block is noticed at once; a vanished one never is.
 *
 * A MISSING VALUE (8.18.0) is checked FIRST, before the operator is chosen, and that is not a
 * micro-optimization. Without an explicit branch the answer would be accidental:
 * `asText(undefined)` is an empty string (so `isEmpty` would hold on its own), and
 * `asBoolean(undefined)` is `false` (so `isFalse` would hold too), though the contract promises
 * neither.
 */
export function isConditionMet(input: VisibilityCondition, scope: DataScope): boolean {
  // A condition from the network that is not an object or has no path means "no condition": the node is visible.
  const raw: unknown = input
  if (!isRecord(raw) || typeof raw.path !== 'string' || typeof raw.op !== 'string') return true
  const condition = input
  const value = valueAt(scope, condition.path)

  /*
   * ORDER OF TWO POLICY RULES, and it is this order, not the reverse.
   *
   * `unknownVisibilityOp: 'visible'` is STRONGER than `missingConditionValue` because it speaks
   * about a different kind of ignorance. A missing value means "I know the question but have no
   * answer"; an unknown operator means "I do not even know the question", so I cannot judge
   * whether absence answers it. Hiding the node in that case would eat part of the screen
   * because of the reader's own ignorance.
   *
   * The order is not theoretical: without it a document of a NEWER schema arriving on a screen
   * with no data would hide nodes, exactly where both uncertainties meet, which is the most
   * likely place to meet them.
   */
  if (!KNOWN_OPS.has(condition.op)) return true

  // A missing value counts as EMPTY: `isEmpty` holds, the rest do not.
  // Contract rule `x-compatibility.policy.missingConditionValue`.
  if (value === undefined || value === null) return condition.op === 'isEmpty'

  switch (condition.op) {
    case 'isTrue':
      return asBoolean(value)
    case 'isFalse':
      return !asBoolean(value)
    /*
     * A COLLECTION is checked by length, not as text. Without this branch `asText([])` would be
     * `'[object]'`, so an empty list would NOT count as empty and the "nothing yet" message
     * would not appear exactly when it is needed. It is the same mistake as with a missing
     * value, one step further: the data arrived but is empty.
     */
    case 'isEmpty':
      return Array.isArray(value) ? value.length === 0 : asText(value).length === 0
    case 'isNotEmpty':
      return Array.isArray(value) ? value.length > 0 : asText(value).length > 0
    case 'eq':
      return equals(value, condition.value)
    case 'neq':
      return !equals(value, condition.value)
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return compare(value, condition.value, condition.op)
    default:
      return true
  }
}

/**
 * Whether the `disabledIf` condition holds (9.13.0, `rules.disabled`): the same shape and rules
 * as `visibleIf`, with one difference: a condition that cannot be understood (not an object, no
 * path, unknown operator) does NOT disable the field (`unknownDisabledOp: 'enabled'`), whereas
 * `visibleIf` says "visible" in that case. A missing value works as in `visibleIf`
 * (`missingDisabledValue`).
 */
export function isDisabledBy(condition: unknown, scope: DataScope): boolean {
  if (!isRecord(condition) || typeof condition.path !== 'string' || typeof condition.op !== 'string' || !KNOWN_OPS.has(condition.op)) return false
  return isConditionMet(condition as unknown as VisibilityCondition, scope)
}

/** Whether to show the node. No condition means show. */
export function isNodeVisible(condition: VisibilityCondition | null | undefined, scope: DataScope): boolean {
  return condition === undefined || condition === null || isConditionMet(condition, scope)
}

/** The block `x-conditions` of the artifact, whole (a test compares it): which operator is legal on which type of path, and what "empty" means. */
export const CONDITION_RULES = {
  opPathTypes: {
    isTrue: ['boolean'],
    isFalse: ['boolean'],
    isEmpty: ['string', 'date', 'number', 'boolean'],
    isNotEmpty: ['string', 'date', 'number', 'boolean'],
    eq: ['string', 'number', 'boolean', 'date'],
    neq: ['string', 'number', 'boolean', 'date'],
    gt: ['number'],
    gte: ['number'],
    lt: ['number'],
    lte: ['number'],
  },
  collectionOps: ['isEmpty', 'isNotEmpty'],
  emptiness: {
    ops: ['isEmpty', 'isNotEmpty'],
    pathTypes: 'any',
    judged: 'the-value-under-the-path-not-the-type-of-the-path',
    empty: ['absent', 'null', 'the-empty-string', 'a-list-without-records'],
    notEmpty: {
      number: 'any-number-zero-too',
      boolean: 'any-flag-false-too',
      string: 'any-non-empty-string-a-string-of-spaces-too-the-value-is-not-trimmed',
      list: 'a-list-with-a-record',
    },
    clearedNumberField: 'writes-the-empty-string-so-it-is-empty',
    absent: 'x-compatibility.policy.missingConditionValue',
  },
  cases: 'contract/fixtures/inputs/input-cases.json',
} as const
