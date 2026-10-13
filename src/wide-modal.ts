/** The modal layer on a wide place: the mirror of `x-style.layout.wideModal`, a sheet that becomes a window. */
import { modalBoxOf, modalPlacementOf, modalWidthOf } from './media-chrome'
import type { ModalBox } from './media-chrome'
import { WIDE_WIDTH_CLASSES, isWideWidthClass } from './wide-chrome'
import { WIDTH_CLASS_FROM, widthClassOf } from './width-class'
import type { WidthClass } from './width-class'

/** The largest width, in points, of the window a sheet becomes in a wide place. */
export const WIDE_MODAL_MAX_WIDTH = 560
/** The largest share of the area height such a window takes. */
export const WIDE_MODAL_MAX_HEIGHT_SHARE = 0.85

/** How the modal layer is shown: a sheet from the bottom, a `center` window, or a sheet that became a window in a wide place. */
export const MODAL_SHAPES = ['sheet', 'window', 'sheetWindow'] as const
export type ModalShape = (typeof MODAL_SHAPES)[number]

/**
 * SHEET IN A WIDE PLACE BECOMES A WINDOW IN THE MIDDLE (`x-style.layout.wideModal`).
 *
 * A screen with `presentation: 'modal'` WITHOUT `modalPlacement` (or with `bottom`) is a
 * full-width sheet from the bottom on a phone. At width 1280 a full-width sheet is a strip across
 * the whole monitor: the custom of a wide place is a dialog in the middle. The document does not
 * change and has no word for this; it is decided by the WIDTH CLASS OF THE PLACE in which the
 * stack is shown (the area the host gave the screen), not the layer's class.
 *
 * THE WIDTH IS AT MOST 560 (`maxWidth`), and the number is chosen to stay SMALLER THAN THE
 * `medium` BOUNDARY (600): the width class of a layer is computed from its OWN box, so the
 * window's content is always `compact`. The sheet was built for a phone, and in the window it is
 * drawn with exactly the layout it was built with, with no second layout. A wider window would
 * switch the content to `medium` exactly when the place becomes wider than some threshold, and
 * two readers with different field rounding would diverge in the tree, not in a pixel.
 *
 * THE HEIGHT follows the content, at most 85% of the area height (`maxHeightShare`) and at most
 * the area without margin above and below: above and below the window the scrim stays, which is
 * what is clicked to close it. Beyond that the layer body scrolls and the layer's app bar stays
 * (the zones rule).
 *
 * `modalPlacement: 'center'` works at ALL widths as before (`centerPlacement`): 400 and a margin
 * make a window the author named, and its size does not grow with the place.
 *
 * RADIUS (`radius`). The layer has no look of its own; background, radius and shadow come from
 * the root `style`. A sheet usually names only its TOP corners, since the bottom ones lie on the
 * screen edge. In a window the bottom corners are visible, and sharp ones under rounded ones
 * would read as a cut-off sheet. So a BOTTOM corner the style did NOT NAME takes the radius of
 * the top corner on the same side. A named one, zero included, stays as is. There is nothing to
 * say this in the document: the layer root's `styleOn` reads the class of the LAYER, which is
 * `compact`.
 */
export const WIDE_MODAL_RULES = {
  appliesTo: 'modal-screen-with-no-modalPlacement-or-with-bottom',
  decidedBy: 'the-width-class-of-the-area-the-host-gave-the-screen',
  classes: [...WIDE_WIDTH_CLASSES],
  compact: 'sheet-at-the-bottom-modalLayer.bottom',
  wide: 'window-in-the-centre',
  window: {
    width: 'fill-minus-margins-up-to-max',
    maxWidth: WIDE_MODAL_MAX_WIDTH,
    margin: 'xl',
    height: 'content',
    maxHeightShare: WIDE_MODAL_MAX_HEIGHT_SHARE,
    maxHeight: 'the-lesser-of-the-share-of-the-area-height-and-the-area-minus-margins',
    align: 'center',
    rounding: 'none',
  },
  centerPlacement: 'modalLayer.center-unchanged-on-every-width',
  contentWidthClass: 'from-the-box-of-the-layer-always-compact-under-600',
  radius: {
    unnamedBottomCorner: 'takes-the-radius-of-the-top-corner-of-the-same-side',
    namedCorner: 'as-is-zero-too',
    singleValue: 'as-is',
    appliesTo: 'sheet-shown-as-a-window-only',
  },
  look: 'modalLayer.look',
  scrim: 'modalLayer.scrim',
  dismiss: 'modalLayer.dismiss',
  overflow: 'modalLayer.overflow',
  zones: 'modalLayer.zones',
  record: 'modalLayer.record',
  pinned: 'at-the-bottom-of-the-window',
  navBar: 'not-drawn',
  safeAreaBottom: 'none-as-a-window',
  event: 'screen-shown-as-is-no-new-field',
  olderReader: 'sheet-at-the-bottom-on-every-width',
} as const

