/**
 * Bottom zone of a screen (schema 9.12.0): the navigation bar and the block pinned to the bottom.
 *
 * The rules are contract data (`x-style.layout.bottomZone`, `x-style.layout.navBar`); the
 * functions are the reference implementation's, verbatim. The package imports nothing from the
 * contract repository, so the rule is written here a second time; the two copies are kept together by the
 * shared case table `contract/fixtures/bottom-zone/bottom-zone-cases.json` and by a test that
 * compares the data blocks with the artifact.
 *
 * No React and no DOM in this file: the server graph of the entry point reads it too.
 */

/* ───────────────────────────── the `pin` field ───────────────────────────── */

/** The edge a node is pinned to. There is one word; an older reader treats any later word as "no field". */
export const PIN_EDGES = ['bottom'] as const
export type PinEdge = (typeof PIN_EDGES)[number]

/** The effective `pin` value: a word from the list or nothing (`unreadablePin`). An own property, not the prototype chain. */
export function pinOf(node: object | undefined | null): PinEdge | undefined {
  if (node === undefined || node === null || !Object.hasOwn(node, 'pin')) return undefined
  const value = (node as { readonly pin?: unknown }).pin
  return typeof value === 'string' && (PIN_EDGES as readonly string[]).includes(value) ? (value as PinEdge) : undefined
}

/* ────────────────────── which root child belongs to which zone ────────────────────── */

export const NAV_BAR_TYPE = 'NavBar'
export const NAV_ITEM_TYPE = 'NavItem'

interface RootChild {
  readonly type: string
  readonly pin?: unknown
}

/** The navigation bar: the LAST child of the root in document order, if it is a `NavBar`. Visibility is not considered. */
export function screenNavBarOf<T extends RootChild>(children: readonly T[]): T | undefined {
  const last = children[children.length - 1]
  return last?.type === NAV_BAR_TYPE ? last : undefined
}

/**
 * The pinned block: the last child of the root, NOT COUNTING the navigation bar, if its `pin` is
 * `bottom`. Exactly one; the app bar zone and the navigation bar are never pinned.
 */
export function screenPinnedOf<T extends RootChild>(children: readonly T[]): T | undefined {
  const end = screenNavBarOf(children) === undefined ? children.length : children.length - 1
  const index = end - 1
  const candidate = children[index]
  if (candidate === undefined || pinOf(candidate) !== 'bottom') return undefined
  if (candidate.type === NAV_BAR_TYPE) return undefined
  if (index === 0 && candidate.type === 'AppBar') return undefined
  return candidate
}

/**
 * Where the bar sits at a WIDE width class (`NavBar.props.widePlacement`, 9.18.0): `top` is at the
 * top (inside the app bar or as its own strip), `bottom` is at the bottom, as on a phone. Without
 * the field, or with an unknown word, `top`. What follows from it is in `wide-chrome.ts`.
 */
export const NAV_WIDE_PLACEMENTS = ['top', 'bottom'] as const
export type NavWidePlacement = (typeof NAV_WIDE_PLACEMENTS)[number]
export const DEFAULT_NAV_WIDE_PLACEMENT: NavWidePlacement = 'top'

/** The wide-width placement as the READER interprets it. */
export function navWidePlacementOf(value: unknown): NavWidePlacement {
  return (NAV_WIDE_PLACEMENTS as readonly unknown[]).includes(value) ? (value as NavWidePlacement) : DEFAULT_NAV_WIDE_PLACEMENT
}

/** Root children by zone: the one place where the three rules ("first is the app bar", "last is the bar", "the one before it with `pin`") are combined. */
export function screenChildrenByZone<T extends RootChild>(
  children: readonly T[],
): { readonly appBar: T | undefined; readonly body: readonly T[]; readonly pinned: T | undefined; readonly navBar: T | undefined } {
  const first = children[0]
  const appBar = first?.type === 'AppBar' ? first : undefined
  const navBar = screenNavBarOf(children)
  const pinned = screenPinnedOf(children)
  const from = appBar === undefined ? 0 : 1
  const to = children.length - (navBar === undefined ? 0 : 1) - (pinned === undefined ? 0 : 1)
  return { appBar, body: children.slice(from, Math.max(from, to)), pinned, navBar }
}

/* ───────────────────────────── navigation bar ───────────────────────────── */

export const NAV_BAR_MAX_ITEMS = 5

/** The catalog action by which an item switches section. */
export const SECTION_ACTION_TYPE = 'navigate.section'

