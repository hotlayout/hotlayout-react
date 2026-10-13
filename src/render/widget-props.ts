/** What every widget view receives from its node. */
import type { CSSProperties } from 'react'

import type { TextStyleContext } from '../style'
import type { NodeStyle, UiNode } from '../types'
import type { ChoicePlace } from '../write-action'
import type { PressAttributes } from './press-host'

/**
 * Marks of a node on its box. They give the host an address of the node in the DOM (tests,
 * analytics, measurement) and cost the reader nothing: the node `id` is part of the document, not
 * an internal of the package.
 */
export interface NodeMark extends PressAttributes {
  readonly 'data-hl-node': string
  readonly 'data-hl-type': string
}

export interface WidgetProps {
  readonly node: UiNode
  readonly props: Readonly<Record<string, unknown>>
  /** The box of the node, already built; the widget adds only its own layout to it. */
  readonly css: CSSProperties
  /** The node's own style with its state applied. Needed only by widgets that have a role. */
  readonly own: NodeStyle | undefined
  /**
   * Size fields of `style` that this node does NOT apply because the parent gave the size (a row
   * weight took the width, a layer filling the stack took both axes). Needed by widgets for which
   * the node size is data (a ring: its diameter).
   */
  readonly dropped: readonly string[]
  /** The foreground of the node. Needed only by those who read it (`Text`, `Icon`). */
  readonly text: TextStyleContext
  readonly mark: NodeMark
  /** The place of the node in its group of options (9.19.0); absent for a node that is not an option of a group. */
  readonly choice?: ChoicePlace | undefined
}
