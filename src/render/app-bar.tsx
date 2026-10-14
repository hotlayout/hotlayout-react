/** The app bar (`AppBar`): the leading zone, the title and the trailing zone with actions and navigation items. */
import { useContext, useRef } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'

import { BACK_ACTION_TYPE } from '../actions'
import type { DataScope } from '../data'
import { APP_BAR_LEADING_MAX_SHARE, appBarActionsOf, appBarDrawnActions, appBarLeadingOf, appBarLeadingShown, titleAlignOf } from '../media-chrome'
import { LabelsContext } from '../runtime'
import type { ScreenLabels } from '../runtime'
import { cssNumber } from '../sanitize'
import { glyphTypographyOf } from '../layout-rules'
import type { TextStyleContext } from '../style'
import { PRESSABLE_CLASS } from '../styles'
import { productVar } from '../theme'
import type { UiNode } from '../types'
import { NAV_MARK, useWideNavView } from '../wide-nav-view'
import type { WidthClass } from '../width-class'
import { AppBarNavContext, ContentMaxContext, LeadingZoneContext, NavModeContext, NavPlaceContext, SafeTopContext, WidthClassContext, useData, useTheme } from './contexts'
import { Glyph } from './icon'
import { NodeView } from './node-view'
import { useSpacing, useSpacingMath } from './prop-tokens'
import { withTopInset } from './safe-top'
import { contentColumn } from './screen-root'
import { nodeShown } from './siblings'
import { swallowAutoRepeat, usePress } from './use-press'
import { usePartColor, usePartText, useText } from './use-text'
import type { WidgetProps } from './widget-props'
import { screenPart } from './screen-part'

/** The side of the square for the "back" arrow: a step of the spacing scale (`appBar.backSide`). */
const APP_BAR_SIDE = 'xl'

/** The texts, the built-in gaps and the part styles of the bar. */
function useBarLook(props: WidgetProps['props'], text: TextStyleContext) {
  const title = useText(props.title, 'title')
  const subtitle = useText(props.subtitle, 'subtitle')
  const gap = useSpacing('sm', 'sm')
  const gapMath = useSpacingMath('sm', 'sm')
  const lineGap = useSpacing('xs', 'xs')
  const actionGap = useSpacing('xs', 'xs')
  const actionGapMath = useSpacingMath('xs', 'xs')
  const side = useSpacing(APP_BAR_SIDE, APP_BAR_SIDE)
  const titleCss = usePartText('AppBar', 'title', text, 'titleM', 'onSurface')
  const subtitleCss = usePartText('AppBar', 'subtitle', text, 'bodyS', 'muted')
  const backCss = usePartColor('AppBar', 'backIcon', text, 'onSurface')
  return { title, subtitle, gap, gapMath, lineGap, actionGap, actionGapMath, side, titleCss, subtitleCss, backCss }
}
type BarLook = ReturnType<typeof useBarLook>

/** Who stands in the zones: the node of the leading zone or the back arrow, where the title is, the drawn actions. */
function barChildrenOf(node: UiNode, props: WidgetProps['props'], widthClass: WidthClass, scope: DataScope) {
  const showBack = props.showBack === true
  /*
   * The node of the leading zone (schema 9.16.0, `x-style.layout.appBarLeading`): the first child,
   * by the document, with the field `zone: 'leading'` (a button or an icon button). A VISIBLE one
   * replaces the built-in arrow whatever `showBack` says; one hidden by a condition leaves
   * `showBack` in charge. It is not an action: it does not count toward the limit of two actions,
   * and a second such child is drawn nowhere. A button with a label and WITHOUT the field is not
   * drawn, as before.
   */
  const children = node.children ?? []
  const leadingNode = appBarLeadingOf(children)
  const leadingVisible = leadingNode === undefined ? undefined : nodeShown(leadingNode, widthClass, scope)
  const shown = appBarLeadingShown(leadingVisible, showBack)
  const titleStart = titleAlignOf(props.titleAlign) === 'start'
  // The first two VISIBLE actions are drawn: one hidden by a condition does not count, anything past the second is not drawn.
  const allActions = appBarActionsOf(children)
  const drawn = appBarDrawnActions(allActions.map((action) => nodeShown(action, widthClass, scope)))
  const actions = allActions.filter((_action, index) => drawn[index] === true)
  const hasActions = actions.length > 0
  return { leadingNode, shown, titleStart, actions, hasActions }
}
type BarChildren = ReturnType<typeof barChildrenOf>
type NavView = ReturnType<typeof useWideNavView>

