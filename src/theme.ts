/**
 * Theme -> CSS variables.
 *
 * A mirror of the contract's theme-to-variables conversion. The copy is deliberate and minimal:
 * the package does not depend on the builder's code, but every divergence here is a different
 * color on screen, so compare this file when the theme version is bumped.
 *
 * THEME 4.0.0: THE DICTIONARIES ARE OPEN. The six dictionaries (`color`, `gradient`, `spacing`,
 * `radius`, `elevation`, `typography`) carry a REQUIRED CORE and any number of own names. The
 * reader has NO list of names of its own (`customTokens: 'declared-by-theme'`): variables are
 * declared by walking what lies in the theme, so `brandCoral` gets `--product-color-brand-coral`
 * exactly like `primary`. The only list the reader does keep is the core (`CORE_TOKENS` below, a
 * mirror of `x-tokens.core` of the widget schema), and the fallback values rest on it.
 *
 * TRUST BOUNDARY. The theme comes from the network, and here it becomes names and values of CSS
 * variables on the root of the host page. So `themeCssVariables` first runs the theme through
 * `sanitizeTheme`, and composes every name and value from validated parts (`sanitize.ts`): a raw
 * theme string reaches CSS by no path, and a theme cannot name an address (`url(...)`) at all.
 */
import { cssNumber, cssPercent, cssPx, hexChannels, safeColor, safeFontFamily, safeRgba, varSegment } from './sanitize'
import { sanitizeTheme } from './theme-shape'

export interface ThemeShadow {
  readonly offsetX: number
  readonly offsetY: number
  readonly blur: number
  readonly spread: number
  readonly color: string
  readonly opacity: number
}

export interface ThemeTypography {
  readonly fontSize: number
  /** A MULTIPLIER, not pixels: `1.1667`, not `28`. */
  readonly lineHeight: number
  readonly fontWeight: number
  /**
   * Letter spacing in logical PIXELS (theme 3.4.0). Optional: a theme made earlier lacks it, and
   * that means the typeface's ordinary tracking.
   */
  readonly letterSpacing?: number
  readonly role: 'body' | 'heading'
}

export interface ThemeGradient {
  readonly angle: number
  readonly stops: readonly { readonly color: string; readonly position: number }[]
}

/** Role colors are NAMES of colors of this same theme. `background` and `border` are optional: absent means not drawn. */
export interface ThemeRole {
  readonly background?: string
  readonly foreground: string
  readonly border?: string
}

export interface Theme {
  readonly id: string
  readonly name: string
  readonly brightness: 'light' | 'dark'
  readonly fontFamilies: Readonly<Record<'body' | 'heading', { readonly primary: string; readonly fallback: readonly string[] }>>
  readonly spacing: Readonly<Record<string, number>>
  readonly radius: Readonly<Record<string, number>>
  readonly color: Readonly<Record<string, string>>
  readonly typography: Readonly<Record<string, ThemeTypography>>
  readonly elevation: Readonly<Record<string, readonly ThemeShadow[]>>
  readonly gradient: Readonly<Record<string, ThemeGradient>>
  readonly roles: Readonly<Record<string, Readonly<Record<string, ThemeRole>>>>
}

export interface ThemeContract {
  readonly themeContractVersion: string
  readonly defaultThemeId: string
  readonly themes: Readonly<Record<string, Theme>>
}

/**
 * The variable prefix does not always equal the map name, and this is the one trap of the whole
 * file: `spacing` gives `--product-space-*`, `typography` gives `--product-font-*`.
 */
const VAR_PREFIX: Readonly<Record<string, string>> = {
  spacing: 'space',
  color: 'color',
  radius: 'radius',
  typography: 'font',
  elevation: 'elevation',
  gradient: 'gradient',
  align: 'align',
  icon: 'icon',
  asset: 'asset',
}

