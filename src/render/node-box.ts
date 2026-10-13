/** The box of a node in its parent: what `fill`, `weight`, a tight slot, a scrollable row, a column parent, a carousel and `pull` make of its CSS. */
import type { CSSProperties } from 'react'

import type { TextDirection } from '../direction'
import { isInputWidget } from '../input-rules'
import { isReadableSpacingRef } from '../layer-placement'
import type { ReaderLayer } from '../layer-placement'
import { mathLength, spacingMathCss } from '../resolve'
import { cssNumber, lookup } from '../sanitize'
import { HEIGHT_KEYS, WIDTH_KEYS, withoutScreenExcluded } from '../style'
import { ROW_LAYOUT, SIZED_BOX_KEYS, stretchesInScrollRow, takesNaturalWidthInColumn, weightOf } from '../layout-rules'
import type { Css } from '../style'
import type { Theme } from '../theme'
import type { NodeStyle, UiNode } from '../types'
import { sheetWindowRadius } from '../wide-modal'
import type { NavPlace, ScreenAnatomy } from './contexts'
import { ALIGN } from './flex-words'
import { inheritedStyleOnly, signedSpacing } from './node-css'
import { inlineMarginOf } from './prop-tokens'

/** What the parent says about the place of this child: read from the contexts by `NodeView`, valid for this node only. */
export interface NodePlacement {
  readonly fillIgnored: boolean
  readonly tightSlot: boolean
  readonly isStackLayer: boolean
  readonly inScrollRow: boolean
  readonly inLeadingZone: boolean
  readonly columnAlign: string | undefined
  readonly inWeightedRow: boolean
  readonly layer: ReaderLayer | undefined
  readonly pullAxis: 'column' | 'row' | undefined
  readonly carouselCard: { readonly sized: boolean; readonly stretch: boolean } | undefined
  readonly direction: TextDirection
}

/** The effective style of a node in the place where it is drawn: the screen root, a sheet shown as a window, a navigation bar inside the app bar. */
export function placedStyleOf(node: UiNode, resolved: NodeStyle | undefined, anatomy: ScreenAnatomy, navPlace: NavPlace | undefined): NodeStyle | undefined {
  // The screen root has no `margin` and no sizes: if the document brings them they are ignored
  // (`screenBoxFields: 'ignore'`), the rest of the style applies. Colour and font pass on as they are.
  const screenOwn = node.type === 'Screen' ? withoutScreenExcluded(resolved) : resolved
  /*
   * Wide place (schema 9.18.0). The root of a sheet shown as a WINDOW: a bottom corner of the radius
   * that the document did not name takes the radius of the top one (`sheetWindowRadius`). A
   * navigation bar INSIDE the app bar has no box: background, border, margins, shadow, radius and
   * size are not read, and the items inherit only the colour and font named on the bar.
   */
  const windowRadius = node.type === 'Screen' && anatomy.modal && anatomy.sheetWindow === true && screenOwn?.radius !== undefined ? sheetWindowRadius(screenOwn.radius) : undefined
  const sheetOwn = windowRadius === undefined || screenOwn === undefined ? screenOwn : { ...screenOwn, radius: windowRadius }
  return node.type === 'NavBar' && navPlace === 'appBar' ? inheritedStyleOnly(sheetOwn) : sheetOwn
}

/** A layer stretched over the whole stack; the size keys it drops are added to `dropped`. */
export function fillLayerCss(node: UiNode, box: Css, dropped: string[], place: Pick<NodePlacement, 'isStackLayer' | 'fillIgnored'>): Css {
  const { isStackLayer, fillIgnored } = place
  /*
   * `fill` is a property of the node IN ITS PARENT, so it is handled HERE and not inside the widget:
   * a `Container`, an `Image` or anything else put into a stack can be a stretched layer.
   */
  const isFilled = node.fill === true && isStackLayer && !fillIgnored
  const fillCss: Css = isFilled ? { position: 'absolute', inset: 0 } : {}

  /*
   * `fill` beats `style.width` / `height` (`x-style.fillOverridesSize`): the layer takes the size of
   * the stack, and a stretched layer with its own width would be two statements about one thing.
   * A size goes together with its `min…` / `max…`.
   */
  if (isFilled) {
    for (const key of [...WIDTH_KEYS, ...HEIGHT_KEYS]) {
      Reflect.deleteProperty(box, key)
      dropped.push(key)
    }
  }
  return fillCss
}

