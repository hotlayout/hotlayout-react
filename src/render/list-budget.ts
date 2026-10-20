/**
 * THE LIST BUDGET OF A SCREEN (`x-listBudget`, schema 9.28.0).
 *
 * The 50-record bound of one list (`limit`, `MAX_COLLECTION_ITEMS`) multiplies with nesting, and a
 * document the builder did not make may nest deeper. The builder does not publish a screen whose worst
 * case is above the budget, so a published screen is always drawn whole. A
 * screen draws at most `LIST_BUDGET_PER_SCREEN` instances of list templates, nested ones included,
 * counted in document order depth first: an instance counts before the lists inside it, then the
 * next instance of the same list, then the next list. The instance that would exceed the budget is
 * not drawn, nor anything inside it, nor any instance after it on the screen.
 *
 * The count follows the TREE of the screen for its width class, not what is shown right now: a
 * list hidden by `visibleIf` or `showOn`, in an inactive tab or a folded accordion costs the same,
 * so switching a tab never moves the cut in another list. The records are those the list draws
 * (after `where` and `limit`). A group header is not an instance; lists inside it count.
 *
 * The plan is computed once per screen, before drawing, because a list cannot know what the lists
 * before it drew: each `RepeaterView` asks the plan how many of its records it may draw.
 */
import { createContext, useEffect, useMemo, useRef } from 'react'

import { itemScope, withItemScope } from '../data'
import type { DataScope } from '../data'
import { drawnRecords, listWhereOf } from '../list-filter'
import type { DrawnRecord } from '../list-filter'
import { GROUP_HEADER_INDEX, groupStartsOf, readGroupBy } from '../repeater-group'
import { PROP_BOUNDS, lookup, safeInteger } from '../sanitize'
import { valueAt } from '../data'
import type { IssueSink } from '../shape'
import type { UiNode } from '../types'
import { MAX_COLLECTION_ITEMS } from './contexts'
import { columnsOf } from './grid'

/** How many instances of list templates one screen draws, nested ones included (`x-listBudget.perScreen`). */
export const LIST_BUDGET_PER_SCREEN = 2550

/** `x-listBudget.perScreen` of the artifact, mirrored (a test compares it). */
export const LIST_BUDGET_RULES = { perScreen: LIST_BUDGET_PER_SCREEN } as const

/** Counting what was NOT drawn stops here: the report then says «at least». */
const COUNT_CEILING = 1_000_000

type Collections = Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>

export interface ListBudgetPlan {
  /** How many of its drawn records the list `nodeId` at the instance path `path` may draw. */
  readonly allowed: (nodeId: string, path: readonly number[]) => number
  /** Instances drawn per list node, summed over the instances of the lists around it. */
  readonly drawnByList: Readonly<Record<string, number>>
  readonly total: number
  /** Instances the lists would draw without the budget and do not draw (at most the counting ceiling). */
  readonly notDrawn: number
}

/** The records a list draws before the budget: the filter first, the bound after (9.23.0). Shared with `RepeaterView`. */
export function listRecordsOf(props: Readonly<Record<string, unknown>>, collections: Collections, outer: DataScope): readonly DrawnRecord[] {
  const source = typeof props.source === 'string' ? props.source : ''
  const limit = safeInteger(props.limit, PROP_BOUNDS.repeaterLimit[0], PROP_BOUNDS.repeaterLimit[1]) ?? MAX_COLLECTION_ITEMS
  const listed: unknown = lookup(collections, source)
  const item = typeof props.item === 'string' ? props.item : ''
  return drawnRecords(Array.isArray(listed) ? (listed as readonly Readonly<Record<string, unknown>>[]) : [], { outer, item, where: listWhereOf(props.where) }, limit)
}

/** The header of a group, when the list has one (a column list with `groupBy` and a second child). */
function groupHeaderOf(node: UiNode): UiNode | undefined {
  const notAColumn = columnsOf(node.props) !== undefined || node.props.direction === 'row'
  return readGroupBy(node.props) === undefined || notAColumn ? undefined : node.children?.[GROUP_HEADER_INDEX]
}

const keyOf = (nodeId: string, path: readonly number[]): string => `${nodeId}@${path.join('.')}`

