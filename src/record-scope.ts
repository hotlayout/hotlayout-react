/**
 * Row record scope and data layers (schema 9.2.0): a mirror of the contract reference
 * implementation (the package imports nothing from the contract repository). Both files are checked against
 * one case table, `contract/fixtures/scope/record-scope-cases.json`.
 *
 * The rule in four statements:
 *
 * 1. A node's record scope is the record the screen was opened with, and over it the records of
 *    the `Repeater` instances the node is drawn in (`overlayRecord`).
 * 2. An action carries its node's record scope: the host receives it in `source.record`, and
 *    `navigate` opens the screen with a record per `recordForOpenedScreen`. From a list row the
 *    screen gets the node's record scope; a page opened not from a row has no record, and a
 *    modal layer sees the record of the screen beneath it.
 * 3. A record lives as long as the screen is in the stack.
 * 4. Layer order is `DATA_LAYER_ORDER`: record, session, host scope, data. In this package the
 *    HOST holds the session and its own scope, all of it in the `data` prop; so there are two
 *    layers here: the record over `data`.
 *
 * `null` and a missing key both mean "no value": the next layer is consulted.
 *
 * ZERO IMPORTS.
 */

/** A flat "path to value" map: `{ 'item.id': 'bottle', 'item.name': 'Bottle' }`. */
export type RecordScope = Readonly<Record<string, unknown>>

/** A screen's data layers, strongest first. Published in the artifact as `x-dataScope.layers`. */
export const DATA_LAYER_ORDER = ['record', 'session', 'host', 'data'] as const

export type DataLayerName = (typeof DATA_LAYER_ORDER)[number]

/**
 * What a node's record scope is built from, weaker to stronger.
 * Published in the artifact as `x-dataScope.recordSources`.
 */
export const RECORD_SOURCES = ['opened-screen', 'repeater-instance'] as const

/**
 * The layers of one screen.
 *
 *  - `record`  is the record scope (the record the screen was opened with, and the instances);
 *  - `session` is what the person wrote into a bound field during the run;
 *  - `host`    is an entity the host supplied to this screen itself;
 *  - `data`    is the document's data, shared by all screens.
 *
 * A reader whose host keeps the session and its own scope together with the data (as in
 * `@hotlayout/react`, where all of it is the `data` prop) simply has no middle layers; the order
 * does not change.
 */
export type DataLayers = Readonly<Partial<Record<DataLayerName, RecordScope | undefined>>>

/** "No value": the key is missing or holds `null`. The same "absent" as in conditions. */
export function isAbsent(value: unknown): value is null | undefined {
  return value === undefined || value === null
}

/** An own key of the flat map: the document names the path, and `constructor` is not a value. */
function own(scope: RecordScope | undefined, path: string): unknown {
  return scope !== undefined && Object.hasOwn(scope, path) ? scope[path] : undefined
}

/**
 * The value at a path and the layer that supplied it; `undefined` when no layer has it (then the
 * binding's `fallback` and the condition's `missingConditionValue` apply).
 */
export function readLayered(layers: DataLayers, path: string): { readonly layer: DataLayerName; readonly value: unknown } | undefined {
  for (const layer of DATA_LAYER_ORDER) {
    const value = own(layers[layer], path)
    if (!isAbsent(value)) return { layer, value }
  }
  return undefined
}

/**
 * All layers as one flat map, for a reader that draws from a single scope. It equals
 * `readLayered` for every path: an absent value in a stronger layer does not shadow a weaker one.
 */
export function mergeLayers(layers: DataLayers): RecordScope {
  const merged: Record<string, unknown> = {}
  for (let index = DATA_LAYER_ORDER.length - 1; index >= 0; index -= 1) {
    const name = DATA_LAYER_ORDER[index]
    const layer = name === undefined ? undefined : layers[name]
    if (layer === undefined) continue
    for (const path of Object.keys(layer)) {
      const value = layer[path]
      if (!isAbsent(value)) merged[path] = value
    }
  }
  return merged
}

/**
 * A collection record under entity paths: the `name` field of an `item` record is `item.name`. A
 * field already named by a full path stays as is. The prefix is named by `Repeater.item` (the data
 * dictionary); it is not guessed from the collection name.
 */
export function instanceRecord(itemPrefix: string, fields: Readonly<Record<string, unknown>>): RecordScope {
  const record: Record<string, unknown> = {}
  for (const field of Object.keys(fields)) {
    const value = fields[field]
    if (isAbsent(value)) continue
    record[field.startsWith(`${itemPrefix}.`) ? field : `${itemPrefix}.${field}`] = value
  }
  return record
}

/**
 * A record over a record: an inner instance is stronger than an outer one, which is stronger than
 * the record the screen was opened with. An absent value shadows nothing. `undefined` means there
 * is no record at all (not an "empty record").
 */
export function overlayRecord<Outer extends RecordScope, Inner extends RecordScope>(outer: Outer | undefined, inner: Inner | undefined): (Outer & Inner) | Outer | Inner | undefined {
  if (inner === undefined) return outer
  if (outer === undefined) return inner
  const merged: Record<string, unknown> = { ...outer }
  for (const path of Object.keys(inner)) {
    const value = inner[path]
    if (!isAbsent(value)) merged[path] = value
  }
  return merged as Outer & Inner
}

/** How the target screen of a navigation is presented. */
export type OpenedPresentation = 'page' | 'modal'

export interface OpenedScreenInput<Scope extends RecordScope> {
  /** The record scope of the node on which `navigate` was invoked. */
  readonly nodeRecord: Scope | undefined
  /** Whether this node is drawn inside a `Repeater` instance. */
  readonly insideListItem: boolean
  /** The target screen's presentation mode (`ScreenEntry.presentation`; `page` without the field). */
  readonly presentation: OpenedPresentation
  /**
   * The action's explicit word (since 9.8.0, `ButtonAction.carryRecord`): carry the record to a
   * PAGE not opened from a row as well. Without it the 9.2.0 rule applies.
   */
  readonly carryRecord?: boolean | undefined
}

/**
 * The record a `navigate` target screen is opened with.
 *
 *  - from a list row: the node's record scope;
 *  - not from a row, a modal layer: the record of the screen beneath it (which is the node's
 *    record scope, since outside a list it equals the screen's record);
 *  - not from a row, a page: no record.
 */
export function recordForOpenedScreen<Scope extends RecordScope>(input: OpenedScreenInput<Scope>): Scope | undefined {
  if (input.insideListItem || input.presentation === 'modal' || input.carryRecord === true) return input.nodeRecord
  return undefined
}
