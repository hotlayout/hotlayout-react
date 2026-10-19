/**
 * The floating navigation bar (schema 9.22.0, `NavBar.float: true`). A mirror of the contract's
 * reference rule; the shared rows are the `floatZoneCases` and `floatPlaceCases` groups of
 * `contract/fixtures/bottom-zone/bottom-zone-cases.json`, and the block below is compared with the
 * artifact key `x-style.layout.navFloat`.
 *
 * Without the field the body ends above the bottom zone and is clipped at its top edge. With it the
 * WHOLE bottom zone (the pinned block and the bar) lies over the body: the body area reaches the
 * bottom of the screen, the content scrolls UNDER the zone, and the reader adds the height of the
 * zone at the end of the content, so the last row scrolls clear of it. The bottom safe inset lies
 * under the box of the bar, outside it, and is transparent.
 *
 * Nothing else changes: the look of the pill is the `style` of the node (margin, radius, glass,
 * shadow), there is no built-in pill, the order of the zone is the same.
 *
 * No React in this file: the server graph of the entry reads it too.
 */
import { screenZonesOf } from './media-chrome'
import type { ScreenZonesInput, ScreenZonesResult } from './media-chrome'

/** The field as the reader reads it: only the literal `true`. */
export function navFloatOf(props: object | null | undefined): boolean {
  return props !== null && props !== undefined && (props as { readonly float?: unknown }).float === true
}

/** Where the bar stands (`screenChromeIn().navPlace`). */
type NavPlace = 'bottom' | 'appBar' | 'top' | undefined

/** Whether the bar floats: only where it stands in the bottom zone; at the top there is nothing to float over. */
export function navFloatsIn(navPlace: NavPlace, navBarProps: object | null | undefined): boolean {
  return navPlace === 'bottom' && navFloatOf(navBarProps)
}

/** `x-style.layout.navFloat` of the artifact, whole; a test compares the two. */
export const NAV_FLOAT_RULES = {
  prop: 'float',
  on: 'NavBar',
  value: 'literal-true-or-no-field',
  refines: ['bottomZone.bodyArea', 'bottomZone.bodyClip', 'bottomZone.contentUnderBottomZone', 'bottomZone.safeArea.navBarBackground', 'screen.body.area'],
  applies: 'where-the-bar-stands-in-the-bottom-zone',
  wideAtTop: 'not-read',
  hiddenBar: 'no-zone-nothing-floats',
  inModalLayer: 'not-read-the-bar-is-not-drawn',
  zone: 'the-whole-bottom-zone-floats-the-pinned-block-and-the-bar',
  order: 'unchanged',
  bodyArea: 'from-the-top-of-the-body-area-to-the-bottom-of-the-screen',
  bodyClip: 'bottom-of-the-screen',
  contentUnderBottomZone: 'scrolls-under-it',
  paint: 'bottom-zone-over-the-body',
  bodyEnd: 'body-tail-plus-the-height-of-the-bottom-zone',
  bodyTail: 'unchanged-root-bottom-padding-or-the-screen-gap-under-a-pinned-block',
  barHeight: 'margin-box-of-the-bar-node',
  safeArea: {
    inset: 'under-the-margin-box-of-the-bar-outside-it',
    barBackground: 'within-the-box-of-the-bar',
    pinnedOnly: 'unchanged',
  },
  press: 'the-boxes-of-the-pinned-block-and-of-the-bar-the-rest-of-the-zone-passes-through-to-the-body',
  look: 'style-of-the-node-no-built-in-pill',
  builtInSurface: 'unchanged-named-style-background-and-border-replace-it',
  justify: 'free-space-unchanged-the-added-tail-is-part-of-the-content',
  appBarScrolled: 'unchanged',
  firstScreen: 'content-under-the-bottom-zone-is-covered',
  withoutOwnHeight: {
    bottomZone: 'sticks-over-the-content',
    stuckBackdrop: 'none',
    focusMargin: 'unchanged-scroll-margin-bottom-equals-the-bottom-zone-height',
  },
  olderReader: 'ordinary-bar-the-body-ends-above-it',
  cases: 'contract/fixtures/bottom-zone/bottom-zone-cases.json',
} as const

export interface FloatScreenZonesInput extends ScreenZonesInput {
  /** The bar floats (`navFloatsIn`). Without a bar in the zone the field changes nothing. */
  readonly navFloat?: boolean | undefined
}

export type FloatScreenZonesResult = ScreenZonesResult & {
  /** The zone lies over the body: there is a bar in the zone and it floats. */
  readonly float: boolean
}

/**
 * The zones of a screen with a floating bar, as numbers. Without the field (or without a bar in the
 * zone) it is `screenZonesOf`. With it: the body area runs from its own top to the bottom of the
 * screen, what scrolls is longer by the height of the zone, and the box of the bar has no safe inset
 * (it lies under the bar). The scroll limit does not change: the area and the content grew by the
 * same amount.
 */
export function floatScreenZonesOf(input: FloatScreenZonesInput): FloatScreenZonesResult {
  const base = screenZonesOf(input)
  const zone = base.bottom
  if (input.navFloat !== true || zone?.navBar == null) return { ...base, float: false }
  const restTop = base.contentTop + base.scrollTop
  const bodyHeight = Math.max(0, base.height - base.body.top)
  const contentHeight = base.contentHeight + zone.height
  const maxScroll = Math.max(0, contentHeight - bodyHeight)
  const scrollTop = Math.min(Math.max(0, input.scrollTop ?? 0), maxScroll)
  const bar = zone.navBar
  return {
    ...base,
    body: { top: base.body.top, height: bodyHeight },
    contentTop: restTop - scrollTop,
    contentHeight,
    maxScroll,
    scrollTop,
    scrolls: maxScroll > 0,
    bottom: { ...zone, navBar: { top: bar.top, height: bar.contentHeight, contentHeight: bar.contentHeight } },
    float: true,
  }
}
