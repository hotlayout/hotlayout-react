/**
 * Guards for raw input: what the reader checks BEFORE parsing a document and a theme.
 *
 * A mirror of the contract's guards. They are not part of the schema (they do not reach the
 * artifact, except `propertyNames.pattern`, which ajv reads by itself) but a trust boundary:
 * the document and the theme come from the network, and a reader that draws "as much as
 * fits" puts itself in the hands of whoever composed them.
 *
 * Two limits:
 *
 *  - DEPTH. A node tree deeper than 32 levels (`MAX_PARSE_DEPTH`; the legal maximum is five)
 *    is rejected with an ordinary refusal, not `RangeError: Maximum call stack size exceeded`
 *    in the middle of a render. Depth is measured ITERATIVELY and BEFORE any recursion: a
 *    recursive measurement would crash on the very document it exists to defend against;
 *  - an OWN `__proto__` KEY in open maps (`themes`, `action.params`, `entryPoints`,
 *    translations, the six theme dictionaries). `JSON.parse` makes it an ORDINARY own key, while
 *    `Object.assign` or an indexed assignment would turn it into a prototype replacement. The
 *    schema rejects such a key (`propertyNames.pattern: "^(?!__proto__$)"`), so a VALIDATOR
 *    refuses the whole document. A reader that draws without validating rejects only the
 *    ENTRY (`protoKeyWithoutValidation: 'drop-entry'`): the key does not enter the map and the
 *    rest of the screen is drawn. One corrupted action parameter is not worth an empty screen,
 *    and in readers where `__proto__` is an ordinary map key (Dart) no other answer would be
 *    the same everywhere.
 */
import type { UiNode } from './types'

/** Depth limit of the node tree when parsing, a mirror of the contract's `MAX_PARSE_DEPTH`. */
export const MAX_PARSE_DEPTH = 32

/** The same limit in the depth where the root is 1 (as the walk counts): 32 levels UNDER the root (`x-style.layout.composition.depth.readerParseLimit`) is 33. */
export const MAX_TREE_DEPTH = MAX_PARSE_DEPTH + 1

/** A key an open map cannot have: the schema rejects it through `propertyNames.pattern`. */
export const FORBIDDEN_KEY = '__proto__'

export type GuardVerdict = { readonly kind: 'ok' } | { readonly kind: 'rejected'; readonly reason: 'max_depth_exceeded' }

/** Depth of the node tree: the root is 1. Iterative, no recursion. */
export function treeDepth(root: UiNode): number {
  let deepest = 0
  const pending: { node: UiNode; depth: number }[] = [{ node: root, depth: 1 }]
  while (pending.length > 0) {
    const item = pending.pop()
    if (item === undefined) break
    deepest = Math.max(deepest, item.depth)
    // The limit is exceeded; nothing more to count, and the walk need not reach the bottom.
    if (deepest > MAX_TREE_DEPTH) return deepest
    for (const child of item.node.children ?? []) pending.push({ node: child, depth: item.depth + 1 })
  }
  return deepest
}

/** Whether an object at any nesting depth has an OWN `__proto__` key (iterative). */
export function hasForbiddenKey(value: unknown): boolean {
  const pending: unknown[] = [value]
  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current !== 'object' || current === null) continue
    if (!Array.isArray(current) && Object.hasOwn(current, FORBIDDEN_KEY)) return true
    for (const item of Object.values(current as Record<string, unknown>)) pending.push(item)
  }
  return false
}

/**
 * The same input WITHOUT own `__proto__` keys at any depth
 * (`protoKeyWithoutValidation: 'drop-entry'`). An input that has no such key is returned as
 * THE SAME object: no copy for the sake of copying.
 *
 * The copy is built iteratively and in a way that never assigns the key: the new objects are
 * literals into which `__proto__` is never written.
 */
export function withoutForbiddenKeys<T>(value: T): T {
  if (!hasForbiddenKey(value)) return value

  const copyOf = (source: object): object => (Array.isArray(source) ? [] : {})
  const root = copyOf(value as object)
  const pending: { from: object; to: object }[] = [{ from: value as object, to: root }]
  while (pending.length > 0) {
    const item = pending.pop()
    if (item === undefined) break
    for (const [key, entry] of Object.entries(item.from)) {
      // An entry with a forbidden key is dropped together with whatever it holds.
      if (!Array.isArray(item.from) && key === FORBIDDEN_KEY) continue
      if (typeof entry !== 'object' || entry === null) {
        ;(item.to as Record<string, unknown>)[key] = entry
        continue
      }
      const child = copyOf(entry as object)
      ;(item.to as Record<string, unknown>)[key] = child
      pending.push({ from: entry as object, to: child })
    }
  }
  return root as T
}

/** Check of the screen root before render: only excessive depth refuses. */
export function guardRoot(root: UiNode): GuardVerdict {
  if (treeDepth(root) > MAX_TREE_DEPTH) return { kind: 'rejected', reason: 'max_depth_exceeded' }
  return { kind: 'ok' }
}
