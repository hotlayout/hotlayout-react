/**
 * IMAGE, APP BAR, SCREEN ANATOMY, MODAL LAYER, STATUS BAR (schema 9.9.0).
 *
 * The rules are contract data (`x-style.layout.image`, `.appBar`, `.screen`, `.modalLayer`,
 * `x-statusBar`); the functions are a literal mirror of the contract's reference implementation.
 * The package does not import the builder's sources, so the rule is written a second time; the
 * two copies are held together by the shared case table
 * `contract/fixtures/media-chrome/media-chrome-cases.json` and by a check that the data blocks
 * equal the artifact.
 *
 * Numbers here are logical pixels; in the browser CSS does the layout, and these functions give
 * the same number to tests and to anyone who needs a value without measuring.
 */

import { bottomZoneOf } from './bottom-zone'
import type { BottomZoneInput } from './bottom-zone'
import { cssNumber } from './sanitize'

export const IMAGE_RATIO_TOKENS = {
  '1:1': { width: 1, height: 1 },
  '16:9': { width: 16, height: 9 },
  '4:3': { width: 4, height: 3 },
} as const satisfies Readonly<Record<string, { readonly width: number; readonly height: number }>>

export const IMAGE_RATIO_FALLBACK = '16:9' as const
export const IMAGE_RATIO_RANGE = { min: 0.125, max: 8 } as const

/** Mirror of `x-style.layout.image` (without the service keys `widget`, `props`, `heightKeys`). */
export const IMAGE_BOX_RULES = {
  box: 'node-box',
  width: 'named-else-given-by-parent',
  height: 'named-else-width-divided-by-ratio',
  namedHeight: 'overrides-aspect-ratio',
  heightClamp: 'min-max-height-after-ratio',
  ratioDerives: 'height-from-width-only',
  intrinsicSize: 'never-read',
  fitAlign: 'center',
  clip: 'node-radius',
  ratios: IMAGE_RATIO_TOKENS,
  ratioFallback: IMAGE_RATIO_FALLBACK,
  ratioRange: IMAGE_RATIO_RANGE,
  circle: { width: 'equals-height', radius: 'pill', holdsUpTo: 'side-of-two-pill-radii' },
} as const

/**
 * The "width / height" ratio. A word of the list is read by the table's own key; a pair of two
 * positive finite numbers is their ratio, clamped to `ratioRange`; anything else (a string from
 * a newer minor, zero, `null`, a missing field) is `16:9` (`unreadableImageRatio`).
 */
export function imageRatioOf(value: unknown): number {
  const fallback = IMAGE_RATIO_TOKENS[IMAGE_RATIO_FALLBACK]
  if (typeof value === 'string') {
    const token = Object.hasOwn(IMAGE_RATIO_TOKENS, value) ? IMAGE_RATIO_TOKENS[value as keyof typeof IMAGE_RATIO_TOKENS] : fallback
    return token.width / token.height
  }
  if (typeof value === 'object' && value !== null) {
    const { width, height } = value as { readonly width?: unknown; readonly height?: unknown }
    if (typeof width === 'number' && typeof height === 'number' && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return Math.min(Math.max(width / height, IMAGE_RATIO_RANGE.min), IMAGE_RATIO_RANGE.max)
    }
  }
  return fallback.width / fallback.height
}

/**
 * Ratio for CSS `aspect-ratio`: a word of the list is `w / h`, a custom pair is its ratio
 * clamped to `ratioRange`, anything else is `16 / 9`. A number, not a string from the document,
 * so only what the package computed reaches the style.
 */
