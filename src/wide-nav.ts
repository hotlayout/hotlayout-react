/** Navigation items at the top on a wide place: the mirror of `x-style.layout.wideNav`, the zones of the app bar with the items, the own top bar. */
import { DEFAULT_NAV_WIDE_PLACEMENT, NAV_WIDE_PLACEMENTS } from './bottom-zone'
import type { BottomZoneInput } from './bottom-zone'
import { appBarZones, screenZonesOf } from './media-chrome'
import type { AppBarZones, AppBarZonesInput, ScreenZonesInput, ScreenZonesResult } from './media-chrome'
import { WIDE_WIDTH_CLASSES } from './wide-chrome'
import type { NavBarPlace } from './wide-chrome'

/** How much room the app bar title keeps, in points, while item labels are still shown. */
export const WIDE_NAV_TITLE_KEEPS = 120
/** The largest width of an item label at the top, in points; a longer one gets an ellipsis. */
export const WIDE_NAV_LABEL_MAX = 160

/** Look of the items at the top: with labels, or drawings only. */
export const WIDE_NAV_MODES = ['labels', 'icons'] as const
export type WideNavMode = (typeof WIDE_NAV_MODES)[number]

/**
 * NAVIGATION BAR IN A WIDE PLACE: data (`x-style.layout.wideNav`).
 *
 * AN ITEM is a drawing and a label IN A ROW (`item`): a wide place has room for the label beside
 * it, while "drawing above the label" is the form of the bottom bar. The item's width is
 * NATURAL and there are no equal shares: a fifth of a 1280 strip is 250 points for the word
 * "Home". The label uses the `bodyM` style: next to the app bar title it must read as menu text,
 * not as a caption under an icon. Color, the active item, pressing and semantics are the same as
 * at the bottom (`x-style.layout.navBar`): it is the same node in a different place.
 *
 * IN THE APP BAR (`inAppBar`) THERE IS ONE BAR, NOT TWO STRIPS. The order in the row: leading
 * zone -> title -> navigation items -> actions. The items belong to the TRAILING zone and stand
 * in it before the actions, so the app bar rule of 9.9-9.16 stays the same: the title is
 * centered in the bar until it would reach a zone, and shifts exactly as much as needed not to;
 * the leading-zone node is at most half; `titleAlign` works as before. The panel's box
 * (background, border, padding, shadow) is NOT drawn in the app bar, since there is one bar; the
 * color and font named on the panel are inherited by the items.
 *
 * OWN STRIP (`ownBar`) is used when there is no app bar zone: it stands in the app bar zone (at
 * the top, does not scroll), edge to edge like the bottom bar; background and border are on the
 * panel node, the line is now at the BOTTOM. Items start at the row start. The root's top
 * padding stays with the body, inside the scroll, mirroring the "bottom bar without a pinned
 * block" rule.
 *
 * WHEN IT DOES NOT FIT (`overflow`), in order:
 *
 *  1. the title shrinks, down to `titleKeeps` points (or to its own width if it is shorter);
 *  2. item labels hide, ALL TOGETHER, leaving drawings; the label remains the item's accessible
 *     name. They are not hidden one by one: a row of "two with a label, three without" would
 *     read as two kinds of item;
 *  3. the title shrinks further, down to zero;
 *  4. the leading-zone node shrinks below its half;
 *  5. item drawings and actions never shrink: the excess is clipped by the app bar edge.
 *
 * Steps 1, 3 and 4 are the 9.16.0 rule ("the title shrinks first, then the zone node, actions
 * never"); only the second is new, and it comes BEFORE the title would vanish completely.
 *
 * THE BOTTOM ZONE in a wide place (`bottomZone`) is only the pinned block; without it there is
 * no zone, and the reader adds no bottom safe area inset.
 */
