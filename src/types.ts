/**
 * Layout types: exactly as many as the renderer needs.
 *
 * WHY HAND-WRITTEN AND NOT GENERATED FROM JSON SCHEMA. A generated file describes EVERY prop of
 * every widget: several thousand lines, of which the renderer reads about ten. Here it is the
 * other way round: what ALL nodes have (`id`, `type`, the cross-cutting fields) is named exactly,
 * and `props` is left an open dictionary, since each widget reads its own and must check what
 * lies there anyway.
 *
 * If you want strict prop types, generate them from `screen-schema.json` separately; this file
 * does not get in their way.
 *
 * THE `WidgetType` LIST IS CHECKED BY A GATE in the contract repository's build: a widget added to
 * the contract and forgotten here fails the build. Without it the package would quietly fall
 * behind the schema at the first minor version.
 */

export const WIDGET_TYPES = [
  'Screen',
  'AppBar',
  'Column',
  'Row',
  'Container',
  'Grid',
  'Stack',
  'Tabs',
  'Tab',
  'Accordion',
  'ChoiceGroup',
  'Repeater',
  'Spacer',
  'Divider',
  'Text',
  'Image',
  'Icon',
  'Button',
  'IconButton',
  'ListTile',
  'ProgressBar',
  'CircularProgress',
  'Badge',
  // Since 9.12.0: the bottom navigation bar and its item.
  'NavBar',
  'NavItem',
  // Since 9.13.0: input fields.
  'TextField',
  'Switch',
  'Checkbox',
] as const

export type WidgetType = (typeof WIDGET_TYPES)[number]

/** A condition: one shape for both `visibleIf` and a node's state. */
export type VisibilityOp =
  | 'isTrue'
  | 'isFalse'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'

export interface VisibilityCondition {
  readonly path: string
  readonly op: VisibilityOp
  /** Unary operators have NO such key at all: not `null`, but absent. */
  readonly value?: string | number | boolean
  /** The operand is the value under another data path (since 9.23.0), instead of `value`. Comparison operators only. */
  readonly valuePath?: string
  /** On a collection path with `isEmpty` / `isNotEmpty` (since 9.23.0): the entity prefix of the list and its filter. */
  readonly item?: string
  readonly where?: VisibilityCondition
}

/* ─────────────── "a token or an own value" (schema 9.0.0) ─────────────── */

/**
 * Token names are strings matching a pattern (`x-tokens.namePattern`), NOT a closed list: since
 * 9.0.0 a theme declares its own names, and whether `brandCoral` exists is known only to the theme
 * being drawn with. So the type cannot be narrowed to a union of words, by construction, and does
 * not need to be.
 */
export type TokenName = string

/**
 * A colour reference: three forms told apart by STRUCTURE:
 *
 *  - a string is a theme token;
 *  - `{ token, opacity }` is a TINT of a token ("10% of the brand colour");
 *  - `{ value, opacity? }` is an own value, exactly `#rrggbb`.
 */
export type ColorRef =
  | TokenName
  | { readonly token: TokenName; readonly opacity: number }
  | { readonly value: string; readonly opacity?: number }

/** Spacing and radius: a string is a token, a number is logical pixels. */
export type SpacingRef = TokenName | number
export type RadiusRef = TokenName | number

/** Sides are LOGICAL: `start` / `end`, not `left` / `right`. An unnamed side is zero. */
export interface SpacingSides {
  readonly top?: SpacingRef
  readonly end?: SpacingRef
  readonly bottom?: SpacingRef
  readonly start?: SpacingRef
}
export type BoxSpacing = SpacingRef | SpacingSides

/** Corners are logical too; an unnamed corner is square. */
export interface RadiusCorners {
  readonly topStart?: RadiusRef
  readonly topEnd?: RadiusRef
  readonly bottomEnd?: RadiusRef
  readonly bottomStart?: RadiusRef
}
export type BoxRadius = RadiusRef | RadiusCorners

/**
 * A text style: a token or a token WITH OVERRIDES. There is no from-scratch own style: the
 * typeface and role always come from the token.
 */
export type TypographyRef =
  | TokenName
  | {
      readonly token: TokenName
      readonly fontSize?: number
      readonly fontWeight?: number
      /** A MULTIPLIER of the font size, as in the theme. */
      readonly lineHeight?: number
      readonly letterSpacing?: number
    }

/** An own gradient: the shape of the theme's, but the stop colours are REFERENCES. */
export interface CustomGradient {
  readonly angle: number
  readonly stops: readonly { readonly color: ColorRef; readonly position: number }[]
}
export type GradientRef = TokenName | CustomGradient

/**
 * A layer of an own shadow. There is NO separate `opacity` as in the theme: the colour reference
 * itself carries the opacity (`{ token: 'onSurface', opacity: 0.12 }`).
 */
