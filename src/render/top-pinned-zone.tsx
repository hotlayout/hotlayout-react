/**
 * The top zone of nodes (schema 9.24.0, `pin: 'top'`): the nodes pinned to the top stand between the
 * app bar zone and the scrolling body and never scroll themselves. Rules: `top-zone.ts`.
 *
 * Layout: below the app bar a gap of the screen, without an app bar the top padding of the root (the
 * safe inset of the host lies above the zone, outside the node boxes); the root side padding on the
 * sides; the nodes in the same content column as the body, a gap of the screen apart. The `pull` of
 * the first node is not read, that of the others is, as in the screen column. The zone has no
 * background of its own: a node names its own, otherwise the screen background shows through.
 *
 * In a block without its own height the zone sticks to the top of the host page together with the
 * app bar zone, by the same host switch (`chrome="sticky"`), right under the bar.
 */
import { Fragment } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { PullAxisContext } from './contexts'
import { NodeView } from './node-view'
import { numbered } from './siblings'
import type { ListNumber } from './contexts'
import type { UiNode } from '../types'
import { screenPart } from './screen-part'

/** The variable the root writes: the height of the stuck app bar zone, so the pinned zone sticks right under it. Our own, not a theme token. */
export const TOP_BAR_HEIGHT_VAR = '--hl-top-bar-h'

interface TopPinnedProps {
  readonly nodes: readonly UiNode[]
  readonly numbers: ReadonlyMap<string, ListNumber> | undefined
  /** The padding above the first node: the gap of the screen below an app bar, the root top padding without one. */
  readonly lead: string | undefined
  readonly sides: CSSProperties
  readonly sticky: boolean
  readonly stickyOffset: string | undefined
  /** The root background for the backdrop of a stuck zone; empty means none. */
  readonly backdrop: CSSProperties
  readonly backdropSize: { readonly width: string; readonly height: string }
  readonly column: (children: ReactNode) => ReactNode
}

export const TopPinnedZone = screenPart(function TopPinnedZone({ nodes, numbers, lead, sides, sticky, stickyOffset, backdrop, backdropSize, column }: TopPinnedProps): ReactNode {
  if (nodes.length === 0) return null
  const stuck: CSSProperties = sticky ? { position: 'sticky', insetBlockStart: `calc(var(${TOP_BAR_HEIGHT_VAR}, 0px) + ${stickyOffset ?? '0px'})`, zIndex: 1 } : {}
  return (
    <div data-hl-zone="topPinned" style={{ flex: 'none', display: 'flex', flexDirection: 'column', ...sides, paddingBlockStart: lead, ...stuck }}>
      {sticky && Object.keys(backdrop).length > 0 ? (
        <div aria-hidden="true" data-hl-backdrop="" style={{ position: 'absolute', inset: 0, overflow: 'clip', zIndex: -1, pointerEvents: 'none' }}>
          <div style={{ ...backdrop, inlineSize: backdropSize.width, blockSize: backdropSize.height, translate: `0 calc(-1 * var(${TOP_BAR_HEIGHT_VAR}, 0px))` }} />
        </div>
      ) : null}
      {column(
        nodes.map((node, index) => {
          const view = <NodeView node={node} />
          // The `pull` of the first node is not read; the others overlap the previous one as in the screen column.
          return <Fragment key={node.id}>{numbered(numbers, node, index === 0 ? <PullAxisContext.Provider value={undefined}>{view}</PullAxisContext.Provider> : view)}</Fragment>
        }),
      )}
    </div>
  )
})
