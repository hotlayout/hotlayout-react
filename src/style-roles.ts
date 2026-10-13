/** Widgets with a theme role (`Button`, `Badge`): the role of the theme and the own style of the node on the surface of the widget. */
import type { DataScope } from './data'
import { DEFAULT_IMAGES } from './images'
import type { ImagePolicy } from './images'
import { colorCss, shadowCss, typographyCss } from './resolve'
import { lookup, safeIdent } from './sanitize'
import { typographyToCss } from './style'
import type { Css } from './style'
import { backgroundCss, borderCss, radiusBoxCss, spacingBoxCss } from './style-box'
import { declares, productVar, roleBorderWidthVarName } from './theme'
import type { Theme, ThemeRole } from './theme'
import type { NodeStyle } from './types'

/**
 * Widgets whose default look comes from a theme ROLE: `x-style.roles.widgets`.
 *
 * `prop` is the node prop that names the role; `group` is the group in `theme.roles`.
 */
export const ROLE_WIDGETS: Readonly<Record<string, { readonly prop: string; readonly group: string }>> = {
  Button: { prop: 'variant', group: 'buttonVariant' },
  // Since 9.5.0: the icon button reads the same role group as the button; the theme has no new group.
  IconButton: { prop: 'variant', group: 'buttonVariant' },
  Badge: { prop: 'tone', group: 'badgeTone' },
}

/** Style fields that, on a widget with a role, apply to its OWN surface: `x-style.roles.overridableBy`. */
export const ROLE_STYLE_KEYS = ['background', 'color', 'border', 'radius', 'shadow', 'padding', 'typography'] as const

const ROOT_COLOR_TOKEN = 'onSurface'

/**
 * A role from the theme; `undefined` means there is no role and the widget is drawn NEUTRALLY
 * (`missingRole: 'render-neutral'`): `onSurface` text with no background and no border. This
 * happens when the widget schema is ahead of the theme.
 */
function roleOf(theme: Theme, group: string, name: unknown): ThemeRole | undefined {
  const roles = lookup(theme.roles, group)
  return roles === undefined ? undefined : lookup(roles, safeIdent(name))
}

/**
 * The colour of a role slot; `undefined` means there is no slot.
 *
 * `unknownRoleColor: 'neutral-slot'`: when a role names a colour the theme does not declare, only
 * THAT SLOT becomes neutral, not the whole role. A background and border with an unknown colour
 * disappear (like a missing slot), while the foreground becomes the root colour, since the label
 * must stay visible. Inventing a colour would show a brand the client did not choose.
 */
function roleSlot(theme: Theme, token: string | undefined): string | undefined {
  return token !== undefined && declares(theme, 'color', token) ? productVar('color', token) : undefined
}

/** If an own value exists, the properties of the same family from the built-in geometry are removed. */
function replaceFamily(css: Css, family: RegExp, next: Css): void {
  if (Object.keys(next).length === 0) return
  for (const key of Object.keys(css)) if (family.test(key)) Reflect.deleteProperty(css, key)
  Object.assign(css, next)
}

/** What a surface is resolved against: the theme, the data scope and the image policy of the screen (by default — `DEFAULT_IMAGES`). */
export interface SurfaceContext {
  readonly theme: Theme
  readonly scope: DataScope
  readonly images?: ImagePolicy | undefined
}

/**
 * How to paint the surface of a button or badge: a theme role with the node's own style on top.
 *
 * Four parts of the rule (`x-style.roles`):
 *
 * 1. THE ROLE IS THE DEFAULT. A node without a style is drawn by `theme.roles`: background,
 *    foreground and border;
 * 2. EACH SLOT SEPARATELY (`override: 'own-style-per-slot'`). `style.background` changes the
 *    background and does NOT touch the label colour. "Name one and lose the rest of the role"
 *    would force rewriting the whole button for the sake of one shade;
 * 3. AN INHERITED COLOUR DOES NOT OVERRIDE THE ROLE. Only a colour named ON THE NODE ITSELF (base
 *    style or the active state) does. So the function takes `own` and accepts no ancestor
 *    context at all: a button on a coloured card does not pick up the card's text colour on its
 *    own background;
 * 4. THE SURFACE IS THE WIDGET ITSELF (`appliesTo: 'widget-surface'`). `style.radius` on a button
 *    rounds the button, not a rectangle around it.
 *
 * The role does NOT supply `radius`, `shadow`, `padding` or `typography`: without an own value
 * the widget's built-in geometry applies (the `builtIn` argument).
 *
 * An own field that did not resolve (a token the theme does not know) is "not applied", i.e. the
 * slot stays with the role rather than becoming empty.
 */
export function roleSurfaceCss(type: string, props: Readonly<Record<string, unknown>>, own: NodeStyle | undefined, context: SurfaceContext, builtIn: Css): Css {
  const { theme, scope, images = DEFAULT_IMAGES } = context
  const spec = lookup(ROLE_WIDGETS, type)
  const roleName = spec === undefined ? undefined : safeIdent(props[spec.prop])
  const role = spec === undefined ? undefined : roleOf(theme, spec.group, roleName)

  // Step 1: the role (or a neutral look when there is no role).
  const css: Css = { ...builtIn, color: roleSlot(theme, role?.foreground) ?? productVar('color', ROOT_COLOR_TOKEN) }
  const roleBackground = roleSlot(theme, role?.background)
  const roleBorder = roleSlot(theme, role?.border)
  if (roleBackground !== undefined) css.backgroundColor = roleBackground
  /*
   * A role border exists only for a `border` slot that leads to a known colour; no slot means no
   * border and no room for one (`no-border-no-space`). The width (1 dp) is carried by the role's
   * variable, which the theme declares; the `border-width` sits next to it.
   */
  if (roleBorder !== undefined && spec !== undefined && roleName !== undefined) {
    css.border = `var(${roleBorderWidthVarName(spec.group, roleName)}) solid ${roleBorder}`
  }

  if (typeof own !== 'object' || (own as unknown) === null) return css

  // Steps 2-4: the node's own fields, each on its own slot.
  const background = backgroundCss(own.background, theme, scope, images)
  if (Object.keys(background).length > 0) {
    // An own background replaces the role's background ENTIRELY: a gradient over the role colour
    // would show it through transparent stops.
    delete css.backgroundColor
    Object.assign(css, background)
  }

  const color = own.color === undefined ? undefined : colorCss(own.color, theme)
  if (color !== undefined) css.color = color

  Object.assign(css, borderCss(own.border, theme))
  /*
   * Radius, padding and font REPLACE the built-in geometry entirely rather than mixing into it:
   * the widget's `padding: 8px 16px` and the node's `paddingBlockStart` on one element would
   * produce a padding nobody named.
   */
  replaceFamily(css, /^border.*Radius$/, radiusBoxCss(own.radius, theme))
  if (own.radius !== undefined) css.overflow = 'hidden'
  replaceFamily(css, /^padding/, spacingBoxCss('padding', own.padding, theme))
  replaceFamily(
    css,
    /^(font|lineHeight$|letterSpacing$)/,
    own.typography === undefined ? {} : typographyToCss(typographyCss(own.typography, theme)),
  )

  const shadow = shadowCss(own.shadow, theme)
  if (shadow !== undefined) css.boxShadow = shadow

  return css
}