function leadingZone({ look, who, navView, labels, press }: { readonly look: BarLook; readonly who: BarChildren; readonly navView: NavView; readonly labels: ScreenLabels; readonly press: (() => void) | undefined }): ReactNode {
  const { gap, gapMath, side, backCss } = look
  const { shown, leadingNode } = who
  const square: CSSProperties = { flex: 'none', inlineSize: side, blockSize: side, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
  return (
      <div
      data-hl-zone="leading"
      style={{
        justifySelf: 'start',
        display: 'flex',
        alignItems: 'center',
        ...(shown === 'none' ? {} : { paddingInlineEnd: gap }),
        // The node is no wider than half the app bar plus the zone gap (`maxShare`): the title shrinks first. Navigation items that left less than half give the node only the remainder.
        ...(shown === 'node'
          ? {
              boxSizing: 'border-box',
              minInlineSize: 0,
              maxInlineSize: navView.leadingMax === undefined ? `calc(${cssNumber(APP_BAR_LEADING_MAX_SHARE * 100)}cqi + ${gapMath})` : `calc(${cssNumber(navView.leadingMax)}px + ${gapMath})`,
            }
          : {}),
      }}
    >
      {shown === 'back' ? (
        <button
          type="button"
          className={PRESSABLE_CLASS}
          {...{ [NAV_MARK.back]: '' }}
          aria-label={labels.back}
          onClick={press}
          onKeyDown={swallowAutoRepeat}
          style={{ ...square, font: productVar('typography', glyphTypographyOf('md')), lineHeight: 1, rotate: '180deg', ...backCss }}
        >
          <Glyph name="chevron" />
        </button>
      ) : null}
      {shown === 'node' && leadingNode !== undefined ? (
        <div {...{ [NAV_MARK.leadingNode]: '' }} style={{ display: 'flex', minInlineSize: 0, maxInlineSize: '100%' }}>
          <LeadingZoneContext.Provider value={true}>
            <NodeView node={leadingNode} />
          </LeadingZoneContext.Provider>
        </div>
      ) : null}
    </div>
  )
}

function titleZone(look: BarLook, titleStart: boolean): ReactNode {
  const { title, subtitle, lineGap, titleCss, subtitleCss } = look
  const oneLine: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  return (
    <div data-hl-zone="title" style={{ minInlineSize: 0, display: 'flex', flexDirection: 'column', gap: lineGap, textAlign: titleStart ? 'start' : 'center' }}>
      {/* The line text sits in its own inline element: its width is the natural width of the TEXT whatever the width of the line box (`wide-nav-view.ts`). */}
      <div style={{ ...titleCss, ...oneLine }}>
        <span {...{ [NAV_MARK.titleText]: '' }}>{title}</span>
      </div>
      {subtitle === '' ? null : (
        <div style={{ ...subtitleCss, ...oneLine }}>
          <span {...{ [NAV_MARK.titleText]: '' }}>{subtitle}</span>
        </div>
      )}
    </div>
  )
}

function trailingZone({ look, who, navView, navBar }: { readonly look: BarLook; readonly who: BarChildren; readonly navView: NavView; readonly navBar: UiNode | undefined }): ReactNode {
  const { gap, gapMath, actionGap, actionGapMath } = look
  const { actions, hasActions } = who
  return (
    <div data-hl-zone="trailing" style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: actionGap, ...(hasActions || navBar !== undefined ? { paddingInlineStart: gap } : {}) }}>
      {navBar === undefined ? null : (
        /* Between the items and the actions sits the gap of the APP BAR, not the action gap (`inAppBar.gapToActions`): the flex `gap` gives `xs` and the margin adds the rest. */
        <div {...{ [NAV_MARK.group]: '' }} data-hl-nav-mode={navView.mode ?? 'labels'} style={{ flex: 'none', display: 'flex', alignItems: 'center', ...(hasActions ? { marginInlineEnd: `calc(${gapMath} - ${actionGapMath})` } : {}) }}>
          <NavPlaceContext.Provider value="appBar">
            <NavModeContext.Provider value={navView.mode ?? 'labels'}>
              <NodeView node={navBar} />
            </NavModeContext.Provider>
          </NavPlaceContext.Provider>
        </div>
      )}
      {actions.map((action) => (
        <NodeView key={action.id} node={action} />
      ))}
    </div>
  )
}