/**
 * `titleM` -> `title-m`. Tokens in the contract are camelCase, CSS variables are kebab. A string
 * that is not a token name does NOT become a variable name (`varSegment`): the name comes from
 * the document and the theme.
 */
const toKebab = varSegment

export function productVarName(set: string, token: string): string {
  return `--product-${(Object.hasOwn(VAR_PREFIX, set) ? VAR_PREFIX[set] : undefined) ?? varSegment(set)}-${toKebab(token)}`
}

/** `('spacing', 'md')` → `var(--product-space-md)`. */
export function productVar(set: string, token: string): string {
  return `var(${productVarName(set, token)})`
}

/** Letter spacing has its OWN group of variables: `font:` cannot hold it. */
export function trackingVarName(token: string): string {
  return `--product-tracking-${toKebab(token)}`
}

/** One component of a font style as a separate variable: `('titleM', 'size')` -> `--product-type-size-title-m`. */
export function typographyPartVarName(token: string, part: 'size' | 'weight' | 'line' | 'family'): string {
  return `--product-type-${part}-${toKebab(token)}`
}

export const FONT_FAMILY_VAR = '--product-sys-font-family'
export const FONT_FAMILY_HEADING_VAR = '--product-sys-font-family-heading'

const px = cssPx

/**
 * The font family stack of a role. Names pass `safeFontFamily`: quotes are needed only for names
 * that are not a CSS identifier (keywords like `system-ui` must not be quoted), backslash and
 * apostrophe are escaped ("O'Reilly Sans"), and a name with a line break is dropped. A stack
 * with nothing left is `sans-serif`: an empty value would invalidate the whole `font:`.
 */
function familyStack(theme: Theme, role: 'body' | 'heading'): string {
  const family = theme.fontFamilies[role] as Theme['fontFamilies'][typeof role] | undefined
  const names = family === undefined ? [] : [family.primary, ...family.fallback].map(safeFontFamily).filter((name): name is string => name !== undefined)
  return names.length === 0 ? 'sans-serif' : names.join(', ')
}

/**
 * `#rrggbb` or `#rrggbbaa` -> channels and opacity separately.
 *
 * Alpha comes LAST (`colorAlpha: 'rrggbbaa-alpha-last'`), as in CSS. In Flutter the usual form
 * puts it first, so the contract says this as a policy row.
 */
export const parseHex = hexChannels

/**
 * `rgba(...)` from channels and opacity. The only place a color becomes a CSS value that is
 * "not a variable". Not a color (`#rrggbb[aa]`) gives `undefined`: the value is composed of
 * channel NUMBERS, so a string that arrived as a "color" never reaches CSS.
 */
export function rgbaCss(hex: unknown, opacity: number): string | undefined {
  return safeRgba(hex, opacity)
}

export interface ShadowLayerCss {
  readonly offsetX: number
  readonly offsetY: number
  readonly blur: number
  readonly spread: number
  /** A ready CSS color, only from `colorCss` / `rgbaCss`: a theme variable, `#rrggbb[aa]` or `rgba(...)`. */
  readonly color: string
}

/**
 * Whether this is a color the READER COMPOSED: a theme variable, a hexadecimal value or
 * `rgba()` from numbers. A shadow and a gradient are composed of parts, and the "color" is the
 * only string part; if it could carry a comma or a parenthesis it would add a layer to the list
 * (`#fff, 0 0 0 100000px #fff`) or an address (`...), url(...), linear-gradient(...`). This is the
 * second lock; the first is in `colorCss`.
 */