export function imageRatioCssOf(value: unknown): string {
  const fallback = IMAGE_RATIO_TOKENS[IMAGE_RATIO_FALLBACK]
  if (typeof value === 'string') {
    const token = Object.hasOwn(IMAGE_RATIO_TOKENS, value) ? IMAGE_RATIO_TOKENS[value as keyof typeof IMAGE_RATIO_TOKENS] : fallback
    return `${String(token.width)} / ${String(token.height)}`
  }
  const pair = typeof value === 'object' && value !== null ? (value as { readonly width?: unknown; readonly height?: unknown }) : undefined
  if (pair !== undefined && typeof pair.width === 'number' && typeof pair.height === 'number' && Number.isFinite(pair.width) && Number.isFinite(pair.height) && pair.width > 0 && pair.height > 0) {
    return cssNumber(imageRatioOf(value))
  }
  return `${String(fallback.width)} / ${String(fallback.height)}`
}

export interface ImageBoxInput {
  readonly aspectRatio: unknown
  readonly width: number
  readonly height?: number | undefined
  readonly minHeight?: number | undefined
  readonly maxHeight?: number | undefined
}

/** Image box: a named height beats the ratio, constraints clamp both, the minimum wins. */
export function imageBoxOf(input: ImageBoxInput): { readonly width: number; readonly height: number; readonly byRatio: boolean } {
  const byRatio = input.height === undefined
  const raw = input.height ?? input.width / imageRatioOf(input.aspectRatio)
  const capped = input.maxHeight === undefined ? raw : Math.min(raw, input.maxHeight)
  const height = input.minHeight === undefined ? capped : Math.max(capped, input.minHeight)
  return { width: input.width, height, byRatio }
}

/** Where the drawing lies in the box by `fit`: centered, `cover` covers, `contain` fits; an unknown word is `cover`. */
export function imagePaintRect(
  box: { readonly width: number; readonly height: number },
  natural: number,
  fit: unknown,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const boxRatio = box.width / box.height
  const contain = fit === 'contain'
  const widthBound = contain ? natural >= boxRatio : natural <= boxRatio
  const width = widthBound ? box.width : box.height * natural
  const height = widthBound ? box.width / natural : box.height
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height }
}

/** The radius that really applies: the named one, clamped to half the shorter side. */
export function effectiveCornerRadius(box: { readonly width: number; readonly height: number }, radius: number): number {
  return Math.max(0, Math.min(radius, box.width / 2, box.height / 2))
}

/* ───────────────────────────── app bar ───────────────────────────── */

/** How many app bar actions the reader draws (policy row `appBarExtraActions: 'draw-first-two'`). */
export const APP_BAR_MAX_DRAWN_ACTIONS = 2

/**
 * WHICH APP BAR ACTIONS ARE DRAWN. The input is, for each action in document order, whether it
 * is visible (not hidden by a condition). The output is whether it is drawn: the first two
 * VISIBLE ones; one hidden by a condition does not count and is not drawn, and an action past
 * the second visible one is not drawn. With eight actions the title would have zero width.
 */
export function appBarDrawnActions(visible: readonly boolean[]): readonly boolean[] {
  let drawn = 0
  return visible.map((isVisible) => {
    if (!isVisible || drawn >= APP_BAR_MAX_DRAWN_ACTIONS) return false
    drawn += 1
    return true
  })
}

/** Mirror of `x-style.layout.appBar` (without the service keys `widget`, `actionWidget`). */
export const APP_BAR_LAYOUT = {
  order: 'leading-title-trailing',
  backSide: 'xl',
  backGlyph: { icon: 'chevron', size: 'md', rotation: 'half-turn' },
  gap: 'sm',
  gapAppliesTo: 'non-empty-zone-only',
  lineGap: 'xs',
  actionGap: 'xs',
  actions: 'children-in-document-order',
  maxDrawnActions: 2,
  actionLook: 'own-icon-button',
  titleBlock: 'as-wide-as-the-longer-line',
  titleRoom: 'width-minus-zones-and-their-gaps',
  titlePlacement: 'centered-in-bar-shifted-off-zones',
  lineAlign: 'center',
  titleOverflow: 'single-line-ellipsis',
  crossAlign: 'center',
  height: 'tallest-zone',
  placement: 'app-bar-zone-first-child-inside-screen-padding',
  scroll: 'fixed',
  background: 'none-unless-style',
  contentUnderBar: 'never',
} as const