/** Mirror of `x-style.layout.navBar` (without the service key `cases`). */
export const NAV_BAR_LAYOUT = {
  items: {
    are: 'nav-item-children-in-document-order',
    max: NAV_BAR_MAX_ITEMS,
    fewer: 'drawn-as-is',
    more: 'first-five-visible-drawn',
    hidden: 'takes-no-share',
    width: 'equal-shares-of-the-bar-width-among-visible-items',
    order: 'reading-direction-first-item-at-the-inline-start',
    wrap: 'never',
  },
  item: {
    direction: 'icon-above-label',
    align: 'centered-on-both-axes',
    paddingBlock: 'sm',
    paddingInline: 'xs',
    gap: 'xs',
    iconSize: 'md',
    labelTypography: 'bodyS',
    labelLines: 1,
    labelOverflow: 'ellipsis',
    labelAlign: 'center',
    touchArea: 'the-whole-share-at-the-full-height-of-the-bar',
    unknownIcon: 'empty-box-of-the-same-size',
  },
  height: 'top-border-plus-padding-plus-icon-box-plus-gap-plus-label-line-plus-padding',
  surface: {
    background: 'surface',
    borderTop: { width: 1, color: 'border' },
    named: 'style-background-replaces-the-background-style-border-replaces-the-top-line',
    width: 'edge-to-edge-root-padding-does-not-apply',
  },
  color: {
    active: 'primary',
    inactive: 'muted',
    named: 'inherited-color-active-as-is-inactive-at-secondary-opacity',
    icon: 'same-as-the-label',
  },
  active: {
    is: 'item-whose-action-is-navigate.section-to-the-shown-screen',
    several: 'every-such-item',
    none: 'no-item-is-active',
    mark: 'color',
  },
  press: {
    does: 'performs-the-action-of-the-item',
    otherAction: 'performed-as-is-the-item-is-never-active',
    activeItem: 'nothing-happens-no-event',
  },
  semantics: {
    bar: 'navigation',
    item: 'button',
    name: 'label',
    active: 'current-page',
    keyboard: 'every-item-is-a-tab-stop-enter-and-space-press',
  },
  badge: 'none-in-9.12',
  inModalLayer: 'not-drawn',
  insideOtherThanScreenRoot: 'not-a-child',
} as const

export interface NavBarMetrics {
  readonly paddingBlock: number
  readonly iconBox: number
  readonly gap: number
  readonly labelLine: number
  /** The built-in top border, or zero when the node named its own border. */
  readonly borderTop: number
}

/** Bar height without the safe area inset. */
export function navBarHeightOf(metrics: NavBarMetrics): number {
  return metrics.borderTop + metrics.paddingBlock + metrics.iconBox + metrics.gap + metrics.labelLine + metrics.paddingBlock
}

/** Which items are drawn: the first `NAV_BAR_MAX_ITEMS` VISIBLE ones in document order (`navBarExtraItems`). */
export function navDrawnItems(visible: readonly boolean[]): readonly boolean[] {
  let drawn = 0
  return visible.map((isVisible) => {
    if (!isVisible || drawn >= NAV_BAR_MAX_ITEMS) return false
    drawn += 1
    return true
  })
}

/** Item shares: equal, with no gaps and no rounding; `start` is measured from the bar's LEFT edge; a hidden item has no share. */
export function navItemSharesOf(
  barWidth: number,
  visible: readonly boolean[],
  rtl = false,
): readonly ({ readonly start: number; readonly width: number } | null)[] {
  const drawn = navDrawnItems(visible)
  const count = drawn.filter(Boolean).length
  if (count === 0) return visible.map(() => null)
  const width = Math.max(0, barWidth) / count
  let position = 0
  return drawn.map((isDrawn) => {
    if (!isDrawn) return null
    const index = position
    position += 1
    return { start: rtl ? barWidth - width * (index + 1) : width * index, width }
  })
}

interface ActionLike {
  readonly type?: unknown
  readonly params?: unknown
}

/** The section an action leads to: the `screenId` of a `navigate.section` action, otherwise nothing. The parameter must be an own key. */
export function sectionTargetOf(action: ActionLike | undefined | null): string | undefined {
  if (action?.type !== SECTION_ACTION_TYPE) return undefined
  const params = action.params
  if (typeof params !== 'object' || params === null || !Object.hasOwn(params, 'screenId')) return undefined
  const target = (params as Readonly<Record<string, unknown>>).screenId
  return typeof target === 'string' && target !== '' ? target : undefined
}

/** Whether an item with this action is ACTIVE on the shown screen. */
export function isActiveNavAction(action: ActionLike | undefined | null, shownScreenId: string): boolean {
  return sectionTargetOf(action) === shownScreenId
}

/** The stack after `navigate.section`: the one named screen; `undefined` means the stack is already that, so nothing happens and no event is emitted. */
export function sectionStackOf(stack: readonly string[], target: string): readonly [string] | undefined {
  if (stack.length === 1 && stack[0] === target) return undefined
  return [target]
}

/* ───────────────────────────── bottom zone ───────────────────────────── */

