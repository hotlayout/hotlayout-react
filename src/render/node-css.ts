/**
 * Small pure helpers of the box of a node: the foreground a navigation bar inside an app bar
 * keeps, a signed spacing and the style of an overlay layer.
 */
import { cssNumber, cssPx } from '../sanitize'
import type { ReaderLayer } from '../layer-placement'
import { spacingCss, spacingMathCss } from '../resolve'
import type { Css } from '../style'
import type { Theme } from '../theme'
import type { NodeStyle } from '../types'

/** The foreground of a node without a box: only colour and font (with emphasis), what descendants inherit. */
const INHERITED_STYLE_KEYS = ['color', 'typography', 'fontStyle', 'textDecoration'] as const

export function inheritedStyleOnly(style: NodeStyle | undefined): NodeStyle | undefined {
  if (style === undefined) return undefined
  const kept: Record<string, unknown> = {}
  for (const key of INHERITED_STYLE_KEYS) if (style[key] !== undefined) kept[key] = style[key]
  return Object.keys(kept).length === 0 ? undefined : kept
}

/** A signed spacing: a number is pixels directly, a token is a theme variable (a minus goes through `calc`). An unknown token is zero. */
export function signedSpacing(by: unknown, theme: Theme, positive: boolean): string {
  const css = spacingCss(by as string | number, theme) ?? '0'
  if (positive || css === '0') return css
  // The minus multiplies the theme number with its unit: a variable for `none` would be a bare `0` and `calc()` would become invalid.
  return typeof by === 'number' ? cssPx(-by) : `calc(-1 * ${spacingMathCss(by as string, theme) ?? '0px'})`
}

/**
 * The style of the overlay node itself: the offset along the stack axes uses logical properties
 * (right to left, an offset "toward the end" goes left by itself); the angle is `rotate` around the
 * centre with ONE mirror for RTL (the sign of the angle); the layer is no wider than the stack.
 * A layer inside a `pointer-events: none` cell catches the pointer itself, where it is drawn.
 */
export function layerNodeCss(layer: ReaderLayer, theme: Theme, rtl: boolean, hasMaxWidth: boolean): Css {
  const css: Css = { position: 'relative', pointerEvents: 'auto' }
  if (!hasMaxWidth) css.maxInlineSize = '100%'
  if (layer.offsetX !== undefined) css.insetInlineStart = signedSpacing(layer.offsetX.by, theme, layer.offsetX.toward === 'end')
  if (layer.offsetY !== undefined) css.insetBlockStart = signedSpacing(layer.offsetY.by, theme, layer.offsetY.toward === 'bottom')
  if (layer.rotate !== 0) css.rotate = `${cssNumber(rtl ? -layer.rotate : layer.rotate)}deg`
  return css
}