export const WIDE_NAV_LAYOUT = {
  field: 'widePlacement',
  on: 'NavBar',
  values: [...NAV_WIDE_PLACEMENTS],
  default: DEFAULT_NAV_WIDE_PLACEMENT,
  unknown: 'default',
  classes: [...WIDE_WIDTH_CLASSES],
  measured: 'the-width-class-of-the-screen-box',
  compact: 'bottom-whatever-the-field-says',
  document: 'unchanged-the-nav-bar-stays-the-last-child-of-the-screen-root',
  place: {
    bottom: 'bottom-zone-on-every-width-as-on-compact',
    topWithAppBar: 'items-inside-the-app-bar',
    topWithoutAppBar: 'own-bar-in-the-app-bar-zone',
    appBarCounts: 'the-app-bar-zone-that-is-shown-in-this-class-and-by-its-condition',
    hiddenNavBar: 'drawn-nowhere',
    inModalLayer: 'not-drawn',
    notLast: 'ordinary-child-of-the-body',
  },
  item: {
    direction: 'icon-before-label',
    align: 'centered-on-the-cross-axis',
    paddingBlock: 'sm',
    paddingInline: 'md',
    gap: 'xs',
    iconSize: 'md',
    labelTypography: 'bodyM',
    labelLines: 1,
    labelMaxWidth: WIDE_NAV_LABEL_MAX,
    labelOverflow: 'ellipsis',
    width: 'natural-padding-icon-gap-label-padding',
    iconOnlyWidth: 'padding-icon-padding',
    height: 'padding-plus-the-taller-of-icon-box-and-label-line-plus-padding',
    shares: 'none',
    between: 'xs',
    order: 'reading-direction-first-item-at-the-inline-start',
    drawn: 'navBar.items-first-five-visible',
    touchArea: 'the-item-box',
    unknownIcon: 'empty-box-of-the-same-size',
  },
  color: 'x-style.layout.navBar.color',
  active: 'x-style.layout.navBar.active',
  press: 'x-style.layout.navBar.press',
  semantics: 'x-style.layout.navBar.semantics',
  inAppBar: {
    order: ['leading', 'title', 'navItems', 'actions'],
    zone: 'trailing-before-the-actions',
    gapToActions: 'appBar.gap',
    gapToTitle: 'appBar.gap',
    title: 'appBar.titlePlacement-the-nav-items-count-as-the-trailing-zone',
    titleAlign: 'appBarTitle-as-is',
    leading: 'appBarLeading-as-is',
    navBarBox: 'not-drawn-background-border-padding-shadow-radius-size-of-the-nav-bar-are-not-read',
    inherits: 'color-and-typography-named-on-the-nav-bar',
    height: 'appBar.height-the-nav-items-are-a-zone',
    crossAlign: 'appBar.crossAlign',
    contentMaxWidth: 'inside-the-app-bar-content-column',
  },
  ownBar: {
    zone: 'appBar',
    position: 'top-of-the-screen-fixed',
    width: 'edge-to-edge-root-padding-does-not-apply',
    surface: {
      background: 'surface',
      borderBottom: { width: 1, color: 'border' },
      named: 'style-background-replaces-the-background-style-border-replaces-the-bottom-line',
    },
    items: 'from-the-inline-start',
    height: 'bottom-border-plus-item-height',
    contentMaxWidth: 'items-inside-the-content-column-the-box-stays-edge-to-edge',
    rootPaddingTop: 'stays-with-the-body-inside-scroll',
    bodyArea: 'from-the-bottom-edge-of-the-bar',
    pulledFirstChild: 'as-without-an-app-bar',
    safeAreaTop: 'reader-adds-nothing',
  },
  overflow: {
    order: ['title-down-to-titleKeeps', 'labels-hidden', 'title-down-to-zero', 'leading-node', 'clipped'],
    titleKeeps: WIDE_NAV_TITLE_KEEPS,
    titleShorter: 'keeps-its-own-width',
    labelsHidden: 'all-at-once-icons-only',
    hiddenLabel: 'stays-the-accessible-name',
    perItem: 'no',
    neverShrink: ['nav-item-icons', 'actions'],
    clipped: 'at-the-end-edge-of-the-bar',
    ownBar: 'labels-hidden-when-the-items-do-not-fit-then-clipped',
    rounding: 'none',
  },
  bottomZone: 'pinned-block-only-no-zone-without-it',
  safeAreaBottom: 'bottomZone.safeArea-only-when-the-zone-exists',
  sections: 'every-section-carries-the-same-widePlacement',
  olderReader: 'nav-bar-at-the-bottom-on-every-width',
} as const

/** Numbers of a navigation item at the top, in theme points. */
export interface WideNavMetrics {
  /** Side padding of an item (`item.paddingInline`). */
  readonly paddingInline: number
  /** Width of the drawing box: the font size of the text style of the `item.iconSize` step (`x-style.layout.iconGlyphTypography`). */
  readonly iconWidth: number
  /** Gap between the drawing and the label (`item.gap`). */
  readonly gap: number
  /** Gap between items (`item.between`). */
  readonly between: number
}

/** REFERENCE: the width of one item at the top. `labelWidth` is the natural width of the label on one line. */
export function wideNavItemWidth(labelWidth: number, metrics: WideNavMetrics, mode: WideNavMode): number {
  const box = metrics.paddingInline + metrics.iconWidth + metrics.paddingInline
  if (mode === 'icons') return box
  return box + metrics.gap + Math.min(Math.max(0, labelWidth), WIDE_NAV_LABEL_MAX)
}