export interface CustomShadowLayer {
  readonly offsetX: number
  readonly offsetY: number
  readonly blur: number
  readonly spread: number
  readonly color: ColorRef
}
export type ShadowRef = TokenName | readonly CustomShadowLayer[]

/** A size: a number in dp, or a data binding with a numeric fallback value. */
export type Dimension = number | { readonly kind: 'binding'; readonly path: string; readonly fallback: number }

export type ImageSource =
  | { readonly kind: 'asset'; readonly asset: string }
  | { readonly kind: 'url'; readonly url: string }
  /** `fallback` is an asset TOKEN, not a second URL. */
  | { readonly kind: 'binding'; readonly path: string; readonly fallback: string }

/** A node's background. For an image `fit` is required: a style has no defaults by construction. */
export type NodeBackground =
  | { readonly kind: 'color'; readonly color: ColorRef }
  | { readonly kind: 'gradient'; readonly gradient: GradientRef }
  | { readonly kind: 'image'; readonly source: ImageSource; readonly fit: 'cover' | 'contain' }

/** A border is the same on all sides. No field means no border (not a "transparent" one). */
export interface NodeBorder {
  readonly width: number
  readonly color: ColorRef
  /** The line (since 9.22.0): the one word `dashed`; no field and any other word is a solid border. */
  readonly style?: string
}

/**
 * The shared node style (since 9.0.0): the same on EVERY widget.
 *
 * The whole look of a box lives here and nowhere else: these fields are not in `props`. A node
 * without `style` has no background and no padding; the reader has no hidden defaults
 * (`x-style.hiddenDefaults: 'none'`).
 *
 * The key list is `NODE_STYLE_KEYS` below. A field not listed here came from a newer minor
 * version and is skipped (`unknownStyleField: 'ignore-field'`).
 */
export interface NodeStyle {
  /** Inherited down the tree. */
  readonly color?: ColorRef
  /** Inherited down the tree as a WHOLE, not field by field of the overrides. */
  readonly typography?: TypographyRef
  /**
   * Text emphasis (since 9.17.0): italic and line. Inherited by the same rule as colour and font
   * (each field separately), but read only by `Text` (`text-emphasis.ts`). The values are the
   * words `x-style.layout.textEmphasis.fontStyles` / `decorations`.
   */
  readonly fontStyle?: string
  readonly textDecoration?: string
  readonly padding?: BoxSpacing
  readonly margin?: BoxSpacing
  readonly width?: Dimension
  readonly height?: Dimension
  readonly minWidth?: Dimension
  readonly maxWidth?: Dimension
  readonly minHeight?: Dimension
  readonly maxHeight?: Dimension
  readonly radius?: BoxRadius
  readonly border?: NodeBorder
  readonly background?: NodeBackground
  readonly shadow?: ShadowRef
  /** The colour of the shadow (since 9.25.0): `background` — the hue of the own background. Not drawn by this version: the shadow keeps its own colour. */
  readonly shadowColor?: 'background'
  readonly opacity?: number
  /** Glass (since 9.20.0): a blur of what lies under the box, in logical pixels (a whole number 1..40). */
  readonly backdropBlur?: number
  /** A gradient on the glyphs of a text (since 9.23.0): read by `Text` only and not inherited. A gradient that does not resolve leaves the text its colour. */
  readonly textGradient?: GradientRef
}

export const NODE_STYLE_KEYS = [
  'color',
  'typography',
  'fontStyle',
  'textDecoration',
  'textGradient',
  'padding',
  'margin',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'radius',
  'border',
  'background',
  'shadow',
  'shadowColor',
  'opacity',
  'backdropBlur',
] as const satisfies readonly (keyof NodeStyle)[]

export interface StyleCase {
  readonly when: VisibilityCondition
  readonly style: NodeStyle
}

/**
 * A text field has three kinds, told apart by `kind`: a literal, a data path with a fallback text,
 * and (since 9.4.0) a template, i.e. a translatable string with named places `{name}` and a map
 * of values.
 */
export type BindableString =
  | { readonly kind: 'literal'; readonly value: string }
  | BindingString
  | TemplateString

/*
 * `format` says how to show the value: `date`, `dateTime`, `time` (since 8.20.0), `number`,
 * `currency`, `daysUntil` (since 9.4.0). The type here is `string` rather than a union of words,
 * ON PURPOSE: a document of a newer minor version may bring a format this reader does not know,
 * and the type must let it through, since the policy says to show the value as is rather than
 * crash. `currency` is an ISO 4217 code for the `currency` format.
 */
export interface BindingString {
  readonly kind: 'binding'
  readonly path: string
  readonly fallback: string
  readonly format?: string
  readonly currency?: string
}

/** Forms of a word next to a number, by CLDR plural category. `other` is always present. */
export interface PluralForms {
  readonly zero?: string
  readonly one?: string
  readonly two?: string
  readonly few?: string
  readonly many?: string
  readonly other: string
}

