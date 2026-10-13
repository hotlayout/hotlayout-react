/** A list from data (`Repeater`): one template drawn once per record of a collection. */
import { useContext } from 'react'
import type { ReactNode } from 'react'

import { carouselOf } from '../carousel'
import { itemScope, withItemScope } from '../data'
import type { DataScope } from '../data'
import { listInstanceNumbers, listMarkerOf } from '../list-marker'
import { PROP_BOUNDS, lookup, safeInteger } from '../sanitize'
import { makesTightSlots } from '../layout-rules'
import { CarouselRow } from './carousel-row'
import { CollectionsContext, DataContext, InstancePathContext, ListNumberContext, MAX_COLLECTION_ITEMS, RecordContext, TightSlotContext, WidthClassContext, useData } from './contexts'
import type { ListNumber } from './contexts'
import { columnsOf, gridColumns } from './grid'
import { NodeView } from './node-view'
import { useSpacing } from './prop-tokens'
import { nodeShown } from './siblings'
import type { WidgetProps } from './widget-props'

const NO_FIELDS: DataScope = {}

/**
 * The list: ONE template drawn once per record of the collection.
 *
 * Two places where it is easy to go wrong:
 *
 *  - the record scope is LAYERED over the outer one (`withItemScope`) and does not replace it:
 *    inside a task list `user.points` still means the user's points;
 *  - `columns` lays the instances out as a GRID, with the same formula as `Grid`. Together with
 *    `direction: 'row'` it is invalid: those are two statements about the same axis.
 */
export function RepeaterView({ node, props, css, mark }: WidgetProps): ReactNode {
  const collections = useContext(CollectionsContext)
  const outer = useData()
  const outerRecord = useContext(RecordContext).record
  const instancePath = useContext(InstancePathContext)
  const widthClass = useContext(WidthClassContext)
  const gap = useSpacing(props.gap, 'sm')

  const source = typeof props.source === 'string' ? props.source : ''
  const itemPrefix = typeof props.item === 'string' ? props.item : ''
  const template = node.children?.[0]
  // `limit` is an integer 1…50; beyond `MAX_COLLECTION_ITEMS` the reader draws nothing, however many the backend returned.
  const limit = safeInteger(props.limit, PROP_BOUNDS.repeaterLimit[0], PROP_BOUNDS.repeaterLimit[1]) ?? MAX_COLLECTION_ITEMS
  const listed: unknown = lookup(collections, source)
  const records = (Array.isArray(listed) ? (listed as readonly Readonly<Record<string, unknown>>[]) : []).slice(0, limit)

  if (template === undefined) return null

  if (records.length === 0) {
    // An empty list is a normal state, not an error. What to show instead is decided by the
    // document through `visibleIf` on a neighbouring node.
    return null
  }

  const columns = columnsOf(props)
  const isRow = columns === undefined && props.direction === 'row'

  /*
   * A NUMBERED TEMPLATE ITEM (schema 9.17.0, `listMarker.number.repeaterTemplate`): the group is
   * the drawn INSTANCES. The number is how many instances in which the template is visible were
   * drawn up to and including this one; the column width follows the number of drawn records (after
   * `limit`). Otherwise every row of a data-driven list would be "1.".
   */
  const numberedTemplate = listMarkerOf(template) === 'number'
  const instanceNumbers = numberedTemplate
    ? listInstanceNumbers(records.map((record) => nodeShown(template, widthClass, withItemScope(outer, itemScope(itemPrefix, record)))))
    : []
  const numberOf = (index: number): ListNumber | undefined => {
    const number = instanceNumbers[index]
    return number === undefined ? undefined : { number, groupSize: records.length }
  }
  const templateView = (index: number): ReactNode => {
    const view = <NodeView node={template} />
    const item = numberOf(index)
    return item === undefined ? view : <ListNumberContext.Provider value={item}>{view}</ListNumberContext.Provider>
  }

  /*
   * CAROUSEL (schema 9.11.0): the only place where a field TURNS ON scrolling: a list in a row with
   * `carousel` scrolls (without the field it stays an ordinary row). The cards are instances of the
   * template, one per record, each with its own record scope.
   */
  const carousel = carouselOf(node)
  const instance = (record: Readonly<Record<string, unknown>>, index: number): { readonly key: string; readonly content: ReactNode } => {
    const item = itemScope(itemPrefix, record)
    return {
      key: String(index),
      content: (
        <DataContext.Provider value={withItemScope(outer, item)}>
          <RecordContext.Provider value={{ record: withItemScope(outerRecord ?? NO_FIELDS, item), insideListItem: true }}>
            <InstancePathContext.Provider value={[...instancePath, index]}>
              <TightSlotContext.Provider value={makesTightSlots(node)}>
                {templateView(index)}
              </TightSlotContext.Provider>
            </InstancePathContext.Provider>
          </RecordContext.Provider>
        </DataContext.Provider>
      ),
    }
  }
  if (carousel !== undefined) {
    return <CarouselRow node={node} mark={mark} css={css} gap={gap} align="center" carousel={carousel} cards={records.map((record, index) => ({ ...instance(record, index), node: template }))} />
  }

  return (
    <div
      {...mark}
      style={{
        display: columns === undefined ? 'flex' : 'grid',
        flexDirection: isRow ? 'row' : 'column',
        // Instances in a row are centred on the cross axis, like the children of `Row`.
        alignItems: isRow ? 'center' : undefined,
        gridTemplateColumns: columns === undefined ? undefined : gridColumns(columns),
        minInlineSize: 0,
        gap,
        ...css,
      }}
    >
      {records.map((record, index) => {
        const item = itemScope(itemPrefix, record)
        return (
          <DataContext.Provider key={index} value={withItemScope(outer, item)}>
            {/* Whose row this is: an action of a node inside carries exactly this record (over the outer one). */}
            <RecordContext.Provider value={{ record: withItemScope(outerRecord ?? NO_FIELDS, item), insideListItem: true }}>
              {/* A tight slot only when `columns` is set (`x-style.layout.tightSlots`). */}
              <InstancePathContext.Provider value={[...instancePath, index]}>
                <TightSlotContext.Provider value={makesTightSlots(node)}>
                  {templateView(index)}
                </TightSlotContext.Provider>
              </InstancePathContext.Provider>
            </RecordContext.Provider>
          </DataContext.Provider>
        )
      })}
    </div>
  )
}