/** The share of a row a node takes: by its weight, or as a child without one. */
export interface RowShare {
  readonly weight: number | undefined
  readonly shareCss: CSSProperties | undefined
  readonly weightCss: Css
  readonly rowCss: Css
}

export function rowShareOf(node: UiNode, box: Css, dropped: string[], inWeightedRow: boolean): RowShare {
  /*
   * `weight` is also a property of the node IN ITS PARENT and is also handled HERE: anything put into
   * a row can be wider than its neighbour.
   *
   * `flex: N 1 0` is a literal translation of Flutter's `Expanded(flex: N)`: zero basis, growth by
   * weight. `minWidth: 0` is mandatory: without it the minimum size of a flex child equals the size
   * of its content, and long text would not let it shrink to its share. Flutter has no such effect,
   * so without this line the web would show a wider node than the phone.
   *
   * WEIGHT BEATS `style.width` (`x-style.weightOverridesWidth`): `Expanded` gives a tight
   * constraint. So the width from the style is removed here rather than merely overridden by flex:
   * a `width` together with `flex-basis: 0` does not lose in CSS.
   */
  /*
   * THE SHARE INCLUDES THE NODE'S OWN MARGINS (`x-style.weightShareIncludes`). If `flex: N 1 0` is
   * put on the element that has a `margin`, flex first subtracts the margins of ALL children and
   * only then divides: a row with weights 3 and 1 and `sm` margins would give 263/98 instead of
   * 271/90. So the row is divided by a WRAPPER without margins (`shareCss`), and the box with its
   * margins lies inside it and fills it completely (`weightCss`), literally Flutter's
   * `Expanded(Padding(margin, box))`.
   *
   * WEIGHT ACTS ONLY IN A PARENT THAT DIVIDES THE ROW (`acceptsWeightedChildren`): in a column, a
   * grid, a stack, a scrolling or wrapping row a node with `weight` is drawn at its own width and
   * its `style.width` applies.
   */
  const weightCss: Css = {}
  let shareCss: CSSProperties | undefined
  /*
   * A weight that is not a positive INTEGER is no weight (`invalidWeight: 'no-weight'`): `weight: 0`
   * in flex would make the node zero-sized, and CSS would execute `1.5` as a fractional `flex`,
   * which Flutter does not have.
   *
   * A ROW WITHOUT A FINITE WIDTH (`rowInUnboundedWidth: 'natural-width-ignore-weights'`) needs no
   * code of its own here: a row that is itself a child without weight has a "by content" width in
   * CSS, the sum of the natural widths of its children, and `flex: N 1 0` divides nothing in it, so
   * a child with a weight keeps its natural width. In Flutter this has to be done by hand.
   */
  const weight = inWeightedRow ? weightOf(node) : undefined
  if (weight !== undefined) {
    for (const key of WIDTH_KEYS) {
      Reflect.deleteProperty(box, key)
      dropped.push(key)
    }
    shareCss = { flex: `${cssNumber(weight)} 1 0px`, minWidth: 0, display: 'flex' }
    Object.assign(weightCss, { flex: '1 1 auto', minWidth: 0 })
  }

  /*
   * A ROW CHILD WITHOUT WEIGHT (`unweightedRowChild`, `unweightedStretchInRow`; block
   * `x-style.layout.row`). In a row that divides the width, a child without weight is one of four
   * kinds, the first that fits:
   *
   *  - it has its own `style.width`: it takes it and does NOT shrink (`flex-shrink: 0`); a row that
   *    cannot fit such children overflows;
   *  - a widget from the `column.naturalWidth` list (badge, a button not "full width", icon, ring,
   *    vertical line and spacer): natural width, no wider than the row, and it does not shrink either;
   *  - "stretchable content" (`scrollableRow.stretchToViewport`) has no natural width and takes the
   *    remainder as a weight share `stretchShare`, with the same wrapper as a node with a weight.
   *    Without this a progress bar in a flex row would be ZERO wide;
   *  - the rest: a natural width that shrinks proportionally. This is `flex: 0 1 auto`, the default
   *    behaviour of a flex child, and needs no code.
   *
   * A CSS INACCURACY this package does not fix: flex takes the full text length as the basis for
   * shrinking (not "at most the row") and does not shrink below the longest word. With two long
   * labels side by side the widths differ from Flutter by a few dozen pixels.
   */
  const rowCss: Css = {}
  if (inWeightedRow && weight === undefined) {
    if (box.width !== undefined) {
      rowCss.flexShrink = 0
    } else if (takesNaturalWidthInColumn(node)) {
      rowCss.flexShrink = 0
      if (box.maxWidth === undefined) rowCss.maxWidth = '100%'
    } else if (stretchesInScrollRow(node) || isInputWidget(node.type)) {
      // Input fields (schema 9.13.0) are stretchable content too: without a weight they divide the rest of the row.
      shareCss = { flex: `${String(ROW_LAYOUT.stretchShare)} 1 0px`, minWidth: 0, display: 'flex' }
      Object.assign(weightCss, { flex: '1 1 auto', minWidth: 0 })
    }
  }
  return { weight, shareCss, weightCss, rowCss }
}

