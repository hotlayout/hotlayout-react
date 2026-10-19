/**
 * The shadow in the colour of the node's own background (schema 9.25.0, `style.shadowColor`). A
 * mirror of the contract's reference rule; the shared table
 * `contract/fixtures/shadow-color/shadow-color-cases.json` keeps the two copies together.
 *
 * With `shadowColor: 'background'` every layer of `style.shadow` (a theme token or own layers) takes
 * the HUE of the node's own background and keeps the opacity of the layer itself; the geometry is
 * the same. A solid background gives its colour (its own opacity does not count: the layer carries
 * it); a gradient gives the stop nearest to the middle, the earlier one on a tie; no background, an
 * image background or a colour that does not resolve leaves the shadow in its own colour.
 *
 * The colour is composed here from NUMBERS (`rgba()`), never copied from the document as a string.
 */
import type { Theme } from './theme'
import { declares, shadowLayersCss, themeColorValue } from './theme'
import { MAX_GRADIENT_STOPS, MAX_SHADOW_LAYERS } from './theme-shape'
import { clampLiteral, optionalLiteral } from './resolve'
import { hexChannels, isRecord, safeColor, safeIdent, safeRgba } from './sanitize'
import type { LiteralKind } from './resolve'
import type { NodeStyle } from './types'

export const SHADOW_COLOR_WORDS = ['background'] as const
export type ShadowColorWord = (typeof SHADOW_COLOR_WORDS)[number]

/** The word as the reader takes it: an unknown one (or a field of another type) is no field. */
export function readShadowColor(value: unknown): ShadowColorWord | undefined {
  return SHADOW_COLOR_WORDS.find((word) => word === value)
}

/** The index of the stop whose colour the shadow takes: nearest to 0.5, the earlier one on a tie; `undefined` — no stops. */
export function middleStopIndexOf(positions: readonly number[]): number | undefined {
  let best: number | undefined
  positions.forEach((position, index) => {
    const at = best === undefined ? undefined : positions[best]
    if (at === undefined || Math.abs(position - 0.5) < Math.abs(at - 0.5)) best = index
  })
  return best
}

interface ColorParts {
  /** `#rrggbb`. */
  readonly hex: string
  readonly alpha: number
}

/** A colour reference as its channels and total opacity (the opacities multiply), or `undefined` when it does not resolve. */
function colorParts(ref: unknown, theme: Theme): ColorParts | undefined {
  const parts = (value: string | undefined, opacity: number): ColorParts | undefined => {
    const safe = safeColor(value)
    if (safe === undefined) return undefined
    return { hex: safe.slice(0, 7), alpha: hexChannels(safe).alpha * opacity }
  }
  if (typeof ref === 'string') {
    const token = safeIdent(ref)
    return token !== undefined && declares(theme, 'color', token) ? parts(themeColorValue(theme, token), 1) : undefined
  }
  if (!isRecord(ref)) return undefined
  if (typeof ref.value === 'string') return parts(ref.value, optionalLiteral(ref.opacity, 'opacity') ?? 1)
  if (typeof ref.token === 'string') {
    const token = safeIdent(ref.token)
    return token === undefined ? undefined : parts(themeColorValue(theme, token), ref.opacity === undefined ? 1 : clampLiteral(ref.opacity, 'opacity'))
  }
  return undefined
}

interface Stop {
  readonly hex: string
  readonly position: number
}

function themeGradientStops(token: unknown, theme: Theme): readonly Stop[] | undefined {
  const name = safeIdent(token)
  if (name === undefined || !Object.hasOwn(theme.gradient, name)) return undefined
  return (theme.gradient[name]?.stops ?? []).map((stop) => ({ hex: stop.color.slice(0, 7), position: stop.position }))
}

function ownGradientStops(ref: Readonly<Record<string, unknown>>, theme: Theme): readonly Stop[] | undefined {
  if (!Array.isArray(ref.stops) || ref.stops.length > MAX_GRADIENT_STOPS) return undefined
  const stops: Stop[] = []
  for (const stop of ref.stops as readonly unknown[]) {
    const color = isRecord(stop) ? colorParts(stop.color, theme) : undefined
    if (!isRecord(stop) || color === undefined || stop.position === undefined) return undefined
    stops.push({ hex: color.hex, position: clampLiteral(stop.position, 'gradientPosition') })
  }
  return stops
}

