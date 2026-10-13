/** Children of one parent: who is shown, the numbers of numbered list items, and the views of sibling nodes. */
import { useContext } from 'react'
import type { ReactNode } from 'react'

import { isConditionMet } from '../conditions'
import type { DataScope } from '../data'
import { listMarkerOf } from '../list-marker'
import type { UiNode } from '../types'
import { isNodeShown } from '../width-class'
import type { WidthClass } from '../width-class'
import { ListNumberContext, WidthClassContext, useData } from './contexts'
import type { ListNumber } from './contexts'
import { NodeView } from './node-view'
import { PressLabel } from './press-host'

/** Whether a node is visible: the class is in `showOn` AND `visibleIf` holds on this data. ONE place for every "is it visible" question. */
export function nodeShown(node: UiNode, widthClass: WidthClass, scope: DataScope): boolean {
  return isNodeShown(node, widthClass, (condition) => isConditionMet(condition, scope))
}

/**
 * Item numbers among siblings, for numbered items only. With no numbered item the result is
 * `undefined` and no contexts are provided. One pass: a group is consecutive children with
 * `marker: number` (`numberRun` of the reference implementation), the number is the count of VISIBLE
 * items up to and including this one, the size is the length of the group by the document. The
 * result equals `listNumberOf` / `listMarkerGroupSize` but without searching for the group bounds
 * for every child (that would be quadratic on 10,000 items).
 */
export function numberedSiblings(nodes: readonly UiNode[], scope: DataScope, widthClass: WidthClass): ReadonlyMap<string, ListNumber> | undefined {
  let numbers: Map<string, ListNumber> | undefined
  let start = 0
  while (start < nodes.length) {
    if (listMarkerOf(nodes[start]) !== 'number') {
      start += 1
      continue
    }
    let end = start
    while (end + 1 < nodes.length && listMarkerOf(nodes[end + 1]) === 'number') end += 1
    const groupSize = end - start + 1
    let visible = 0
    for (let at = start; at <= end; at += 1) {
      const child = nodes[at]
      if (child === undefined) continue
      numbers ??= new Map()
      numbers.set(child.id, { number: visible + 1, groupSize })
      if (nodeShown(child, widthClass, scope)) visible += 1
    }
    start = end + 1
  }
  return numbers
}

/** The children of one parent: each numbered item gets its number. `numbers` is passed when the group was already counted over ALL the children (the screen root). */
export function SiblingViews({ nodes, numbers: given }: { readonly nodes: readonly UiNode[]; readonly numbers?: ReadonlyMap<string, ListNumber> | undefined }): ReactNode {
  const scope = useData()
  const widthClass = useContext(WidthClassContext)
  const numbers = given ?? numberedSiblings(nodes, scope, widthClass)
  return nodes.map((child) => {
    const item = numbers?.get(child.id)
    return item === undefined ? <NodeView key={child.id} node={child} /> : (
      <ListNumberContext.Provider key={child.id} value={item}>
        <NodeView node={child} />
      </ListNumberContext.Provider>
    )
  })
}

/**
 * The same for parents that draw their children THEMSELVES (stack layers, cards of a carousel row):
 * a group is consecutive children of one parent whatever it is (`numberRun` of the reference
 * implementation does not ask for the parent type). Without this each numbered layer or card would
 * be "1.".
 */
export function numbered(numbers: ReadonlyMap<string, ListNumber> | undefined, child: UiNode, view: ReactNode): ReactNode {
  const item = numbers?.get(child.id)
  return item === undefined ? view : <ListNumberContext.Provider value={item}>{view}</ListNumberContext.Provider>
}

export function Children({ node }: { node: UiNode }): ReactNode {
  return (
    <>
      <PressLabel node={node} />
      <SiblingViews nodes={node.children ?? []} />
    </>
  )
}