/** A named box clips the content larger than itself. */
export function clipSizedBox(box: Css): void {
  /*
   * A NAMED BOX CLIPS content larger than itself (`sizedBoxOverflow: 'clip'`): `style.width` /
   * `height` are EXACT, not minimums. Computed AFTER `fill` and `weight` took their sizes, because a
   * size that does not apply clips nothing.
   */
  const hasSizedBox = SIZED_BOX_KEYS.some((key) => box[key] !== undefined)
  if (hasSizedBox && box.overflow === undefined) box.overflow = 'hidden'
}

/** A node in a tight slot (a grid cell, an instance of a list in columns). */
export function tightSlotCss(node: UiNode, box: Css, tightSlot: boolean): Css {
  /*
   * A node with its own size in a tight slot sits at the logical start and the top
   * (`sizedChildInTightSlot: 'start-top'`): `justify-self` / `align-self` of the cell.
   */
  const slotCss: Css = {}
  if (tightSlot) {
    /*
     * A widget of natural width from the `column.naturalWidth` list in a tight slot also takes its
     * natural width and sits at the start and the top (`naturalWidthInTightSlot:
     * 'natural-start-top'`): a badge in a grid cell is a pill, not a strip. No wider than the slot.
     */
    const natural = box.width === undefined && takesNaturalWidthInColumn(node)
    if (box.width !== undefined || natural) {
      slotCss.justifySelf = 'start'
      if (box.maxWidth === undefined) slotCss.maxWidth = '100%'
    }
    if (box.height !== undefined || natural) slotCss.alignSelf = 'start'
  }
  return slotCss
}

/** A child of a scrollable row. */
export function scrollRowChildCss(node: UiNode, box: Css, inScrollRow: boolean, theme: Theme): Css {
  /*
   * A child of a scrolling row does not shrink (there would be nothing to scroll) and is no wider
   * than the visible area of the row (`scrollableRowChildWidth: 'row-viewport'`). Stretchable
   * content (a progress bar, a horizontal divider, a grid) takes the width of that area, not
   * infinity.
   */
  const rowViewportCss: Css = {}
  if (inScrollRow) {
    rowViewportCss.flexShrink = 0
    /*
     * `max(row-viewport, own-width)` (`scrollRow.childMaxWidth`): no wider than the visible area of
     * the row, but an own width larger than it is ALLOWED. Otherwise a card with `width: 400` in a
     * narrow strip would shrink to the screen and there would be nothing to scroll.
     */
    rowViewportCss.maxInlineSize = typeof box.width === 'string' ? `max(100%, ${mathLength(box.width, theme)})` : '100%'
    if (stretchesInScrollRow(node) && box.width === undefined) rowViewportCss.inlineSize = '100%'
  }
  return rowViewportCss
}