export interface AppBarZonesInput {
  readonly width: number
  readonly showBack: boolean
  readonly backSide: number
  readonly actionSides: readonly number[]
  readonly gap: number
  readonly actionGap: number
  readonly titleNatural: number
  /**
   * Natural outer width of the VISIBLE leading-zone node (9.16.0), or its named `style.width`.
   * If present, the arrow is not drawn whatever `showBack` says; `undefined` means there is no
   * node or it is hidden by a condition, and `showBack` applies.
   */
  readonly leadingNatural?: number | undefined
  /** Value of the `titleAlign` field as it stands in the document (9.16.0). */
  readonly titleAlign?: unknown
}

export interface AppBarZones {
  /** Width of the leading zone TOGETHER with the gap to the title; zero means there is no zone. */
  readonly leading: number
  readonly trailing: number
  readonly titleRoom: number
  readonly titleWidth: number
  readonly titleStart: number
  readonly centered: boolean
  readonly truncated: boolean
  readonly actionStarts: readonly number[]
  /** What stands in the leading zone (9.16.0). */
  readonly leadingShown: AppBarLeadingShown
  /** Width of what stands in the leading zone, WITHOUT the gap (9.16.0): the node (already clamped), the arrow's square, or zero. */
  readonly leadingWidth: number
}

/** The three app bar zones (9.16.0: a node in the leading zone and a title from the start) as numbers, from the row start in reading order. */
export function appBarZones(input: AppBarZonesInput): AppBarZones {
  const actions = input.actionSides.reduce((sum, side) => sum + side, 0) + Math.max(0, input.actionSides.length - 1) * input.actionGap
  const leadingShown = appBarLeadingShown(input.leadingNatural === undefined ? undefined : true, input.showBack)
  const leadingWidth = leadingShown === 'node' ? appBarLeadingWidth(input.leadingNatural ?? 0, input.width) : leadingShown === 'back' ? input.backSide : 0
  const leading = leadingShown === 'none' ? 0 : leadingWidth + input.gap
  const trailing = input.actionSides.length > 0 ? actions + input.gap : 0
  const titleRoom = Math.max(0, input.width - leading - trailing)
  const titleWidth = Math.min(Math.max(0, input.titleNatural), titleRoom)
  const ideal = (input.width - titleWidth) / 2
  // `start` (9.16.0): the block right after the leading zone, with the same lower clamp edge.
  const titleStart = titleAlignOf(input.titleAlign) === 'start' ? leading : Math.max(leading, Math.min(ideal, input.width - trailing - titleWidth))
  let cursor = input.width - actions
  const actionStarts = input.actionSides.map((side) => {
    const start = cursor
    cursor += side + input.actionGap
    return start
  })
  return { leading, trailing, titleRoom, titleWidth, titleStart, centered: titleStart === ideal, truncated: input.titleNatural > titleRoom, actionStarts, leadingShown, leadingWidth }
}

/* ───────────────── app bar 9.16.0: leading-zone node, title from the start ───────────────── */

/** The app bar zone a child stands in. There is one word; an older reader reads the next one as "no field". */
export const BAR_ZONES = ['leading'] as const
export type BarZone = (typeof BAR_ZONES)[number]

/** Effective value of the `zone` field: a word of the list or nothing (`unknown: 'no-field'`). An own property, not the prototype chain. */
export function barZoneOf(node: object | undefined | null): BarZone | undefined {
  if (node === undefined || node === null || !Object.hasOwn(node, 'zone')) return undefined
  const value = (node as { readonly zone?: unknown }).zone
  return typeof value === 'string' && (BAR_ZONES as readonly string[]).includes(value) ? (value as BarZone) : undefined
}

