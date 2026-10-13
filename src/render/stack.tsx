/** The stack (`Stack`): layers in one cell, overlays with a place of their own. */
import { useContext } from 'react'
import type { ReactNode } from 'react'

import { readerLayerOf } from '../layer-placement'
import { FillIgnoredContext, LayerContext, StackLayerContext, WidthClassContext, useData } from './contexts'
import { NodeView } from './node-view'
import { PressLabel } from './press-host'
import { numbered, numberedSiblings } from './siblings'
import type { WidgetProps } from './widget-props'

/**
 * The stack: layers at one point, the FIRST in the list is the lowest.
 *
 * The DOM order equals the document order, so no separate `z-index` is needed and none should be
 * added: it would diverge from Flutter, where the order also decides everything.
 */
export function StackView({ node, props, css, mark }: WidgetProps): ReactNode {
  const align = (value: unknown): string => (value === 'start' || value === 'end' ? value : 'center')
  // When all layers are stretched, `fill` is ignored (`allLayersFilled: 'ignore-fill'`).
  const children = node.children ?? []
  const allFilled = children.length > 0 && children.every((child) => child.fill === true)
  const numbers = numberedSiblings(children, useData(), useContext(WidthClassContext))
  return (
    <div
      {...mark}
      style={{
        position: 'relative',
        display: 'grid',
        // The alignment is LOGICAL: `start` is the row start, which in RTL is the right side.
        justifyItems: align(props.alignHorizontal),
        alignItems: align(props.alignVertical),
        ...css,
      }}
    >
      <PressLabel node={node} />
      {children.map((child) => {
        /*
         * AN OVERLAY (schema 9.10.0, `x-style.layout.layer`): a layer with its own place sits in the
         * same grid cell as the rest but takes no part in MEASURING the stack: `contain: size` makes
         * its contribution to the tracks zero (not `position: absolute`, which would measure from the
         * padding box, while the layers sit in the content). Inside, the cell is a 1x1 grid and the
         * layer is aligned by its own words or by those of the stack (`inherit`). The cell does not
         * catch the pointer (`pointer-events: none`), so the lower layers stay pressable.
         */
        const place = readerLayerOf(child, node)
        if (place !== undefined) {
          return (
            <div
              key={child.id}
              data-hl-layer=""
              style={{
                gridArea: '1 / 1',
                display: 'grid',
                justifySelf: 'stretch',
                alignSelf: 'stretch',
                justifyItems: place.alignHorizontal ?? 'inherit',
                alignItems: place.alignVertical ?? 'inherit',
                contain: 'size',
                minInlineSize: 0,
                minBlockSize: 0,
                pointerEvents: 'none',
              }}
            >
              <FillIgnoredContext.Provider value={allFilled}>
                <StackLayerContext.Provider value>
                  <LayerContext.Provider value={place}>
                    {numbered(numbers, child, <NodeView node={child} />)}
                  </LayerContext.Provider>
                </StackLayerContext.Provider>
              </FillIgnoredContext.Provider>
            </div>
          )
        }
        return (
          // All layers share one cell; a stretched one (`fill`) leaves the flow by itself.
          <div key={child.id} style={{ gridArea: '1 / 1', display: 'grid', minInlineSize: 0, maxInlineSize: '100%' }}>
            <FillIgnoredContext.Provider value={allFilled}>
              <StackLayerContext.Provider value>
                {numbered(numbers, child, <NodeView node={child} />)}
              </StackLayerContext.Provider>
            </FillIgnoredContext.Provider>
          </div>
        )
      })}
    </div>
  )
}
