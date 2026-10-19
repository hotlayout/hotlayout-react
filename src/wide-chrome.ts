/**
 * The wide placement (schema 9.18.0): where the navigation bar sits and what a modal sheet layer
 * becomes at the `medium` and `expanded` width classes.
 *
 * The rules are contract data (`x-style.layout.wideNav`, `x-style.layout.wideModal`); the
 * functions are the reference implementation's, verbatim. The package imports nothing from the
 * contract repository, so the rule is written here a second time; the two copies are kept together by the
 * shared case table `contract/fixtures/adaptive/adaptive-cases.json` and by a test that compares
 * the data blocks with the artifact.
 *
 * THE DOCUMENT DOES NOT CHANGE. The navigation bar is the same node, the last child of the root;
 * the modal screen is the same entry. The READER picks the placement by width class. No React and
 * no DOM in this file: the server graph of the entry point reads it too.
 */
import { navWidePlacementOf, screenChildrenByZone } from './bottom-zone'
import type { WidthClass } from './width-class'

/** The classes where the wide app bar and layer layout applies: all but `compact`. */
export const WIDE_WIDTH_CLASSES = ['medium', 'expanded'] as const satisfies readonly WidthClass[]

/** Whether the class is wide: the navigation bar moves to the top and a sheet becomes a window. */
export function isWideWidthClass(widthClass: WidthClass): boolean {
  return (WIDE_WIDTH_CLASSES as readonly WidthClass[]).includes(widthClass)
}

/**
 * Where the navigation bar sits:
 *
 *  - `bottom`: the bottom zone, as on a phone (`x-style.layout.bottomZone`);
 *  - `appBar`: the items sit IN the screen's app bar, on one row with the title;
 *  - `top`: the bar's own top strip in the app bar zone (the screen has no app bar zone).
 */
export const NAV_BAR_PLACES = ['bottom', 'appBar', 'top'] as const
export type NavBarPlace = (typeof NAV_BAR_PLACES)[number]

interface ChromeChild {
  readonly type: string
  readonly pin?: unknown
  readonly props?: unknown
}

/** Root children by zone in a width class: zones by document, and the navigation bar's place. */
export interface ScreenChrome<T> {
  readonly appBar: T | undefined
  /** Pinned to the top, in a run after the app bar zone (9.24.0). */
  readonly topPinned: readonly T[]
  readonly body: readonly T[]
  readonly pinned: T | undefined
  readonly navBar: T | undefined
  /** Where the bar sits in this class; `undefined` when the screen has no bar. */
  readonly navPlace: NavBarPlace | undefined
}

/** The `widePlacement` field of the bar node as it stands in the document. */
export function widePlacementFieldOf(navBar: { readonly props?: unknown } | undefined | null): unknown {
  const props = navBar?.props
  if (typeof props !== 'object' || props === null || !Object.hasOwn(props, 'widePlacement')) return undefined
  return (props as { readonly widePlacement?: unknown }).widePlacement
}

/**
 * Who sits where in a width class: ONE place.
 *
 * Which child is the app bar, body, pinned block and bar is still stated by the DOCUMENT
 * (`screenChildrenByZone`): a width class does not move children between zones. The only new
 * thing is the NAVIGATION BAR'S PLACE:
 *
 *  1. at `compact`, at the bottom, whatever the field says;
 *  2. `widePlacement: 'bottom'` puts it at the bottom at every width;
 *  3. otherwise the bar goes to the TOP: into the app bar if the screen has an app bar zone and it
 *     is SHOWN (`isShown`: the width class and the data condition, `isNodeShown`), and, without
 *     one, as its own strip in the app bar zone.
 *
 * The bar does NOT wait for an app bar hidden by a condition or a class: there is no app bar zone
 * (`screen.appBar.hidden`), and items left inside it would disappear along with it, leaving a
 * screen without navigation. So "there is an app bar" here means "shown", not "present in the
 * document". A bar that is hidden the same way is drawn nowhere.
 *
 * `isShown` comes from whoever knows the data; without it everything counts as shown (an editor
 * asks this way: it draws hidden nodes dimmed, and an app bar remains an app bar).
 */
export function screenChromeIn<T extends ChromeChild>(
  children: readonly T[],
  widthClass: WidthClass,
  isShown: (node: T) => boolean = () => true,
  rootProps?: unknown,
): ScreenChrome<T> {
  const zones = screenChildrenByZone(children, rootProps)
  const navBar = zones.navBar
  if (navBar === undefined) return { ...zones, navPlace: undefined }
  if (!isWideWidthClass(widthClass) || navWidePlacementOf(widePlacementFieldOf(navBar)) === 'bottom') return { ...zones, navPlace: 'bottom' }
  return { ...zones, navPlace: zones.appBar !== undefined && isShown(zones.appBar) ? 'appBar' : 'top' }
}
