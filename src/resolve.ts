/**
 * A reference from the document to a CSS value: "a theme token or an own value".
 *
 * A mirror of the contract's reference implementation. There are few rules here, but each is a
 * place where two readers would silently diverge: what to do with a token the theme does not
 * know; how a tint's opacity combines with the colour's own alpha; where a state colour falls
 * back to.
 *
 * THE ONLY ANSWER TO "NONE" IS `undefined`, and the reader does NOT APPLY such a property. This
 * is the policy `tokenWithoutFieldDefault: 'omit-field'`, stated by the type. No function here
 * substitutes a "similar" token: an invented colour would look right, and nothing would reveal
 * the substitution.
 *
 * A TOKEN BECOMES A VARIABLE, NOT A VALUE. `'accent'` becomes `var(--product-color-accent)`:
 * that is what keeps rebranding and theme switching a swap of the variable set on the root. A
 * value (`rgba(...)`, `20px`) is produced only for what the theme cannot hold by construction:
 * an own value and a TINT of a token, computed from the theme here, because "colour times
 * opacity" cannot be expressed by one variable.
 */
import { cssNumber, cssPx, isRecord, safeColor, safeIdent, safeRgba } from './sanitize'
import type { Theme } from './theme'
import { declares, gradientCssOf, productVar, productVarName, shadowLayersCss, themeColorValue, trackingVarName, typographyPartVarName } from './theme'
import { MAX_GRADIENT_STOPS, MAX_SHADOW_LAYERS } from './theme-shape'
import type { GradientRef, RadiusRef, ShadowRef, SpacingRef } from './types'

/**
 * Bounds of numeric literals: a mirror of `minimum` / `maximum` in `screen-schema.json`.
 *
 * `literalOutOfRange: 'clamp'`: a number outside the schema's bounds in a document produced by
 * someone else (`padding: -8`, `opacity: 1.5`, `blur: -5`) is clamped into range by the reader
 * rather than the field being dropped. A negative padding crashes Flutter (`EdgeInsets` rejects
 * it), and "the field is not applied" would remove padding exactly where the author clearly
 * wanted some. A validator still rejects such values. A test compares the table with the artifact.
 */
export const LITERAL_BOUNDS = {
  spacing: [0, 128],
  radius: [0, 256],
  opacity: [0, 1],
  borderWidth: [0.5, 16],
  size: [1, 1200],
  fontSize: [8, 96],
  fontWeight: [100, 900],
  lineHeight: [0.8, 3],
  letterSpacing: [-2, 8],
  shadowOffset: [-64, 64],
  shadowBlur: [0, 128],
  shadowSpread: [-64, 64],
  gradientPosition: [0, 1],
} as const satisfies Readonly<Record<string, readonly [number, number]>>

export type LiteralKind = keyof typeof LITERAL_BOUNDS

/**
 * Clamp a literal into its field's bounds.
 *
 * A NON-NUMBER where a bounded number was expected (a string, `null`, `NaN`, an object) becomes
 * the field's LOWER BOUND (`nonNumericLiteral: 'lower-bound'`), not zero and not "the field is
 * not applied". The reader takes the bounds from the schema's `minimum` / `maximum`, so the lower
 * bound is a number the schema allows anyway (`opacity: 'oops'` gives 0, `blur: null` gives 0,
 * `offsetX: 'x'` gives -64). It is the same answer as for `NaN`: the safest one is the closest to
 * "off". A field that is ABSENT FROM THE DOCUMENT (`undefined`) is not covered by this rule: the
 * field's default decides.
 */
