/**
 * Tree shape: a document from the network becomes a tree that is safe to walk.
 *
 * The reader does not validate a document against the schema, so anything can lie where a node
 * should be: `null`, a number, a node without `props`, a `children` object, a state without a
 * condition. Each of these is legal JSON, and without this file each would throw in the middle of
 * rendering, and an exception during render takes down the host app's WHOLE React tree.
 *
 * Here the tree is brought into the shape the render modules rely on:
 *
 *  - a node is an object with string `id` and `type` and an object `props`; whatever is not a
 *    node is DROPPED together with its subtree;
 *  - `children` is an array of nodes; if it is not an array, there are no children;
 *  - `visibleIf` is a condition with a path and an operator, or nothing (the node is visible, the
 *    same as with an operator the reader does not know, `unknownVisibilityOp`);
 *  - `style` is an object or nothing; `styleWhen` is an array of states with a condition;
 *  - a node without `type` is drawn as an unknown widget, i.e. its children are drawn
 *    (`unknownWidget: 'render-children'`).
 *
 * Values inside `props` and `style` are NOT checked here: whoever turns them into CSS checks
 * them (`sanitize.ts`) at the moment of use. The exception is own colours: a rejected colour is
 * silently "not applied", so the report about it comes from here (the tree walk is already
 * under way).
 *
 * The walk is ITERATIVE and has a depth limit (`MAX_TREE_DEPTH`): a recursive one would crash on
 * the very document it is meant to guard against.
 */
import { MAX_TREE_DEPTH } from './guards'
import { isRecord, safeColor } from './sanitize'
import type { UiNode } from './types'

/** What the reader ignored in the input, and why. */
export interface InputIssue {
  /** Where: `node “hero”: style.color`, `screen “main”`, `onWrite path`. */
  readonly where: string
  readonly reason: string
}

export type IssueSink = (issue: InputIssue) => void

export type ShapedRoot = { readonly kind: 'ok'; readonly root: UiNode } | { readonly kind: 'rejected'; readonly reason: 'max_depth_exceeded' | 'not_a_node' }

function isCondition(value: unknown): boolean {
  return isRecord(value) && typeof value.path === 'string' && typeof value.op === 'string'
}

/** Own colours (`{ value }`) in a style subtree that are not colours. The walk is shallow: a style is not a node tree. */
function lintColors(value: unknown, where: string, report: IssueSink, depth = 0): void {
  if (depth > 6 || typeof value !== 'object' || value === null) return
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 32) as readonly unknown[]) lintColors(item, where, report, depth + 1)
    return
  }
  const record = value as Readonly<Record<string, unknown>>
  // An own colour is an object with `value` and without `kind` (with `kind` it is a text or an image source).
  if (Object.hasOwn(record, 'value') && !Object.hasOwn(record, 'kind') && safeColor(record.value) === undefined) {
    report({ where, reason: 'a custom colour must be #rrggbb or #rrggbbaa; the value was ignored' })
    return
  }
  for (const key of Object.keys(record).slice(0, 32)) lintColors(record[key], where, report, depth + 1)
}

