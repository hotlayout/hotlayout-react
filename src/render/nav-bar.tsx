/** Navigation: the navigation bar (`NavBar`) at the bottom or at the top, and its item (`NavItem`). */
import { useContext, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { NAV_BAR_LAYOUT, NAV_ITEM_TYPE, isActiveNavAction, navDrawnItems } from '../bottom-zone'
import { isRecord } from '../sanitize'
import { shownTextOf } from '../shown-text'
import { iconButtonNameOf } from '../layout-rules'
import { FOCUSABLE_CLASS } from '../styles'
import { productVar } from '../theme'
import { WIDE_NAV_LABEL_MAX, WIDE_NAV_LAYOUT } from '../wide-nav'
import { NAV_MARK, useWideNavView } from '../wide-nav-view'
import { ContentMaxContext, NavModeContext, NavPlaceContext, PlaceContext, SafeBottomContext, SafeTopContext, WidthClassContext, ZERO_INSET, useData, useTheme } from './contexts'
import { COLUMN } from './flex-words'
import { Glyph, glyphBox } from './icon'
import { NodeView } from './node-view'
import { withTopInset } from './safe-top'
import { contentColumn } from './screen-root'
import { nodeShown } from './siblings'
import { swallowAutoRepeat, useDocumentAction, usePress } from './use-press'
import { usePartColor, usePartText, useText } from './use-text'
import type { WidgetProps } from './widget-props'
import { screenPart } from './screen-part'

/**
 * THE BOTTOM NAVIGATION BAR (schema 9.12.0, `x-style.layout.navBar`): a row of items in equal
 * shares with no gaps. The items are `NavItem` children in document order; visible ones divide the
 * width equally, a hidden one has no share, and beyond five only the first five are drawn
 * (`navBarExtraItems`); a child of another type is not drawn. The order follows the writing
 * direction because the row is a flex container under the root `dir`.
 *
 * The background (`surface`) and the top line (1 of the `border` colour) are built in; a named
 * `style.background` and `style.border` replace them (`surface.named`). The theme has no new role
 * group. The bottom safe area inset (`SafeBottomContext`) lies UNDER the item row, inside the bar
 * background, which extends to the physical bottom. The navigation landmark is `<nav>`, not
 * `tablist`.
 */
export const NavBarView = screenPart(function NavBarView({ node, css: ownCss, mark }: WidgetProps): ReactNode {
  const scope = useData()
  const safe = useContext(SafeBottomContext)
  const widthClass = useContext(WidthClassContext)
  const contentMax = useContext(ContentMaxContext)
  const place = useContext(NavPlaceContext)
  const theme = useTheme()
  const topInset = useContext(SafeTopContext)
  const css = place === 'top' ? withTopInset(ownCss, topInset, theme) : ownCss
  const rowRef = useRef<HTMLDivElement | null>(null)
  // The look of the items in the bar's own top strip is measured by the strip; in the app bar the app bar measures it and the look arrives by context.
  const ownView = useWideNavView(rowRef, place === 'top' ? 'ownBar' : undefined, theme)
  const items = (node.children ?? []).filter((child) => child.type === NAV_ITEM_TYPE)
  const drawn = navDrawnItems(items.map((item) => nodeShown(item, widthClass, scope)))
  const itemViews = items.map((item, index) => (drawn[index] === true ? <NodeView key={item.id} node={item} /> : null))

  /*
   * ON A WIDE PLACE (schema 9.18.0, `x-style.layout.wideNav`) the items form a row: glyph and label
   * side by side, of natural width, without equal shares, an `xs` gap. In the app bar the navigation
   * bar has no box at all, only the group of items; its own top strip is a box from edge to edge
   * with the items starting at the row start in the content column.
   */
  if (place === 'appBar') {
    return (
      <nav {...mark} style={{ display: 'flex', alignItems: 'center', gap: productVar('spacing', WIDE_NAV_LAYOUT.item.between), flex: 'none' }}>
        {itemViews}
      </nav>
    )
  }

  const named = css as Readonly<Record<string, unknown>>
  const ownBackground = named.backgroundColor !== undefined || named.backgroundImage !== undefined || named.background !== undefined
  const ownBorder = Object.keys(named).some((key) => key.startsWith('border') && !key.endsWith('Radius'))
  if (place === 'top') {
    const line = WIDE_NAV_LAYOUT.ownBar.surface.borderBottom
    const topSurface: CSSProperties = {
      ...(ownBackground ? {} : { backgroundColor: productVar('color', WIDE_NAV_LAYOUT.ownBar.surface.background) }),
      // The line is at the bottom (for a bottom bar it is at the top); a named border replaces it (`ownBar.surface.named`).
      ...(ownBorder ? {} : { borderBlockEnd: `${String(line.width)}px solid ${productVar('color', line.color)}` }),
    }
    return (
      <nav {...mark} style={{ ...COLUMN, flex: 'none', ...topSurface, ...css }}>
        <div
          ref={rowRef}
          data-hl-nav-mode={ownView.mode ?? 'labels'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: productVar('spacing', WIDE_NAV_LAYOUT.item.between),
            // Even the icons alone do not fit: the excess is clipped at the end of the row.
            overflowX: 'clip',
            ...(contentMax === undefined ? {} : contentColumn(contentMax)),
          }}
        >
          <NavModeContext.Provider value={ownView.mode ?? 'labels'}>{itemViews}</NavModeContext.Provider>
        </div>
      </nav>
    )
  }

  const surface: CSSProperties = {
    ...(ownBackground ? {} : { backgroundColor: productVar('color', NAV_BAR_LAYOUT.surface.background) }),
    ...(ownBorder ? {} : { borderBlockStart: `${String(NAV_BAR_LAYOUT.surface.borderTop.width)}px solid ${productVar('color', NAV_BAR_LAYOUT.surface.borderTop.color)}` }),
  }
  return (
    <nav {...mark} style={{ ...COLUMN, ...surface, ...css }}>
      {/* With a largest content width the bar background runs edge to edge and the ITEMS form the column. */}
      <div style={{ display: 'flex', alignItems: 'stretch', ...(contentMax === undefined ? {} : contentColumn(contentMax)) }}>{itemViews}</div>
      {safe === ZERO_INSET ? null : <div aria-hidden="true" data-hl-safe-inset="" style={{ flex: 'none', blockSize: safe }} />}
    </nav>
  )
})