/**
 * The app bar (schema 9.9.0, `x-style.layout.appBar`): three zones in reading order,
 * "arrow - title over subtitle - actions".
 *
 *  - ZONES: the leading zone holds the "back" arrow (an `xl` square, an `md` glyph) and an `sm` gap
 *    to the title, WHEN the arrow exists; the trailing zone holds the `IconButton` children in
 *    document order `xs` apart and an `sm` gap to the title, WHEN there are visible actions. An
 *    empty zone has neither size nor gap (`gapAppliesTo`). A child of another type is not drawn
 *    (`appBarChildren`); an action hidden by a condition takes no room.
 *  - The TITLE is centred in the APP BAR while it fits (`titlePlacement`). There is no counterweight
 *    opposite the arrow (`appBarTitleRoom`): the grid
 *    `minmax(max-content, 1fr) - minmax(0, auto) - minmax(max-content, 1fr)` gives the side columns
 *    equal shares, and a longer title takes all the room between the zones and moves away from the
 *    wider one. The title block is as wide as the longer of its two lines, each a single line with
 *    an ellipsis.
 *  - Across the line everything is centred; the app bar is as tall as its tallest zone.
 *  - In right-to-left writing the grid follows the `dir` of the root: the leading zone on the right,
 *    the actions on the left, the first action of the document nearest the title.
 *
 * The arrow is the `navigate.back` action, the same as a button with that action. The glyph is a
 * chevron rotated half a turn; in RTL the chevron is mirrored (`x-mirroredIcons`) and the arrow
 * points right, back to where the user came from.
 *
 * The bar background is `style.background`, as everywhere. Its absence is MEANINGFUL: "no own
 * background, the screen shows through". An action is painted by itself (`appBarActionColor`): a
 * colour named on the app bar does not apply to it, since an icon button takes its role and its own
 * style.
 */
export const AppBarView = screenPart(function AppBarView({ node, props, css: ownCss, text, mark }: WidgetProps): ReactNode {
  const scope = useData()
  const widthClass = useContext(WidthClassContext)
  const contentMax = useContext(ContentMaxContext)
  /*
   * Navigation items in the app bar (schema 9.18.0): on a wide place the screen root hands the
   * navigation bar to the app bar, and it sits in the TRAILING zone before the actions. The look of
   * the items (with labels or icons only) is decided by the reference implementation from the
   * measured app bar (`useWideNavView`); until measured, the labels are shown.
   */
  const navCtx = useContext(AppBarNavContext)
  const navBar = navCtx?.bar === node ? navCtx.navBar : undefined
  const theme = useTheme()
  const gridRef = useRef<HTMLElement | null>(null)
  const navView = useWideNavView(gridRef, navBar === undefined ? undefined : 'appBar', theme)
  // The top safe area inset (schema 9.19.0) lies inside the app bar box above its content: a named background covers the status bar.
  const css = withTopInset(ownCss, useContext(SafeTopContext), theme)
  const look = useBarLook(props, text)
  const press = usePress({ type: BACK_ACTION_TYPE }, node.id)
  const labels = useContext(LabelsContext)
  const who = barChildrenOf(node, props, widthClass, scope)
  const { titleStart } = who

  const gridStyle: CSSProperties = {
    display: 'grid',
    // `start` (schema 9.16.0): zones as wide as their content, the title takes the rest; without the field it is the 9.9.0 grid, the title centred in the APP BAR.
    gridTemplateColumns: titleStart ? 'max-content minmax(0, 1fr) max-content' : 'minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr)',
    alignItems: 'center',
    // The app bar is a size container: the leading zone node measures half of ITS width (`50cqi`), not of a grid cell.
    containerType: 'inline-size',
    // Even the icons and actions alone do not fit: the excess is clipped at the END of the app bar, the start of the row stays in place.
    ...(navBar === undefined ? {} : { overflowX: 'clip' as const }),
  }
  const zones = (
    <>
      {leadingZone({ look, who, navView, labels, press })}
      {titleZone(look, titleStart)}
      {trailingZone({ look, who, navView, navBar })}
    </>
  )

  /*
   * With a largest content width the app bar BOX stays between the root padding, and its background
   * and own padding stay on it; the content inside is limited: the zone grid becomes a column
   * centred in its own content box, and "half the app bar" for the leading zone node is half the
   * column.
   */
  if (contentMax !== undefined) {
    return (
      <header {...mark} data-hl-title-align={titleStart ? 'start' : undefined} style={css}>
        <div ref={gridRef as RefObject<HTMLDivElement>} data-hl-title-align={titleStart ? 'start' : undefined} data-hl-content="" style={{ ...gridStyle, ...contentColumn(contentMax) }}>
          {zones}
        </div>
      </header>
    )
  }
  return (
    <header ref={gridRef} {...mark} data-hl-title-align={titleStart ? 'start' : undefined} style={{ ...gridStyle, ...css }}>
      {zones}
    </header>
  )
})
