/**
 * The app bar after the body is scrolled (schema 9.21.0): the field `styleScrolled`, the prop
 * `titleShown` and the threshold of "scrolled". A mirror of the contract's reference rule; the shared
 * table (`scrolled…` groups of `contract/fixtures/media-chrome/media-chrome-cases.json`) keeps the two
 * copies together, and `package.test.tsx` checks the data against
 * `x-style.layout.appBarScrolled`.
 *
 *   scrolled  <=>  scrollTop > max(0, barBottom - bodyTop)       (strictly greater)
 *
 * `barBottom` is the bottom edge of the app bar zone from the top of the screen (the top safe inset
 * included), `bodyTop` the top of the BODY area from the top of the screen (0 with
 * `bodyTop: 'screenTop'`). The layer lies LAST: over the base style, the width-class layers and the
 * state of `styleWhen`, by top-level fields; a field whose token the theme does not know is dropped
 * and the field under it stays. The box is never changed (the threshold measures it).
 *
 * No React and no DOM in this file: the server graph of the entry reads it too.
 */
import { isRecord } from './sanitize'
import type { NodeStyle } from './types'

/** Mirror of `x-style.layout.appBarScrolled`: the field, the prop and the only four fields of the layer. */
export const APP_BAR_SCROLLED = { prop: 'styleScrolled', titleProp: 'titleShown', keys: ['background', 'color', 'shadow', 'backdropBlur'], titleWord: 'scrolled' } as const

/** `true` for the one word of `AppBar.props.titleShown`; an unknown word and no field draw the title always. */
export function titleOnlyWhenScrolled(props: Readonly<Record<string, unknown>>): boolean {
  return props.titleShown === APP_BAR_SCROLLED.titleWord
}

/** The layer of the node as the reader takes it: the four known fields of a record, or nothing. */
export function scrolledLayerOf(node: object): NodeStyle | undefined {
  const raw = (node as { readonly styleScrolled?: unknown }).styleScrolled
  if (!isRecord(raw)) return undefined
  const layer: Record<string, unknown> = {}
  for (const key of APP_BAR_SCROLLED.keys) if (raw[key] !== undefined) layer[key] = raw[key]
  return Object.keys(layer).length === 0 ? undefined : layer
}

export interface ScrollThreshold {
  /** The bottom edge of the app bar zone from the top of the screen. */
  readonly barBottom: number
  /** The top of the body area from the top of the screen. */
  readonly bodyTop: number
}

export function scrolledThreshold(input: ScrollThreshold): number {
  return Math.max(0, input.barBottom - input.bodyTop)
}

export function isBarScrolled(scrollTop: number, input: ScrollThreshold): boolean {
  return Number.isFinite(scrollTop) && scrollTop > scrolledThreshold(input)
}