/**
 * A NAVIGATION ITEM (schema 9.12.0): the icon ABOVE the label, centred on both axes; `sm`
 * (vertical) and `xs` (side) padding, an `xs` gap; an `md` icon, a `bodyS` label on one line with
 * an ellipsis. The button takes the whole share and the full height of the bar.
 *
 * The active item is the one whose `navigate.section` action leads to the SHOWN screen (the one
 * carrying the bar): `aria-current="page"` and the `primary` colour, the rest are `muted`; there is
 * no separate "which tab is selected" state. A named colour (on the item, the bar or an ancestor)
 * follows the tabs rule (`COLOR_PARTS.NavItem`). The action runs along the same path as a button
 * action (`usePress`); an action other than a section is used as is, and such an item is never
 * active. An empty label takes its name from the icon name, as an icon button does. An item outside
 * a bar (a broken document) is the same node.
 */
export const NavItemView = screenPart(function NavItemView({ node, props, css, text, mark }: WidgetProps): ReactNode {
  const place = useContext(NavPlaceContext)
  const mode = useContext(NavModeContext)
  const screenPlace = useContext(PlaceContext)
  const label = useText(props.label, 'label')
  const press = usePress(useDocumentAction(props.action, node.id), node.id)
  const active = isRecord(props.action) && isActiveNavAction(props.action, screenPlace.screenId)
  const part = active ? 'activeItem' : 'inactiveItem'
  const wide = place !== undefined
  const itemColor = usePartColor('NavItem', part, text, active ? 'primary' : 'muted')
  const labelCss = usePartText('NavItem', part, text, wide ? WIDE_NAV_LAYOUT.item.labelTypography : NAV_BAR_LAYOUT.item.labelTypography, active ? 'primary' : 'muted')
  const name = shownTextOf(iconButtonNameOf(label, props.icon)) // CSS does not collapse `aria-label` (shownText)
  const icons = wide && mode === 'icons'
  /*
   * AN ITEM AT THE TOP: the glyph, then the label in a row; `sm` / `md` padding, an `xs` gap, a
   * `bodyM` label no wider than `labelMaxWidth` (an ellipsis beyond). A hidden label stays in the
   * markup because it is the button name; a one-point box outside the flow also keeps the natural
   * text width, against which the look is rechecked, so the measurement does not depend on the look.
   * Not `display: none`.
   */
  const box: CSSProperties = wide
    ? {
        flex: 'none',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: icons ? undefined : productVar('spacing', WIDE_NAV_LAYOUT.item.gap),
        paddingBlock: productVar('spacing', WIDE_NAV_LAYOUT.item.paddingBlock),
        paddingInline: productVar('spacing', WIDE_NAV_LAYOUT.item.paddingInline),
        position: 'relative',
      }
    : {
        flex: '1 1 0px',
        minInlineSize: 0,
        ...COLUMN,
        alignItems: 'center',
        justifyContent: 'center',
        gap: productVar('spacing', NAV_BAR_LAYOUT.item.gap),
        paddingBlock: productVar('spacing', NAV_BAR_LAYOUT.item.paddingBlock),
        paddingInline: productVar('spacing', NAV_BAR_LAYOUT.item.paddingInline),
      }
  const labelBox: CSSProperties = !wide
    ? { minInlineSize: 0, maxInlineSize: '100%', overflow: 'hidden', textAlign: NAV_BAR_LAYOUT.item.labelAlign, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
    : icons
      ? { position: 'absolute', inlineSize: '1px', blockSize: '1px', overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }
      : { minInlineSize: 0, maxInlineSize: `${String(WIDE_NAV_LABEL_MAX)}px`, overflow: 'hidden', textAlign: 'start', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  return (
    <button
      {...mark}
      {...(wide ? { [NAV_MARK.item]: '' } : {})}
      type="button"
      className={FOCUSABLE_CLASS}
      aria-current={active ? 'page' : undefined}
      onClick={press}
      onKeyDown={swallowAutoRepeat}
      style={{
        ...box,
        cursor: 'pointer',
        touchAction: 'manipulation',
        userSelect: 'none',
        ...itemColor,
        ...css,
      }}
    >
      <span aria-hidden="true" {...(wide ? { [NAV_MARK.icon]: '' } : {})} style={{ ...glyphBox(wide ? WIDE_NAV_LAYOUT.item.iconSize : NAV_BAR_LAYOUT.item.iconSize), flex: 'none' }}>
        <Glyph name={props.icon} />
      </span>
      <span {...(wide ? { [NAV_MARK.label]: '' } : {})} style={{ ...labelCss, ...labelBox }}>
        {name}
      </span>
    </button>
  )
})
