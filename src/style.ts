/**
 * Node style: states and inheritance. Roles live in `style-roles.ts`, the box model in
 * `style-box.ts`.
 *
 * These are rules of the CONTRACT, not of the renderer (machine-readable as the `x-style` block
 * of `screen-schema.json`): if they diverged, web and Flutter would draw the same closed card
 * differently, and the difference would be visible only with a browser next to a phone.
 *
 * Appearance lives only in `style`; there is no "style beats props" rule to apply.
 *
 * FIVE RULES, in order of application:
 *
 *  1. STATE: the first one whose condition holds is laid over the base style BY TOP-LEVEL
 *     FIELDS (`resolveNodeStyle`);
 *  2. INHERITANCE: `color` and `typography` travel down the tree, AFTER the state is laid over
 *     (`inheritTextStyle`);
 *  3. ROLE: on `Button` and `Badge` seven style fields land on the widget's own surface and
 *     override the theme role, each separately (`roleSurfaceCss`, `style-roles.ts`);
 *  4. BOX: the rest of the style -> CSS (`boxCss`, `style-box.ts`);
 *  5. UNKNOWN: a token the theme does not know means the property is not applied; a field the
 *     reader does not know is skipped.
 */
import { isConditionMet } from './conditions'
import type { DataScope } from './data'
import { clampLiteral, colorCss, gradientCss, radiusCss, shadowCss, spacingCss, typographyCss } from './resolve'
import type { TypographyCss } from './resolve'
import { isRecord, lookup } from './sanitize'
import { readDecoration, readFontStyle } from './text-emphasis'
import type { TextDecoration, TextFontStyle } from './text-emphasis'
import { ROLE_BORDER_WIDTH } from './theme'
import type { Theme } from './theme'
import { NODE_STYLE_KEYS } from './types'
import type { ColorRef, GradientRef, NodeStyle, RadiusRef, ShadowRef, SpacingRef, TypographyRef, UiNode } from './types'

export { ROLE_BORDER_WIDTH }

export type Css = Record<string, string | number>

/**
 * Style fields the SCREEN ROOT does not have, a mirror of `x-style.screenExcluded`.
 *
 * A screen is the whole screen: it cannot have an outer margin or a size of its own, so the
 * schema has a separate `ScreenStyle` without these fields. A document assembled by something
 * other than the builder may bring them; the reader IGNORES them (`screenBoxFields: 'ignore'`),
 * and the rest of the root's style applies.
 */
