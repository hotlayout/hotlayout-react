/** The grid: `Grid` and the column count shared with a list from data. */
import type { ReactNode } from 'react'

import { PROP_BOUNDS, cssNumber, safeInteger } from '../sanitize'
import { makesTightSlots } from '../layout-rules'
import { columnsBoundsOf } from '../width-class'
import { TightSlotContext } from './contexts'
import { useSpacing } from './prop-tokens'
import { Children } from './siblings'
import type { WidgetProps } from './widget-props'
import { screenPart } from './screen-part'

/**
 * The grid columns are EQUAL shares of the width whatever the cells hold.
 *
 * `minmax(0, 1fr)` rather than `1fr`: a bare `1fr` is `minmax(auto, 1fr)`, and a cell with a long
 * word would push its column wider at the expense of its neighbours. In Flutter a cell gets a tight
 * constraint and cannot do that, so here too the minimum column width is zero.
 */
export function gridColumns(columns: number): string {
  return `repeat(${cssNumber(columns)}, minmax(0, 1fr))`
}

/**
 * The number of columns from the document: an integer 2…4 (`columns` in the schema). A larger value
 * is clamped (`literalOutOfRange: 'clamp'`): `repeat(10000000, …)` would be ten million grid tracks
 * in the user's browser. A non-number gives `undefined` and the field default applies.
 */
export function columnsOf(props: Readonly<Record<string, unknown>>): number | undefined {
  // The base is read as 2…4, a number from a width-class override as 1…6 (`props.columns`).
  const [min, max] = columnsBoundsOf(props, PROP_BOUNDS.gridColumns)
  return safeInteger(props.columns, min, max)
}

/**
 * The grid: how many children go in a row is dictated by the DOCUMENT.
 *
 * `repeat(N, …)` rather than `auto-fill`: `auto-fill` decides how many fit, which is exactly what
 * `Grid` exists to avoid. The difference shows only on a narrow screen, where nobody checks it.
 *
 * `align-items: start` mirrors Flutter: a row does not know its height in advance in order to
 * stretch the cells, so it aligns them to the top. The grid default `stretch` would show cards of
 * equal height, which the phone will not have.
 */
export const GridView = screenPart(function GridView({ node, props, css, mark }: WidgetProps): ReactNode {
  const gap = useSpacing(props.gap, 'sm')
  const columns = columnsOf(props) ?? 2
  return (
    <div {...mark} style={{ display: 'grid', gridTemplateColumns: gridColumns(columns), alignItems: 'start', gap, ...css }}>
      <TightSlotContext.Provider value={makesTightSlots(node)}>
        <Children node={node} />
      </TightSlotContext.Provider>
    </div>
  )
})