export function clampLiteral(value: unknown, kind: LiteralKind): number {
  const [min, max] = LITERAL_BOUNDS[kind]
  // A string where a number was expected (`"0;position:fixed"`) never becomes a number.
  if (typeof value !== 'number' || Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

/**
 * An OPTIONAL numeric field: `undefined` and an explicit `null` mean there is NO field
 * (`nullNumericField: 'absent'`); anything else goes through `clampLiteral`. `"opacity": null`
 * must not make a node transparent: a serializer that writes `null` instead of omitting the key
 * is common. In a REQUIRED field (a gradient stop position, a border width) `null` stays "not a
 * number", so `clampLiteral` is used there.
 */
export function optionalLiteral(value: unknown, kind: LiteralKind): number | undefined {
  return value === undefined || value === null ? undefined : clampLiteral(value, kind)
}

function px(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${cssNumber(value)}px`
}

/** A token name from the document, if it is a valid NAME (`sanitize.ts`) and the theme declares it. */
function declared(theme: Theme, dictionary: Parameters<typeof declares>[1], ref: unknown): string | undefined {
  const token = safeIdent(ref)
  return token !== undefined && declares(theme, dictionary, token) ? token : undefined
}

/**
 * A colour reference to a CSS colour.
 *
 * The three forms are told apart by STRUCTURE. Opacities MULTIPLY: a tint `{ token, opacity: 0.5 }`
 * of a half-transparent theme colour (`#rrggbb80`) gives a quarter, not a half; otherwise the same
 * tint would mean different things depending on whether the token has its own alpha.
 *
 * The argument is `unknown` rather than `ColorRef`: the document arrives over the network, and a
 * newer minor version may bring a fourth form. An unknown form means "none".
 *
 * AN OWN VALUE IS A COLOUR ONLY (`safeColor`: `#rrggbb[aa]`). A string that is not a colour
 * (`red;position:fixed`, `url(...)`, `var(--foreign-variable)`) also means "none": the property
 * is not applied, as with a token the theme does not know. The result is always one of three
 * forms the reader composed itself: a theme variable, a hex value, or `rgba()` built from numbers.
 */
export function colorCss(ref: unknown, theme: Theme): string | undefined {
  if (typeof ref === 'string') {
    const token = declared(theme, 'color', ref)
    return token === undefined ? undefined : productVar('color', token)
  }
  if (!isRecord(ref)) return undefined

  if (typeof ref.value === 'string') {
    const color = safeColor(ref.value)
    if (color === undefined) return undefined
    // `opacity` is OPTIONAL here: `null` is the same as omitted (`nullNumericField`).
    const opacity = optionalLiteral(ref.opacity, 'opacity')
    return opacity === undefined ? color : safeRgba(color, opacity)
  }

  if (typeof ref.token === 'string') {
    const token = safeIdent(ref.token)
    const value = token === undefined ? undefined : themeColorValue(theme, token)
    if (value === undefined) return undefined
    return safeRgba(value, ref.opacity === undefined ? 1 : clampLiteral(ref.opacity, 'opacity'))
  }

  return undefined
}

/**
 * A colour reference as a LITERAL value (`#rrggbb[aa]` or `rgba()`), for the places that cannot read
 * the variables of the page: an image drawn by the reader (the dashes of a border). The same three
 * forms and the same rules as {@link colorCss}; a token is read off the theme, not off a variable.
 * A tint and an own value are literals already.
 */
export function colorLiteral(ref: unknown, theme: Theme): string | undefined {
  if (typeof ref !== 'string') return colorCss(ref, theme)
  const token = declared(theme, 'color', ref)
  return token === undefined ? undefined : safeColor(themeColorValue(theme, token))
}

function scaleCss(ref: unknown, theme: Theme, dictionary: 'spacing' | 'radius'): string | undefined {
  // A number is logical pixels; on the web that is CSS pixels one to one.
  if (typeof ref === 'number') {
    return cssPx(clampLiteral(ref, dictionary))
  }
  const token = declared(theme, dictionary, ref)
  return token === undefined ? undefined : productVar(dictionary, token)
}

/** Spacing: a token becomes a variable, a number becomes pixels. */
export function spacingCss(ref: SpacingRef | undefined, theme: Theme): string | undefined {
  return scaleCss(ref, theme, 'spacing')
}

/**
 * Spacing for CSS MATH (`calc()`, `max()`, `min()`, `clamp()`): always a NUMBER WITH A UNIT, never
 * a variable. A spacing variable can be a bare `0` (`none` always, and a theme token valued 0
 * too, since `cssPx(0)` writes `0`), and `calc(56px - 0)` is invalid, so the whole declaration
 * would silently drop. The token is resolved to the theme's number. An unknown token gives
 * `undefined` (as in `spacingCss`).
 */
export function spacingMathCss(ref: SpacingRef | undefined, theme: Theme): string | undefined {
  if (typeof ref === 'number') return `${cssNumber(clampLiteral(ref, 'spacing'))}px`
  const token = declared(theme, 'spacing', ref)
  if (token === undefined) return undefined
  const value = token === 'none' ? 0 : theme.spacing[token]
  return typeof value === 'number' && Number.isFinite(value) ? `${cssNumber(value)}px` : undefined
}

const SPACE_VAR_IN_TEXT = /var\(\s*(--product-space-[a-z0-9-]+)\s*\)/g

/**
 * A length ALREADY composed into a string, turned into a length for CSS math: a bare `0` becomes
 * `0px`, and every spacing variable becomes the theme's number with a unit. For places where a
 * ready-made string reaches `calc()` (a node's field, the root's padding) and the token reference
 * is already lost. A variable the theme does not know becomes `0px` (as an unknown token in
 * `spacingCss` gives a zero side). The host's own variables (`var(--site-...)`) and `env()` are
 * left alone: there is nobody to ask for their unit.
 */
export function mathLength(css: string | number | undefined, theme: Theme): string {
  if (css === undefined || css === 0 || css === '0' || css === '') return '0px'
  const text = String(css)
  return text.replace(SPACE_VAR_IN_TEXT, (_match, name: string) => {
    for (const token of Object.keys(theme.spacing)) {
      if (productVarName('spacing', token) === name) return `${cssNumber(theme.spacing[token] ?? 0)}px`
    }
    return '0px'
  })
}

/** Radius: a token becomes a variable, a number becomes pixels. */
export function radiusCss(ref: RadiusRef | undefined, theme: Theme): string | undefined {
  return scaleCss(ref, theme, 'radius')
}

/** A text style as a set of CSS properties: exactly as many as needed to put on a label. */
export interface TypographyCss {
  readonly font?: string
  readonly fontFamily?: string
  readonly fontSize?: string
  readonly fontWeight?: string | number
  readonly lineHeight?: string | number
  readonly letterSpacing: string
}

/**
 * A font reference to CSS.
 *
 * A token without overrides is one theme variable (`font: var(--product-font-title-m)`), as before
 * 9.0.0. A token WITH OVERRIDES cannot be expressed by one variable, so it expands into separate
 * properties: an overridden field as a value, the rest as variables for the same token's parts
 * (`--product-type-size-...`).
 *
 *  - an override replaces exactly its own field;
 *  - `lineHeight` stays a MULTIPLIER and multiplies the already OVERRIDDEN font size: "titleM at
 *    size 28" has a line of 28 x 1.33, not the old absolute height; in CSS this happens by itself
 *    because `line-height` is unitless;
 *  - the typeface (role `body` / `heading`) ALWAYS comes from the token: an override cannot change
 *    it, so changing the brand font stays a single theme edit.
 */
export function typographyCss(ref: unknown, theme: Theme): TypographyCss | undefined {
  const token = declared(theme, 'typography', typeof ref === 'string' ? ref : isRecord(ref) ? ref.token : undefined)
  if (token === undefined) return undefined

  const tracking = `var(${trackingVarName(token)})`
  if (!isRecord(ref)) return { font: productVar('typography', token), letterSpacing: tracking }

  const part = (name: 'size' | 'weight' | 'line' | 'family'): string => `var(${typographyPartVarName(token, name)})`
  return {
    fontFamily: part('family'),
    // The four overrides are OPTIONAL: `null` means no override, and the token's value applies.
    fontSize: px(optionalLiteral(ref.fontSize, 'fontSize')) ?? part('size'),
    fontWeight: optionalLiteral(ref.fontWeight, 'fontWeight') ?? part('weight'),
    lineHeight: optionalLiteral(ref.lineHeight, 'lineHeight') ?? part('line'),
    letterSpacing: px(optionalLiteral(ref.letterSpacing, 'letterSpacing')) ?? tracking,
  }
}

/**
 * A gradient reference to `background-image`.
 *
 * An own gradient with a stop on an unknown token is not drawn AT ALL, rather than drawn "without
 * that stop": a gradient missing one stop is a different gradient, and it would look as intended.
 * The same holds for stops that run backwards (`unorderedGradient: 'do-not-draw'`), which
 * `gradientCssOf` decides.
 */
export function gradientCss(ref: GradientRef | undefined, theme: Theme): string | undefined {
  if (typeof ref === 'string') {
    const token = declared(theme, 'gradient', ref)
    return token === undefined ? undefined : productVar('gradient', token)
  }
  if (!isRecord(ref) || typeof ref.angle !== 'number' || !Array.isArray(ref.stops) || ref.stops.length > MAX_GRADIENT_STOPS) return undefined

  const stops: { color: string; position: number }[] = []
  for (const stop of ref.stops as readonly unknown[]) {
    if (!isRecord(stop) || stop.position === undefined) return undefined
    const color = colorCss(stop.color, theme)
    if (color === undefined) return undefined
    stops.push({ color, position: clampLiteral(stop.position, 'gradientPosition') })
  }
  return gradientCssOf(ref.angle, stops)
}

/**
 * A shadow reference to `box-shadow`.
 *
 * In an own shadow, opacity lives in the colour REFERENCE; there is no separate per-layer
 * `opacity` (as in the theme). A layer with an unknown token cancels the whole shadow, for the
 * same reason as a gradient stop.
 */
export function shadowCss(ref: ShadowRef | undefined, theme: Theme): string | undefined {
  if (typeof ref === 'string') {
    const token = declared(theme, 'elevation', ref)
    return token === undefined ? undefined : productVar('elevation', token)
  }
  if (!Array.isArray(ref) || ref.length > MAX_SHADOW_LAYERS) return undefined

  const layers = []
  for (const layer of ref as readonly unknown[]) {
    if (!isRecord(layer)) return undefined
    const color = colorCss(layer.color, theme)
    if (color === undefined) return undefined
    // Geometry the layer does NOT have (or `null`) is zero, not the lower bound
    // (`missingShadowLayerField: 'zero'`): the offset's lower bound is -64.
    const number = (key: string, kind: LiteralKind): number => optionalLiteral(layer[key], kind) ?? 0
    layers.push({
      offsetX: number('offsetX', 'shadowOffset'),
      offsetY: number('offsetY', 'shadowOffset'),
      blur: number('blur', 'shadowBlur'),
      spread: number('spread', 'shadowSpread'),
      color,
    })
  }
  return shadowLayersCss(layers)
}