const COMPOSED_COLOR = /^(?:var\(--product-color-[a-z0-9-]+\)|#[0-9a-f]{6}(?:[0-9a-f]{2})?|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, [0-9.]+\))$/

export function isComposedColor(value: unknown): value is string {
  return typeof value === 'string' && COMPOSED_COLOR.test(value)
}

/**
 * Shadow layers -> `box-shadow`. An empty list is `none`, not "".
 *
 * The order is the same as in the contract (`shadowOrder: 'first-is-nearest'`), and in CSS it
 * means the same: the first layer in the list lies on top.
 */
export function shadowLayersCss(layers: readonly ShadowLayerCss[]): string {
  // A layer with a "color" the reader did not compose cancels the whole shadow, as an unknown token does.
  if (layers.length === 0 || !layers.every((layer) => isComposedColor(layer.color))) return 'none'
  return layers
    .map((layer) => {
      const spread = layer.spread === 0 ? '' : ` ${px(layer.spread)}`
      return `${px(layer.offsetX)} ${px(layer.offsetY)} ${px(layer.blur)}${spread} ${layer.color}`
    })
    .join(', ')
}

/**
 * A THEME shadow: a layer has a `#rrggbb` color and opacity as a separate field. The layer's
 * color is the channels without its own alpha (as in Flutter): the opacity is `opacity`.
 */
function shadowCss(shadows: readonly ThemeShadow[]): string {
  const layers: ShadowLayerCss[] = []
  for (const shadow of shadows) {
    const color = safeRgba(safeColor(shadow.color)?.slice(0, 7), shadow.opacity)
    if (color === undefined) return 'none'
    layers.push({ offsetX: shadow.offsetX, offsetY: shadow.offsetY, blur: shadow.blur, spread: shadow.spread, color })
  }
  return shadowLayersCss(layers)
}

/**
 * GRADIENT ANGLE -> CSS direction (`gradientAngleSpace: 'axis-as-css-diagonal-css-to-corner'`).
 *
 * Axis angles (0 / 90 / 180 / 270) are CSS degrees, the conversion is the identity.
 *
 * Diagonal ones (45 / 135 / 225 / 315) are NOT CSS degrees, and this is the main trap of the
 * file: they are EXACTLY the CSS `to <corner>` geometry (`diagonalGradientGeometry:
 * 'css-to-corner'`, the formula is the `x-gradientGeometry` block of the artifacts). The gradient
 * line passes through the center perpendicular to the diagonal between the two OTHER corners:
 * the 50% isoline passes through them, and the target corner gets position 1. `135deg` on a wide
 * card would give a different line. The web is lucky: the browser computes the formula for us;
 * Flutter computes `Alignment` from the box size. The direction is PHYSICAL: it is not flipped
 * in right-to-left writing.
 */
const GRADIENT_DIRECTIONS: ReadonlyMap<number, string> = new Map([
  [0, '0deg'],
  [90, '90deg'],
  [180, '180deg'],
  [270, '270deg'],
  [45, 'to top right'],
  [135, 'to bottom right'],
  [225, 'to bottom left'],
  [315, 'to top left'],
])

export interface GradientStopCss {
  /** A ready CSS color, only one composed by the reader (`isComposedColor`). */
  readonly color: string
  readonly position: number
}

/**
 * Gradient -> `linear-gradient(...)`; `undefined` means "do not draw at all".
 *
 * Two reasons not to draw, both named by the policy:
 *  - stops go BACKWARDS (`unorderedGradient: 'do-not-draw'`, the same word in the theme and
 *    document policy; the order rule is `gradientStopOrder: 'non-descending'`, so EQUAL
 *    positions are ordered). We do not sort: sorting hides a broken document or theme, and the
 *    order changes the transition's colors themselves;
 *  - an angle this reader does not know.
 *
 * Positions 0..1 become percentages WITHOUT rounding: the contract allows a fractional position,
 * CSS accepts fractional percentages, and rounding would make copies diverge.
 */
export function gradientCssOf(angle: unknown, stops: readonly GradientStopCss[]): string | undefined {
  // A `Map`, not an object: the angle comes from the network, and `DIRECTIONS['constructor']` is not a direction.
  const direction = typeof angle === 'number' ? GRADIENT_DIRECTIONS.get(angle) : undefined
  if (direction === undefined) return undefined
  // A stop with a "color" the reader did not compose cancels the whole gradient.
  if (stops.length === 0 || !stops.every((stop) => isComposedColor(stop.color) && Number.isFinite(stop.position))) return undefined

  for (let index = 1; index < stops.length; index += 1) {
    const previous = stops[index - 1]
    const current = stops[index]
    if (previous !== undefined && current !== undefined && current.position < previous.position) return undefined
  }

  return `linear-gradient(${direction}, ${stops.map((stop) => `${stop.color} ${cssPercent(stop.position)}`).join(', ')})`
}

/**
 * CORE OF THE SIX DICTIONARIES: a mirror of `x-tokens.core` from `screen-schema.json`.
 *
 * These names are in EVERY theme (state colors optionally, with the fallbacks below), and only
 * on them may the reader rely without checking: the inheritance root (`onSurface`, `bodyM`) and
 * the defaults of `props` fields (`border`, `primary`, `sm`). The theme declares the rest of the
 * names, and they are checked before use (`declares`).
 */
export const CORE_TOKENS = {
  color: ['primary', 'onPrimary', 'secondary', 'accent', 'surface', 'onSurface', 'muted', 'border', 'success', 'warning', 'danger', 'locked', 'inProgress', 'completed'],
  gradient: ['brandBackdrop'],
  spacing: ['none', 'xs', 'sm', 'md', 'lg', 'xl'],
  radius: ['none', 'sm', 'md', 'lg', 'pill'],
  elevation: ['none', 'low', 'medium'],
  typography: ['displayL', 'titleM', 'titleS', 'bodyM', 'bodyS', 'caption', 'numericL'],
} as const

export type TokenDictionary = keyof typeof CORE_TOKENS

/**
 * State colors added by theme 3.4.0, and the token each one was borrowed from BEFORE it had a
 * name of its own.
 *
 * WHY A LIST AND NOT THE PHRASE "fall back to something sensible". These three colors are
 * OPTIONAL: a theme made before 3.4.0 lacks them, and a document may already refer to them. If
 * the contract said only "resolve to defaults", every reader would invent its own defaults, and
 * the same document would have different colors in Flutter and in a browser. So the map is named
 * item by item, lies in the artifact (`theme.json`, block `x-optionalColors.fallbacks`; in the
 * widget schema the same list is `x-tokens.optionalInTheme.color`) and is mirrored here. The core
 * (`CORE_TOKENS.color`) HAS these three names, because a document may always name them; a theme
 * may NOT have them, and a theme without them must not be rejected.
 *
 * Compare when the theme version is bumped, like the rest of this file.
 */
export const THEME_COLOR_FALLBACKS: Readonly<Record<string, string>> = {
  locked: 'muted',
  inProgress: 'accent',
  completed: 'success',
}

/**
 * THE SCALE'S ZERO: a mirror of `x-tokens.zeroScale` of the widget schema.
 *
 * The token `none` in spacing, radii and shadows is ALWAYS zero, not a value a theme may choose:
 * `spacing.none` and `radius.none` equal 0 (`const: 0` in the theme schema), and `elevation.none`
 * is an empty list of layers. In the theme policy this is `zeroScaleToken: 'none-is-zero'`.
 *
 * WHY THIS MATTERS TO THE READER. Migration and node templates rest on the name, not the number:
 * "no spacing" is written as `none`. A reader that let a theme set `none = 16` would change the
 * look of a screen without changing a byte of the document. So the variable with this name is
 * always declared, from zero, even when there is no theme (an incomplete one, not ours) in it,
 * and the walk over the theme does not override it.
 */
export const ZERO_SCALE = { token: 'none', sets: ['spacing', 'radius', 'elevation'] } as const

/**
 * Border width of a ROLE in logical pixels, `x-style.roles.roleBorderWidth`.
 *
 * Only for a role with a `border` slot that leads to a known color
 * (`roleBorderAppliesTo: 'role-with-border-slot'`); other roles have no border and no room for
 * one (`withoutBorderSlot: 'no-border-no-space'`). The theme does not carry this width, so it
 * goes into CSS as a number, a separate variable per role.
 */
export const ROLE_BORDER_WIDTH = 1

/**
 * Whether the theme DECLARES such a name in this dictionary.
 *
 * `Object.hasOwn`, not an index: a token name is an arbitrary string by pattern, and
 * `theme.color['constructor']` would otherwise give a function instead of "missing".
 *
 * An optional state color counts as declared always: it has a fallback, and a variable for it
 * exists in any theme.
 */
export function declares(theme: Theme, dictionary: TokenDictionary, token: string): boolean {
  if (isZeroScale(dictionary, token)) return true
  if (Object.hasOwn(theme[dictionary], token)) return true
  return dictionary === 'color' && Object.hasOwn(THEME_COLOR_FALLBACKS, token)
}

function isZeroScale(dictionary: string, token: string): boolean {
  return token === ZERO_SCALE.token && (ZERO_SCALE.sets as readonly string[]).includes(dictionary)
}

/** A theme color value by name, with the fallback of an optional state color. */
export function themeColorValue(theme: Theme, token: string): string | undefined {
  if (Object.hasOwn(theme.color, token)) return theme.color[token]
  const fallback = Object.hasOwn(THEME_COLOR_FALLBACKS, token) ? THEME_COLOR_FALLBACKS[token] : undefined
  return fallback !== undefined && Object.hasOwn(theme.color, fallback) ? theme.color[fallback] : undefined
}

const ROLE_SLOTS = ['background', 'foreground', 'border'] as const

export function roleVarName(group: string, role: string, slot: (typeof ROLE_SLOTS)[number]): string {
  return `--product-role-${toKebab(group)}-${toKebab(role)}-${slot}`
}

/** Variable of a role's border width: `...-border` + `-width`. */
export function roleBorderWidthVarName(group: string, role: string): string {
  return `${roleVarName(group, role, 'border')}-width`
}

function colorVar(token: string | undefined): string {
  // A missing color becomes `transparent`: CSS does not tell "absent" from "transparent", while
  // the theme does, and that is where the difference matters.
  return token === undefined ? 'transparent' : productVar('color', token)
}

/** A dictionary value by OWN key: the token name is a string from the network. */
function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined
}

