/** The box of a node: its `style` (spacing, size, radius, border, background, shadow, opacity) as CSS. */
import { valueAt } from './data'
import type { DataScope } from './data'
import { backdropBlurOf, backdropFilterCss } from './backdrop-blur'
import { borderStyleOf } from './border-dash'
import { DEFAULT_IMAGES } from './images'
import type { ImagePolicy } from './images'
import { tintedShadowCss } from './shadow-color'
import { clampLiteral, colorCss, colorLiteral, gradientCss, optionalLiteral, radiusCss, shadowCss, spacingCss } from './resolve'
import { cssNumber, isRecord, safeIdent } from './sanitize'
import type { Css } from './style'
import { productVar } from './theme'
import type { Theme } from './theme'
import type { Dimension, GradientRef, NodeStyle } from './types'

const STYLE_SIZE_MIN = 1
const STYLE_SIZE_MAX = 1200

/**
 * Size in dp: a number or a data binding.
 *
 * A value from data that is not a number within the contract bounds (1..1200) means "no data",
 * and `fallback` is drawn (`boundSizeOutOfRange: 'use-fallback'`), just as a text binding draws
 * its fallback text. A chart bar 100,000 dp tall because of a backend error would be a worse
 * answer than the fallback height.
 */
export function dimension(input: Dimension | undefined, scope: DataScope): number | undefined {
  // The document comes from the network: the type below is not what `Dimension` promises.
  const value: unknown = input
  // `null` in a size is a missing field (`nullNumericField: 'absent'`), not 1 dp.
  if (value === undefined || value === null) return undefined
  // A literal out of bounds is clamped (`literalOutOfRange: 'clamp'`); a non-number gets the
  // lower bound (`nonNumericLiteral: 'lower-bound'`).
  if (typeof value !== 'object') return clampLiteral(value, 'size')
  const binding = value as { readonly path?: unknown; readonly fallback?: unknown }
  if (typeof binding.path !== 'string') return undefined

  const bound = valueAt(scope, binding.path)
  // A value from data out of bounds is NOT clamped: there is a fallback the author chose.
  if (typeof bound === 'number' && Number.isFinite(bound) && bound >= STYLE_SIZE_MIN && bound <= STYLE_SIZE_MAX) return bound
  return binding.fallback === undefined ? undefined : clampLiteral(binding.fallback, 'size')
}

const SPACING_SIDES = [
  ['top', 'BlockStart'],
  ['end', 'InlineEnd'],
  ['bottom', 'BlockEnd'],
  ['start', 'InlineStart'],
] as const

/**
 * Spacing (`padding` or `margin`) -> CSS.
 *
 * Sides are LOGICAL (`x-style.sides: 'logical'`): `start` is `inline-start`, i.e. left in
 * left-to-right writing and right in Arabic. Using `padding-left` here would break RTL for
 * exactly the screens built with asymmetric spacing.
 *
 * A side that is not named is ZERO (`x-style.unnamedSide: 'zero'`), not "as in the parent" and
 * not "as in the base style": a state replaces the field whole. A side with a token the theme
 * does not know is zero too, and the other sides apply (`unknownSideToken: 'side-is-zero'`): one
 * broken token does not take away the whole spacing.
 */
export function spacingBoxCss(property: 'padding' | 'margin', value: unknown, theme: Theme): Css {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null) {
    const all = spacingCss(value as string | number, theme)
    return all === undefined ? {} : { [property]: all }
  }

  const sides = value as Readonly<Record<string, string | number | undefined>>
  const css: Css = {}
  for (const [side, suffix] of SPACING_SIDES) {
    css[`${property}${suffix}`] = spacingCss(sides[side], theme) ?? '0'
  }
  return css
}

/** CSS logical corners: the first word is the block axis (top/bottom), the second the inline axis (start/end). */
const RADIUS_CORNERS = [
  ['topStart', 'borderStartStartRadius'],
  ['topEnd', 'borderStartEndRadius'],
  ['bottomEnd', 'borderEndEndRadius'],
  ['bottomStart', 'borderEndStartRadius'],
] as const

/**
 * Radius -> CSS. An unknown token in ONE corner makes that corner square and the rest apply
 * (`unknownSideToken: 'side-is-zero'`); the same as the spacing sides above.
 */
export function radiusBoxCss(value: unknown, theme: Theme): Css {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null) {
    const all = radiusCss(value as string | number, theme)
    return all === undefined ? {} : { borderRadius: all }
  }

  const corners = value as Readonly<Record<string, string | number | undefined>>
  const css: Css = {}
  for (const [corner, property] of RADIUS_CORNERS) css[property] = radiusCss(corners[corner], theme) ?? '0'
  return css
}