/** What may stand in the leading zone: a button with a label and an icon button. */
export const APP_BAR_LEADING_TYPES = ['Button', 'IconButton'] as const
/** Type of an app bar ACTION (trailing zone). */
export const APP_BAR_ACTION_TYPE = 'IconButton'
/** The largest share of the app bar width that the leading-zone node takes. */
export const APP_BAR_LEADING_MAX_SHARE = 0.5

export function canStandInLeadingZone(type: string): boolean {
  return (APP_BAR_LEADING_TYPES as readonly string[]).includes(type)
}

/** The leading-zone node: the FIRST child in document order with `zone: 'leading'` and a type from the list. Visibility is not counted here. A second one is not drawn. */
export function appBarLeadingOf<T extends { readonly type: string }>(children: readonly T[]): T | undefined {
  return children.find((child) => barZoneOf(child) === 'leading' && canStandInLeadingZone(child.type))
}

/** App bar actions in document order: icon buttons WITHOUT a zone field. A zone node is not among them and does not count toward the limit of two. */
export function appBarActionsOf<T extends { readonly type: string }>(children: readonly T[]): readonly T[] {
  return children.filter((child) => child.type === APP_BAR_ACTION_TYPE && barZoneOf(child) === undefined)
}

export type AppBarLeadingShown = 'node' | 'back' | 'none'

/** What is drawn in the leading zone: a visible node replaces the arrow whatever `showBack` says; hidden or absent, `showBack` applies. */
export function appBarLeadingShown(nodeVisible: boolean | undefined, showBack: boolean): AppBarLeadingShown {
  if (nodeVisible === true) return 'node'
  return showBack ? 'back' : 'none'
}

export type AppBarPlace = 'leading' | 'action' | 'leading-taken' | 'actions-full' | 'type'

/** Where a child put into the app bar goes (a hint for editors; the reader does not ask, but the table checks it). */
export function appBarPlaceOf(siblings: readonly { readonly type: string; readonly zone?: unknown }[], child: { readonly type: string; readonly zone?: unknown }): AppBarPlace {
  const isAction = child.type === APP_BAR_ACTION_TYPE
  if (!isAction && !canStandInLeadingZone(child.type)) return 'type'
  const leadingFree = appBarLeadingOf(siblings) === undefined
  const actionFree = appBarActionsOf(siblings).length < APP_BAR_MAX_DRAWN_ACTIONS
  if (barZoneOf(child) === 'leading' && leadingFree) return 'leading'
  if (isAction) return actionFree ? 'action' : 'actions-full'
  return leadingFree ? 'leading' : 'leading-taken'
}

/** Mirror of `x-style.layout.appBarLeading`. */
export const APP_BAR_LEADING = {
  field: 'zone',
  value: 'leading',
  on: 'child-of-the-app-bar',
  types: [...APP_BAR_LEADING_TYPES],
  is: 'first-child-in-document-order-with-the-field',
  max: 1,
  extra: 'not-drawn',
  order: 'not-read',
  countsAsAction: false,
  replacesBack: 'when-visible-whatever-show-back-says',
  hidden: 'show-back-applies',
  action: 'own-action-no-built-in-back',
  look: 'own-node',
  width: 'natural-or-named-up-to-max-share-of-the-bar',
  maxShare: APP_BAR_LEADING_MAX_SHARE,
  shrinks: 'title-first-then-the-leading-node-actions-never',
  tight: 'node-lays-out-in-the-capped-width',
  gap: 'appBar.gap',
  crossAlign: 'appBar.crossAlign',
  height: 'appBar.height',
  elsewhere: 'not-read',
  unknown: 'no-field',
  before916: 'icon-button-drawn-as-an-action-button-not-drawn-back-arrow-by-show-back',
} as const

export const TITLE_ALIGNS = ['start', 'center'] as const
export type TitleAlign = (typeof TITLE_ALIGNS)[number]
export const DEFAULT_TITLE_ALIGN: TitleAlign = 'center'