/**
 * A flat "variable -> value" map: exactly what is put on the root.
 *
 * Switching the theme is replacing this map. The document does not know about the theme at all.
 */
export function themeCssVariables(input: Theme): Record<string, string> {
  /*
   * TRUST BOUNDARY, HERE and not only in `resolveTheme`: whoever calls this function and with
   * whatever theme, the names and values below are composed only of what passed the shape check.
   * For an already validated theme this is an identity transformation.
   */
  const theme = sanitizeTheme(input).theme
  const vars: Record<string, string> = {
    [FONT_FAMILY_VAR]: familyStack(theme, 'body'),
    [FONT_FAMILY_HEADING_VAR]: familyStack(theme, 'heading'),
  }

  /*
   * WALKING THE THEME rather than a list of names of our own: this is how own tokens
   * (`brandCoral`, `xxl`, `card`) get variables on a par with the core.
   */
  for (const [token, value] of Object.entries(theme.spacing)) vars[productVarName('spacing', token)] = px(value)
  for (const [token, value] of Object.entries(theme.color)) vars[productVarName('color', token)] = safeColor(value) ?? 'transparent'

  /*
   * A variable is declared for EVERY state color, even if the theme lacks it: the document refers
   * to a token, not to a theme, so `var(--product-color-locked)` must have something to
   * substitute. Without this line an older theme would silently leave the node unpainted, and
   * that would be visible only by eye, because on OUR theme all three colors exist and the
   * fallback path is not needed.
   */
  for (const [token, fallback] of Object.entries(THEME_COLOR_FALLBACKS)) {
    if (Object.hasOwn(theme.color, token)) continue
    vars[productVarName('color', token)] = safeColor(own(theme.color, fallback)) ?? safeColor(own(theme.color, 'onSurface')) ?? 'inherit'
  }
  for (const [token, value] of Object.entries(theme.radius)) vars[productVarName('radius', token)] = px(value)

  for (const [token, value] of Object.entries(theme.typography)) {
    /*
     * One shorthand instead of three variables. Our own generated CSS does the same; otherwise
     * the same number would live separately in the theme, the font and the weight variable:
     * three copies that drift apart one by one.
     */
    const family = value.role === 'heading' ? FONT_FAMILY_HEADING_VAR : FONT_FAMILY_VAR
    vars[productVarName('typography', token)] = `${cssNumber(value.fontWeight)} ${cssNumber(value.fontSize)}px / ${cssNumber(value.lineHeight)} var(${family})`
    /*
     * LETTER SPACING IS A SEPARATE VARIABLE, a CSS limitation: the `font:` shorthand covers
     * weight, size, line height and family, but not `letter-spacing`. Declared even for themes
     * without a value: then `letter-spacing: var(--product-tracking-...)` always has something
     * to substitute, and zero means zero, not `initial`.
     */
    vars[trackingVarName(token)] = px(value.letterSpacing ?? 0)
  }

  /*
   * COMPONENTS of the same font style as separate variables (theme 4.0.0). They are needed for
   * a "token with tweaks": `{ token: 'titleM', fontSize: 28 }` changes the size, and the weight,
   * line height and family must come from the token; one field cannot be taken out of the `font:`
   * shorthand. The group is its own (`type-...`), not a suffix to `--product-font-...`: a suffix
   * would collide with the theme's own token (`titleMSize` -> `--product-font-title-m-size`).
   */
  for (const [token, value] of Object.entries(theme.typography)) {
    const family = value.role === 'heading' ? FONT_FAMILY_HEADING_VAR : FONT_FAMILY_VAR
    vars[typographyPartVarName(token, 'size')] = `${cssNumber(value.fontSize)}px`
    vars[typographyPartVarName(token, 'weight')] = cssNumber(value.fontWeight)
    vars[typographyPartVarName(token, 'line')] = cssNumber(value.lineHeight)
    vars[typographyPartVarName(token, 'family')] = `var(${family})`
  }

  for (const [token, value] of Object.entries(theme.elevation)) vars[productVarName('elevation', token)] = shadowCss(value)
  for (const [token, value] of Object.entries(theme.gradient)) {
    // A theme gradient with unordered stops is not drawn at all (`unorderedGradient:
    // 'do-not-draw'`): the variable becomes `none` and the background stays empty.
    vars[productVarName('gradient', token)] = gradientCssOf(value.angle, value.stops) ?? 'none'
  }

  /*
   * THE SCALE'S ZERO comes AFTER the walk and OVER it (`zeroScaleToken: 'none-is-zero'`): the
   * theme schema rejects a non-zero `none`, but the reader need not believe anyone checked the
   * theme; otherwise `none = 16` would change the look of every migrated screen without a byte
   * changing in the document. An incomplete theme that does not declare `none` gets the
   * variable too. `elevation.none` is not "0" but the absence of a shadow.
   */
  vars[productVarName('spacing', ZERO_SCALE.token)] = '0'
  vars[productVarName('radius', ZERO_SCALE.token)] = '0'
  vars[productVarName('elevation', ZERO_SCALE.token)] = 'none'

  /*
   * Roles are the second half of why the theme exists. A widget names a ROLE ("success badge"),
   * not a color, so re-coloring the brand touches no document.
   */
  for (const [group, groupRoles] of Object.entries(theme.roles)) {
    for (const [role, colors] of Object.entries(groupRoles)) {
      for (const slot of ROLE_SLOTS) {
        vars[roleVarName(group, role, slot)] = colorVar(colors[slot])
      }
      /*
       * WHETHER THERE IS A BORDER, as a number, because the color does not show it: a missing
       * slot is also a "color" in CSS (`transparent`), and a transparent border would eat a pixel
       * that nobody occupies on the phone. 1 only for a `border` slot that leads to a KNOWN theme
       * color; otherwise 0.
       */
      const borderKnown = colors.border !== undefined && declares(theme, 'color', colors.border)
      vars[roleBorderWidthVarName(group, role)] = px(borderKnown ? ROLE_BORDER_WIDTH : 0)
    }
  }

  return vars
}

