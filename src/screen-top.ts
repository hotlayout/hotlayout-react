/**
 * The top of a screen (schema 9.19.0): the body under the app bar
 * (`Screen.props.bodyTop`) and the top safe inset the reader adds. Rules as data
 * are the artifact blocks `x-style.layout.bodyTop` and `x-style.layout.safeTop`;
 * the functions below are their reference, written out here because this package
 * does not import from the builder. The shared table is the groups of
 * `contract/fixtures/media-chrome/media-chrome-cases.json` named `bodyTopCases`,
 * `topZoneCases`, `screenTopZoneCases`, `screenTopPressCases` and
 * `safeTopValueCases`.
 *
 * The frame is not negotiable: the app bar and the bottom zone stand, only the
 * body scrolls. The word `screenTop` changes one thing — where the BODY AREA
 * starts: at the top edge of the screen, under the app bar and the status bar.
 *
 * No React and no DOM in this file: the server graph of the entry reads it too.
 */
import type { ScreenZonesInput, ScreenZonesResult } from './media-chrome'
import { screenZonesOf } from './media-chrome'
import { cssNumber, SAFE_INSET_MAX } from './sanitize'
import { screenChromeIn } from './wide-chrome'
import type { WidthClass } from './width-class'

/* ───────────────────────────── the field ───────────────────────────── */

/** The only word of `Screen.props.bodyTop`. There is no word for «as without the field». */
export const BODY_TOPS = ['screenTop'] as const
export type BodyTop = (typeof BODY_TOPS)[number]

/** The word of the field as the reader uses it; an unknown word and no field are `undefined` — the screen as before 9.19.0. */
export function bodyTopOf(props: object | undefined | null): BodyTop | undefined {
  if (typeof props !== 'object' || props === null || !Object.hasOwn(props, 'bodyTop')) return undefined
  const value = (props as { readonly bodyTop?: unknown }).bodyTop
  return (BODY_TOPS as readonly unknown[]).includes(value) ? (value as BodyTop) : undefined
}

/** Who stands in the app bar zone: the app bar itself, the own strip of the navigation bar (wide place) or nobody. */
export type TopZoneOwner = 'appBar' | 'navBar' | 'none'

/**
 * Whether the body starts at the top edge of the screen. The word works always
 * EXCEPT on a screen whose zone is taken by the own strip of the navigation bar:
 * the strip has a built-in background and the body never goes under it.
 */
export function bodyStartsAtScreenTop(props: object | undefined | null, owner: TopZoneOwner): boolean {
  return bodyTopOf(props) === 'screenTop' && owner !== 'navBar'
}

/** Who owns the app bar zone in this width class — over the CHILDREN of the screen root. */
export function topZoneOwnerIn<T extends { readonly type: string; readonly pin?: unknown; readonly props?: unknown }>(
  children: readonly T[],
  widthClass: WidthClass,
  isShown: (node: T) => boolean = () => true,
): TopZoneOwner {
  const chrome = screenChromeIn(children, widthClass, isShown)
  if (chrome.navPlace === 'top') return 'navBar'
  return chrome.appBar !== undefined && isShown(chrome.appBar) ? 'appBar' : 'none'
}

/* ─────────────────────────── the safe inset ─────────────────────────── */

/**
 * How much of the top inset is taken into account (`safeTop.value`): not a number,
 * `NaN`, infinity and negative are zero; more than the screen height is clamped to it.
 */
export function safeTopOf(value: unknown, screenHeight: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(value, Math.max(0, screenHeight))
}

/* ─────────────────────────── zones in numbers ─────────────────────────── */

export interface ScreenTopInput extends ScreenZonesInput {
  readonly bodyTop?: unknown
  readonly safeTop?: number | undefined
}

export interface ScreenTopZones extends Omit<ScreenZonesResult, 'appBar'> {
  /** The box of the bar WITH the inset inside it; `contentTop` is where its content starts. `null` — no zone. */
  readonly appBar: { readonly top: number; readonly height: number; readonly contentTop: number } | null
  readonly bodyAtScreenTop: boolean
  readonly safeTop: number
}

function lowered(zones: ScreenZonesResult, by: number): ScreenZonesResult {
  if (by === 0) return zones
  const moved = <T extends { readonly top: number }>(box: T): T => ({ ...box, top: box.top + by })
  return {
    ...zones,
    height: zones.height + by,
    body: moved(zones.body),
    contentTop: zones.contentTop + by,
    bottom:
      zones.bottom === null
        ? null
        : {
            ...moved(zones.bottom),
            pinned: zones.bottom.pinned === null ? null : moved(zones.bottom.pinned),
            navBar: zones.bottom.navBar === null ? null : moved(zones.bottom.navBar),
          },
  }
}