function shapeOne(raw: unknown, fallbackId: string, report: IssueSink): { readonly node: UiNode & { children?: UiNode[] }; readonly children: readonly unknown[] } | undefined {
  if (!isRecord(raw)) {
    report({ where: `node at ${fallbackId}`, reason: 'not an object; the node was dropped' })
    return undefined
  }
  const id = typeof raw.id === 'string' && raw.id !== '' ? raw.id : fallbackId
  const where = `node “${id.slice(0, 64)}”`
  const node: Record<string, unknown> = { id, type: typeof raw.type === 'string' ? raw.type : '' }
  if (typeof raw.type !== 'string') report({ where, reason: 'no widget type; only its children are drawn' })

  if (isRecord(raw.props)) node.props = raw.props
  else {
    node.props = {}
    report({ where, reason: 'props is not an object; the widget is drawn with field defaults' })
  }

  if (raw.visibleIf !== undefined) {
    if (isCondition(raw.visibleIf)) node.visibleIf = raw.visibleIf
    else report({ where: `${where}: visibleIf`, reason: 'not a condition; the node stays visible' })
  }

  if (raw.style !== undefined) {
    if (isRecord(raw.style)) {
      node.style = raw.style
      lintColors(raw.style, `${where}: style`, report)
    } else report({ where: `${where}: style`, reason: 'not an object; ignored' })
  }

  if (raw.styleWhen !== undefined) {
    if (Array.isArray(raw.styleWhen)) {
      const cases = (raw.styleWhen as readonly unknown[]).filter((entry) => isRecord(entry) && isCondition(entry.when))
      if (cases.length !== raw.styleWhen.length) report({ where: `${where}: styleWhen`, reason: 'a state without a condition was dropped' })
      node.styleWhen = cases.map((entry) => {
        const state = entry as Readonly<Record<string, unknown>>
        if (isRecord(state.style)) lintColors(state.style, `${where}: styleWhen`, report)
        return { when: state.when, style: isRecord(state.style) ? state.style : {} }
      })
    } else report({ where: `${where}: styleWhen`, reason: 'not a list; ignored' })
  }

  // Since 9.18.0: width class. The fields arrive from the network as they are; only `width-class.ts` reads a layer's shape, and anything of the wrong shape is skipped.
  if (raw.showOn !== undefined) node.showOn = raw.showOn
  if (raw.styleOn !== undefined) {
    node.styleOn = raw.styleOn
    if (isRecord(raw.styleOn)) for (const layer of ['medium', 'expanded']) if (Object.hasOwn(raw.styleOn, layer)) lintColors(raw.styleOn[layer], `${where}: styleOn.${layer}`, report)
  }
  if (raw.propsOn !== undefined) node.propsOn = raw.propsOn
  if (raw.fill === true) node.fill = true
  if (raw.weight !== undefined) node.weight = raw.weight
  // Since 9.10.0: a layer's place and the pull arrive as they are; only `layer-placement.ts` reads the values.
  if (raw.layer !== undefined) node.layer = raw.layer
  if (raw.pull !== undefined) node.pull = raw.pull
  // Since 9.12.0: pinning to the bottom arrives as it is; only `bottom-zone.ts` reads the value.
  if (raw.pin !== undefined) node.pin = raw.pin
  // Since 9.20.0: the motion arrives as it is; only `motion.ts` (`readMotion`) reads the value, and a form it does not know means the node stands still.
  if (raw.motion !== undefined) node.motion = raw.motion
  // Since 9.21.0: the look of the app bar after scrolling arrives as it is; only `app-bar-scrolled.ts` reads it and takes the four fields it knows.
  if (raw.styleScrolled !== undefined) node.styleScrolled = raw.styleScrolled
  // Since 9.25.0: the press feedback arrives as it is; only `press-feedback.ts` reads it, and the one word `none` turns the feedback off.
  if (raw.pressFeedback !== undefined) node.pressFeedback = raw.pressFeedback
  // Since 9.16.0: the app bar zone arrives as it is; only `media-chrome.ts` (`barZoneOf`) reads the value: the word `leading` or "no field".
  if (raw.zone !== undefined) node.zone = raw.zone
  // Since 9.33.0: the fade on a condition arrives as it is; only `visibility-fade.ts` reads it, and only the word `fade` counts.
  if (raw.visibilityTransition !== undefined) node.visibilityTransition = raw.visibilityTransition
  // The colour of a widget PART lives in `props` (`Divider`, `ProgressBar`, `CircularProgress`).
  if (isRecord(raw.props) && isRecord(raw.props.color)) lintColors(raw.props.color, `${where}: props.color`, report)

  let children: readonly unknown[] = []
  if (raw.children !== undefined) {
    if (Array.isArray(raw.children)) children = raw.children as readonly unknown[]
    else report({ where: `${where}: children`, reason: 'not a list; the node has no children' })
  }
  return { node: node as unknown as UiNode & { children?: UiNode[] }, children }
}

/**
 * A screen root of any shape becomes a node tree or a rejection. Never throws.
 *
 * A tree deeper than the limit is rejected ENTIRELY (`max_depth_exceeded`): drawing "as much as
 * fits" would show half a screen.
 */
export function shapeRoot(raw: unknown, report: IssueSink = () => undefined): ShapedRoot {
  const top = shapeOne(raw, 'root', report)
  if (top === undefined) return { kind: 'rejected', reason: 'not_a_node' }

  const pending: { readonly parent: UiNode & { children?: UiNode[] }; readonly raw: readonly unknown[]; readonly depth: number }[] = []
  if (raw !== null && typeof raw === 'object' && 'children' in raw && Array.isArray(raw.children)) top.node.children = []
  if (top.children.length > 0) pending.push({ parent: top.node, raw: top.children, depth: 2 })

  while (pending.length > 0) {
    const item = pending.pop()
    if (item === undefined) break
    if (item.depth > MAX_TREE_DEPTH) return { kind: 'rejected', reason: 'max_depth_exceeded' }
    const shaped: UiNode[] = []
    item.raw.forEach((child, index) => {
      const next = shapeOne(child, `${item.parent.id}/${String(index)}`, report)
      if (next === undefined) return
      const rawChildren: unknown = (child as Readonly<Record<string, unknown>>).children
      if (Array.isArray(rawChildren)) next.node.children = []
      shaped.push(next.node)
      if (next.children.length > 0) pending.push({ parent: next.node, raw: next.children, depth: item.depth + 1 })
    })
    item.parent.children = shaped
  }
  return { kind: 'ok', root: top.node }
}
