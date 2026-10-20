/**
 * A NODE THAT PAINTS NOTHING SAYS NOTHING (`x-silentText`, schema 9.28.0).
 *
 * The name of a pressable card is its label, then the text of its content. A text drawn fully
 * transparent is not seen, so it must not be heard either: otherwise a document could show
 * "Show offer" and have a screen reader announce "Show offer Confirm transfer".
 *
 *  - a node whose resolved `style.opacity` (with its state) is 0 is `aria-hidden`, with all it holds;
 *  - a `Text` painted in a colour that resolves with opacity 0 (its own or the inherited one) is
 *    `aria-hidden`.
 *
 * Exactly zero: 0.01 is a text that is seen. A control (a node with an action) is not hidden by this
 * rule: it keeps its own name and its own place in the focus order.
 */
import { optionalLiteral } from './resolve'
import { themeColorValue } from './theme'
import type { Theme } from './theme'
import type { ColorRef, NodeStyle, UiNode } from './types'

/** The alpha of a theme colour `#rrggbb[aa]`; 1 when it has none. */
function hexAlpha(hex: string | undefined): number | undefined {
  if (typeof hex !== 'string') return undefined
  if (/^#[0-9a-fA-F]{8}$/.test(hex)) return Number.parseInt(hex.slice(7, 9), 16) / 255
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? 1 : undefined
}

/** The opacity of a resolved colour reference; `undefined` when it does not resolve. */
export function colorOpacityOf(ref: ColorRef | undefined, theme: Theme): number | undefined {
  if (ref === undefined) return undefined
  if (typeof ref === 'string') return hexAlpha(themeColorValue(theme, ref))
  const own = optionalLiteral(ref.opacity, 'opacity') ?? 1
  if ('value' in ref) return own
  const base = hexAlpha(themeColorValue(theme, ref.token))
  return base === undefined ? undefined : base * own
}

/** Whether the node's own resolved style makes it fully transparent. */
export function paintsNothing(style: NodeStyle | undefined): boolean {
  return style !== undefined && optionalLiteral(style.opacity, 'opacity') === 0
}

/** The attribute that takes a node that paints nothing out of the name of a card; a control keeps its own name. */
export function silentMark(node: UiNode, style: NodeStyle | undefined): { readonly 'aria-hidden'?: true } {
  const isControl = typeof node.props.action === 'object'
  return !isControl && paintsNothing(style) ? { 'aria-hidden': true } : {}
}

/** Whether a `Text` says nothing: its own opacity 0, or the colour it is painted in (own or inherited) has opacity 0. */
export function silentText(style: NodeStyle | undefined, color: ColorRef | undefined, theme: Theme): true | undefined {
  return paintsNothing(style) || colorOpacityOf(color, theme) === 0 ? true : undefined
}
