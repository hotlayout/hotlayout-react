/**
 * React contexts of a screen and the types of their values. A LEAF module (it imports nothing from
 * the render modules): the screen root, the node view and the widget views all read them from here,
 * so initialisation order does not depend on the "NodeView -> widget view -> NodeView" cycle.
 */

import { createContext, useContext } from 'react'
import type { DataScope } from '../data'
import type { ImagePolicy } from '../images'
import { DEFAULT_IMAGES } from '../images'
import type { LocaleResolution } from '../locale'
import type { ReaderLayer } from '../layer-placement'
import { safeBottomInset } from '../sanitize'
import { NO_SAFE_TOP, safeTopInset } from '../screen-top'
import type { IssueSink } from '../shape'
import type { TextStyleContext } from '../style'
import { ROOT_TEXT_STYLE } from '../style'
import type { Theme } from '../theme'
import type { LocalizationSection, UiNode } from '../types'
import type { WideNavMode } from '../wide-nav'
import type { WidthClass } from '../width-class'


/**
 * The data of the screen. A context rather than a prop because `Repeater` layers its own scope over
 * the whole subtree below it; passing it as a prop would thread it through every widget, including
 * those that never read data.
 */
export const DataContext = createContext<DataScope>({})

/**
 * The row record of a node: the record the screen was opened with, and on top of it the records of
 * `Repeater` instances. Kept apart from `DataContext` on purpose: data is what the node READS
 * (the record over the host data), while this is what its action CARRIES onward: to the host and to
 * the screen a `navigate` leads to.
 */
export interface RecordPlace {
  readonly record: DataScope | undefined
  /** Whether the node is drawn inside a list instance: a row NAMES a record, a screen button does not. */
  readonly insideListItem: boolean
}

export const NO_RECORD: RecordPlace = { record: undefined, insideListItem: false }

export const RecordContext = createContext<RecordPlace>(NO_RECORD)

/**
 * The chain of template instances from the root: the indices of the `Repeater` records the node
 * sits in. Empty means the node is not inside a data-driven list. Together with the node `id` it
 * forms the carousel state key (`carouselStateKey`): there is one template but one instance per
 * record, and each instance has its own current card.
 */
export const InstancePathContext = createContext<readonly number[]>([])

/** Collections: `tasks` -> records. They arrive from the backend together with the screen data. */
export const CollectionsContext = createContext<Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>>({})

/**
 * The theme being drawn with. The document does not know it (it only holds token names), but the
 * reader must: whether a token exists is decided by the theme, not by the schema
 * (`customTokens: 'declared-by-theme'`), and that decides whether a property applies at all.
 */
export const ThemeContext = createContext<Theme | undefined>(undefined)

export function useTheme(): Theme {
  const theme = useContext(ThemeContext)
  if (theme === undefined) throw new Error('node rendered outside ScreenView: no theme in context')
  return theme
}

/**
 * The foreground in effect at this point of the tree: `color` and `typography`.
 *
 * A React context is a literal translation of the contract rule: the value flows down until a
 * descendant names its own.
 */
export const TextContext = createContext<TextStyleContext>(ROOT_TEXT_STYLE)

/**
 * Where we are in the document, needed EXACTLY for translation.
 *
 * A translation key is "screen/node/field", so a text widget must know its node. A context rather
 * than a prop for the same reason as the data: otherwise `nodeId` would be threaded through every
 * widget, including those with no texts.
 */
export interface TextPlace {
  readonly screenId: string
  readonly nodeId: string
  readonly localization: LocalizationSection | undefined
  /** The shown translation language and the formatting locale: ONE answer per document (`locale.ts`). */
  readonly shown: LocaleResolution
  /** The time zone for dates, from the host; `undefined` means the zone of whoever draws. */
  readonly timeZone?: string | undefined
  /** The reader's "now", epoch milliseconds, for `daysUntil` (`readerClock`). One instant per screen. */
  readonly now?: number | undefined
}

/** The most collection records the reader draws: `x-delivery.maxCollectionItems` of the data contract. */
export const MAX_COLLECTION_ITEMS = 50

/**
 * The image policy in effect on this screen: which address from the document or the data the
 * reader will load (`images.ts`). A context because an image is both a widget and the background of
 * any node.
 */
export const ImageContext = createContext<ImagePolicy>(DEFAULT_IMAGES)

export const NO_LOCALE: LocaleResolution = { translation: undefined, formatting: undefined, directionLocale: undefined, matched: false }

export const PlaceContext = createContext<TextPlace>({ screenId: '', nodeId: '', localization: undefined, shown: NO_LOCALE })

