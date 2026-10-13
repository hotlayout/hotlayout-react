/**
 * The look of the navigation items at the top: with labels, or icons only (since 9.18.0,
 * `x-style.layout.wideNav.overflow`).
 *
 * The decision is made by the reference implementation (`wideAppBarZones`, `wideNavBarOf` in
 * `wide-nav.ts`); this file only measures what it asks. CSS cannot decide this: the condition
 * reads the natural width of the title and labels, not the width of the frame.
 *
 * A MEASUREMENT MUST NOT CHANGE WHAT IT MEASURES. Everything read here is independent of the
 * chosen look: the app bar width; the natural width of the title TEXT (the inline element around
 * it, not the row's box, whose width follows the zone); the natural width of the labels
 * (`scrollWidth`, also for a label hidden from the eye, whose one-point box still holds the text
 * length); and the sides of actions and icons. So the look does not flip between frames. A zero
 * measurement (server, jsdom, a node not yet in the document) means "unknown": the look stays as
 * it was, i.e. with labels.
 *
 * Layout sizes are measured (`clientWidth`, `offsetWidth`, `scrollWidth`) rather than
 * `getBoundingClientRect`: a `transform` on a host ancestor does not change layout numbers.
 */
import type { RefObject } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Theme } from './theme'
import type { WideNavMetrics, WideNavMode } from './wide-nav'
import { wideAppBarZones, wideNavBarOf } from './wide-nav'
export interface WideNavView {
  /** `undefined` means not measured: the look with labels applies. */
  readonly mode: WideNavMode | undefined
  /**
   * How much room is left for the leading-zone node, in points; `undefined` means no limit (half
   * the app bar suffices, or there is no zone node).
   */
  readonly leadingMax: number | undefined
}

const UNMEASURED: WideNavView = { mode: undefined, leadingMax: undefined }

/** Markup marks used for measuring. They are set by `AppBarView`, `NavBarView` and `NavItemView`. */
export const NAV_MARK = {
  item: 'data-hl-nav-item',
  icon: 'data-hl-nav-icon',
  label: 'data-hl-nav-label',
  group: 'data-hl-nav-group',
  back: 'data-hl-back',
  leadingNode: 'data-hl-leading-node',
  titleText: 'data-hl-title-text',
} as const

interface BarMetrics extends WideNavMetrics {
  readonly barGap: number
  readonly actionGap: number
}

function metricsOf(theme: Theme, iconWidth: number): BarMetrics {
  const space = (token: string): number => theme.spacing[token] ?? 0
  return {
    paddingInline: space('md'),
    gap: space('xs'),
    between: space('xs'),
    iconWidth,
    barGap: space('sm'),
    actionGap: space('xs'),
  }
}

/** The width of an element's content without its own padding. A padding the engine did not resolve (a variable with no value) counts as zero. */
function innerWidth(element: HTMLElement): number {
  const view = element.ownerDocument.defaultView
  if (view === null) return element.clientWidth
  const style = view.getComputedStyle(element)
  const pad = (value: string): number => {
    const number = Number.parseFloat(value)
    return Number.isFinite(number) ? number : 0
  }
  return element.clientWidth - pad(style.paddingLeft) - pad(style.paddingRight)
}

/** The drawn items: each label's natural width and the icon box width. */
function measureItems(within: HTMLElement): { readonly labels: readonly number[]; readonly iconWidth: number } {
  const labels: number[] = []
  let iconWidth = 0
  for (const item of Array.from(within.querySelectorAll<HTMLElement>(`[${NAV_MARK.item}]`))) {
    const icon = item.querySelector<HTMLElement>(`[${NAV_MARK.icon}]`)
    const label = item.querySelector<HTMLElement>(`[${NAV_MARK.label}]`)
    iconWidth = Math.max(iconWidth, icon?.offsetWidth ?? 0)
    labels.push(label?.scrollWidth ?? 0)
  }
  return { labels, iconWidth }
}