/** Mirror of `x-style.layout.appBarTitle`. */
export const APP_BAR_TITLE = {
  field: 'titleAlign',
  values: [...TITLE_ALIGNS],
  default: DEFAULT_TITLE_ALIGN,
  center: { placement: 'appBar.titlePlacement', lineAlign: 'appBar.lineAlign' },
  start: { placement: 'right-after-the-leading-zone', withoutLeadingZone: 'at-the-start-edge', lineAlign: 'start' },
  direction: 'logical',
  room: 'appBar.titleRoom',
  overflow: 'appBar.titleOverflow',
  unknown: 'default',
} as const

/** The alignment the reader draws: an unknown word and a missing field give the default (centered). */
export function titleAlignOf(value: unknown): TitleAlign {
  return (TITLE_ALIGNS as readonly unknown[]).includes(value) ? (value as TitleAlign) : DEFAULT_TITLE_ALIGN
}

/** Width of the leading-zone node: natural (or named), at most `maxShare` of the app bar's content width. */
export function appBarLeadingWidth(natural: number, barWidth: number): number {
  return Math.max(0, Math.min(natural, barWidth * APP_BAR_LEADING_MAX_SHARE))
}

/* ───────────────────────── screen anatomy ───────────────────────── */

/** Mirror of `x-style.layout.screen` (without the service keys `widget`, `appBarWidget`, `gapProp`, `cases`). */
export const SCREEN_ANATOMY = {
  zones: ['appBar', 'body', 'bottom'],
  scrolls: 'body-only',
  scrollAxis: 'vertical',
  appBar: {
    is: 'first-child-of-the-screen-root-when-it-is-an-app-bar',
    counts: 'document-order-not-visibility',
    hidden: 'no-zone',
    notFirst: 'ordinary-child-of-the-body',
    position: 'top-of-the-screen-fixed',
  },
  body: {
    is: 'every-other-child-of-the-screen-root',
    area: 'from-the-bottom-edge-of-the-app-bar-to-the-top-edge-of-the-bottom-zone-full-width',
    clip: 'body-area',
    pulledFirstChild: 'raises-the-body-area-by-its-overlap-not-above-the-screen',
    paintOrder: 'body-over-app-bar',
    empty: 'no-gap',
  },
  bottom: { is: 'pinned-block-then-nav-bar', content: 'x-style.layout.bottomZone', position: 'bottom-of-the-screen-fixed' },
  background: 'under-all-zones-fixed',
  padding: {
    withAppBar: { appBar: ['top', 'start', 'end'], body: ['start', 'end', 'bottom'], bodyTop: 'screen-gap', bodyPadding: 'inside-scroll' },
    withoutAppBar: 'all-sides-inside-body-scroll',
  },
  contentUnderAppBar: 'never',
  modal: 'same-zones-layer-as-tall-as-content-body-scrolls',
  ownHeight: 'zones-apply',
  withoutOwnHeight: {
    decides: 'host',
    default: 'app-bar-sticks-to-the-top-of-the-scrolling-ancestor',
    otherwise: 'app-bar-is-the-top-row-and-scrolls-with-the-page',
    stuckBackdrop: 'screen-root-background-under-the-app-bar-zone',
    background: 'grows-and-scrolls-with-the-page',
    layerArea: 'visible-part-of-the-block-not-taller-than-the-window',
    layerNoFixed: true,
    layerOtherwise: 'host-asks-for-an-own-height',
    documentField: 'none',
  },
} as const

export interface ScreenZonesInput {
  readonly height: number
  readonly shrink?: boolean | undefined
  readonly appBarHeight?: number | undefined
  readonly padding: { readonly top: number; readonly bottom: number }
  readonly gap: number
  readonly bodyContentHeight?: number | undefined
  readonly firstPull?: number | undefined
  readonly scrollTop?: number | undefined
  /** Bottom zone (9.12.0): heights of the pinned block and the bar, and the safe area inset. No heights means no zone, and the numbers are the same as before 9.12.0. */
  readonly bottom?: BottomZoneInput | undefined
}

