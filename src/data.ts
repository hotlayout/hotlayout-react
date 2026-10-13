/**
 * Data: reading by path, data bindings and the row record scope.
 *
 * The most delicate part of the reader is here, and it is not `Repeater` itself but what it does
 * to data paths inside it.
 */
import { directionOf } from './direction'
import { boundValuePieces } from './money'
import type { FormattedPiece } from './money'
import { instanceRecord, overlayRecord } from './record-scope'
import { isRecord } from './sanitize'
import type { BindableString } from './types'

export { formatBound } from './binding-format'

/**
 * Values available to a screen (see `DataScope`): a flat "path to value" map.
 *
 * Flat on purpose. A path in the contract is a STRING (`task.title`), not a walk through nested
 * objects, and the data dictionary lists exactly such strings. Splitting a path into segments
 * would raise questions the contract does not answer: what a dot in a field name means, whether
 * an array can occur mid-path.
 */
export type DataScope = Readonly<Record<string, unknown>>

/**
 * Row record scope: what `Repeater` LAYERS over the outer data.
 *
 * It layers rather than replaces, which is the point. Inside a list of tasks `task.*` means the
 * current record, but `user.points` still means the user's points: the user did not change
 * because a list is being drawn. Replacement would look equally simple and be silently wrong.
 *
 * Since 9.2.0 a record's absent value (`null`) does NOT shadow the outer one: it is the same
 * "absent" as in conditions and in the other layers (`record-scope.ts`).
 */
export function withItemScope(outer: DataScope, item: DataScope): DataScope {
  return overlayRecord(outer, item) ?? outer
}

/**
 * A collection record under its entity prefix.
 *
 * The `tasks` collection yields `task` records, so a record's `title` field becomes the path
 * `task.title`. The prefix is named by the data dictionary itself. It must not be guessed from
 * the collection name (dropping the "s"): the next project may have a collection called `orders`
 * with `order` records, and sooner or later such a guess is wrong.
 */
export function itemScope(itemPrefix: string, record: Readonly<Record<string, unknown>>): DataScope {
  // A collection record comes from the host's backend: a non-object is a record without fields.
  const raw: unknown = record
  // The dictionary may list fields by full path or by short name; the rule is in `instanceRecord`.
  return isRecord(raw) ? instanceRecord(itemPrefix, raw) : {}
}

/**
 * A screen's data scope: the record it was opened with, layered over the host's data.
 *
 * The record is the strongest layer (`DATA_LAYER_ORDER`): tap the "Bottle" row and the detail
 * screen is about the bottle, whatever lies under the same paths in `data`. A path the record
 * does not carry (`user.points`) is read from the data as usual.
 */
export function withScreenRecord(data: DataScope, record: DataScope | undefined): DataScope {
  return overlayRecord(data, record) ?? data
}

/**
 * The value at a path: an OWN key of the flat map, not the prototype chain.
 *
 * The document names the path: `scope['constructor']` would yield the `Object` function, and an
 * `isNotEmpty` condition on such a path would hold with no data at all. A missing key gives
 * `undefined`, i.e. "no data" (`missingConditionValue: 'absent-is-empty'`).
 */
export function valueAt(scope: DataScope, path: unknown): unknown {
  // The host supplies the data: `null` or a non-object in its place means there is no data.
  const data: unknown = scope
  if (typeof path !== 'string' || !isRecord(data)) return undefined
  return Object.hasOwn(data, path) ? data[path] : undefined
}

/**
 * Collections in a screen's data scope.
 *
 * A condition on a collection path (`{ path: 'tasks', op: 'isEmpty' }`, the empty state of a
 * list) must see the collection itself. In the contract a screen's data is one map in which a
 * collection is a list under its own name, while this package's host passes it as the separate
 * `collections` prop. So collections are layered UNDER the data: a path missing from `data` is
 * looked up among the collections. A missing collection is a missing value, i.e. empty
 * (`absentCollection: 'empty'`).
 *
 * `data` is stronger: a value the host placed under the same path itself is not replaced.
 */
export function withCollections(data: DataScope, collections: unknown): DataScope {
  const base: unknown = data
  const own: DataScope = isRecord(base) ? base : {}
  if (!isRecord(collections)) return own
  const scope: Record<string, unknown> = {}
  for (const [name, records] of Object.entries(collections)) if (Array.isArray(records)) scope[name] = records
  return Object.keys(scope).length === 0 ? own : { ...scope, ...own }
}