/** REFERENCE: the width of a group of items with gaps; zero without items. */
export function wideNavGroupWidth(labelWidths: readonly number[], metrics: WideNavMetrics, mode: WideNavMode): number {
  if (labelWidths.length === 0) return 0
  return labelWidths.reduce((sum, width) => sum + wideNavItemWidth(width, metrics, mode), 0) + (labelWidths.length - 1) * metrics.between
}

/** REFERENCE: the height of an item at the top (`item.height`). */
export function wideNavItemHeight(metrics: { readonly paddingBlock: number; readonly iconBox: number; readonly labelLine: number }): number {
  return metrics.paddingBlock + Math.max(metrics.iconBox, metrics.labelLine) + metrics.paddingBlock
}

/** REFERENCE: the height of the own top strip (`ownBar.height`); `borderBottom` is zero when the node named its own border. */
export function wideNavBarHeight(metrics: { readonly paddingBlock: number; readonly iconBox: number; readonly labelLine: number; readonly borderBottom: number }): number {
  return wideNavItemHeight(metrics) + metrics.borderBottom
}

function itemStartsOf(from: number, labelWidths: readonly number[], metrics: WideNavMetrics, mode: WideNavMode): { readonly starts: readonly number[]; readonly widths: readonly number[] } {
  let cursor = from
  const widths = labelWidths.map((width) => wideNavItemWidth(width, metrics, mode))
  const starts = widths.map((width) => {
    const start = cursor
    cursor += width + metrics.between
    return start
  })
  return { starts, widths }
}

export interface WideAppBarInput extends AppBarZonesInput {
  /** Natural widths of the labels of the DRAWN items (`navDrawnItems`), in document order. */
  readonly navLabels: readonly number[]
  readonly nav: WideNavMetrics
}

export interface WideAppBarZones extends AppBarZones {
  readonly navMode: WideNavMode
  /** Offset of the item group from the row START (in reading order) and its width. */
  readonly navStart: number
  readonly navWidth: number
  /** Offsets and widths of the items, in document order. */
  readonly navItemStarts: readonly number[]
  readonly navItemWidths: readonly number[]
  /** Even with drawings only the row is wider than the app bar: its edge clips the excess. */
  readonly clipped: boolean
}

/**
 * REFERENCE: app bar zones with navigation items (`wideNav.inAppBar`, `overflow`).
 *
 * Items with actions are ONE block of the trailing zone: "items, app bar gap, actions". The same
 * `appBarZones` as before 9.18.0 does the rest: the title, the leading zone and the centering
 * rule stay its business; here is only the look of the items and their places inside the block.
 *
 * LABELS ARE SHOWN when everything fits together: the leading zone, a title no narrower than
 * `titleKeeps` (or than itself if shorter) and the trailing zone with labels. The condition
 * reads only NATURAL widths, which do not depend on the chosen look: a measurement must not
 * change what it measures.
 */
export function wideAppBarZones(input: WideAppBarInput): WideAppBarZones {
  const actions = input.actionSides.reduce((sum, side) => sum + side, 0) + Math.max(0, input.actionSides.length - 1) * input.actionGap
  const blockOf = (mode: WideNavMode): number => {
    const group = wideNavGroupWidth(input.navLabels, input.nav, mode)
    return group + (group > 0 && actions > 0 ? input.gap : 0) + actions
  }
  // The leading zone as the app bar counts it: a node at most half, an arrow is a square, plus the gap.
  const plain = appBarZones({ ...input, actionSides: [], titleNatural: 0 })
  const need = Math.min(Math.max(0, input.titleNatural), WIDE_NAV_TITLE_KEEPS)
  const trailingOf = (block: number): number => (block > 0 ? block + input.gap : 0)
  const navMode: WideNavMode = plain.leading + need + trailingOf(blockOf('labels')) <= input.width ? 'labels' : 'icons'
  const block = blockOf(navMode)
  const trailing = trailingOf(block)
  /*
   * THE LEADING-ZONE NODE SHRINKS LAST of what shrinks: when the title has nothing left to give,
   * the zone gets what the items and actions left. While there is room, this number is larger
   * than half the app bar and changes nothing.
   */
  const leadingRoom = Math.max(0, input.width - trailing - input.gap)
  const leadingNatural = input.leadingNatural === undefined ? undefined : Math.min(input.leadingNatural, leadingRoom)
  const zones = appBarZones({ ...input, leadingNatural, actionSides: block > 0 ? [block] : [] })
  const navWidth = wideNavGroupWidth(input.navLabels, input.nav, navMode)
  /*
   * The block is pressed to the END of the row; if it does not fit (drawings and actions alone
   * are wider than what is left), it starts right after the leading zone, and the excess is
   * clipped by the app bar edge from the end (`overflow.clipped`): the row start stays in place.
   */
  const navStart = Math.max(input.width - block, zones.leading)
  const items = itemStartsOf(navStart, input.navLabels, input.nav, navMode)
  let cursor = navStart + block - actions
  const actionStarts = input.actionSides.map((side) => {
    const start = cursor
    cursor += side + input.actionGap
    return start
  })
  return {
    ...zones,
    actionStarts,
    navMode,
    navStart,
    navWidth,
    navItemStarts: items.starts,
    navItemWidths: items.widths,
    clipped: zones.leading + trailing > input.width,
  }
}

