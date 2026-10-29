/**
 * The screen root: the zones (app bar, body, bottom zone), their look, and the root padding. The
 * contexts live in `contexts.ts`; the node view lives in `node-view.tsx` (references to it are needed
 * only at draw time, so the module cycle is safe).
 */

import { useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { contentMaxWidthOf } from '../width-class'
import { isReadableSpacingRef } from '../layer-placement'
import { screenChromeIn } from '../wide-chrome'
import { bodyStartsAtScreenTop } from '../screen-top'
import { navFloatsIn } from '../nav-float'
import { useIsomorphicLayoutEffect } from '../wide-nav-view'
import { mathLength, spacingMathCss } from '../resolve'
import { justifyLayout, mainJustifyOf } from '../alignment'
import { cssNumber } from '../sanitize'
import type { Theme } from '../theme'
import type { UiNode } from '../types'
import { useTheme,WidthClassContext, PullAxisContext, AnatomyContext, NavPlaceContext, AppBarNavContext, useData, ContentMaxContext, ZERO_INSET, SafeBottomContext, SafeTopContext } from './contexts'
import type { ListNumber, ScreenAnatomy } from './contexts'
import { COLUMN } from './flex-words'
import { NodeView } from './node-view'
import { useSpacing, useSpacingMath } from './prop-tokens'
import { nodeShown, numberedSiblings, SiblingViews, numbered } from './siblings'
import { createScrollStore, ScrolledBar, useBarScrollStore } from './bar-scrolled'
import type { ScrollStore } from './bar-scrolled'
import { scrolledLayerOf, titleOnlyWhenScrolled } from '../app-bar-scrolled'
import type { WidgetProps } from './widget-props'
import { screenPart } from './screen-part'
import { TOP_BAR_HEIGHT_VAR, TopPinnedZone } from './top-pinned-zone'


/**
 * THE SCREEN ZONES IN THIS CLASS AND ON THIS DATA (schema 9.9.0 + 9.12.0 + 9.18.0): one place.
 *
 * Which root child is in which zone is dictated by the DOCUMENT, and where the navigation bar stands
 * is dictated by the width class: both questions are asked once, in `screenChromeIn`. The app bar is
 * the first `AppBar` child; the navigation bar is the last `NavBar`; the pinned block is the last
 * child with `pin: "bottom"`, not counting the bar. A zone whose node is hidden (by a condition or a
 * class) does not exist: nobody else takes its place, and the root padding returns to the body. A
 * screen shown as a modal layer has no navigation bar at all (`navBarInModalLayer`). The rest is
 * the body.
 *
 * The bar is at the bottom on `compact` and with `widePlacement: bottom`; otherwise, on a wide place,
 * it is at the top: in the app bar if the app-bar zone is SHOWN, and without one as its own strip
 * in the app bar zone.
 */
interface ScreenZones {
  readonly bar: UiNode | undefined
  readonly pinned: UiNode | undefined
  /** The navigation bar in the bottom zone. */
  readonly bottomNav: UiNode | undefined
  /** The navigation bar as its own top strip (a wide place, no app bar). */
  readonly ownNav: UiNode | undefined
  /** The navigation bar whose items stand in the app bar. */
  readonly barNav: UiNode | undefined
  /** Where the navigation bar is now; `undefined` means it is not drawn. */
  readonly navPlace: 'bottom' | 'top' | 'appBar' | undefined
  /** The bar in the bottom zone floats (9.22.0, `NavBar.float`): the whole zone lies over the body. */
  readonly float: boolean
  /** The nodes pinned to the top (9.24.0, `pin: 'top'`) that are shown: they stand under the app bar zone and never scroll. */
  readonly topPinned: readonly UiNode[]
  readonly body: readonly UiNode[]
  /** The body starts at the top edge of the screen (`Screen.props.bodyTop`) and the app bar lies over it. */
  readonly atTop: boolean
  readonly firstInBody: UiNode | undefined
  /** Item numbers: a group is consecutive root children by the document, the pinned block included (it is a root child, only in another zone). */
  readonly numbers: ReadonlyMap<string, ListNumber> | undefined
}

function useScreenZones(node: UiNode, modal: boolean): ScreenZones {
  const scope = useData()
  const widthClass = useContext(WidthClassContext)
  const children = node.children ?? []
  const isShown = (child: UiNode): boolean => nodeShown(child, widthClass, scope)
  const shown = (candidate: UiNode | undefined): UiNode | undefined => (candidate !== undefined && isShown(candidate) ? candidate : undefined)
  const chrome = screenChromeIn(children, widthClass, isShown, node.props)
  const bar = shown(chrome.appBar)
  const navBar = modal ? undefined : shown(chrome.navBar)
  const navPlace = navBar === undefined ? undefined : chrome.navPlace
  return {
    bar,
    pinned: shown(chrome.pinned),
    bottomNav: navPlace === 'bottom' ? navBar : undefined,
    ownNav: navPlace === 'top' ? navBar : undefined,
    barNav: navPlace === 'appBar' && bar !== undefined ? navBar : undefined,
    navPlace,
    float: navFloatsIn(navPlace, navBar?.props),
    topPinned: chrome.topPinned.filter(isShown),
    body: chrome.body,
    // The bar's own strip never lies over the body: the word is not read on such a screen.
    atTop: bodyStartsAtScreenTop(node.props, navPlace === 'top' ? 'navBar' : bar === undefined ? 'none' : 'appBar'),
    firstInBody: chrome.body.find(isShown),
    numbers: numberedSiblings(children, scope, widthClass),
  }
}

/** Where the screen lives and which of its zones stick: one answer for the root, the body and both zones. */
interface ScreenFrame {
  /** The root has its own height (`scroll="screen"` or a modal layer): the body scrolls. Otherwise the host page scrolls. */
  readonly ownHeight: boolean
  readonly hasTop: boolean
  readonly hasBottom: boolean
  /** The zone sticks to the edge of the host page and needs the root sizes (backdrop, scroll padding). */
  readonly stickyTop: boolean
  readonly stickyBottom: boolean
  /** The top zone of nodes sticks too (9.24.0): together with the app bar zone, by the same host switch. */
  readonly stickyPinned: boolean
  /** The safe area inset under the bottom zone content (`bottomZone.safeArea`); zero means none is added. */
  readonly safe: string
  /** The inset of a modal SHEET without a bottom zone: a transparent strip inside the root box under the body (`sheetSafeBottom`); zero means none. */
  readonly sheetSafe: string
  /** The top safe area inset (`safeTop`): inside the app bar box when there is one, otherwise above the body area; zero means none is added. */
  readonly safeTop: string
}

function screenFrameOf(anatomy: ScreenAnatomy, zones: ScreenZones): ScreenFrame {
  const ownHeight = anatomy.scroll === 'screen' || anatomy.modal
  // The app bar zone: the app bar itself or (on a wide place without an app bar) the navigation bar's own top strip.
  const hasTop = zones.bar !== undefined || zones.ownNav !== undefined
  const hasBottom = zones.pinned !== undefined || zones.bottomNav !== undefined
  const sticks = !ownHeight && anatomy.chrome === 'sticky'
  const stickyBottom = sticks && hasBottom
  // A window in the middle has no inset; a block without its own height gets it only while the zone sticks.
  const insetApplies = anatomy.modal ? anatomy.windowed !== true : ownHeight || stickyBottom
  const stickyTop = sticks && hasTop
  // A modal layer has no inset; a block without its own height gets it only while the app bar sticks to the top of the window.
  const topApplies = !anatomy.modal && (ownHeight || stickyTop)
  return { ownHeight, hasTop, hasBottom, stickyTop, stickyBottom, stickyPinned: sticks && zones.topPinned.length > 0, safe: hasBottom && insetApplies ? anatomy.safeBottom : ZERO_INSET, sheetSafe: !hasBottom && anatomy.modal && anatomy.windowed !== true ? anatomy.safeBottom : ZERO_INSET, safeTop: topApplies ? anatomy.safeTop : ZERO_INSET }
}

/**
 * A PULLED FIRST BODY CHILD RAISES THE BODY AREA (schema 9.10.0): by the overlap, that is the `pull`
 * of the first VISIBLE child minus the screen gap, no less than zero. Without an app bar there is
 * nowhere to raise it. Computed with theme NUMBERS: the variable for `none` is a bare `0`, and
 * `calc(56px - var(--product-space-none))` is invalid (the body would not rise).
 */
function bodyOverlapOf(zones: ScreenZones, gapMath: string, theme: Theme): string | undefined {
  const first = zones.firstInBody
  // The body starts at the top of the screen: there is nowhere to raise it, and `pull` acts as on a screen without an app bar.
  if (zones.atTop || (zones.bar === undefined && zones.topPinned.length === 0) || first === undefined || first.type === 'AppBar' || !isReadableSpacingRef(first.pull)) return undefined
  return `max(0px, calc(${spacingMathCss(first.pull, theme) ?? '0px'} - ${gapMath}))`
}

/**
 * The root box. A screen with its own height (or a modal layer): the app bar and bottom zones do
 * not shrink, the body is the only scroll, and the root clips the body by its own radius
 * (`overflow: clip` does not touch the node's own shadow). A modal layer as tall as its content:
 * `flex: 0 1 auto`. The basis is `auto`, not `0`: a root without a given height (the host forgot to
 * give one) stays as tall as its content instead of zero. Without its own height the root grows with
 * its content (`flex-grow` is the screen's place in the HOST: the screen background reaches the
 * bottom of the layer instead of ending under the last widget).
 */
function screenRootCss(frame: ScreenFrame, modal: boolean, rest: CSSProperties): CSSProperties {
  if (!frame.ownHeight) return { ...COLUMN, flexGrow: 1, ...rest }
  return { ...COLUMN, flex: modal ? '0 1 auto' : '1 1 auto', minBlockSize: 0, ...rest, overflow: 'clip' }
}

/**
 * The body area. With its own height it is a scroll (vertical only) that ends at the top edge of the
 * bottom zone; a pulled first child raises it statically: a negative margin and an equal top
 * padding inside, so at rest the child stands where the flow puts it, and the body is painted OVER
 * the app bar and catches presses in the overlap strip. Without its own height the host page
 * scrolls, and the body merely lies over a stuck app bar (`body.paintOrder`).
 */
function screenBodyCss(frame: ScreenFrame, modal: boolean, overlap: string | undefined, sticky: boolean): CSSProperties {
  if (!frame.ownHeight) return { ...COLUMN, flex: '1 0 auto', ...(overlap !== undefined && sticky ? { position: 'relative', zIndex: 1 } : {}) }
  const raised: CSSProperties = overlap === undefined ? {} : { position: 'relative', marginBlockStart: `calc(-1 * ${overlap})`, paddingBlockStart: overlap }
  return { flex: modal ? '0 1 auto' : '1 1 auto', minBlockSize: 0, overflowY: 'auto', overflowX: 'hidden', ...COLUMN, ...raised }
}

/**
 * The screen root. Background and padding are its `style`, as for any node: a screen without
 * `style` has neither. The only layout prop is `gap`, the gap between the root children.
 *
 * THE MARKUP SHAPE IS ONE for all width classes and all zone combinations:
 *
 *     root -> [app bar zone] . body area -> body padding -> content column -> children . [bottom zone]
 *
 * The app bar and bottom zones are either present or absent, but the body ALWAYS stands at the same
 * depth in the same wrappers: a width class that turns on the content column (`contentMaxWidth`),
 * hides the app bar or the pinned block changes only styles. Otherwise React would rebuild the body
 * subtree: an input field would lose focus and unfinished typing, an expanded block would collapse
 * (the same rule as the carousel shell: the shell is always the same box).
 *
 * THE ROOT PADDING IS SPLIT between the zones: the app bar gets the top and side padding; the
 * pinned block the side and bottom padding; the body the side padding, with the screen GAP instead
 * of the top (a body without visible children has none) and, with a pinned block, a gap instead of
 * the bottom too; without an app bar the body gets the top padding, without a pinned block the
 * bottom one. The body padding lies on the body CONTENT, not on the scroll itself: browsers compute
 * the bottom padding of a scrolling element differently. The root background and the zone
 * backgrounds run edge to edge.
 */
export const ScreenRootView = screenPart(function ScreenRootView({ node, props, css, mark }: WidgetProps): ReactNode {
  const anatomy = useContext(AnatomyContext)
  const theme = useTheme()
  const gap = useSpacing(props.gap, 'sm')
  const gapMath = useSpacingMath(props.gap, 'sm')
  const zones = useScreenZones(node, anatomy.modal)
  const frame = screenFrameOf(anatomy, zones)
  const { padding, rest } = splitRootPadding(css)
  const contentMax = contentMaxWidthOf(props)
  // The main axis of the screen (schema 9.15.0): the body content is no shorter than the body area, and the free space is "the area minus what scrolls".
  const main = justifyLayout(mainJustifyOf(node), 'block', gapMath)
  const overlap = bodyOverlapOf(zones, gapMath, theme)
  // A floating zone has no backdrop (`navFloat.withoutOwnHeight.stuckBackdrop`): the body scrolls under it.
  const backdrop = frame.stickyTop || frame.stickyPinned || (frame.stickyBottom && zones.pinned !== undefined && !zones.float) ? backdropOf(rest) : NO_BACKDROP
  // The body starts at the top of the screen: the content shows through the app bar, so no backdrop is put under it (`stuckBackdrop`).
  const topBackdrop = zones.atTop ? NO_BACKDROP : backdrop
  const root = useRef<HTMLDivElement>(null)
  // The app bar after scrolling (9.21.0): listened to only when the bar zone asks for it (a layer or a title shown only when scrolled).
  const [barScroll] = useState(createScrollStore)
  const asks = zones.bar !== undefined && (scrolledLayerOf(zones.bar) !== undefined || titleOnlyWhenScrolled(zones.bar.props))
  useBarScrollStore(barScroll, root, { id: zones.bar?.id, enabled: asks, ownHeight: frame.ownHeight, shape: zones.atTop ? 'lifted' : 'flow' })
  useStickyBarMetrics(root, { bar: frame.stickyTop, pinned: frame.stickyPinned, bottom: frame.stickyBottom, floating: zones.float }, anatomy.stickyOffset, anatomy.stickyBottomOffset)
  useNavFocusCarry(root, zones.navPlace)
  const sides: CSSProperties = { paddingInlineStart: padding.inlineStart, paddingInlineEnd: padding.inlineEnd }
  const seam = zones.firstInBody === undefined ? undefined : gap
  // The usual end of the body, and with a floating bar the height of the whole bottom zone on top of it (measured by `useStickyBarMetrics`): the last row scrolls clear of the bar.
  const usualEnd = zones.pinned === undefined ? padding.blockEnd : seam
  const bodyEnd = zones.float ? `calc(${mathLength(usualEnd, theme)} + var(${FLOAT_HEIGHT_VAR}, 0px))` : usualEnd

  return (
    <div {...mark} ref={root} data-hl-body-top={zones.atTop ? 'screenTop' : undefined} style={screenRootCss(frame, anatomy.modal, rest)}>
      <ScreenTopZone zones={zones} frame={frame} contentMax={contentMax} sides={sides} padding={padding} backdrop={topBackdrop} stickyOffset={anatomy.stickyOffset} barScroll={barScroll} />
      <TopPinnedZone
        nodes={zones.topPinned}
        numbers={zones.numbers}
        lead={zones.bar === undefined ? padding.blockStart : gap}
        sides={sides}
        sticky={frame.stickyPinned}
        stickyOffset={anatomy.stickyOffset}
        backdrop={backdrop}
        backdropSize={{ width: `var(${BACKDROP_WIDTH_VAR}, 0px)`, height: `var(${BACKDROP_HEIGHT_VAR}, 0px)` }}
        column={(children) => <ContentColumn max={contentMax} style={{ gap }}>{children}</ContentColumn>}
      />
      <div data-hl-zone="body" style={screenBodyCss(frame, anatomy.modal, overlap, anatomy.chrome === 'sticky')}>
        <div style={{ ...COLUMN, flex: '1 0 auto', ...sides, paddingBlockStart: zones.bar === undefined && zones.topPinned.length === 0 ? padding.blockStart : zones.atTop ? undefined : seam, paddingBlockEnd: bodyEnd }}>
          <ContentColumn max={contentMax} attrs={main.attrs} style={{ flex: '1 0 auto', gap, ...main.style }}>
            <NodeChildren nodes={zones.body} numbers={zones.numbers} />
          </ContentColumn>
        </div>
      </div>
      {frame.sheetSafe === ZERO_INSET ? null : <div aria-hidden="true" data-hl-zone="safeBottom" style={{ flex: 'none', blockSize: frame.sheetSafe }} />}
      <ScreenBottomZone zones={zones} frame={frame} contentMax={contentMax} sides={sides} padding={padding} backdrop={backdrop} stickyOffset={anatomy.stickyBottomOffset} />
    </div>
  )
})

/** No backdrop: the zone is transparent and the root background itself is under it. */
const NO_BACKDROP: CSSProperties = {}

interface ScreenZoneProps {
  readonly zones: ScreenZones
  readonly frame: ScreenFrame
  readonly contentMax: number | undefined
  readonly sides: CSSProperties
  readonly padding: RootPadding
  /** The root background for the backdrop of a stuck zone (`backdropOf`); empty means no backdrop. */
  readonly backdrop: CSSProperties
  /** A ready CSS value for how far the zone sits from the edge it sticks to; `undefined` means zero. */
  readonly stickyOffset: string | undefined
  /** Whether the body is scrolled under the app bar (the top zone only; the bottom zone gets none). */
  readonly barScroll?: ScrollStore | undefined
}

/**
 * THE APP BAR ZONE: the app bar itself or the navigation bar's own top strip. It does not shrink; in
 * a block without its own height it sticks to the top of the host page (`chrome="sticky"`) or stays
 * the top row. The bar's own strip runs edge to edge and has no root padding.
 *
 * BACKDROP (`stuckBackdrop`): the root background AT THE SIZE OF THE ROOT, anchored to its top. At
 * rest the app bar matches pixel for pixel what the root would paint under it (no seam); once stuck
 * it shows the top slice of the background, as on mobile. The size comes from a variable written by
 * the root observer (`useStickyBarMetrics`); while it is absent (server, first frame) the backdrop
 * is zero and the zone is transparent, with the root background itself under it. The background is
 * not copied onto the zone ITSELF: a screen gradient would be squeezed into its 72 px.
 */
const ScreenTopZone = screenPart(function ScreenTopZone({ zones, frame, contentMax, sides, padding, backdrop, stickyOffset, barScroll }: ScreenZoneProps): ReactNode {
  const { bar, ownNav, barNav } = zones
  if (!frame.hasTop) {
    // No app bar: the inset goes above the body area. A body that starts at the screen top does not lie under it, so there is no inset above it (`bodyAtScreenTop`).
    return frame.safeTop === ZERO_INSET || zones.atTop ? null : <div aria-hidden="true" data-hl-zone="safeTop" style={{ flex: 'none', blockSize: frame.safeTop }} />
  }
  const inset: CSSProperties = bar === undefined ? {} : { ...sides, paddingBlockStart: padding.blockStart }
  const stuck: CSSProperties = frame.stickyTop ? { position: 'sticky', insetBlockStart: stickyOffset ?? '0px', zIndex: 1 } : {}
  const content = (
    <SafeTopContext.Provider value={frame.safeTop}>
      <ContentMaxContext.Provider value={contentMax}>
        {bar !== undefined ? (
          <AppBarNavContext.Provider value={barNav === undefined ? undefined : { bar, navBar: barNav }}>
            {barScroll === undefined ? <NodeView node={bar} /> : <ScrolledBar node={bar} store={barScroll}><NodeView node={bar} /></ScrolledBar>}
          </AppBarNavContext.Provider>
        ) : ownNav !== undefined ? (
          <NavPlaceContext.Provider value="top">
            <ZoneNode node={ownNav} />
          </NavPlaceContext.Provider>
        ) : null}
      </ContentMaxContext.Provider>
    </SafeTopContext.Provider>
  )
  /*
   * A BODY THAT STARTS AT THE SCREEN TOP: the app bar zone has zero height and does not push the
   * body down, while the app bar itself overflows it and lies OVER the body in its place (in the
   * root padding, under the inset). The zone catches no events but the app bar node box does: every
   * pixel of that box owns the press, while the root side padding next to it belongs to the body
   * under it. `display: contents` only carries `pointer-events: auto` down to the app bar and has no
   * box of its own.
   */
  if (zones.atTop && bar !== undefined) {
    return (
      <div data-hl-zone="appBar" data-hl-lifted="" style={{ flex: 'none', blockSize: 0, position: frame.stickyTop ? 'sticky' : 'relative', zIndex: 1, ...(frame.stickyTop ? { insetBlockStart: stickyOffset ?? '0px' } : {}) }}>
        <div style={{ position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, insetBlockStart: 0, pointerEvents: 'none', ...inset }}>
          <div style={{ display: 'contents', pointerEvents: 'auto' }}>{content}</div>
        </div>
      </div>
    )
  }
  return (
    <div data-hl-zone={bar === undefined ? 'navTop' : 'appBar'} style={{ flex: 'none', ...inset, ...stuck }}>
      {frame.stickyTop && Object.keys(backdrop).length > 0 ? (
        <div aria-hidden="true" data-hl-backdrop="" style={BACKDROP_CLIP}>
          <div style={{ ...backdrop, inlineSize: `var(${BACKDROP_WIDTH_VAR}, 0px)`, blockSize: `var(${BACKDROP_HEIGHT_VAR}, 0px)` }} />
        </div>
      ) : null}
      {content}
    </div>
  )
})

/**
 * THE BOTTOM ZONE (schema 9.12.0): the pinned block above the navigation bar. It does not shrink; in
 * a block without its own height it sticks to the bottom. The bar has no root padding; the pinned
 * block gets the side and bottom padding.
 *
 * THE BOTTOM SAFE AREA INSET (`bottomZone.safeArea`): the reader adds it UNDER the zone content.
 * With a bar it lies within the bar background (`SafeBottomContext`); without a bar it is a
 * transparent space under the bottom root padding (`safeArea.pinnedOnly`). The backdrop mirrors
 * the app bar backdrop, anchored to the BOTTOM of the root.
 */
const ScreenBottomZone = screenPart(function ScreenBottomZone({ zones, frame, contentMax, sides, padding, backdrop, stickyOffset }: ScreenZoneProps): ReactNode {
  const theme = useTheme()
  const { pinned, bottomNav, numbers } = zones
  if (!frame.hasBottom) return null
  const stuck: CSSProperties = frame.stickyBottom ? { position: 'sticky', insetBlockEnd: stickyOffset ?? '0px', zIndex: 1 } : {}
  const clear = bottomNav === undefined && frame.safe !== ZERO_INSET ? `calc(${mathLength(padding.blockEnd, theme)} + ${frame.safe})` : padding.blockEnd
  const pinnedView =
    pinned === undefined ? null : (
      <div data-hl-zone="pinned" style={{ ...COLUMN, ...sides, paddingBlockEnd: clear, ...(zones.float ? CATCHES_PRESSES : {}) }}>
        <ContentColumn max={contentMax}>{numbered(numbers, pinned, <ZoneNode node={pinned} />)}</ContentColumn>
      </div>
    )
  // The inset lies INSIDE the bar background, or, with a floating bar, under the box of the bar and transparent (it is the padding of the zone).
  const barView =
    bottomNav === undefined ? null : (
      <div data-hl-zone="navBar" style={{ ...COLUMN, ...(zones.float ? CATCHES_PRESSES : {}) }}>
        <SafeBottomContext.Provider value={zones.float ? ZERO_INSET : frame.safe}>
          <ContentMaxContext.Provider value={contentMax}>
            <ZoneNode node={bottomNav} />
          </ContentMaxContext.Provider>
        </SafeBottomContext.Provider>
      </div>
    )
  /*
   * A FLOATING ZONE (9.22.0, `x-style.layout.navFloat`): the zone has no height in the flow, so the
   * body area runs to the bottom of the screen, and its content is the box that grows UP from the
   * bottom edge over the body. It sticks to the bottom of the host page (or stays at the end of the
   * root with its own height). Only the boxes of the pinned block and of the bar catch presses: the
   * rest of the zone, the side margin of a pill included, lets them through to the body. The safe inset
   * is the padding under the bar, so the zone height measured for the tail of the body includes it.
   */
  if (zones.float) {
    return (
      <div data-hl-zone="bottom" data-hl-floating="" style={{ flex: 'none', blockSize: 0, position: 'relative', zIndex: 1, ...stuck }}>
        <div style={{ position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, insetBlockEnd: 0, ...COLUMN, paddingBlockEnd: frame.safe, pointerEvents: 'none' }}>
          {pinnedView}
          {barView}
        </div>
      </div>
    )
  }
  return (
    <div data-hl-zone="bottom" style={{ flex: 'none', ...COLUMN, ...stuck }}>
      {Object.keys(backdrop).length === 0 ? null : (
        <div aria-hidden="true" data-hl-backdrop="" style={{ ...BACKDROP_CLIP, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
          <div style={{ ...backdrop, flex: 'none', inlineSize: `var(${BACKDROP_WIDTH_VAR}, 0px)`, blockSize: `var(${BACKDROP_HEIGHT_VAR}, 0px)` }} />
        </div>
      )}
      {pinnedView}
      {barView}
    </div>
  )
})

/** The box of a part of a floating zone catches presses; the zone around it lets them through. */
const CATCHES_PRESSES: CSSProperties = { pointerEvents: 'auto' }

/**
 * THE CONTENT COLUMN of the body and the pinned block (schema 9.18.0). The wrapper is ALWAYS there,
 * even when no largest width is named: then it simply fills the whole box. With `contentMaxWidth`
 * it becomes no wider than the number, CENTRED (`contentColumn`); the zone padding stays on the
 * outer box. The app bar and the navigation bar limit their own content: `ContentMaxContext` gives
 * them the number. The `data-hl-content` mark is a hook for host tests, like the zone marks.
 */
export const ContentColumn = screenPart(function ContentColumn({ max, attrs, style, children }: { readonly max: number | undefined; readonly attrs?: Readonly<Record<string, string>>; readonly style?: CSSProperties; readonly children: ReactNode }): ReactNode {
  return (
    <div {...attrs} data-hl-content="" style={{ ...COLUMN, ...style, ...(max === undefined ? {} : contentColumn(max)) }}>
      {children}
    </div>
  )
})

/**
 * FOCUS ON A NAVIGATION ITEM MOVES WITH THE BAR. A bottom bar and items in the app bar are
 * different places in the markup, so when the width class changes the item buttons are rebuilt; the
 * focused item would vanish and focus would fall on `<body>`, and the next Tab would start from the
 * HOST page. We remember which item has focus (from the root focus events) and after the move put
 * focus on the same item in its new place, but only if focus was really lost and did not move
 * elsewhere.
 */
function useNavFocusCarry(root: RefObject<HTMLElement | null>, navPlace: ScreenZones['navPlace']): void {
  const focusedItem = useRef<string | undefined>(undefined)
  useEffect(() => {
    const element = root.current
    if (element === null) return undefined
    const onFocusIn = (event: globalThis.FocusEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null
      focusedItem.current = target?.closest('nav') == null ? undefined : (target.getAttribute('data-hl-node') ?? undefined)
    }
    // It left by itself (Tab, a click elsewhere): forget it. It vanished with the markup (the node is no longer in the document): remember it.
    const onFocusOut = (event: globalThis.FocusEvent): void => {
      if (event.target instanceof Node && event.target.isConnected) focusedItem.current = undefined
    }
    element.addEventListener('focusin', onFocusIn)
    element.addEventListener('focusout', onFocusOut)
    return () => {
      element.removeEventListener('focusin', onFocusIn)
      element.removeEventListener('focusout', onFocusOut)
    }
  }, [root])
  const previousPlace = useRef(navPlace)
  useIsomorphicLayoutEffect(() => {
    const moved = previousPlace.current !== navPlace
    previousPlace.current = navPlace
    const element = root.current
    const id = focusedItem.current
    if (!moved || element === null || id === undefined) return
    const active = element.ownerDocument.activeElement
    if (active !== null && active !== element.ownerDocument.body) return
    const item = Array.from(element.querySelectorAll<HTMLElement>('nav [data-hl-node]')).find((candidate) => candidate.getAttribute('data-hl-node') === id)
    item?.focus({ preventScroll: true })
  }, [root, navPlace])
}

/**
 * The content column: no wider than `max`, CENTRED in the box it stands in (the remainder is equal on
 * both sides, also in right-to-left writing); a narrower box leaves the column unchanged. A wrapper,
 * not `calc()` padding: the spacing token `none` is `0` WITHOUT a unit, and CSS discards `max(0, 16px)`
 * or `calc(0 - 16px)` entirely, so the padding would silently vanish. Here a zero takes no part in
 * the arithmetic.
 */
export function contentColumn(max: number): CSSProperties {
  return { inlineSize: '100%', maxInlineSize: `${cssNumber(max)}px`, marginInline: 'auto', minInlineSize: 0 }
}

/**
 * A node of the bottom zone. Its `pull` is not read (`pinned.pull`), and its width is that of a child
 * of the root column: `ColumnParentContext` stays inherited from the root.
 */
const ZoneNode = screenPart(function ZoneNode({ node }: { readonly node: UiNode }): ReactNode {
  return (
    <PullAxisContext.Provider value={undefined}>
      <NodeView node={node} />
    </PullAxisContext.Provider>
  )
})

const NodeChildren = screenPart(function NodeChildren({ nodes, numbers }: { nodes: readonly UiNode[]; numbers?: ReadonlyMap<string, ListNumber> | undefined }): ReactNode {
  return <SiblingViews nodes={nodes} numbers={numbers} />
})

interface RootPadding {
  readonly blockStart: string | undefined
  readonly blockEnd: string | undefined
  readonly inlineStart: string | undefined
  readonly inlineEnd: string | undefined
}

const PADDING_KEYS = ['padding', 'paddingBlockStart', 'paddingBlockEnd', 'paddingInlineStart', 'paddingInlineEnd'] as const

/** The root padding apart from the rest of its box: it is divided between the zones and does not lie on the root. */
export function splitRootPadding(css: CSSProperties): { readonly padding: RootPadding; readonly rest: CSSProperties } {
  const source = css as Readonly<Record<string, unknown>>
  const text = (key: string): string | undefined => {
    const value = source[key]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
  }
  const all = text('padding')
  const padding: RootPadding = {
    blockStart: text('paddingBlockStart') ?? all,
    blockEnd: text('paddingBlockEnd') ?? all,
    inlineStart: text('paddingInlineStart') ?? all,
    inlineEnd: text('paddingInlineEnd') ?? all,
  }
  const rest: Record<string, unknown> = { ...source }
  for (const key of PADDING_KEYS) Reflect.deleteProperty(rest, key)
  return { padding, rest: rest }
}

/** The root size variables that a stuck app bar takes for the backdrop and the scroll padding. Our own, not theme tokens. */
const BACKDROP_WIDTH_VAR = '--hl-backdrop-w'
const BACKDROP_HEIGHT_VAR = '--hl-backdrop-h'
const STICKY_CLEAR_VAR = '--hl-sticky-clear'
const STICKY_CLEAR_END_VAR = '--hl-sticky-clear-end'
/** The height of a floating bottom zone, whole: the end of the body adds it so the last row scrolls clear of the bar. */
const FLOAT_HEIGHT_VAR = '--hl-float-h'

/** The app bar backdrop: a window as large as the zone that clips the root background; behind the app bar content, catches no touches. */
const BACKDROP_CLIP: CSSProperties = { position: 'absolute', inset: 0, overflow: 'clip', zIndex: -1, pointerEvents: 'none' }

/**
 * THE ROOT SIZES for a sticking app bar: an observer writes onto the screen root the width and
 * height of its box (the background backdrop) and the offset below the app bar that focus must stay
 * under (`zone height + stickyOffset`). CSS variables rather than React state: nothing is redrawn
 * and the layout does not loop (a variable does not change the root size, since the backdrop is out
 * of flow). Without `ResizeObserver` (server, an old engine) there are no variables, and the app
 * bar stays transparent over the unmoving root background.
 */
interface StickyZones {
  /** The app bar sticks to the top of the host page. */
  readonly bar: boolean
  /** The top zone of nodes sticks under it (9.24.0). */
  readonly pinned: boolean
  /** The bottom zone sticks to the bottom of the host page. */
  readonly bottom: boolean
  /** The bottom zone floats over the body (9.22.0): its height is the tail of the body. */
  readonly floating: boolean
}

function useStickyBarMetrics(root: RefObject<HTMLDivElement | null>, zones: StickyZones, offset: string | undefined, bottomOffset: string | undefined): void {
  const { bar, pinned, bottom, floating } = zones
  useEffect(() => {
    const element = root.current
    if ((!bar && !pinned && !bottom && !floating) || element === null) return undefined
    const { topBox, pinnedBox, low } = zoneBoxes(element, { bar, pinned, bottom, floating })
    const write = (): void => {
      const width = element.clientWidth
      const height = element.clientHeight
      if (width <= 0 || height <= 0) return
      element.style.setProperty(BACKDROP_WIDTH_VAR, `${String(width)}px`)
      element.style.setProperty(BACKDROP_HEIGHT_VAR, `${String(height)}px`)
      if (bar || pinned) writeTopMetrics(element, { topBox, pinnedBox }, offset)
      // The mirror of the app bar offset: a focused element does not hide under a stuck or floating bottom zone.
      if (bottom || floating) element.style.setProperty(STICKY_CLEAR_END_VAR, `calc(${String(low?.offsetHeight ?? 0)}px + ${bottomOffset ?? '0px'})`)
      if (floating) element.style.setProperty(FLOAT_HEIGHT_VAR, `${String(low?.offsetHeight ?? 0)}px`)
    }
    write()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(write)
    observer?.observe(element)
    if (topBox instanceof HTMLElement) observer?.observe(topBox)
    if (pinnedBox !== null) observer?.observe(pinnedBox)
    if (low !== null) observer?.observe(low)
    return () => {
      observer?.disconnect()
      for (const name of [BACKDROP_WIDTH_VAR, BACKDROP_HEIGHT_VAR, STICKY_CLEAR_VAR, STICKY_CLEAR_END_VAR, FLOAT_HEIGHT_VAR, TOP_BAR_HEIGHT_VAR]) element.style.removeProperty(name)
    }
  }, [root, bar, pinned, bottom, floating, offset, bottomOffset])
}

/** The boxes the sticky metrics measure: the app bar, the top zone of nodes and the bottom zone (when each one sticks or floats). */
function zoneBoxes(element: HTMLElement, zones: StickyZones): { readonly topBox: Element | null | undefined; readonly pinnedBox: HTMLElement | null; readonly low: HTMLElement | null } {
  const top = zones.bar ? element.querySelector<HTMLElement>(':scope > [data-hl-zone="appBar"], :scope > [data-hl-zone="navTop"]') : null
  const zone = zones.bottom || zones.floating ? element.querySelector<HTMLElement>(':scope > [data-hl-zone="bottom"]') : null
  // A floating zone has no height of its own: the box that grows up from its bottom edge is what to measure.
  const low = zone?.hasAttribute('data-hl-floating') === true && zone.firstElementChild instanceof HTMLElement ? zone.firstElementChild : zone
  // An app bar lying over the body sits in a zero-height zone: measure its box, not the zone.
  const topBox = top?.hasAttribute('data-hl-lifted') === true ? top.firstElementChild : top
  return { topBox, pinnedBox: zones.pinned ? element.querySelector<HTMLElement>(':scope > [data-hl-zone="topPinned"]') : null, low }
}

/** The height of the stuck app bar zone (for the top zone to stick under it) and how far a focused element stays from the top: both zones and the offset. */
function writeTopMetrics(element: HTMLElement, boxes: { readonly topBox: Element | null | undefined; readonly pinnedBox: HTMLElement | null }, offset: string | undefined): void {
  const barHeight = boxes.topBox instanceof HTMLElement ? boxes.topBox.offsetHeight : 0
  element.style.setProperty(TOP_BAR_HEIGHT_VAR, `${String(barHeight)}px`)
  element.style.setProperty(STICKY_CLEAR_VAR, `calc(${String(barHeight + (boxes.pinnedBox?.offsetHeight ?? 0))}px + ${offset ?? '0px'})`)
}

/** The screen root background for a stuck app bar zone: the same declaration (`stuckBackdrop`). A root without a background gives a transparent zone. */
function backdropOf(rest: CSSProperties): CSSProperties {
  const picked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(rest)) if (key.startsWith('background')) picked[key] = value
  return picked
}