/**
 * HOW THE LAYER IS SHOWN: `center` is a window at all widths; otherwise (no field, `bottom`, an
 * unknown word) a sheet on `compact` and a window in a wider place. `areaWidth` is the width of
 * the area the host gave the screen.
 */
export function modalShapeOf(placement: unknown, areaWidth: number): ModalShape {
  if (modalPlacementOf(placement) === 'center') return 'window'
  return isWideWidthClass(widthClassOf(areaWidth)) ? 'sheetWindow' : 'sheet'
}

/**
 * REFERENCE: the layer's width, which must be known BEFORE the content is measured, and from
 * which the width class of the layer's content is computed (`widthClassOf`).
 */
export function modalLayerWidthOf(placement: unknown, areaWidth: number, margin: number): number {
  if (modalShapeOf(placement, areaWidth) !== 'sheetWindow') return modalWidthOf(placement, areaWidth, margin)
  return Math.max(0, Math.min(areaWidth - 2 * margin, WIDE_MODAL_MAX_WIDTH))
}

export interface ModalLayerBoxInput {
  readonly placement: unknown
  /** The area the host gave the screen. */
  readonly viewport: { readonly width: number; readonly height: number }
  /** Height of the layer content (with the root's padding), measured at the layer's width. */
  readonly contentHeight: number
  /** Window margin in theme points (`center.margin`, `wideModal.window.margin` is one step). */
  readonly margin: number
}

export interface ModalLayerBox extends ModalBox {
  readonly shape: ModalShape
  /** Width class of the layer's CONTENT, from its own box. */
  readonly contentWidthClass: WidthClass
}

/** REFERENCE: the rectangle of the modal layer in the screen area by the area's width class. */
export function modalLayerBoxOf(input: ModalLayerBoxInput): ModalLayerBox {
  const shape = modalShapeOf(input.placement, input.viewport.width)
  if (shape !== 'sheetWindow') {
    const box = modalBoxOf(input)
    return { ...box, shape, contentWidthClass: widthClassOf(box.width) }
  }
  const width = modalLayerWidthOf(input.placement, input.viewport.width, input.margin)
  const available = Math.max(0, Math.min(input.viewport.height * WIDE_MODAL_MAX_HEIGHT_SHARE, input.viewport.height - 2 * input.margin))
  const height = Math.min(Math.max(0, input.contentHeight), available)
  return {
    x: (input.viewport.width - width) / 2,
    y: (input.viewport.height - height) / 2,
    width,
    height,
    scrolls: input.contentHeight > available,
    shape,
    contentWidthClass: widthClassOf(width),
  }
}

/**
 * REFERENCE: the root radius of a sheet shown as a WINDOW (`wideModal.radius`). A single value
 * for all corners and an absent radius stay as they are; for a per-corner radius an UNNAMED
 * bottom corner takes the top one on the same side. If nothing changed, the same value is
 * returned.
 */
export function sheetWindowRadius<V>(radius: V): V {
  if (typeof radius !== 'object' || radius === null) return radius
  const corners = radius as { readonly topStart?: unknown; readonly topEnd?: unknown; readonly bottomEnd?: unknown; readonly bottomStart?: unknown }
  const bottomStart = corners.bottomStart ?? corners.topStart
  const bottomEnd = corners.bottomEnd ?? corners.topEnd
  if (bottomStart === corners.bottomStart && bottomEnd === corners.bottomEnd) return radius
  return {
    ...corners,
    ...(bottomEnd === undefined ? {} : { bottomEnd }),
    ...(bottomStart === undefined ? {} : { bottomStart }),
  } as V
}

/**
 * HOW THE LAYER IS SHOWN IN AN AREA OF A GIVEN CLASS. `modalShapeOf` asks only for the area's
 * width class (`widthClassOf`), so a reader that already knows the class (`HotlayoutScreen`
 * measures it once) need not know the width itself.
 */
export function modalShapeInClass(placement: unknown, areaClass: WidthClass): ModalShape {
  if (modalPlacementOf(placement) === 'center') return 'window'
  return isWideWidthClass(areaClass) ? 'sheetWindow' : 'sheet'
}

/**
 * Width class of the layer's CONTENT, from its own box. A sheet in a `compact` area is narrower
 * than 600 (its width is the area's width); a `center` window is up to 400; a sheet-window is up
 * to 560. So in EVERY area the layer's content is `compact`, though the page under the scrim is
 * `expanded`. The function exists so that this place is named, and the table (`contentWidthClass`
 * in `wideModalCases`) checks it.
 */
export function modalContentWidthClass(placement: unknown, areaClass: WidthClass): WidthClass {
  // The widest area of its class (without margins, the widest layer): `compact` as soon as it is narrower than 600, the rest as wide as you like.
  const widest = areaClass === 'compact' ? WIDTH_CLASS_FROM.medium - 0.01 : Number.MAX_SAFE_INTEGER
  return widthClassOf(modalLayerWidthOf(placement, widest, 0))
}