export interface WideNavBarBox {
  readonly navMode: WideNavMode
  readonly navWidth: number
  /** Offsets of the items from the row START (in reading order) and their widths. */
  readonly navItemStarts: readonly number[]
  readonly navItemWidths: readonly number[]
  readonly clipped: boolean
}

/**
 * REFERENCE: items in the OWN top strip (`wideNav.ownBar`). `width` is the width of the strip's
 * content (the screen's content column, if named). Items start at the row start; if they do not
 * fit with labels, drawings only; if they do not fit even so, the edge clips.
 */
export function wideNavBarOf(input: { readonly width: number; readonly navLabels: readonly number[]; readonly nav: WideNavMetrics }): WideNavBarBox {
  const navMode: WideNavMode = wideNavGroupWidth(input.navLabels, input.nav, 'labels') <= input.width ? 'labels' : 'icons'
  const navWidth = wideNavGroupWidth(input.navLabels, input.nav, navMode)
  const items = itemStartsOf(0, input.navLabels, input.nav, navMode)
  return { navMode, navWidth, navItemStarts: items.starts, navItemWidths: items.widths, clipped: navWidth > input.width }
}

/* -------------------------------------------------------------------------- */
/* Screen zones with the bar at the top                                        */
/* -------------------------------------------------------------------------- */

export interface WideScreenZonesInput extends Omit<ScreenZonesInput, 'bottom'> {
  /** Where the navigation bar is in this class (`screenChromeIn`); `undefined` means there is no bar, it is hidden, or the screen is shown as a layer. */
  readonly navPlace: NavBarPlace | undefined
  /**
   * Height of the navigation bar WHERE IT STANDS: at the bottom without the safe area inset
   * (`navBarHeightOf`), as an own strip at the top `wideNavBarHeight`. In the app bar no number is
   * needed: the items are an app bar zone, and its height is already in `appBarHeight`.
   */
  readonly navBarHeight?: number | undefined
  readonly bottom?: Omit<BottomZoneInput, 'navBarHeight'> | undefined
}

export interface WideScreenZonesResult extends ScreenZonesResult {
  /** The navigation bar's own top strip; `null` means there is none (the bar is at the bottom, in the app bar, or absent). */
  readonly topNav: { readonly top: number; readonly height: number } | null
}

/**
 * REFERENCE: screen zones in a width class: the same `screenZonesOf`, told where the navigation
 * bar is.
 *
 *  - `bottom`: the bar is in the bottom zone, the numbers are the same as before 9.18.0;
 *  - `appBar`: there is NO bar in the bottom zone: the zone is only the pinned block, and without
 *    it there is no zone and the reader adds no safe area inset;
 *  - `top`: the own strip takes the top of the screen at its height, and everything else is
 *    counted in what is left under it: the root's top padding stays with the body, inside the
 *    scroll (there is no app bar zone here by the definition of the place).
 */
export function wideScreenZonesOf(input: WideScreenZonesInput): WideScreenZonesResult {
  const { navPlace, navBarHeight, bottom, ...rest } = input
  if (navPlace !== 'top') {
    const zone = { ...bottom, navBarHeight: navPlace === 'bottom' ? navBarHeight : undefined }
    return { ...screenZonesOf({ ...rest, bottom: zone }), topNav: null }
  }
  const bar = Math.max(0, navBarHeight ?? 0)
  const under = screenZonesOf({ ...rest, appBarHeight: undefined, height: Math.max(0, rest.height - bar), bottom: { ...bottom, navBarHeight: undefined } })
  const shifted = <B extends { readonly top: number }>(box: B): B => ({ ...box, top: box.top + bar })
  return {
    ...under,
    height: under.height + bar,
    appBar: null,
    body: shifted(under.body),
    contentTop: under.contentTop + bar,
    bottom:
      under.bottom === null
        ? null
        : { ...shifted(under.bottom), pinned: under.bottom.pinned === null ? null : shifted(under.bottom.pinned), navBar: null },
    topNav: { top: 0, height: bar },
  }
}