export const SCREEN_EXCLUDED_STYLE_KEYS = ['margin', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'] as const

export function withoutScreenExcluded(style: NodeStyle | undefined): NodeStyle | undefined {
  if (style === undefined) return undefined
  const excluded: readonly string[] = SCREEN_EXCLUDED_STYLE_KEYS
  return Object.fromEntries(Object.entries(style).filter(([key]) => !excluded.includes(key)))
}

/** Size fields that `fill` overrides (and `weight` the width), together with their `min...`/`max...`. */
export const WIDTH_KEYS = ['width', 'minWidth', 'maxWidth'] as const
export const HEIGHT_KEYS = ['height', 'minHeight', 'maxHeight'] as const

/* ─────────────────────────────── 1. states ─────────────────────────────── */

/**
 * Style fields that are ONE token reference or a form with sides: a mirror of
 * `x-style.boxTokenFields`. There are two ways to say the same thing (`padding: 'md'` and
 * `padding: { top: 'md' }`), and the rule for an unknown token differs: ONE value the theme does
 * not know cancels the field, while a form with sides always applies (an unknown side is zero).
 */
export const BOX_TOKEN_FIELDS = ['padding', 'margin', 'radius'] as const

/**
 * WHETHER THE THEME APPLIES THIS STATE FIELD, for `unknownTokenInCase: 'keep-base-field'`.
 *
 * A state field that would not apply (an unknown color, font or shadow token; a background of an
 * unfamiliar kind or with an unknown color; a border with an unknown color; ONE padding or
 * radius value the theme does not know) is dropped BEFORE being laid over the base style.
 * Otherwise it would first REPLACE a good base field and only then "not apply", so a token
 * deleted from the theme would also erase a color the base style had set perfectly well.
 *
 * A form with sides always applies: it is not "one value".
 */
function caseFieldApplies(key: string, style: Readonly<Record<string, unknown>>, theme: Theme): boolean {
  const value = style[key]
  const isForm = typeof value === 'object' && value !== null
  switch (key) {
    case 'color':
      return colorCss(value, theme) !== undefined
    case 'typography':
      return typographyCss(value, theme) !== undefined
    case 'shadow':
      return shadowCss(value as ShadowRef, theme) !== undefined
    case 'border':
      // `null` is not a border: a state field that would apply nothing does not erase the base one.
      return isForm && colorCss((value as { readonly color?: unknown }).color, theme) !== undefined
    case 'background': {
      // The background kind may come from a newer minor, so `kind` is an arbitrary string here.
      const background = value as { readonly kind?: unknown; readonly color?: unknown; readonly gradient?: unknown } | null
      if (background?.kind === 'color') return colorCss(background.color, theme) !== undefined
      if (background?.kind === 'gradient') return gradientCss(background.gradient as GradientRef, theme) !== undefined
      // An image always applies (no value means no background, but that is not a token matter).
      return background?.kind === 'image'
    }
    case 'padding':
    case 'margin':
      return isForm ? true : spacingCss(value as SpacingRef, theme) !== undefined
    case 'radius':
      return isForm ? true : radiusCss(value as RadiusRef, theme) !== undefined
    default:
      return true
  }
}

/**
 * The base style with the state laid over it BY TOP-LEVEL FIELDS
 * (`x-style.caseMerge: 'top-level-fields'`).
 *
 * A state with `padding` replaces `padding` WHOLE, not by sides; a state with `border` replaces
 * both thickness and color. A deep merge looks more convenient, but it has no way to say "this
 * state has NO top padding", and two readers would have to decide identically where it stops (at
 * sides? at shadow layers? at gradient stops?).
 *
 * The walk is over KNOWN keys (`NODE_STYLE_KEYS`), which is two policies at once:
 *  - a field with the value `undefined` does not erase the base one: the document comes from the
 *    network and may carry an explicit `undefined`;
 *  - a field this reader does not know simply does not reach the result
 *    (`unknownStyleField: 'ignore-field'`): one property is lost, not the whole look of the node.
 *
 * The third policy: a STATE field that the theme would not apply does not erase the base one
 * (`unknownTokenInCase: 'keep-base-field'`); see `caseFieldApplies`. The theme is needed exactly
 * here, so it is required.
 */
export function mergeNodeStyles(base: NodeStyle | undefined, overlay: NodeStyle | undefined, theme: Theme): NodeStyle | undefined {
  if (base === undefined && overlay === undefined) return undefined

  const result: Record<string, unknown> = {}
  for (const key of NODE_STYLE_KEYS) {
    const fromOverlay = overlay?.[key] !== undefined && caseFieldApplies(key, overlay as Readonly<Record<string, unknown>>, theme)
    const value = fromOverlay ? overlay[key] : base?.[key]
    if (value !== undefined) result[key] = value
  }
  return result
}

/**
 * The style a node is drawn with RIGHT NOW.
 *
 * Three parts of the rule, each easy to break:
 *
 * 1. the FIRST state whose condition holds applies, not the "narrowest". Conditions in a real
 *    document overlap ("progress > 0" and "progress = 100"), and there is nothing to measure a
 *    condition's specificity with. The order is set by the author and is visible in the JSON;
 * 2. the state is LAID OVER the base style rather than replacing it: the base may set a font for
 *    all states while a state sets only the color;
 * 3. no state at all means the base style, not "nothing".
 *
 * CALL DURING RENDER, not once at document load: the current state depends on data, and data
 * changes without the layout being re-read.
 */
export function resolveNodeStyle(node: UiNode, scope: DataScope, theme: Theme): NodeStyle | undefined {
  // A document from the network: `styleWhen` may not be an array, and a state may not be an object or have no condition.
  const cases: unknown = node.styleWhen
  const active = Array.isArray(cases)
    ? (cases as readonly unknown[]).find((entry): entry is { readonly when: never; readonly style?: unknown } => isRecord(entry) && isRecord(entry.when) && isConditionMet(entry.when as never, scope))
    : undefined
  const base = isRecord(node.style) ? (node.style as NodeStyle) : undefined
  const overlay = isRecord(active?.style) ? (active.style as NodeStyle) : undefined
  return mergeNodeStyles(base, overlay, theme)
}

/* ──────────────────────────── 2. inheritance ──────────────────────────── */

/** Foreground color and font in effect at this point of the tree. Both are ALWAYS present. */
export interface TextStyleContext {
  readonly color: ColorRef
  readonly typography: TypographyRef
  /**
   * Whether anyone NAMED a color: the node itself or an ancestor.
   *
   * A FLAG rather than a comparison with the root color: a card that explicitly says
   * `color: 'onSurface'` also named a color, and the row subtitle inside it must become a shade of
   * exactly that. Comparing `color !== 'onSurface'` would not see this.
   */
  readonly colorNamed: boolean
  /**
   * Text emphasis (9.17.0): the word of the nearest ancestor that named it, EACH FIELD
   * SEPARATELY. The field is ABSENT until someone names it, which is the root (`normal`,
   * `none`), and the context of a document without emphasis stays exactly as it was. Only `Text`
   * reads it (`x-style.layout.textEmphasis.readers`), and it travels as a VALUE, not through the
   * CSS cascade: the italic of a card does not reach the buttons in it.
   */
  readonly fontStyle?: TextFontStyle | undefined
  readonly textDecoration?: TextDecoration | undefined
}

/**
 * Inheritance root, `x-style.root`. Both names come from the REQUIRED core of the theme, which
 * is why the core is required: without them the fallback would have nothing to rest on. At the
 * root nobody has named a color yet.
 */
export const ROOT_TEXT_STYLE: TextStyleContext = { color: 'onSurface', typography: 'bodyM', colorNamed: false }

type PartEmphasis = 'primary' | 'secondary'

/**
 * WHO READS THE NAMED COLOR AND WITH WHICH PART: a mirror of `x-style.colorParts`.
 *
 * `whenUnnamed` says what to do while NOBODY has named a color:
 *  - `root`: draw with the root `onSurface` (`Text`, `Icon`);
 *  - `built-in`: draw with the widget's built-in colors, as before 9.0.0. This is why no existing
 *    document changed its look.
 *
 * `ListTile.leadingIcon` is a primary part: it is a plain glyph WITHOUT a disc (so it is drawn
 * on a phone too, with the built-in `primary`), so without reading the named color it would be
 * invisible on a colored card. The photo and selection circle in a row, the active tab bar and
 * dividers do not read the color.
 *
 * Once a color is named, primary parts (`primary`) take it as is, and secondary ones
 * (`secondary`) take it with the opacity `SECONDARY_PART_OPACITY`. The built-in muted color does
 * not work here: on a dark or gradient card it is the very dark text that cannot be seen.
 */
export const COLOR_PARTS: Readonly<
  Record<string, { readonly whenUnnamed: 'root' | 'built-in'; readonly parts: Readonly<Record<string, PartEmphasis>> }>
> = {
  Text: { whenUnnamed: 'root', parts: { content: 'primary' } },
  Icon: { whenUnnamed: 'root', parts: { glyph: 'primary' } },
  ListTile: {
    whenUnnamed: 'built-in',
    parts: { title: 'primary', subtitle: 'secondary', leadingIcon: 'primary', trailingText: 'primary', trailingIcon: 'primary', chevron: 'secondary' },
  },
  AppBar: { whenUnnamed: 'built-in', parts: { title: 'primary', subtitle: 'secondary', backIcon: 'primary' } },
  Tab: { whenUnnamed: 'built-in', parts: { activeTitle: 'primary', inactiveTitle: 'secondary' } },
  // Bottom navigation bar item (9.12.0): the item's icon and label are one part.
  NavItem: { whenUnnamed: 'built-in', parts: { activeItem: 'primary', inactiveItem: 'secondary' } },
  Accordion: { whenUnnamed: 'built-in', parts: { title: 'primary', chevron: 'secondary' } },
}

/** Opacity of a secondary part when it is drawn in the named color: `x-style.secondaryOpacity`. */
export const SECONDARY_PART_OPACITY = 0.6

/**
 * Who is drawn with the inherited style, `x-style.readers`.
 *
 * Color: all widgets with text (`COLOR_PARTS`). FONT: only `Text`: composite widgets keep their
 * own typographic hierarchy (row title versus subtitle), and one inherited style would flatten
 * it. `Button` and `Badge` do not read the inherited style at all: the theme role drives them.
 */
export const TEXT_STYLE_READERS: Readonly<Record<'color' | 'typography', readonly string[]>> = {
  color: Object.keys(COLOR_PARTS),
  typography: ['Text'],
}

/**
 * The same color with extra opacity.
 *
 * The token becomes a SHADE OF THE TOKEN, not an own value: a subtitle on a colored card stays
 * bound to the brand. Opacities multiply.
 */
export function withColorOpacity(ref: ColorRef, opacity: number): ColorRef {
  if (typeof ref === 'string') return { token: ref, opacity }
  // Opacity from the document is a number 0..1 or absent; a string is not multiplied.
  const own = (value: unknown): number => (value === undefined || value === null ? 1 : clampLiteral(value, 'opacity'))
  if ('value' in ref) return { value: ref.value, opacity: own(ref.opacity) * opacity }
  return { token: ref.token, opacity: own(ref.opacity) * opacity }
}

/**
 * COLOR OF A WIDGET PART in this context; `undefined` means "draw with the built-in one".
 *
 * An unknown part or a widget outside the table is `undefined` too: a reader that got a part it
 * does not know from a new minor draws it as it always did.
 */
export function partColorCss(type: string, part: string, context: TextStyleContext, theme: Theme): string | undefined {
  const reader = lookup(COLOR_PARTS, type)
  const emphasis = reader === undefined ? undefined : lookup(reader.parts, part)
  if (reader === undefined || emphasis === undefined) return undefined
  if (!context.colorNamed && reader.whenUnnamed === 'built-in') return undefined

  return colorCss(emphasis === 'secondary' ? withColorOpacity(context.color, SECONDARY_PART_OPACITY) : context.color, theme)
}

/**
 * Foreground of a node: its own `color` and `typography`, and where there are none, the
 * parent's.
 *
 * The font is inherited WHOLE, not by fields: `{ token: 'titleM', fontSize: 22 }` on an ancestor
 * and `'caption'` on a descendant give `'caption'`, not "caption at size 22".
 *
 * `style` here is already the style WITH its state (`x-style.inheritance: 'after-case-merge'`):
 * a state that colors a card colors the labels inside it too.
 *
 * THE THEME IS NEEDED RIGHT HERE (`unknownInheritedToken: 'keep-parent'`). A reference the theme
 * does not resolve does NOT become context: the parent's applies, for the node and everything
 * under it, and such a color does not count as named. Putting a broken name into the context and
 * checking it only at the label would leave a label under a card with `color: 'brandCoral'` in a
 * theme without `brandCoral` with no color at all, instead of its grandparent's color.
 */
export function inheritTextStyle(parent: TextStyleContext, style: NodeStyle | undefined, theme: Theme): TextStyleContext {
  const ownColor = style?.color !== undefined && colorCss(style.color, theme) !== undefined ? style.color : undefined
  const ownTypography =
    style?.typography !== undefined && typographyCss(style.typography, theme) !== undefined ? style.typography : undefined

  // Emphasis (9.17.0): an unknown word means no field, and the inherited one applies.
  const ownFontStyle = readFontStyle(style?.fontStyle)
  const ownDecoration = readDecoration(style?.textDecoration)

  if (ownColor === undefined && ownTypography === undefined && ownFontStyle === undefined && ownDecoration === undefined) return parent
  const fontStyle = ownFontStyle ?? parent.fontStyle
  const textDecoration = ownDecoration ?? parent.textDecoration
  return {
    color: ownColor ?? parent.color,
    typography: ownTypography ?? parent.typography,
    colorNamed: parent.colorNamed || ownColor !== undefined,
    ...(fontStyle === undefined ? {} : { fontStyle }),
    ...(textDecoration === undefined ? {} : { textDecoration }),
  }
}

/** Font style -> properties put on a label. */
export function typographyToCss(value: TypographyCss | undefined): Css {
  if (value === undefined) return {}
  const css: Css = { letterSpacing: value.letterSpacing }
  if (value.font !== undefined) css.font = value.font
  if (value.fontFamily !== undefined) css.fontFamily = value.fontFamily
  if (value.fontSize !== undefined) css.fontSize = value.fontSize
  if (value.fontWeight !== undefined) css.fontWeight = value.fontWeight
  if (value.lineHeight !== undefined) css.lineHeight = value.lineHeight
  return css
}

/**
 * Foreground CSS for `Text` and `Icon`, their only part.
 *
 * Color and font are put on the label EXPLICITLY, from the context, rather than left to CSS
 * inheritance. The cascade is wider than the contract rule: it would reach a button label
 * (driven by its role), color a list row NOT by the parts table (a subtitle without 0.6), and
 * pass the font to those that do not read it.
 */
export function textCss(type: string, text: TextStyleContext, theme: Theme): Css {
  const css: Css = {}
  const part = Object.keys(lookup(COLOR_PARTS, type)?.parts ?? {})[0]
  const color = part === undefined ? undefined : partColorCss(type, part, text, theme)
  if (color !== undefined) css.color = color
  if (TEXT_STYLE_READERS.typography.includes(type)) Object.assign(css, typographyToCss(typographyCss(text.typography, theme)))
  return css
}