export interface ScreenZonesResult {
  readonly height: number
  readonly appBar: { readonly top: number; readonly height: number } | null
  readonly body: { readonly top: number; readonly height: number }
  readonly contentTop: number
  readonly contentHeight: number
  readonly maxScroll: number
  readonly scrollTop: number
  readonly scrolls: boolean
  /** The bottom zone in screen coordinates, the same at any scroll position; `null` means there is no zone. */
  readonly bottom: {
    readonly top: number
    readonly height: number
    readonly pinned: { readonly top: number; readonly height: number } | null
    readonly navBar: { readonly top: number; readonly height: number; readonly contentHeight: number } | null
    readonly safeBottom: number
  } | null
}

/** Screen zones with their own height, as numbers. In the browser CSS does the same; this function is for tests and for the host. */
export function screenZonesOf(input: ScreenZonesInput): ScreenZonesResult {
  const hasBar = input.appBarHeight !== undefined
  const barZone = hasBar ? input.padding.top + Math.max(0, input.appBarHeight ?? 0) : 0
  const empty = input.bodyContentHeight === undefined
  const lead = hasBar ? (empty ? 0 : input.gap) : input.padding.top
  const pull = empty ? 0 : Math.max(0, input.firstPull ?? 0)
  const raise = hasBar ? Math.min(Math.max(0, pull - lead), barZone) : 0
  const areaTop = barZone - raise
  const restTop = barZone + lead - pull
  const zone = input.bottom === undefined ? null : bottomZoneOf(input.bottom, input.padding.bottom)
  // With a pinned block the root's bottom padding went under the block, and the body ends with the screen gap (an empty one with nothing).
  const pinnedBox = zone?.pinned ?? null
  const tail = pinnedBox === null ? input.padding.bottom : empty ? 0 : input.gap
  const contentHeight = Math.max(0, restTop + (input.bodyContentHeight ?? 0) + tail - areaTop)
  const zoneHeight = zone?.height ?? 0
  const natural = areaTop + contentHeight + zoneHeight
  const height = input.shrink === true ? Math.min(natural, Math.max(0, input.height)) : Math.max(0, input.height)
  const zoneTop = Math.max(areaTop, height - zoneHeight)
  const areaHeight = Math.max(0, zoneTop - areaTop)
  const maxScroll = Math.max(0, contentHeight - areaHeight)
  const scrollTop = Math.min(Math.max(0, input.scrollTop ?? 0), maxScroll)
  return {
    height,
    appBar: hasBar ? { top: input.padding.top, height: Math.max(0, input.appBarHeight ?? 0) } : null,
    body: { top: areaTop, height: areaHeight },
    contentTop: restTop - scrollTop,
    contentHeight,
    maxScroll,
    scrollTop,
    scrolls: maxScroll > 0,
    bottom:
      zone === null
        ? null
        : {
            top: zoneTop,
            height: zoneHeight,
            pinned: zone.pinned === null ? null : { top: zoneTop + zone.pinned.top, height: zone.pinned.height },
            navBar: zone.navBar === null ? null : { top: zoneTop + zone.navBar.top, height: zone.navBar.height, contentHeight: zone.navBar.contentHeight },
            safeBottom: zone.safeBottom,
          },
  }
}

/** The app bar zone: the first child of the root IN DOCUMENT ORDER, if it is an `AppBar`. Visibility is not counted here. */
export function screenAppBarOf<T extends { readonly type: string }>(children: readonly T[]): T | undefined {
  const first = children[0]
  return first?.type === 'AppBar' ? first : undefined
}

/* ───────────────────────── modal layer ───────────────────────── */

export const MODAL_PLACEMENTS = ['bottom', 'center'] as const
export type ModalPlacement = (typeof MODAL_PLACEMENTS)[number]
export const DEFAULT_MODAL_PLACEMENT: ModalPlacement = 'bottom'
export const MODAL_WINDOW_MAX_WIDTH = 400

