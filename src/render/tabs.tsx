/** Tabs: the tab bar (`Tabs`), a tab title and a tab panel (`Tab`). */
import { createContext, useContext, useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

import { DirectionContext } from '../runtime'
import { inheritTextStyle, resolveNodeStyle } from '../style'
import type { TextStyleContext } from '../style'
import { FOCUSABLE_CLASS } from '../styles'
import { productVar } from '../theme'
import type { UiNode } from '../types'
import { TextContext, WidthClassContext, useData, useTheme } from './contexts'
import { COLUMN } from './flex-words'
import { NodePlace } from './node-place'
import { NodeView } from './node-view'
import { mathToken } from './prop-tokens'
import { Children, nodeShown } from './siblings'
import { usePartText, useText } from './use-text'
import type { WidgetProps } from './widget-props'
import { screenPart } from './screen-part'

/** The gap between the children of a tab panel: built in, the same in every reader. */
const TAB_PANEL_GAP = 'md'

/** The tab strip: a built-in look. */
const TABS = { barGap: 'lg', panelGap: 'md', titlePadding: 'sm', underline: 'xs', typography: 'titleS' } as const

/**
 * A tab title lives on the CHILD, not in an array of titles on the parent.
 *
 * Parallel lists ("titles" in `Tabs` and the panels in `children`) would fall out of sync on the
 * first reorder, silently, which is why the contract does not do it that way.
 *
 * `initialTab` says which tab is open WHEN THE SCREEN IS SHOWN; after that the user switches and the
 * document never learns of it. The selection is kept by the tab `id`: if the selected tab became
 * hidden (the data changed), the one named by the document opens.
 */
/** The ids of the "title <-> panel" pair of one tab. */
function tabIds(group: string, tabId: string): { readonly title: string; readonly panel: string } {
  return { title: `${group}-tab-${tabId}`, panel: `${group}-panel-${tabId}` }
}

/** The tab strip a panel stands in: the panel learns its `id` and `aria-labelledby` from it. */
const TabGroupContext = createContext<string | undefined>(undefined)

export const TabPanelView = screenPart(function TabPanelView({ node, css, mark }: WidgetProps): ReactNode {
  const group = useContext(TabGroupContext)
  const ids = group === undefined ? undefined : tabIds(group, node.id)
  // A `Tab` outside `Tabs` (a broken document) is just a column: there is no panel role without a strip.
  const panel = ids === undefined ? {} : { role: 'tabpanel', id: ids.panel, 'aria-labelledby': ids.title }
  return (
    <div {...mark} {...panel} style={{ ...COLUMN, gap: productVar('spacing', TAB_PANEL_GAP), ...css }}>
      <Children node={node} />
    </div>
  )
})

export const TabsView = screenPart(function TabsView({ node, props, css, mark }: WidgetProps): ReactNode {
  const group = useId()
  const direction = useContext(DirectionContext)
  const tabs = node.children ?? []
  const scope = useData()
  const widthClass = useContext(WidthClassContext)
  const visible = tabs.filter((tab) => nodeShown(tab, widthClass, scope))
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  /*
   * `initialTab` counts ALL tabs in document order, hidden ones included. If the named tab is
   * hidden (or the index is out of range), the first visible one opens
   * (`hiddenInitialTab: 'first-visible'`).
   */
  const active = visible.find((tab) => tab.id === chosen) ?? openTabOf(tabs, visible, props.initialTab)

  /*
   * KEYBOARD follows the WAI-ARIA "Tabs" pattern with automatic activation: the strip has one Tab
   * stop (the open tab), arrows move between titles and open the panel at once, Home / End go to
   * the first and last. In right-to-left writing the arrows swap: "right" goes to the PREVIOUS tab,
   * because that is where it stands.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const backward = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
    const at = visible.findIndex((tab) => tab.id === active?.id)
    const count = visible.length
    if (at < 0 || count === 0) return
    let next: number
    if (event.key === forward) next = (at + 1) % count
    else if (event.key === backward) next = (at - 1 + count) % count
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = count - 1
    else return
    event.preventDefault()
    const target = visible[next]
    if (target === undefined) return
    setChosen(target.id)
    event.currentTarget.ownerDocument.getElementById(tabIds(group, target.id).title)?.focus()
  }

  return (
    <div {...mark} style={{ ...COLUMN, gap: productVar('spacing', TABS.panelGap), ...css }}>
      <div role="tablist" onKeyDown={onKeyDown} style={{ display: 'flex', gap: productVar('spacing', TABS.barGap), overflowX: 'auto' }}>
        {visible.map((tab) => (
          <TabTitle
            key={tab.id}
            node={tab}
            ids={tabIds(group, tab.id)}
            isActive={tab.id === active?.id}
            onOpen={() => {
              setChosen(tab.id)
            }}
          />
        ))}
      </div>
      <TabGroupContext.Provider value={group}>{active === undefined ? null : <NodeView node={active} />}</TabGroupContext.Provider>
    </div>
  )
})

/**
 * The open tab: `initialTab` counts ALL tabs of the document (hidden ones included).
 *
 * If the named tab is hidden OR the index is out of range (negative, fractional, not a number), the
 * first visible one opens: `hiddenInitialTab` and `initialTabOutOfRange` have one answer,
 * `'first-visible'`. With no visible tabs nothing opens.
 */
export function openTabOf(tabs: readonly UiNode[], visible: readonly UiNode[], initialTab: unknown): UiNode | undefined {
  const named = typeof initialTab === 'number' && Number.isInteger(initialTab) && initialTab >= 0 ? tabs[initialTab] : undefined
  return visible.find((tab) => tab.id === named?.id) ?? visible[0]
}

/**
 * `Tabs` draws the title, but reads the colour in the context of ITS tab: the title is a `Tab` prop,
 * so `style.color` on a tab paints both its title and the panel content. That is why the context is
 * computed here the same way as in `NodeView`.
 */
type TabIds = ReturnType<typeof tabIds>

const TabTitle = screenPart(function TabTitle({ node, ids, isActive, onOpen }: { node: UiNode; ids: TabIds; isActive: boolean; onOpen: () => void }): ReactNode {
  const theme = useTheme()
  const scope = useData()
  const text = inheritTextStyle(useContext(TextContext), resolveNodeStyle(node, scope, theme), theme)
  return (
    <NodePlace nodeId={node.id}>
      <TabTitleText node={node} ids={ids} isActive={isActive} text={text} onOpen={onOpen} />
    </NodePlace>
  )
})

const TabTitleText = screenPart(function TabTitleText({ node, ids, isActive, text, onOpen }: { node: UiNode; ids: TabIds; isActive: boolean; text: TextStyleContext; onOpen: () => void }): ReactNode {
  const title = useText(node.props.title, 'title')
  const activeCss = usePartText('Tab', 'activeTitle', text, TABS.typography, 'primary')
  const inactiveCss = usePartText('Tab', 'inactiveTitle', text, TABS.typography, 'muted')
  const pad = productVar('spacing', TABS.titlePadding)
  const underline = productVar('spacing', TABS.underline)
  const theme = useTheme()
  return (
    <button
      type="button"
      role="tab"
      id={ids.title}
      className={FOCUSABLE_CLASS}
      aria-selected={isActive}
      aria-controls={isActive ? ids.panel : undefined}
      // One Tab stop per strip: the other titles are reached with arrows.
      tabIndex={isActive ? 0 : -1}
      onClick={onOpen}
      style={{
        flex: 'none',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        // The line under the open tab is part of the title height: the bottom padding is shorter by that much.
        paddingBlock: `${pad} calc(${mathToken(TABS.titlePadding, theme)} - ${mathToken(TABS.underline, theme)})`,
        borderBlockEnd: `${underline} solid ${isActive ? productVar('color', 'primary') : 'transparent'}`,
        ...(isActive ? activeCss : inactiveCss),
      }}
    >
      {title}
    </button>
  )
})