function measureAppBar(bar: HTMLElement, theme: Theme): WideNavView {
  const width = innerWidth(bar)
  const group = bar.querySelector<HTMLElement>(`[${NAV_MARK.group}]`)
  if (!(width > 0) || group === null) return UNMEASURED
  const items = measureItems(group)
  const metrics = metricsOf(theme, items.iconWidth)
  const leading = bar.querySelector<HTMLElement>(`[data-hl-zone="leading"]`)
  const back = leading?.querySelector<HTMLElement>(`[${NAV_MARK.back}]`) ?? undefined
  const leadingNode = leading?.querySelector<HTMLElement>(`:scope > [${NAV_MARK.leadingNode}]`) ?? undefined
  /*
   * The title's NATURAL WIDTH is the width of its TEXT (the longer of the two lines), not of the
   * row's box. A box's `scrollWidth` is never less than the box itself, and with
   * `titleAlign: 'start'` the title zone is "whatever is left" (`minmax(0, 1fr)`): the box is wider
   * than the text by exactly the free room, and there is more of it once the labels are hidden.
   * The measurement would then measure what it changes itself, and the look would depend on the
   * previous one. The inline element around the text (`titleText`) does not depend on the zone's
   * width: text clipped with an ellipsis stays whole inside it.
   */
  const titleNatural = Array.from(bar.querySelectorAll<HTMLElement>(`[data-hl-zone="title"] [${NAV_MARK.titleText}]`)).reduce((widest, line) => Math.max(widest, line.offsetWidth), 0)
  const trailing = bar.querySelector<HTMLElement>(`[data-hl-zone="trailing"]`)
  const actionSides = Array.from(trailing?.children ?? [])
    .filter((child): child is HTMLElement => child instanceof HTMLElement && !child.hasAttribute(NAV_MARK.group))
    .map((action) => action.offsetWidth)
    .filter((side) => side > 0)
  const zones = wideAppBarZones({
    width,
    showBack: back !== undefined,
    backSide: back?.offsetWidth ?? 0,
    leadingNatural: leadingNode === undefined ? undefined : leadingNode.offsetWidth,
    actionSides,
    gap: metrics.barGap,
    actionGap: metrics.actionGap,
    titleNatural,
    titleAlign: bar.getAttribute('data-hl-title-align') ?? undefined,
    navLabels: items.labels,
    nav: metrics,
  })
  // The zone node's limit applies only when it is tighter than half the app bar; otherwise the 9.16.0 rule holds and there is nothing to touch.
  const room = Math.max(0, width - zones.trailing - metrics.barGap)
  return { mode: zones.navMode, leadingMax: leadingNode !== undefined && room < width / 2 ? room : undefined }
}

function measureOwnBar(row: HTMLElement, theme: Theme): WideNavView {
  const width = innerWidth(row)
  if (!(width > 0)) return UNMEASURED
  const items = measureItems(row)
  return { mode: wideNavBarOf({ width, navLabels: items.labels, nav: metricsOf(theme, items.iconWidth) }).navMode, leadingMax: undefined }
}

/** An effect that runs before paint in a browser; on the server `useLayoutEffect` warns, and there is nothing to measure there. */
export const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

/**
 * The look of the top items for the element `ref`: an app bar with items (`appBar`) or the row of
 * an own strip (`ownBar`). `undefined` means there are no items at the top here, and the hook stays
 * silent.
 */
export function useWideNavView(ref: RefObject<HTMLElement | null>, kind: 'appBar' | 'ownBar' | undefined, theme: Theme): WideNavView {
  const [view, setView] = useState<WideNavView>(UNMEASURED)
  const update = useRef<() => void>(() => undefined)
  update.current = () => {
    const bar = ref.current
    if (kind === undefined || bar === null) return
    const next = kind === 'appBar' ? measureAppBar(bar, theme) : measureOwnBar(bar, theme)
    // "Unknown" changes nothing: a zero measurement can neither hide the labels nor bring them back.
    if (next.mode === undefined) return
    setView((previous) => (previous.mode === next.mode && previous.leadingMax === next.leadingMax ? previous : next))
  }
  // After every render: the title, labels and actions change with the data, while the app bar's size does not always.
  useIsomorphicLayoutEffect(() => {
    update.current()
  })
  useIsomorphicLayoutEffect(() => {
    const bar = ref.current
    if (kind === undefined || bar === null || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      update.current()
    })
    observer.observe(bar)
    // A font that finished loading changes the labels' natural width without changing the app bar's size, so the measurement would not repeat on its own.
    const fonts = bar.ownerDocument.fonts as FontFaceSet | undefined
    const remeasure = (): void => {
      update.current()
    }
    fonts?.addEventListener('loadingdone', remeasure)
    return () => {
      observer.disconnect()
      fonts?.removeEventListener('loadingdone', remeasure)
    }
  }, [ref, kind])
  return kind === undefined ? UNMEASURED : view
}