/** A child of a column parent that does not stretch. */
export function columnChildCss(node: UiNode, box: Css, columnAlign: string | undefined, theme: Theme): Css {
  /*
   * WIDTH IN A COLUMN PARENT (`columnChildWidth: 'stretch-unless-natural'`). The parent is a flex
   * column and stretches the child itself: only those that do NOT stretch are handled here.
   *
   *  - a node with its own `style.width` and a widget from the `naturalWidth` list: natural width,
   *    no wider than the parent, placed by the parent's alignment;
   *  - a stretched child with `maxWidth`: the width is the parent content minus its own `margin`,
   *    limited by `maxWidth`, and placed by the same alignment. At the start the stretching itself
   *    puts it there, so the rule is needed only for the centre and the end.
   *
   * A stretched stack layer never gets here: `Stack` is not a column parent.
   */
  const columnCss: Css = {}
  if (columnAlign !== undefined) {
    // A child taller than the column box keeps its size (`alignedChildRects`): a named height is exact and there is nothing to shrink.
    columnCss.flexShrink = 0
    const self = lookup(ALIGN, columnAlign) ?? 'flex-start'
    if (box.width !== undefined || takesNaturalWidthInColumn(node)) {
      columnCss.alignSelf = self
      if (box.maxWidth === undefined) columnCss.maxWidth = '100%'
    } else if (box.maxWidth !== undefined && columnAlign !== 'start') {
      columnCss.alignSelf = self
      columnCss.inlineSize = `calc(100% - ${inlineMarginOf(box, 'InlineStart', theme)} - ${inlineMarginOf(box, 'InlineEnd', theme)})`
    }
  }
  return columnCss
}

/** A card of a carousel; `cardMargins` is the inline margins of the node as a `calc()` fragment. */
export function carouselCardBox(box: Css, carouselCard: NodePlacement['carouselCard'], theme: Theme): { readonly cardCss: Css; readonly cardMargins: string } {
  /*
   * A CAROUSEL CARD (schema 9.11.0): with `perView` the carousel dictates the width and the card's
   * own `width` / `minWidth` / `maxWidth` are not read, as under a row weight. Without `perView` it
   * is the natural width of a scrolling row; stretchable content (a bar, a divider, a grid) takes
   * the visible area.
   */
  const cardCss: Css = {}
  const cardMargins = `${inlineMarginOf(box, 'InlineStart', theme)} - ${inlineMarginOf(box, 'InlineEnd', theme)}`
  if (carouselCard?.sized === true) {
    for (const key of WIDTH_KEYS) Reflect.deleteProperty(box, key)
    // The width of the BOX is exactly the card; the node `margin` lies on top of it, in the wider list item (see the wrapper below).
    Object.assign(cardCss, { inlineSize: `calc(100% - ${cardMargins})`, flex: 'none', minInlineSize: 0, maxInlineSize: 'none' })
  } else if (carouselCard?.stretch === true && box.width === undefined) {
    cardCss.inlineSize = `calc(100% - ${cardMargins})`
  }
  return { cardCss, cardMargins }
}

/** `pull` of a node: laid on the row-share wrapper when there is one (the new wrapper style is returned), otherwise on the box itself. */
export function pulledShare(node: UiNode, box: Css, row: Pick<RowShare, 'weight' | 'shareCss'>, place: Pick<NodePlacement, 'pullAxis' | 'inWeightedRow'>, theme: Theme): CSSProperties | undefined {
  const { pullAxis, inWeightedRow } = place
  const { weight } = row
  let { shareCss } = row
  /*
   * PULL (schema 9.10.0, `x-style.layout.pull`): a negative margin on the start side of the parent's
   * MAIN axis, ADDED to the node's own margin on the same side (the parent gap stays: overlap =
   * `pull - gap`). A weight is stronger: on a node with an effective weight the margin is not read.
   * It goes on the OUTER element of the node's place, the row-share wrapper when there is one.
   * `position: relative`: a later node lies over an earlier one even if that one is positioned (a
   * stack).
   */
  // The app bar is a screen zone, not a flow child: its `pull` is not read (`pull.onAppBar: 'ignore'`).
  const pullBy = node.type !== 'AppBar' && pullAxis !== undefined && isReadableSpacingRef(node.pull) && !(inWeightedRow && weight !== undefined) ? node.pull : undefined
  const pullKey = pullAxis === 'row' ? 'marginInlineStart' : 'marginBlockStart'
  if (pullBy !== undefined) {
    const pulled = signedSpacing(pullBy, theme, false)
    if (shareCss !== undefined) {
      shareCss = { ...shareCss, [pullKey]: pulled, position: 'relative' }
    } else {
      const own = box[pullKey] ?? box.margin
      const ownText = own === undefined || own === '0' || own === 0 ? undefined : mathLength(String(own), theme)
      Reflect.deleteProperty(box, pullKey)
      Object.assign(box, { [pullKey]: ownText === undefined ? pulled : `calc(${ownText} - ${spacingMathCss(pullBy, theme) ?? '0px'})`, position: 'relative' })
    }
  }
  return shareCss
}