/**
 * A theme from the artifact by identifier; without a name, the one the contract names.
 *
 * `Object.hasOwn`, not an index: `themes['__proto__']` would give the map's prototype, not
 * "missing". The schema rejects the key `__proto__` in `themes` (`propertyNames.pattern`), but a
 * reader that trusts a map from the network must not rely on someone having checked it.
 *
 * The third argument is the built-in themes (the artifact `contract/theme.json`): an incomplete
 * theme is completed by `resolveMissingToDefaults`.
 */
export function themeFrom(contract: ThemeContract, themeId?: string, builtIn?: ThemeContract): Theme {
  const wanted = themeId ?? contract.defaultThemeId
  if (!Object.hasOwn(contract.themes, wanted)) throw new Error(`theme "${wanted}" is not in the set`)
  const theme = contract.themes[wanted]
  if (theme === undefined) throw new Error(`theme "${wanted}" is not in the set`)
  return builtIn === undefined ? theme : resolveMissingToDefaults(theme, builtIn)
}

/**
 * INCOMPLETE THEME (`partialTheme: 'resolve-missing-to-defaults'`).
 *
 * Core tokens the theme lacks are taken from the BUILT-IN theme of THE SAME BRIGHTNESS
 * (`partialThemeDefaults: 'built-in-theme-of-same-brightness'`): a dark theme without `surface`
 * gets the dark `surface`, not the light one. A brightness with no pair means the default theme
 * of the built-in set.
 *
 * ONLY the core of the six dictionaries and the font families are filled in. Not filled in:
 *  - own tokens: the theme declares them, and a missing own token is "unknown"
 *    (`missingCustomToken`); substituting someone else's would be inventing;
 *  - optional state colors: they have their own fallback (`THEME_COLOR_FALLBACKS`);
 *  - roles: a missing role is drawn neutrally (`missingRole`).
 * What the theme declared is not touched.
 */