/** A template value: a binding (the same as for a standalone string) or a word that agrees with the number of the value `of`. */
export type TemplateValue = BindingString | { readonly kind: 'plural'; readonly of: string; readonly forms: PluralForms }

/** A template string (since 9.4.0). Allowed only where a string is text for a person. */
export interface TemplateString {
  readonly kind: 'template'
  readonly template: string
  readonly values: Readonly<Record<string, TemplateValue>>
}

export interface UiNode {
  readonly id: string
  readonly type: string
  readonly props: Readonly<Record<string, unknown>>
  readonly children?: readonly UiNode[]
  /*
   * The cross-cutting fields sit NEXT TO props rather than inside: they describe the node within
   * its PARENT, not the widget itself.
   */
  readonly visibleIf?: VisibilityCondition
  readonly style?: NodeStyle
  readonly styleWhen?: readonly StyleCase[]
  readonly fill?: true
  /** A share of the row width (since 8.17.0). Legal only in a row with a finite width. */
  readonly weight?: number
  /**
   * A layer's place in a stack (since 9.10.0): own alignment, offset, rotation. It arrives from the
   * network, hence `unknown`: only `layer-placement.ts` reads it.
   */
  readonly layer?: unknown
  /** Pull the node in the flow toward the start of the parent's main axis (since 9.10.0). `unknown`: only `layer-placement.ts` reads it. */
  readonly pull?: unknown
  /** Pin the node to the bottom of the screen (since 9.12.0). `unknown`: only `bottom-zone.ts` (`pinOf`) reads it; the word `bottom` or "no field". */
  readonly pin?: unknown
  /** The app bar zone a child of `AppBar` sits in (since 9.16.0). `unknown`: only `media-chrome.ts` (`barZoneOf`) reads it; the word `leading` or "no field". */
  readonly zone?: unknown
  /**
   * The width classes the node is shown on (since 9.18.0). `unknown`, since it arrives from the
   * network: only `width-class.ts` (`showOnOf`) reads it; if the field is absent or of the wrong
   * shape, the node is visible everywhere.
   */
  readonly showOn?: unknown
  /** Style overrides by width class (since 9.18.0). `unknown`: only `width-class.ts` (`styleOverrideOf`) reads it. */
  readonly styleOn?: unknown
  /** Prop overrides by width class (since 9.18.0). `unknown`: only `width-class.ts` (`propsOverrideOf`) reads it. */
  readonly propsOn?: unknown
  /** An endless motion of the node (since 9.20.0). `unknown`, since it arrives from the network: only `motion.ts` (`readMotion`) reads it; a form it does not know means the node stands still. */
  readonly motion?: unknown
  /** The feedback of a pressable node to the finger (since 9.25.0). `unknown`, since it arrives from the network: only `press-feedback.ts` reads it; the word `none` turns the feedback off, anything else is no field. */
  readonly pressFeedback?: unknown
  /** The look of an app bar while the body is scrolled (since 9.21.0). `unknown`, since it arrives from the network: only `app-bar-scrolled.ts` reads it; a form it does not know means the bar does not change. */
  readonly styleScrolled?: unknown
}

export type ScreenPresentation = 'page' | 'modal'

export interface ScreenEntry {
  readonly screenId: string
  readonly name: string
  readonly root: UiNode
  /** An absent value is read as `page`; the contract deliberately has no default. */
  readonly presentation?: ScreenPresentation
  /** Since 9.9.0: where a modal layer sits, `bottom` (a sheet) or `center` (a window). Read only for a modal screen; a sheet without the field. */
  readonly modalPlacement?: 'bottom' | 'center'
  /** Since 9.20.0: the blur of everything under a modal layer, in logical pixels (a whole number 1..40). Read only for a modal screen; on a page there is no layer to blur. */
  readonly backdropBlur?: number
  /** Since 9.9.0: a REQUEST about status bar icons. The reader does not touch the system bar; the request travels to the host in `onScreenChange`. */
  readonly statusBarIcons?: 'light' | 'dark'
  /** Since 9.26.0: `false` — the layer waits for an action inside it (no drag, no tap on the scrim, no Esc). Read only for a modal screen; without the field a person can dismiss it. */
  readonly dismissible?: false
}

export interface LocalizationSection {
  readonly defaultLocale: string
  readonly locales: readonly string[]
  /** Language to (PLACE key `screen/node/field` to text). */
  readonly strings: Readonly<Record<string, Readonly<Record<string, string>>>>
}

export interface UiDocument {
  readonly schemaVersion: string
  readonly documentId: string
  readonly name: string
  readonly initialScreenId: string
  readonly screens: readonly ScreenEntry[]
  readonly entryPoints?: Readonly<Record<string, string>>
  readonly localization?: LocalizationSection
}

/** Whether the renderer knows the type. Narrows a string to `WidgetType` without a cast. */
export function isKnownWidget(type: string): type is WidgetType {
  return (WIDGET_TYPES as readonly string[]).includes(type)
}