/** The plan of one screen: who draws how many, in document order depth first. */
export function listBudgetPlan(root: UiNode, scope: DataScope, collections: Collections, budget: number = LIST_BUDGET_PER_SCREEN): ListBudgetPlan {
  const allowed = new Map<string, number>()
  const drawnByList: Record<string, number> = {}
  let used = 0
  let notDrawn = 0

  /** The instances of a list in this scope: the records, and per record the scope and what is drawn with it. */
  const instancesOf = (node: UiNode, outer: DataScope): readonly { readonly scope: DataScope; readonly parts: readonly UiNode[] }[] => {
    const records = listRecordsOf(node.props, collections, outer)
    const item = typeof node.props.item === 'string' ? node.props.item : ''
    const template = node.children?.[0]
    const header = groupHeaderOf(node)
    const groupBy = readGroupBy(node.props)
    const starts = header === undefined || groupBy === undefined ? undefined : groupStartsOf(records.map((entry) => valueAt(itemScope(item, entry.record), groupBy)))
    return records.map((entry, index) => {
      // The header of a group comes with the instance it stands above, before its template.
      const parts = [...(header !== undefined && starts?.has(index) === true ? [header] : []), ...(template === undefined ? [] : [template])]
      return { scope: withItemScope(outer, itemScope(item, entry.record)), parts }
    })
  }

  // Counts what a subtree WOULD draw: everything after the cut.
  const countAll = (node: UiNode, outer: DataScope): void => {
    if (notDrawn >= COUNT_CEILING) return
    if (node.type !== 'Repeater') {
      for (const child of node.children ?? []) countAll(child, outer)
      return
    }
    for (const instance of instancesOf(node, outer)) {
      notDrawn += 1
      for (const part of instance.parts) countAll(part, instance.scope)
    }
  }

  const walk = (node: UiNode, outer: DataScope, path: readonly number[]): void => {
    if (node.type !== 'Repeater') {
      for (const child of node.children ?? []) walk(child, outer, path)
      return
    }
    drawnByList[node.id] ??= 0
    const instances = instancesOf(node, outer)
    let index = 0
    for (; index < instances.length && used < budget; index += 1) {
      used += 1
      drawnByList[node.id] = (drawnByList[node.id] ?? 0) + 1
      const instance = instances[index]
      for (const part of instance?.parts ?? []) walk(part, instance?.scope ?? outer, [...path, index])
    }
    allowed.set(keyOf(node.id, path), index)
    // What did not fit: these instances and everything inside them.
    for (const instance of instances.slice(index)) {
      if (notDrawn >= COUNT_CEILING) break
      notDrawn += 1
      for (const part of instance.parts) countAll(part, instance.scope)
    }
  }

  walk(root, scope, [])
  return {
    // A list the walk never reached sits inside an instance that is not drawn: it is never asked.
    allowed: (nodeId, path) => allowed.get(keyOf(nodeId, path)) ?? 0,
    drawnByList,
    total: used,
    notDrawn,
  }
}

/** The plan of the screen being drawn; `undefined` outside a screen (a list then draws every record it would). */
export const ListBudgetContext = createContext<ListBudgetPlan | undefined>(undefined)

const NO_COLLECTIONS: Collections = {}

/**
 * The plan of the screen being drawn, and its one report: how many instances were not drawn. The report is said once
 * per change of that number, not on every render.
 */
export function useListBudget(root: UiNode | undefined, scope: DataScope, collections: unknown, screenId: string, onIssue: IssueSink): ListBudgetPlan | undefined {
  const plan = useMemo(() => {
    const safe = typeof collections === 'object' && collections !== null && !Array.isArray(collections) ? (collections as Collections) : NO_COLLECTIONS
    return root === undefined ? undefined : listBudgetPlan(root, scope, safe)
  }, [root, scope, collections])
  const notDrawn = plan?.notDrawn ?? 0
  // The report is the business of whoever gave the handler: a new handler is not a new report.
  const report = useRef(onIssue)
  useEffect(() => {
    report.current = onIssue
  })
  useEffect(() => {
    if (notDrawn > 0) report.current({ where: `screen “${screenId}”`, reason: `the list budget of ${String(LIST_BUDGET_PER_SCREEN)} instances per screen was reached: ${String(notDrawn)} instances of list templates were not drawn` })
  }, [notDrawn, screenId])
  return plan
}