export function borderCss(border: unknown, theme: Theme): Css {
  if (!isRecord(border) || border.width === undefined) return {}
  const color = colorCss(border.color, theme)
  // A color that did not resolve means NO border, not a "transparent border": a transparent one
  // would still eat layout pixels.
  if (color === undefined) return {}
  // A dashed border keeps its room as a TRANSPARENT solid one; the dashes are an image over the box (`border-dash.ts`).
  return { border: `${cssNumber(clampLiteral(border.width, 'borderWidth'))}px solid ${borderStyleOf(border) === 'dashed' ? 'transparent' : color}` }
}

/** The line of a dashed border as the box needs it: the width and a literal colour; `undefined` for a solid or an unresolved border. */
export function dashedBorderOf(border: unknown, theme: Theme): { readonly width: number; readonly color: string } | undefined {
  if (!isRecord(border) || border.width === undefined || borderStyleOf(border) !== 'dashed') return undefined
  const color = colorLiteral(border.color, theme)
  const width = clampLiteral(border.width, 'borderWidth')
  return color === undefined || !(width > 0) ? undefined : { width, color }
}

/**
 * Background -> CSS. Three kinds, told apart by the `kind` field.
 *
 * An image is the same `ImageSource` as in the `Image` widget: an address, an asset or a binding
 * with a fallback ASSET. `fit` is required in the document, since "cover by default" would be a
 * hidden reader default.
 */
export function backgroundCss(input: unknown, theme: Theme, scope: DataScope, images: ImagePolicy): Css {
  // The background kind may come from a newer minor: narrowing by `kind` is premature here.
  if (!isRecord(input)) return {}
  const background = input

  if (background.kind === 'color') {
    const color = colorCss(background.color, theme)
    return color === undefined ? {} : { backgroundColor: color }
  }

  if (background.kind === 'gradient') {
    const gradient = gradientCss(background.gradient as GradientRef, theme)
    return gradient === undefined ? {} : { backgroundImage: gradient }
  }

  if (background.kind === 'image') {
    const image = imageCss(background.source, scope, images)
    if (image === undefined) return {}
    return {
      backgroundImage: image,
      backgroundSize: background.fit === 'contain' ? 'contain' : 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
    }
  }

  // A background kind from a newer minor (`unknownBackgroundKind: 'omit-field'`): no background,
  // the rest of the style is drawn.
  return {}
}

/**
 * Background image -> `background-image`.
 *
 * An address from the document or the data becomes `url(...)` ONLY through the image policy
 * (`images.ts`: absolute `https:` by default, then the host's decision). A rejected address
 * means no background. An asset is an identifier name; otherwise there is no variable for it.
 */
function imageCss(source: unknown, scope: DataScope, images: ImagePolicy): string | undefined {
  if (!isRecord(source)) return undefined
  const asset = (name: unknown): string | undefined => {
    const token = safeIdent(name)
    return token === undefined ? undefined : productVar('asset', token)
  }

  if (source.kind === 'url') return images.css(source.url, 'background')
  if (source.kind === 'asset') return asset(source.asset)
  if (source.kind === 'binding' && typeof source.path === 'string') {
    const bound = valueAt(scope, source.path)
    if (typeof bound === 'string' && bound !== '') return images.css(bound, 'background', 'data') ?? asset(source.fallback)
    return asset(source.fallback)
  }
  return undefined
}

/**
 * THE MINIMUM BEATS THE MAXIMUM (`invertedSizeRange: 'min-wins'`).
 *
 * The builder's validator will not emit a `minWidth` greater than `maxWidth`, but a document may
 * have been assembled by something else. CSS takes the minimum by itself in that case, while
 * `BoxConstraints` in Flutter throws, so the rule is named. It is carried out explicitly here so
 * the reader does not rely on matching browser behavior.
 */
function sizeRange(min: number | undefined, max: number | undefined): readonly [number | undefined, number | undefined] {
  return min !== undefined && max !== undefined && min > max ? [min, min] : [min, max]
}

/**
 * SIZE OUTSIDE ITS OWN BOUNDS (`sizeOutsideRange: 'clamp-to-range'`).
 *
 * `width: 300` with `maxWidth: 200` is a legal document, not an error: the size is clamped by
 * the bounds, and the SMALLEST wins (first the ceiling, then the floor, so with an inverted pair,
 * after `sizeRange` when both bounds are already equal, the minimum applies). This is done
 * explicitly rather than handing `min-width`/`max-width` to the browser: in Flutter
 * `BoxConstraints.tightFor(width:).enforce(...)` gives the same, but only because it is written
 * here.
 */