/** Mirror of `x-style.layout.modalLayer` (without the service key `field`). */
export const MODAL_LAYER_RULES = {
  placements: [...MODAL_PLACEMENTS],
  defaultPlacement: DEFAULT_MODAL_PLACEMENT,
  area: 'the-area-the-host-gave-the-screen',
  above: 'whole-page-including-app-bar',
  scrim: { color: 'black', opacity: 0.45, covers: 'whole-screen-area' },
  dismiss: { scrimTap: 'navigate-back', systemBack: 'navigate-back', escapeKey: 'navigate-back' },
  height: 'content',
  maxHeight: 'available-height',
  overflow: 'body-of-the-layer-scrolls',
  zones: 'same-as-a-page',
  builtInLook: 'none',
  look: 'screen-root-style',
  clip: 'screen-root-radius',
  record: 'inherits-like-any-modal',
  bottom: { width: 'fill', margin: 'none', align: 'bottom' },
  center: { width: 'fill-minus-margins-up-to-max', margin: 'xl', maxWidth: MODAL_WINDOW_MAX_WIDTH, align: 'center' },
} as const

/** Layer placement: `center` is a window; anything else is a sheet. */
export function modalPlacementOf(value: unknown): ModalPlacement {
  return (MODAL_PLACEMENTS as readonly unknown[]).includes(value) ? (value as ModalPlacement) : DEFAULT_MODAL_PLACEMENT
}

export function modalWidthOf(placement: unknown, viewportWidth: number, margin: number): number {
  if (modalPlacementOf(placement) === 'bottom') return viewportWidth
  return Math.max(0, Math.min(viewportWidth - 2 * margin, MODAL_WINDOW_MAX_WIDTH))
}

export interface ModalBoxInput {
  readonly placement: unknown
  readonly viewport: { readonly width: number; readonly height: number }
  readonly contentHeight: number
  readonly margin: number
}

export interface ModalBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly scrolls: boolean
}

/** The layer's box within the area the host gave the screen. */
export function modalBoxOf(input: ModalBoxInput): ModalBox {
  const placement = modalPlacementOf(input.placement)
  const width = modalWidthOf(placement, input.viewport.width, input.margin)
  const available = placement === 'bottom' ? input.viewport.height : Math.max(0, input.viewport.height - 2 * input.margin)
  const height = Math.min(Math.max(0, input.contentHeight), available)
  const scrolls = input.contentHeight > available
  if (placement === 'bottom') return { x: 0, y: input.viewport.height - height, width, height, scrolls }
  return { x: (input.viewport.width - width) / 2, y: (input.viewport.height - height) / 2, width, height, scrolls }
}

/* ───────────────────────── status bar ───────────────────────── */

export const STATUS_BAR_ICONS = ['light', 'dark'] as const
export type StatusBarIcons = (typeof STATUS_BAR_ICONS)[number]

/** Mirror of `x-statusBar` (without the service key `cases`). The reader does not touch the system bar: the request goes to the host. */
export const STATUS_BAR_RULES = {
  field: 'statusBarIcons',
  values: [...STATUS_BAR_ICONS],
  meaning: { light: 'light-icons-for-dark-background', dark: 'dark-icons-for-light-background' },
  owner: 'host',
  reader: 'touches-nothing',
  handover: 'screen-shown-event',
  appliesTo: 'top-screen-of-stack',
  withoutField: 'host-decides',
  background: 'screen-root-background-when-host-lays-edge-to-edge',
  safeArea: 'host-not-reader',
} as const

/** The screen's request about status bar icons: a known word, or `undefined` for "no request". */
export function statusBarIconsOf(value: unknown): StatusBarIcons | undefined {
  return (STATUS_BAR_ICONS as readonly unknown[]).includes(value) ? (value as StatusBarIcons) : undefined
}
