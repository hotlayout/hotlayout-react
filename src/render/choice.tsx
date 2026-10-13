/**
 * What a write action makes of a node, and what a press of it does (schema 9.19.0, `x-actions.write`,
 * `x-choice`).
 *
 *  - A press of a node with `setValue` / `toggleValue` sends the analytics event of the action (once,
 *    before anything else, also when nothing is written) and then writes with the write of an input
 *    field. `onAction` is not called, whether the action is valid or not; an invalid one writes nothing
 *    and tells the host why through the report.
 *  - On the finished screen such a node is not a plain button: a `setValue` with a value is an OPTION
 *    (`role="radio"`, `aria-checked`), a `toggleValue` is a TOGGLE (`role="button"`, `aria-pressed`). The
 *    state is computed from the action and the data on every render, so it follows every write and every
 *    change of the data; the reader adds no look of its own — the node's `styleWhen` does.
 *  - Options that are children of one parent and write the same path are one group: each of them says
 *    its place (`aria-posinset` / `aria-setsize`). There is no wrapper with a role of a group and no
 *    arrow-key navigation: every option is a stop of Tab.
 */
import { useContext } from 'react'
import type { AriaAttributes, AriaRole } from 'react'

import type { ActionSource } from '../actions'
import { preparePress } from '../press'
import { InputWriteContext } from '../runtime'
import type { ActionHandler, InputWriteHandler } from '../runtime'
import { isNodeShown } from '../width-class'
import type { WidthClass } from '../width-class'
import type { DataScope } from '../data'
import { valueAt } from '../data'
import { isConditionMet } from '../conditions'
import { isRecord } from '../sanitize'
import type { InputIssue } from '../shape'
import type { UiNode } from '../types'
import { actionOf } from '../actions'
import { choicePlaceIn, isWriteAction, writeControlOf, writeStepOf } from '../write-action'
import type { ChoicePlace } from '../write-action'
import { useData } from './contexts'

/** What the semantics of a write node adds to the element: the role, the state and the place in the group. */
export type WriteSemantics = { readonly role?: AriaRole } & Pick<AriaAttributes, 'aria-checked' | 'aria-pressed' | 'aria-posinset' | 'aria-setsize'>

const PLAIN: WriteSemantics = {}

/** The action a node performs on press (what `props.action` holds, as written), or `undefined`. */
function nodeActionOf(node: UiNode): { readonly type: string; readonly params?: unknown } | undefined {
  return isRecord(node.props) ? actionOf(node.props.action) : undefined
}

/** The place of an option among the children of its parent. `siblings` are the children by the DOCUMENT. */
export function choicePlaceOfNode(siblings: readonly UiNode[], node: UiNode, widthClass: WidthClass, scope: DataScope): ChoicePlace | undefined {
  // The common case first: most nodes do not write anything.
  const own = nodeActionOf(node)
  if (own === undefined || !isWriteAction(own.type)) return undefined
  return choicePlaceIn(siblings, node, nodeActionOf, (sibling) => isNodeShown(sibling, widthClass, (condition) => isConditionMet(condition, scope)))
}

/** The semantics of a node with a write action; a plain button (no state) when the action is not a valid write or clears. */
export function useWriteSemantics(action: { readonly type: string; readonly params?: unknown } | undefined, place: ChoicePlace | undefined): WriteSemantics {
  const scope = useData()
  if (action === undefined || !isWriteAction(action.type)) return PLAIN
  const control = writeControlOf(action, (path) => valueAt(scope, path))
  if (control === undefined) return PLAIN
  if (control.role === 'toggle') return { role: 'button', 'aria-pressed': control.on }
  return place === undefined
    ? { role: 'radio', 'aria-checked': control.on }
    : { role: 'radio', 'aria-checked': control.on, 'aria-posinset': place.position, 'aria-setsize': place.size }
}

/** What a press needs from the screen to perform a write action. */
export interface WritePress {
  readonly dispatch: ActionHandler
  readonly write: InputWriteHandler | undefined
  readonly scope: DataScope
  readonly source: ActionSource
  readonly insideListItem: boolean
  readonly report: (issue: InputIssue) => void
}

/**
 * The press of a write action: the analytics event first, then the write. The value is compared with
 * what lies under the path NOW (the scope of the node, so the session and the record count): the same
 * value is not written again. A path the host's gate refuses is reported by the write itself.
 */
export function pressWriteAction(action: { readonly type: string; readonly params?: unknown; readonly track?: unknown }, press: WritePress): void {
  // `paramBindings` and `carryRecord` of a write action are never read: only the event of `track` is taken from the action.
  const prepared = preparePress({ type: 'none', track: action.track } as { readonly type: string }, () => undefined, press.report, press.source.nodeId)
  if (prepared.track !== undefined) press.dispatch({ type: 'none' }, press.source, press.insideListItem, { track: prepared.track })
  const step = writeStepOf(action, (path) => valueAt(press.scope, path))
  if (step === undefined) return
  if (step.kind === 'invalid') {
    press.report({ where: `node “${press.source.nodeId}”: action`, reason: `the write action is not valid (${step.problem}); nothing was written` })
    // An inert action hands nothing to the host, but the screen delivers the pending reports when it gets one: the report must not wait for the next render.
    press.dispatch({ type: 'none' }, press.source, press.insideListItem)
    return
  }
  if (step.kind === 'write') press.write?.(step.path, step.value)
}

/** The write handler of the screen, for the press of a node. */
export function useInputWrite(): InputWriteHandler | undefined {
  return useContext(InputWriteContext)
}