/**
 * The text of a bindable field.
 *
 * `fallback` is NOT an emergency variant but what is drawn while there is no data: in an
 * editor preview, in a skeleton, when offline. The author saw this text while composing the
 * screen, so a blank in its place would read as a broken screen rather than as "data has not
 * arrived yet".
 */
export function readBindable(value: BindableString | undefined, scope: DataScope, locale?: string, timeZone?: string, fallbackLocale?: string, now?: number): string {
  if (value === undefined) return ''
  // A literal and a fallback text are strings by schema; an object in their place means no field
  // (React throws on an object used as text and would take down the whole host tree).
  if (value.kind === 'literal') return asText(value.value)
  // A template (since 9.4.0) never arrives here: `templateText` reads it, and a string with a length limit cannot be a template.
  if (value.kind !== 'binding') return ''
  return boundText(value, { scope, formattingLocale: locale, fallbackLocale, timeZone, now })
}

/** What turns a data value into text: the data, the formatting locale, the time zone and "now". */
export interface TextEnvironment {
  readonly scope: DataScope
  /** Formatting locale (`formatting` from `resolveLocale`); `undefined` means the device language. */
  readonly formattingLocale: string | undefined
  /** Language of the shown text, used when the engine rejects the formatting locale. */
  readonly fallbackLocale?: string | undefined
  readonly timeZone?: string | undefined
  /** "Now" in epoch milliseconds, for `daysUntil`. Without it the format is not applied. */
  readonly now?: number | undefined
  /** Direction of the SHOWN text (since 9.19.0, amount isolation); without it, derived from `fallbackLocale`. */
  readonly direction?: 'ltr' | 'rtl' | undefined
}

/**
 * The text of ONE binding: the rule shared by a standalone string and a template value (since
 * 9.4.0).
 *
 * No data (`undefined`, `null`), or a value at the path that is not a string, number or boolean,
 * gives the fallback text, which is NOT formatted: it is text typed by a person. An object at the
 * path means the backend returned the wrong thing, and "[object Object]" on screen would be a
 * worse answer. If the format applied, the formatted value is shown; otherwise the value AS IS
 * (`unknownBindingFormat`, `unparsableBoundValue`, `missingCurrencyCode`): a number as its
 * shortest decimal form, without separators, an integer without a fractional part.
 *
 * An empty string in the data means "no value" for TEXT (`emptyBoundString: 'use-fallback'`): the
 * fallback is shown, under any format. A whitespace-only string is a value and is not trimmed;
 * `0` and `false` are values. This does NOT change layer order (`absentInDataLayer`): an empty
 * field of a row record still shadows the same field in host data (`record-scope.ts`) and yields
 * to the fallback only here, at display time.
 */
export function boundText(binding: unknown, environment: TextEnvironment): string {
  return boundPieces(binding, environment)
    .map((piece) => piece.text)
    .join('')
}

/**
 * The same text as PIECES (since 9.19.0): a number or amount that was formatted gives several
 * pieces of one place (sign and integer part, fraction, currency); the rest (fallback text, a
 * value as is, a date) gives one piece without a part. The pieces joined together are exactly
 * `boundText`.
 */
export function boundPieces(binding: unknown, environment: TextEnvironment): readonly FormattedPiece[] {
  if (!isRecord(binding)) return []
  const fallback = asText(binding.fallback)
  const raw = valueAt(environment.scope, binding.path)
  if (raw === undefined || raw === null || raw === '') return [{ text: fallback }]
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') return [{ text: fallback }]
  const formatted = boundValuePieces(raw, binding, {
    locale: environment.formattingLocale,
    fallbackLocale: environment.fallbackLocale,
    timeZone: environment.timeZone,
    now: environment.now,
    direction: environment.direction ?? directionOf(environment.fallbackLocale),
  })
  return formatted ?? [{ text: String(raw) }]
}

/** The text of a document field: a string as is, a number or boolean as its written form, anything else empty. */
export function asText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** The same for a number: progress, points, counters. */
export function readBindableNumber(value: unknown, scope: DataScope): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'object' || value === null) return undefined

  const binding = value as { kind?: string; path?: string; fallback?: unknown; value?: unknown }
  if (binding.kind === 'literal' && typeof binding.value === 'number') return Number.isFinite(binding.value) ? binding.value : undefined
  if (binding.kind !== 'binding' || typeof binding.path !== 'string') return undefined

  const resolved = valueAt(scope, binding.path)
  if (typeof resolved === 'number' && Number.isFinite(resolved)) return resolved
  return typeof binding.fallback === 'number' && Number.isFinite(binding.fallback) ? binding.fallback : undefined
}