export function resolveMissingToDefaults(theme: Theme, builtIn: ThemeContract): Theme {
  const sameBrightness = Object.values(builtIn.themes).find((candidate) => candidate.brightness === theme.brightness)
  const defaults = sameBrightness ?? builtIn.themes[builtIn.defaultThemeId]
  if (defaults === undefined) return theme

  const optional = new Set(Object.keys(THEME_COLOR_FALLBACKS))
  const filled = <T,>(dictionary: TokenDictionary, own: Readonly<Record<string, T>>, from: Readonly<Record<string, T>>): Record<string, T> => {
    const result: Record<string, T> = { ...own }
    for (const token of CORE_TOKENS[dictionary]) {
      if (Object.hasOwn(own, token)) continue
      if (dictionary === 'color' && optional.has(token)) continue
      const value = from[token]
      if (Object.hasOwn(from, token) && value !== undefined) result[token] = value
    }
    return result
  }

  return {
    ...theme,
    fontFamilies: { ...defaults.fontFamilies, ...theme.fontFamilies },
    color: filled('color', theme.color, defaults.color),
    gradient: filled('gradient', theme.gradient, defaults.gradient),
    spacing: filled('spacing', theme.spacing, defaults.spacing),
    radius: filled('radius', theme.radius, defaults.radius),
    elevation: filled('elevation', theme.elevation, defaults.elevation),
    typography: filled('typography', theme.typography, defaults.typography),
  }
}