/** Mirror of `x-style.layout.bottomZone` (without the service keys `cases`, `pinValues`). */
export const BOTTOM_ZONE_RULES = {
  order: ['pinned', 'navBar', 'safeInset'],
  empty: 'no-zone-no-room',
  position: 'bottom-of-the-screen-fixed',
  scrolls: 'never',
  navBar: {
    is: 'last-child-of-the-screen-root-when-it-is-a-nav-bar',
    counts: 'document-order-not-visibility',
    hidden: 'no-zone',
    notLast: 'ordinary-child-of-the-body',
    inModalLayer: 'not-drawn',
  },
  pinned: {
    field: 'pin',
    is: 'last-child-of-the-screen-root-not-counting-the-nav-bar-when-its-pin-is-bottom',
    counts: 'document-order-not-visibility',
    atMost: 1,
    hidden: 'no-zone',
    elsewhere: 'field-is-not-read',
    appBar: 'never-pinned',
    pull: 'not-read-on-the-pinned-node',
    width: 'as-a-child-of-the-screen-column',
    background: 'none-unless-the-node-names-one',
    inModalLayer: 'drawn-at-the-bottom-of-the-layer',
  },
  padding: {
    pinned: ['start', 'end', 'bottom'],
    bodyBottomWithPinned: 'screen-gap',
    bodyBottomWithPinnedEmptyBody: 'none',
    bodyBottomWithoutPinned: 'root-bottom-padding-inside-scroll',
    navBar: 'none',
  },
  bodyArea: 'ends-at-the-top-edge-of-the-bottom-zone',
  bodyClip: 'top-edge-of-the-bottom-zone',
  contentUnderBottomZone: 'never',
  background: 'screen-background-shows-through-a-pinned-block-without-its-own',
  safeArea: {
    bottom: 'reader-adds-the-platform-inset-under-the-content-of-the-bottom-zone',
    navBarBackground: 'extends-under-the-inset-to-the-physical-bottom',
    pinnedOnly: 'transparent-room-under-the-root-bottom-padding',
    withoutBottomZone: 'reader-adds-nothing',
    host: 'may-give-zero-when-it-accounted-for-the-inset-itself',
    modalSheet: 'same-under-the-pinned-block',
    modalWindow: 'none',
  },
  keyboard: {
    applies: 'when-the-screen-keyboard-is-shown',
    body: 'area-ends-at-the-top-of-the-pinned-block-above-the-keyboard',
    pinned: 'rides-above-the-keyboard',
    navBar: 'covered-by-the-keyboard',
    safeInset: 'not-added-above-the-keyboard',
    since: 'named-ahead-no-text-input-in-9.12',
  },
  modal: 'pinned-block-at-the-bottom-of-the-layer-body-of-the-layer-scrolls-above-it',
  withoutOwnHeight: {
    decides: 'host-the-same-switch-as-the-app-bar',
    default: 'bottom-zone-sticks-to-the-bottom-of-the-scrolling-ancestor',
    otherwise: 'bottom-zone-is-the-last-row-and-scrolls-with-the-page',
    stuckBackdrop: 'screen-root-background-under-the-pinned-block',
    focusMargin: 'scroll-margin-bottom-of-the-body-content-equals-the-bottom-zone-height',
    safeInset: 'added-only-while-stuck',
    documentField: 'none',
  },
} as const

export interface BottomZoneInput {
  /** Height of the pinned block's box; `undefined` when there is no block or it is hidden. */
  readonly pinnedHeight?: number | undefined
  /** Bar height without the safe area inset; `undefined` when there is no bar, it is hidden, or the screen is shown as a layer. */
  readonly navBarHeight?: number | undefined
  /** The platform's bottom safe area inset; a host that accounted for it itself passes zero. */
  readonly safeBottom?: number | undefined
}

export interface BottomZoneBox {
  readonly height: number
  readonly pinned: { readonly top: number; readonly height: number } | null
  readonly navBar: { readonly top: number; readonly height: number; readonly contentHeight: number } | null
  readonly safeBottom: number
}

/** The bottom zone's box; `null` when there is no zone (no block and no bar), in which case the reader adds no safe area inset. */
export function bottomZoneOf(input: BottomZoneInput, rootPaddingBottom: number): BottomZoneBox | null {
  const hasPinned = input.pinnedHeight !== undefined
  const hasNav = input.navBarHeight !== undefined
  if (!hasPinned && !hasNav) return null
  const safe = Math.max(0, input.safeBottom ?? 0)
  const pinnedHeight = Math.max(0, input.pinnedHeight ?? 0)
  const pinnedRoom = hasPinned ? pinnedHeight + Math.max(0, rootPaddingBottom) : 0
  const navContent = Math.max(0, input.navBarHeight ?? 0)
  return {
    height: pinnedRoom + (hasNav ? navContent : 0) + safe,
    pinned: hasPinned ? { top: 0, height: pinnedHeight } : null,
    navBar: hasNav ? { top: pinnedRoom, height: navContent + safe, contentHeight: navContent } : null,
    safeBottom: safe,
  }
}