/** Where input the reader ignored WHILE drawing goes (a template value of the wrong shape). */
export const IssueContext = createContext<IssueSink>(() => undefined)

/**
 * A stack where ALL layers are stretched: `fill` has no effect and every layer is drawn at its own
 * size (`allLayersFilled: 'ignore-fill'`). The validator rejects such a stack (nothing measures
 * it), but a document may come from something other than the builder. Without this rule Flutter
 * would get an infinite height.
 */
export const FillIgnoredContext = createContext(false)

/**
 * A slot that fixes the size TIGHTLY, such as a grid cell. Which nodes create one is given by the
 * artifact (`x-style.layout.tightSlots`: `Grid` and `Repeater` with `columns` set), not by a node
 * type here: see `makesTightSlots`. A node with its own width or height sits there at the LOGICAL
 * start and the top, neither centred nor stretched (`sizedChildInTightSlot: 'start-top'`).
 */
export const TightSlotContext = createContext(false)

/**
 * A direct child of `Stack`, the only place where `fill` means anything
 * (`x-style.fillScope: 'direct-children-of-stack'`). Elsewhere `fill: true` is ignored
 * (`fillOutsideStack: 'ignore'`): the node is drawn as without it. The flag concerns ONLY the node
 * the stack wrapped; descendants reset it.
 */
export const StackLayerContext = createContext(false)

/**
 * Children of a scrolling row: bounded by the width of the row ITSELF (the visible area), not by
 * infinity (`scrollableRowChildWidth: 'row-viewport'`).
 */
export const ScrollRowContext = createContext(false)

/**
 * The node of the app bar's leading zone (schema 9.16.0). Only the direct zone node knows that its
 * minimum width cannot exceed half the app bar (`maxShare`): the zone limit beats `style.minWidth`.
 * Descendants reset it.
 */
export const LeadingZoneContext = createContext(false)

/**
 * The column parent (`x-style.layout.column`): the cross-axis alignment by which a child of NATURAL
 * width is placed; `undefined` means the parent is not a column. Which nodes are columns is given
 * by the artifact (`columnAlignOf`), not by a node type here. The parent itself stretches children
 * (a flex column without `align-items`); only the exceptions live here
 * (`columnChildWidth: 'stretch-unless-natural'`).
 */
export const ColumnParentContext = createContext<string | undefined>(undefined)

/**
 * The number of a list item (schema 9.17.0, `Text.marker: 'number'`). The parent provides it ONLY
 * around a numbered item: the number (how many VISIBLE items of the group up to and including this
 * one) and the group size AS DOCUMENTED (the marker column width follows from it). An item without
 * the context (not in a parent that provides it) is the first in a group of one.
 */
export interface ListNumber {
  readonly number: number
  readonly groupSize: number
}
export const ListNumberContext = createContext<ListNumber | undefined>(undefined)

/**
 * The width class of the screen (schema 9.18.0, `x-style.layout.widthClass`): one per screen,
 * measured by `HotlayoutScreen` (the package root box) and passed to the screen as a prop. By then
 * the tree is already resolved for the class (`nodeInWidthClass`), so at draw time only visibility
 * depends on the class (`nodeShown`). `compact` by default, as before the first measurement.
 */
export const WidthClassContext = createContext<WidthClass>('compact')

/**
 * A parent that DIVIDES the row by weights (`acceptsWeightedChildren`): a `Row` without `wrap` and
 * `scrollable`, or a `Container{direction: row}`. Only there does a child's `weight` mean anything;
 * elsewhere the node is drawn at its own width. Concerns DIRECT children only; descendants reset it.
 */
export const WeightedRowContext = createContext(false)

/**
 * Where the screen lives (schema 9.9.0, `x-style.layout.screen`): whether the host gives the block
 * a height. `page` (default): the block grows with its content, the host page scrolls, and the app
 * bar sticks (`sticky`) or stays the top row of the block (`static`). `screen`: the host gave a
 * height, the root fills it, the app bar stays put and only the body scrolls. A modal layer always
 * has its own (bounded) height: `modal`.
 */