export function constrainSize(size: number | undefined, min: number | undefined, max: number | undefined): number | undefined {
  if (size === undefined) return undefined
  const capped = max === undefined ? size : Math.min(size, max)
  return min === undefined ? capped : Math.max(capped, min)
}

const px = (value: number): string => `${cssNumber(value)}px`

/**
 * What is painted over the whole box: `opacity` and the glass.
 *
 * Opacity applies to background, border, shadow and content TOGETHER (`x-style.opacityAppliesTo`):
 * exactly what `opacity` does in CSS. An explicit `null` in an optional numeric field is a MISSING
 * field (`nullNumericField: 'absent'`), not the lower bound: otherwise the node would become invisible.
 *
 * GLASS (9.20.0, `x-backdropBlur.style`): the blur of what is painted under the box, clipped by the
 * radius of this same box. On a button, an icon button and a badge the box IS the surface of the role
 * (one element carries the background and the radius), so no special place is needed. The node's own
 * background lies over the blur; the node and its children stay sharp. Not inherited.
 */
function effectsCss(style: NodeStyle, glass: boolean): Css {
  const css: Css = {}
  const opacity = optionalLiteral(style.opacity, 'opacity')
  if (opacity !== undefined) css.opacity = opacity
  const blur = glass ? backdropBlurOf(style.backdropBlur) : undefined
  if (blur !== undefined) Object.assign(css, backdropFilterCss(blur))
  return css
}

/**
 * BOX MODEL, one for all node types.
 *
 *     margin -> [ box: size, background, border, radius, shadow, opacity ] -> padding -> content
 *
 * In CSS this is one element with `box-sizing: border-box`: `width` and `height` describe the
 * BOX together with border and padding, and `margin` lies outside. Flutter counts the same way
 * (`Container(width:, padding:)`), so `content-box`, the browser default, would give a wider
 * node than on a phone.
 *
 * `color` and `typography` are NOT part of it: they are the foreground, led by inheritance
 * (`textCss`), not by the box.
 *
 * The `skip` argument lists fields that already landed on the surface of a widget with a role:
 * they are not applied twice.
 */
export function boxCss(style: NodeStyle | undefined, theme: Theme, scope: DataScope, skip: readonly string[] = [], images: ImagePolicy = DEFAULT_IMAGES): Css {
  // A style from the network: not an object means no style.
  if (typeof style !== 'object' || (style as unknown) === null) return {}
  const has = (key: keyof NodeStyle): boolean => style[key] !== undefined && !skip.includes(key)

  const css: Css = { boxSizing: 'border-box' }

  if (has('margin')) Object.assign(css, spacingBoxCss('margin', style.margin, theme))
  if (has('padding')) Object.assign(css, spacingBoxCss('padding', style.padding, theme))

  const [minWidth, maxWidth] = sizeRange(dimension(style.minWidth, scope), dimension(style.maxWidth, scope))
  const [minHeight, maxHeight] = sizeRange(dimension(style.minHeight, scope), dimension(style.maxHeight, scope))
  const width = constrainSize(dimension(style.width, scope), minWidth, maxWidth)
  const height = constrainSize(dimension(style.height, scope), minHeight, maxHeight)

  // Set sizes are EXACT, not minimum: "stretch if the content is larger" would make a preview
  // dishonest exactly where it is looked at.
  if (width !== undefined) css.width = px(width)
  if (height !== undefined) css.height = px(height)
  if (minWidth !== undefined) css.minWidth = px(minWidth)
  if (maxWidth !== undefined) css.maxWidth = px(maxWidth)
  if (minHeight !== undefined) css.minHeight = px(minHeight)
  if (maxHeight !== undefined) css.maxHeight = px(maxHeight)

  if (has('radius')) {
    const radius = radiusBoxCss(style.radius, theme)
    Object.assign(css, radius)
    /*
     * THE RADIUS CLIPS the background (and background image) AND the content with its children,
     * `x-style.radiusClips`. CSS clips the background by itself but not the content: without
     * `overflow: hidden` a photo in a rounded card would poke out of the corners, while in
     * Flutter (`clipBehavior`) it would not. The shadow lies outside and is not clipped.
     */
    if (Object.keys(radius).length > 0) css.overflow = 'hidden'
  }
  if (has('border')) Object.assign(css, borderCss(style.border, theme))
  if (has('background')) Object.assign(css, backgroundCss(style.background, theme, scope, images))
  if (has('shadow')) {
    // `shadowColor: 'background'` (9.25.0): the layers take the hue of the node's own background.
    const shadow = tintedShadowCss(style, theme) ?? shadowCss(style.shadow, theme)
    if (shadow !== undefined) css.boxShadow = shadow
  }
  Object.assign(css, effectsCss(style, has('backdropBlur')))

  return css
}