/** The stops of a gradient background, or `undefined` when the gradient is not drawn at all (an unknown token, stops that run backwards). */
function gradientStops(ref: unknown, theme: Theme): readonly Stop[] | undefined {
  const stops = typeof ref === 'string' ? themeGradientStops(ref, theme) : isRecord(ref) ? ownGradientStops(ref, theme) : undefined
  if (stops === undefined) return undefined
  for (let index = 1; index < stops.length; index += 1) if ((stops[index]?.position ?? 0) < (stops[index - 1]?.position ?? 0)) return undefined
  return stops
}

/** The hue a shadow takes from the background (`#rrggbb`), or `undefined`: no background, an image, or a colour that does not resolve. */
export function shadowTintOf(background: unknown, theme: Theme): string | undefined {
  if (!isRecord(background)) return undefined
  if (background.kind === 'color') return colorParts(background.color, theme)?.hex
  if (background.kind !== 'gradient') return undefined
  const stops = gradientStops(background.gradient, theme) ?? []
  const index = middleStopIndexOf(stops.map((stop) => stop.position))
  return index === undefined ? undefined : stops[index]?.hex
}

/** The layers of a shadow with their own colour: geometry and the opacity of the layer. */
function shadowLayers(ref: unknown, theme: Theme): readonly { offsetX: number; offsetY: number; blur: number; spread: number; alpha: number }[] | undefined {
  if (typeof ref === 'string') {
    const token = safeIdent(ref)
    if (token === undefined || !Object.hasOwn(theme.elevation, token)) return undefined
    return (theme.elevation[token] ?? []).map((layer) => ({ offsetX: layer.offsetX, offsetY: layer.offsetY, blur: layer.blur, spread: layer.spread, alpha: layer.opacity }))
  }
  if (!Array.isArray(ref) || ref.length > MAX_SHADOW_LAYERS) return undefined
  const layers = []
  for (const layer of ref as readonly unknown[]) {
    const color = isRecord(layer) ? colorParts(layer.color, theme) : undefined
    if (!isRecord(layer) || color === undefined) return undefined
    const number = (key: string, kind: LiteralKind): number => optionalLiteral(layer[key], kind) ?? 0
    layers.push({ offsetX: number('offsetX', 'shadowOffset'), offsetY: number('offsetY', 'shadowOffset'), blur: number('blur', 'shadowBlur'), spread: number('spread', 'shadowSpread'), alpha: color.alpha })
  }
  return layers
}

/**
 * The `box-shadow` of a node with `shadowColor: 'background'`, or `undefined` when the field does not
 * act (no field, no shadow, no hue): the shadow is then drawn in its own colour as always.
 */
export function tintedShadowCss(style: Pick<NodeStyle, 'background' | 'shadow' | 'shadowColor'>, theme: Theme): string | undefined {
  if (readShadowColor(style.shadowColor) === undefined || style.shadow === undefined) return undefined
  const tint = shadowTintOf(style.background, theme)
  const layers = shadowLayers(style.shadow, theme)
  if (tint === undefined || layers === undefined || layers.length === 0) return undefined
  const composed = layers.map((layer) => ({ ...layer, color: safeRgba(tint, layer.alpha) ?? '' }))
  return shadowLayersCss(composed)
}

/** `x-shadowColor` of the artifact, whole; a test compares the two. */
export const SHADOW_COLOR_RULES = {
  prop: 'style.shadowColor',
  words: SHADOW_COLOR_WORDS,
  value: 'one word; no field or an unknown word — the shadow keeps its own colour',
  with: 'style.shadow — a theme token or own layers; without «shadow» the field does nothing',
  background: 'the own background of the node after styleWhen and the width class (not inherited, not the role background)',
  layer: 'every layer: the hue of the background, the opacity of the layer itself; offset, blur and spread unchanged',
  solid: 'the colour of the background; its own opacity does not count — the layer carries it',
  gradient: 'the colour of the stop nearest to position 0.5; on a tie the earlier one',
  none: 'no background, an image background, or a colour that does not resolve — the layer keeps its own colour',
  roleWidget: 'on a widget with a role it goes with «shadow» to the surface of the role',
  scrolled: 'not in styleScrolled',
  inherited: false,
  olderReader: 'skips the field — the shadow keeps its own colour',
  cases: 'contract/fixtures/shadow-color/shadow-color-cases.json',
} as const
