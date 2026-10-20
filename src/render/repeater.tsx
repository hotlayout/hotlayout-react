/** A list from data (`Repeater`): one template drawn once per record of a collection. */
import { useContext } from 'react'
import type { ReactNode } from 'react'

import { carouselOf } from '../carousel'
import { itemScope, valueAt, withItemScope } from '../data'
import type { DataScope } from '../data'
import { chainWith } from '../live-record'
import { listInstanceNumbers, listMarkerOf } from '../list-marker'
import { makesTightSlots } from '../layout-rules'
import { GROUP_HEADER_INDEX, groupStartsOf, readGroupBy } from '../repeater-group'
import { CarouselRow } from './carousel-row'
import { CollectionsContext, DataContext, InstancePathContext, ListNumberContext, RecordContext, TightSlotContext, WidthClassContext, useData } from './contexts'
import type { ListNumber } from './contexts'
import { columnsOf, gridColumns } from './grid'
import { ListBudgetContext, listRecordsOf } from './list-budget'
import { NodeView } from './node-view'
import { useSpacing } from './prop-tokens'
import { nodeShown } from './siblings'
import type { WidgetProps } from './widget-props'
import { screenPart } from './screen-part'

const NO_FIELDS: DataScope = {}

/**
 * The header of a group and the numbers of the drawn records it stands before (9.26.0). A grid or a row is drawn without
 * headers (the document would not be published); so is a list whose `groupBy` is not a path or that has no second child.
 */
function groupingOf(
  node: WidgetProps['node'],
  props: Readonly<Record<string, unknown>>,
  notAColumn: boolean,
  records: readonly Readonly<Record<string, unknown>>[],
  itemPrefix: string,
): { readonly header: WidgetProps['node'] | undefined; readonly groupStarts: ReadonlySet<number> | undefined } {
  const groupBy = readGroupBy(props)
  const header = groupBy === undefined || notAColumn ? undefined : node.children?.[GROUP_HEADER_INDEX]
  if (header === undefined || groupBy === undefined) return { header: undefined, groupStarts: undefined }
  return { header, groupStarts: groupStartsOf(records.map((record) => valueAt(itemScope(itemPrefix, record), groupBy))) }
}

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
export const RepeaterView = screenPart(function RepeaterView({ node, props, css, mark }: WidgetProps): ReactNode {
  const collections = useContext(CollectionsContext)
  const outer = useData()
  const { record: outerRecord, links: outerLinks } = useContext(RecordContext)
  const instancePath = useContext(InstancePathContext)
  const widthClass = useContext(WidthClassContext)
  const gap = useSpacing(props.gap, 'sm')

  const budget = useContext(ListBudgetContext)
  const source = typeof props.source === 'string' ? props.source : ''
  const itemPrefix = typeof props.item === 'string' ? props.item : ''
  const template = node.children?.[0]
  /*
   * The filter first, the bound after (9.23.0): the first `limit` (1…50, at most `MAX_COLLECTION_ITEMS`) records that PASSED.
   * Then the budget of the screen (9.28.0, `x-listBudget`): the lists before this one and around it may have used it up.
   */
  const passed = listRecordsOf(props, collections, outer)
  const drawn = budget === undefined ? passed : passed.slice(0, budget.allowed(node.id, instancePath))
  const records = drawn.map((entry) => entry.record)

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
   * ONE INSTANCE: the scopes of a record laid over the outer ones. The record scope also carries the LINK of
   * the instance (the collection, the entity, the raw fields; 9.27.0): a page opened from this row keeps it,
   * so its record follows the data. `content` is what is drawn in the scope: the template, or the header of a group.
   */
  const scoped = (record: Readonly<Record<string, unknown>>, index: number, content: ReactNode, key: string): ReactNode => {
    const item = itemScope(itemPrefix, record)
    return (
      <DataContext.Provider key={key} value={withItemScope(outer, item)}>
        {/* Whose row this is: an action of a node inside carries exactly this record (over the outer one). */}
        <RecordContext.Provider value={{ record: withItemScope(outerRecord ?? NO_FIELDS, item), insideListItem: true, links: chainWith(outerLinks, [{ source, item: itemPrefix, fields: record }]) }}>
          {/* A tight slot only when `columns` is set (`x-style.layout.tightSlots`). */}
          <InstancePathContext.Provider value={[...instancePath, index]}>
            <TightSlotContext.Provider value={makesTightSlots(node)}>{content}</TightSlotContext.Provider>
          </InstancePathContext.Provider>
        </RecordContext.Provider>
      </DataContext.Provider>
    )
  }

  /*
   * CAROUSEL (schema 9.11.0): the only place where a field TURNS ON scrolling: a list in a row with
   * `carousel` scrolls (without the field it stays an ordinary row). The cards are instances of the
   * template, one per record, each with its own record scope.
   */
  const carousel = carouselOf(node)
  if (carousel !== undefined) {
    const cards = records.map((record, index) => {
      const key = String(drawn[index]?.index ?? index)
      return { key, content: scoped(record, index, templateView(index), key), node: template }
    })
    return <CarouselRow node={node} mark={mark} css={css} gap={gap} align="center" carousel={carousel} cards={cards} />
  }

  /*
   * GROUPS (schema 9.26.0, `x-repeaterGroup`): the second child is the header of a group. The groups are formed from the
   * records that are DRAWN (after `where` and `limit`), in the order of the data, by the value under the path of the
   * RECORD; the header is drawn before the first record of each group, in the scope of that record. A grid or a row
   * is not grouped (the document would not be published): it is drawn as without the field. A header hidden by its
   * condition takes no place - it is an ordinary node of the flow, with the same `gap` as the records.
   */
  const { header, groupStarts } = groupingOf(node, props, columns !== undefined || isRow, records, itemPrefix)

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
      {records.flatMap((record, index) => {
        const key = String(drawn[index]?.index ?? index)
        const row = scoped(record, index, templateView(index), key)
        return header !== undefined && groupStarts?.has(index) === true ? [scoped(record, index, <NodeView node={header} />, `header-${key}`), row] : [row]
      })}
    </div>
  )
})