/**
 * Zones of a screen with the top inset and the field `bodyTop`, measured from the
 * PHYSICAL top. Without the inset and the field it is exactly `screenZonesOf`.
 * Every case reduces to that function with other numbers: a bar with an inset is a
 * taller bar; a screen without a bar is the same screen, shorter by the inset and
 * lowered by it; a body from the top edge is a screen WITHOUT the bar zone whose
 * bar box is counted on its own and lies over it.
 */
export function screenTopZonesOf(input: ScreenTopInput): ScreenTopZones {
  const safeTop = safeTopOf(input.safeTop, input.height)
  const hasBar = input.appBarHeight !== undefined
  const barBox = hasBar ? { top: input.padding.top, height: safeTop + Math.max(0, input.appBarHeight ?? 0), contentTop: input.padding.top + safeTop } : null
  if (bodyStartsAtScreenTop({ bodyTop: input.bodyTop }, hasBar ? 'appBar' : 'none')) {
    const bare = { ...input, appBarHeight: undefined, padding: { top: hasBar ? 0 : input.padding.top, bottom: input.padding.bottom } }
    const natural = screenZonesOf(bare)
    // A layer as tall as its content is not lower than the bar that lies over it (and not taller than what is available).
    const floor = barBox === null ? 0 : Math.min(barBox.top + barBox.height, Math.max(0, input.height))
    const body = input.shrink === true && natural.height < floor ? screenZonesOf({ ...bare, shrink: false, height: floor }) : natural
    return { ...body, appBar: barBox, bodyAtScreenTop: true, safeTop }
  }
  if (barBox !== null) return { ...screenZonesOf({ ...input, appBarHeight: barBox.height }), appBar: barBox, bodyAtScreenTop: false, safeTop }
  const below = lowered(screenZonesOf({ ...input, height: Math.max(0, input.height - safeTop) }), safeTop)
  return { ...below, appBar: null, bodyAtScreenTop: false, safeTop }
}

/** Who takes a press at a point of the screen: a zone, not a node. */
export type ScreenPressZone = 'appBar' | 'body' | 'bottom' | 'none'

/**
 * Which zone takes the press at a point. `y` is from the top of the screen; `x`
 * and `barInline` tell the box of the bar from the side paddings of the root next
 * to it — there the body under the bar takes the press. Without them the box is
 * the whole width.
 */
export function screenPressZoneAt(
  zones: ScreenTopZones,
  point: { readonly y: number; readonly x?: number | undefined },
  barInline?: { readonly left: number; readonly width: number },
): ScreenPressZone {
  const { y, x } = point
  if (y < 0 || y >= zones.height) return 'none'
  if (zones.bottom !== null && y >= zones.bottom.top) return 'bottom'
  const bar = zones.appBar
  const inBarInline = x === undefined || barInline === undefined || (x >= barInline.left && x < barInline.left + barInline.width)
  const inBar = bar !== null && y >= bar.top && y < bar.top + bar.height && inBarInline
  const inBody = y >= zones.body.top && y < zones.body.top + zones.body.height
  if (zones.bodyAtScreenTop) return inBar ? 'appBar' : inBody ? 'body' : 'none'
  // The body raised over the bar by a pulled first child lies on top of it.
  if (inBody) return 'body'
  return inBar ? 'appBar' : 'none'
}

/* ─────────────────────── the inset as CSS (the host's prop) ─────────────────────── */

/** The CSS value of the top safe inset of the platform; written only here. */
const SAFE_TOP_ENV = 'env(safe-area-inset-top, 0px)'

/**
 * The top safe inset (`safeAreaTop`, a decision of the HOST): `'env'` and no prop —
 * `env(safe-area-inset-top)`; a number — logical pixels the host measured itself
 * (`0` turns it off); anything else is zero. The value goes into `padding`, so
 * nothing that is not a clean number or the one word reaches the style.
 */
export function safeTopInset(value: unknown): string {
  if (value === undefined || value === 'env') return SAFE_TOP_ENV
  return `${cssNumber(safeTopOf(value, SAFE_INSET_MAX))}px`
}

/** The inset is absent: the value that adds nothing. */
export const NO_SAFE_TOP = '0px'

/* ─────────────────────── the rules as data (mirror of the artifact) ─────────────────────── */

/**
 * `x-style.layout.bodyTop` of the artifact, whole. This package does not import the
 * builder, so the block is written out here and compared with the artifact by a test.
 */
