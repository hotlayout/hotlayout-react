/**
 * The bottom safe inset of a modal sheet (`x-style.layout.sheetSafeBottom`).
 *
 * A sheet is a modal layer shown from the bottom in a `compact` area. Its box reaches the physical
 * bottom of the area, so the reader adds the platform's bottom inset INSIDE the box, under the
 * content: the background and radius of the root extend under the home indicator, the last node
 * stands above it. The inset is added ONCE: with a shown bottom zone (a pinned block) it goes under
 * the content of the zone, otherwise under the content of the body. A `center` window and a sheet
 * shown as a window in a wide place get nothing; a page is unchanged.
 *
 * The value is the host's decision (`safeAreaBottom`): a number it computed itself, zero when it
 * already accounted for the inset. Not a number, not finite or negative means zero.
 */
import { widthClassOf } from './width-class'
import { modalShapeInClass } from './wide-modal'

/** The inset the reader counts: a finite positive number, otherwise zero. */
export function sheetSafeInsetOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** Where the inset lies: the bottom padding of the sheet box, or under the content of the bottom zone. */
export interface SheetSafeBottom {
  readonly root: number
  readonly zone: number
}

const NONE: SheetSafeBottom = { root: 0, zone: 0 }

export interface SheetSafeBottomInput {
  readonly presentation?: unknown
  readonly modalPlacement?: unknown
  /** The width of the area the host gave the screen. */
  readonly areaWidth: number
  readonly safeBottom?: unknown
  /** The screen has a SHOWN bottom zone. */
  readonly bottomZone: boolean
}

/** Where the reader adds the bottom safe inset of a screen. */
export function sheetSafeBottomOf(input: SheetSafeBottomInput): SheetSafeBottom {
  const value = sheetSafeInsetOf(input.safeBottom)
  if (value === 0) return NONE
  if (input.presentation !== 'modal') return input.bottomZone ? { root: 0, zone: value } : NONE
  if (modalShapeInClass(input.modalPlacement, widthClassOf(input.areaWidth)) !== 'sheet') return NONE
  return input.bottomZone ? { root: 0, zone: value } : { root: value, zone: 0 }
}

export interface SheetBoxInput {
  readonly areaHeight: number
  /** The content of the sheet with the root paddings and its bottom zone, WITHOUT the inset. */
  readonly contentHeight: number
  readonly safeBottom?: unknown
}

export interface SheetBox {
  /** The top of the sheet from the top of the area. */
  readonly y: number
  /** The height of the box, the inset included. */
  readonly height: number
  /** The bottom edge of the content (above the inset) from the top of the sheet. */
  readonly contentBottom: number
  /** The content with the inset is taller than the area: the body of the sheet scrolls. */
  readonly scrolls: boolean
}

/** The box of a sheet with the inset inside it, no taller than the area. */
export function sheetBoxOf(input: SheetBoxInput): SheetBox {
  const area = Math.max(0, input.areaHeight)
  const inset = Math.min(sheetSafeInsetOf(input.safeBottom), area)
  const natural = Math.max(0, input.contentHeight) + inset
  const height = Math.min(natural, area)
  return { y: area - height, height, contentBottom: height - inset, scrolls: natural > area }
}
