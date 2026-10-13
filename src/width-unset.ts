/**
 * The explicit "no" in a layer of width (schema 9.19.0): the key `unset` of `styleOn` and `propsOn`.
 *
 *   styleOn: { expanded: { padding: 'xl' }, unset: { expanded: ['background', 'maxWidth'] } }
 *
 * — "on the wide class these fields are ABSENT". The layers of 9.18.0 only lay on; a key a layer does not name
 * stays what it is below, so there was no way to say "no background on the wide one". The order is part of
 * the rule: for each layer that acts on the class, from the narrow one, the fields named in `unset` of that
 * layer are removed first, then the layer itself is laid on. What is removed on `medium` stays removed on
 * `expanded` until that layer names the field again. A state (`styleWhen`) lies on top and may name it.
 *
 * "Removed" means "no field": the node is drawn as it would be without it. The reader is tolerant: a wrapper or
 * a list of the wrong form removes nothing; a non-string in the list and a name the reader does not know are
 * skipped. In properties the list is closed and short — only a property that has no word "as without the
 * field" (today `Screen: contentMaxWidth`). Rules: the artifact block `x-style.layout.widthUnset`, mirrored whole.
 */
import { isRecord } from './sanitize'
import type { OverrideWidthClass } from './width-class'

/** The key of the wrapper `styleOn` / `propsOn` under which the lists of the removed fields lie. */
export const UNSET_KEY = 'unset'

/** The properties a layer can REMOVE, by widget; the rest of the overridable ones have a word "as without the field". */
const UNSETTABLE_PROPS: Readonly<Record<string, readonly string[]>> = { Screen: ['contentMaxWidth'] }

const NO_KEYS: readonly string[] = []

/** Which properties of this type a layer can remove. */
export function unsettablePropsOf(type: string): readonly string[] {
  return Object.hasOwn(UNSETTABLE_PROPS, type) ? (UNSETTABLE_PROPS[type] ?? NO_KEYS) : NO_KEYS
}

/**
 * The names `unset` gives for a layer, as the READER reads them: a wrapper or a list of the wrong form — nothing
 * removed; a non-string in the list is skipped. `carrier` is the value of the field `styleOn` or `propsOn` of the node.
 */
export function unsetKeysOf(carrier: unknown, layer: OverrideWidthClass): readonly string[] {
  if (!isRecord(carrier) || !Object.hasOwn(carrier, UNSET_KEY)) return NO_KEYS
  const all = carrier[UNSET_KEY]
  if (!isRecord(all) || !Object.hasOwn(all, layer)) return NO_KEYS
  const list = all[layer]
  return Array.isArray(list) ? (list as readonly unknown[]).filter((entry): entry is string => typeof entry === 'string') : NO_KEYS
}

/**
 * The record without the named keys. Nothing removed — the SAME object; everything removed — `undefined`, as
 * for a node without a style. `allowed` narrows the names that count (the closed list of properties).
 */
export function withoutUnset<T extends object>(record: T | undefined, keys: readonly string[], allowed?: readonly string[]): T | undefined {
  if (record === undefined || keys.length === 0) return record
  const dropped = keys.filter((key) => Object.hasOwn(record, key) && (allowed === undefined || allowed.includes(key)))
  if (dropped.length === 0) return record
  const kept = Object.fromEntries(Object.entries(record).filter(([key]) => !dropped.includes(key)))
  return Object.keys(kept).length === 0 ? undefined : (kept as T)
}

/** The block `x-style.layout.widthUnset` of the artifact, whole (a test compares it). */
export const WIDTH_UNSET_LAYOUT = {
  prop: 'unset',
  in: ['styleOn', 'propsOn'],
  shape: 'a-list-of-field-names-per-wider-class',
  order: ['remove-the-fields-named-for-the-class', 'then-lay-the-layer-of-the-class'],
  cascade: 'removed-on-medium-stays-removed-on-expanded-until-named-again',
  removedMeans: 'no-field-what-the-node-has-without-it',
  styleWhen: 'laid-on-top-may-name-a-removed-field',
  style: 'any-field-of-the-style-of-the-node',
  props: {
    byWidget: [
      {
        type: 'Screen',
        props: ['contentMaxWidth'],
      },
    ],
    others: 'say-it-with-the-explicit-value',
  },
  fieldNotSetBelow: 'nothing-to-remove-not-an-error',
  namedAndRemovedInOneLayer: {
    document: 'not-published',
    reader: 'the-named-value-wins',
  },
  malformed: 'nothing-is-removed',
  unknownName: 'skipped',
  nullInAPropsLayer: 'still-does-not-override',
  olderReader: 'ignores-the-key-the-field-keeps-the-value-from-below',
  cases: 'contract/fixtures/adaptive/adaptive-cases.json',
} as const