export const BODY_TOP_RULES = {
  prop: 'bodyTop',
  on: 'Screen.props',
  values: [
    'screenTop'
  ],
  withoutField: 'x-style.layout.screen-as-it-is',
  unknown: 'as-without-the-field',
  widthOverride: 'none-the-field-is-not-in-propsOn',
  screenTop: {
    bodyArea: 'from-the-top-edge-of-the-screen-to-the-top-edge-of-the-bottom-zone-full-width',
    bodyLead: {
      withAppBar: 'none-the-first-child-starts-at-the-top-edge',
      withoutAppBar: 'root-top-padding-inside-scroll'
    },
    appBar: 'fixed-where-it-stood-inside-the-root-padding-below-the-safe-inset',
    paintOrder: 'app-bar-over-body',
    press: 'the-app-bar-box-takes-presses-the-body-under-it-does-not',
    pressBesideTheBox: 'body',
    appBarBackground: 'none-unless-style-the-content-shows-through',
    clip: 'top-edge-of-the-screen-scrolled-content-shows-under-the-app-bar',
    pulledFirstChild: 'as-without-an-app-bar-nothing-is-raised',
    hiddenAppBar: 'no-zone-the-body-still-starts-at-the-top-edge',
    bottomZone: 'unchanged',
    background: 'unchanged-under-all-zones-fixed'
  },
  modal: 'same-inside-the-layer-the-body-starts-at-the-top-edge-of-the-layer',
  wide: {
    navItemsInAppBar: 'the-app-bar-with-its-nav-items-lies-over-the-body',
    ownNavBar: 'never-over-the-body-the-field-is-not-read'
  },
  withoutOwnHeight: {
    decides: 'host-the-same-switch-as-the-app-bar',
    default: 'app-bar-sticks-over-the-content',
    otherwise: 'app-bar-lies-over-the-top-of-the-block-and-scrolls-with-the-page',
    stuckBackdrop: 'none-the-content-shows-through'
  },
  scrolledState: 'none-in-9.19-the-look-of-the-app-bar-does-not-depend-on-scroll',
  replaces: [
    'x-style.layout.screen.contentUnderAppBar',
    'x-style.layout.screen.body.area',
    'x-style.layout.screen.body.clip',
    'x-style.layout.screen.body.paintOrder',
    'x-style.layout.screen.body.pulledFirstChild',
    'x-style.layout.screen.padding.withAppBar.bodyTop',
    'x-style.layout.screen.withoutOwnHeight.stuckBackdrop',
    'x-style.layout.appBar.contentUnderBar'
  ],
  olderReader: 'field-skipped-the-app-bar-is-a-strip-above-the-body',
  cases: 'contract/fixtures/media-chrome/media-chrome-cases.json'
} as const

/** `x-style.layout.safeTop` of the artifact, whole. */
export const SAFE_TOP_RULES = {
  adds: 'reader',
  inset: 'top-inset-of-the-platform-status-bar-and-cutout',
  host: 'may-give-zero-when-it-accounted-for-the-inset-itself',
  withAppBar: {
    where: 'inside-the-app-bar-box-above-its-content',
    box: 'app-bar-box-is-taller-by-the-inset',
    background: 'named-app-bar-background-covers-the-inset',
    rootTopPadding: 'stays-above-the-app-bar-box',
    bodyArea: 'from-the-bottom-edge-of-the-app-bar'
  },
  withoutAppBar: {
    where: 'above-the-body-area',
    bodyArea: 'from-the-bottom-edge-of-the-inset',
    clip: 'bottom-edge-of-the-inset',
    background: 'screen-background-shows-under-the-status-bar'
  },
  hiddenAppBar: 'as-without-an-app-bar',
  bodyAtScreenTop: {
    appBar: 'as-with-an-app-bar-below-the-inset',
    bodyArea: 'from-the-physical-top-under-the-status-bar',
    bodyContent: 'reader-adds-nothing-the-first-child-lies-under-the-status-bar',
    safeContent: 'lives-in-the-app-bar-or-below-its-bottom-edge',
    nodeField: 'none-in-9.19'
  },
  wideOwnNavBar: 'inside-the-bar-box-above-its-items',
  modal: {
    inside: 'no-inset-inside-the-layer',
    sheet: 'not-taller-than-the-area-below-the-inset',
    window: 'centred-in-the-area-below-the-inset',
    scrim: 'covers-the-inset'
  },
  withoutOwnHeight: 'added-only-while-the-app-bar-is-stuck-to-the-top-of-the-window',
  statusBarIcons: 'x-statusBar-unchanged-the-host-owns-the-icons',
  builder: 'inset-of-the-device-frame-zero-in-a-browser-window',
  replaces: [
    'x-statusBar.safeArea',
    'x-style.layout.wideNav.ownBar.safeAreaTop'
  ],
  olderReader: 'adds-nothing-the-host-wraps-it-in-a-safe-area',
  value: {
    unit: 'logical-pixels',
    notANumberOrNotFinite: 'zero',
    negative: 'zero',
    greaterThanTheScreenHeight: 'clamped-to-the-screen-height'
  },
  cases: 'contract/fixtures/media-chrome/media-chrome-cases.json'
} as const