export interface ScreenAnatomy {
  readonly scroll: 'page' | 'screen'
  readonly chrome: 'sticky' | 'static'
  /** A ready CSS `top` value for sticking (`'0px'`, `'56px'`); `undefined` means zero. */
  readonly stickyOffset?: string | undefined
  /** The same for the bottom zone (`bottom`); `undefined` means zero. */
  readonly stickyBottomOffset?: string | undefined
  readonly modal: boolean
  /** The modal layer is a window in the middle (`center`, or a sheet shown as a window on a wide place): it has no bottom safe area inset. */
  readonly windowed?: boolean | undefined
  /**
   * A sheet shown as a WINDOW on a wide place (schema 9.18.0): a bottom corner of the root radius
   * the document did not name takes the radius of the top one (`sheetWindowRadius`). Does not apply
   * to a `center` window.
   */
  readonly sheetWindow?: boolean | undefined
  /** A ready CSS value of the bottom safe area inset (`safeBottomInset`): `env(...)` or `Npx`. */
  readonly safeBottom: string
  /** A ready CSS value of the top safe area inset (`safeTopInset`): `env(...)` or `Npx`. */
  readonly safeTop: string
}

/**
 * The place of an overlay (schema 9.10.0): `Stack` puts it into the context of exactly the node the
 * reader treats as an overlay (`readerLayerOf`). Reset for descendants like the other place
 * contexts.
 */
export const LayerContext = createContext<ReaderLayer | undefined>(undefined)

/** The axis along which the children of the PARENT follow one another (`pullAxisOf`); `pull` acts only there. Reset for descendants. */
export const PullAxisContext = createContext<'column' | 'row' | undefined>(undefined)

/**
 * The carousel memory (schema 9.11.0, `carouselState`): which stop is open is READER state, not
 * document state. It is kept while the screen is on the stack, so going "back" restores the same
 * card. The memory lives above the screen (`HotlayoutScreen`) because the screen itself is not
 * drawn during a transition, and `scope` is the key of the stack frame.
 */
export interface CarouselMemory {
  readonly scope: string
  readonly get: (key: string) => number | undefined
  readonly set: (key: string, offset: number) => void
}
export const CarouselMemoryContext = createContext<CarouselMemory | undefined>(undefined)

/**
 * A carousel card as the node sees it (schema 9.11.0): `sized` means the width comes from `perView`
 * (the node's own `width` / `minWidth` / `maxWidth` are not read); `stretch` means stretchable
 * content takes the visible area. Reset for descendants.
 */
export const CarouselCardContext = createContext<{ readonly sized: boolean; readonly stretch: boolean } | undefined>(undefined)

/** The card width variable on the scrolling element (`carouselCardCss`). Our own variable, not a theme token. */
export const CAROUSEL_CARD_VAR = '--hl-carousel-card'

export const DEFAULT_ANATOMY: ScreenAnatomy = { scroll: 'page', chrome: 'sticky', modal: false, safeBottom: safeBottomInset(undefined), safeTop: safeTopInset(undefined) }
export const AnatomyContext = createContext<ScreenAnatomy>(DEFAULT_ANATOMY)

/**
 * Where the navigation bar being drawn now sits (schema 9.18.0): the screen root provides it around
 * the bar node, as `appBar` (items in the app bar) or `top` (its own top strip). There is no
 * context at the bottom. Read only by `NodeView` (the bar has no box in the app bar) and by the bar
 * itself with its items.
 */
export type NavPlace = 'appBar' | 'top'
export const NavPlaceContext = createContext<NavPlace | undefined>(undefined)

/** The look of items at the top: with labels or icons only. Provided by whoever measures (the app bar or the strip). */
export const NavModeContext = createContext<WideNavMode>('labels')

/** The navigation bar for the app bar: the root provides it around the app bar node, and the app bar takes it only for THAT node. */
export const AppBarNavContext = createContext<{ readonly bar: UiNode; readonly navBar: UiNode } | undefined>(undefined)

export function useData(): DataScope {
  return useContext(DataContext)
}

/**
 * The largest content width, as a number, for the app bar and navigation bar nodes (the screen
 * zones). The screen root provides it ONLY around zone nodes: the body and the pinned block become
 * a column with side padding (`columnPadding`), while the app bar and the navigation bar limit
 * the content inside their own box.
 */
export const ContentMaxContext = createContext<number | undefined>(undefined)

/** The zero safe area inset: what applies when there is no zone or no inset is added. */
export const ZERO_INSET = '0px'

/**
 * The bottom safe area inset the navigation bar draws under its items (`safeArea.navBarBackground`):
 * the bar background extends under it to the physical bottom. Provided only by the bottom zone; a
 * bar that is an ordinary child of the body gets zero.
 */
export const SafeBottomContext = createContext(ZERO_INSET)

/** The top safe area inset the app bar zone passes to the app bar or the bar's own strip, inside its box. Does not apply to descendants: only the screen root provides it. */
export const SafeTopContext = createContext(NO_SAFE_TOP)

/** The children of the node being drawn, by the document: what its own children read as their siblings. The place of an option in its group comes from them. */
export const SiblingNodesContext = createContext<readonly UiNode[]>([])
