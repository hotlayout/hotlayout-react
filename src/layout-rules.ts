/** Layout as data: the mirror of `x-style.layout` of the schema artifact and the answers the renderer asks of it. */
import { PROP_BOUNDS, lookup, safeInteger } from './sanitize'
import type { UiNode } from './types'

/**
 * LAYOUT AS DATA: a mirror of `x-style.layout` from `screen-schema.json`.
 *
 * These are not style rules but "what exactly the policy names": phrases like "stretchable
 * content" or "tight slot" without an enumeration are an invitation to invent one, which
 * guarantees readers diverge. A test compares every constant below with the artifact.
 */

/** `Icon` glyph size -> font token whose FONT SIZE is the size (`iconGlyphMeasure: 'typography-font-size'`). */
export const ICON_GLYPH_TYPOGRAPHY: Readonly<Record<string, string>> = { sm: 'bodyS', md: 'titleM', lg: 'displayL' }

/**
 * Icon box (`x-style.layout.iconGlyphBox`, 9.1.0): as wide as the font token's FONT SIZE, as
 * tall as its LINE; the drawing is a font-size square in the center. This is how `glyphBox` in
 * `render/icon.tsx` draws it (the token's font on a flex box).
 */
export const ICON_GLYPH_BOX: Readonly<Record<'inline' | 'block', string>> = {
  inline: 'typography-font-size',
  block: 'typography-line-height',
}

/** Size when `props.size` is missing or unknown. */
export const DEFAULT_ICON_SIZE = 'md'

/** Icon size inside `ListTile`: the leading icon is the main one, the trailing is smaller. */
export const LIST_TILE_ICON_SIZES: Readonly<Record<string, string>> = { leadingIcon: 'md', trailingIcon: 'sm' }

/** Font token for a glyph of size `size`; an unknown size gives `DEFAULT_ICON_SIZE`. */
export function glyphTypographyOf(size: unknown): string {
  return lookup(ICON_GLYPH_TYPOGRAPHY, size) ?? lookup(ICON_GLYPH_TYPOGRAPHY, DEFAULT_ICON_SIZE) ?? 'titleM'
}

interface WidgetCondition {
  readonly type: string
  readonly when?: { readonly prop: string; readonly equals?: unknown; readonly defined?: boolean }
}

/**
 * Prop defaults that the conditions below refer to (`$defs.*Props` of the schema, key
 * `default`). A builder document carries them materialized, but a document assembled by other
 * means may omit them; then the FIELD default applies, not "did not match".
 */
export const PROP_DEFAULTS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  Button: { fullWidth: true },
  Divider: { orientation: 'horizontal' },
  Spacer: { orientation: 'horizontal' },
  Container: { direction: 'column' },
}

function matchesWidget(rule: WidgetCondition, node: UiNode): boolean {
  if (rule.type !== node.type) return false
  if (rule.when === undefined) return true
  const { prop, equals, defined } = rule.when
  const defaults = lookup(PROP_DEFAULTS, node.type)
  const value = lookup(node.props, prop) ?? (defaults === undefined ? undefined : lookup(defaults, prop))
  if (defined === true) return value !== undefined
  return value === equals
}

/**
 * Scrolling row (`x-style.layout.scrollableRow`).
 *
 * `childMaxWidth: 'max(row-viewport, own-width)'`: a child is no wider than the row's visible
 * area, BUT a larger own width is allowed, since a wide card in a strip is exactly the reason to
 * scroll.
 * `stretchToViewport` is the LIST of stretchable content that takes the width of that area (not
 * infinity): a full-width button, horizontal divider and `Spacer`, progress bar, grid. The other
 * children have their natural width.
 * `overflow: 'scroll-instead-of-clip'`: the row scrolls instead of clipping.
 */
export const SCROLLABLE_ROW: {
  readonly childMaxWidth: string
  readonly stretchToViewport: readonly WidgetCondition[]
  readonly overflow: string
} = {
  childMaxWidth: 'max(row-viewport, own-width)',
  stretchToViewport: [
    { type: 'Button', when: { prop: 'fullWidth', equals: true } },
    { type: 'Divider', when: { prop: 'orientation', equals: 'horizontal' } },
    { type: 'Spacer', when: { prop: 'orientation', equals: 'horizontal' } },
    { type: 'ProgressBar' },
    { type: 'Grid' },
  ],
  overflow: 'scroll-instead-of-clip',
}

/** Whether the node stretches to the visible area of a scrolling row. */
export function stretchesInScrollRow(node: UiNode): boolean {
  return SCROLLABLE_ROW.stretchToViewport.some((rule) => matchesWidget(rule, node))
}

/**
 * "Tight slot" (`x-style.layout.tightSlots`): a grid cell and an instance of a repeater that
 * lays its instances out as a grid (`columns` set). A repeater WITHOUT `columns` is an ordinary
 * column or row, not a tight slot: a node with its own size stays where the layout puts it.
 */
export const TIGHT_SLOTS: readonly WidgetCondition[] = [{ type: 'Grid' }, { type: 'Repeater', when: { prop: 'columns', defined: true } }]

/**
 * Who takes the NATURAL width in a tight slot (`x-style.layout.tightSlotNaturalWidth`,
 * `naturalWidthInTightSlot: 'natural-start-top'`): the same list as in a column,
 * `column.naturalWidth`. A badge in a grid cell is a content-sized pill at the logical start and
 * top, not a strip across the whole cell.
 */
export const TIGHT_SLOT_NATURAL_WIDTH = 'column.naturalWidth'

/** Whether this node makes its children "tight". */
export function makesTightSlots(node: Pick<UiNode, 'type' | 'props'>): boolean {
  return TIGHT_SLOTS.some((rule) => matchesWidget(rule, node as UiNode))
}

/**
 * COLUMN CHILD WIDTH (`x-style.layout.column`, `columnChildWidth: 'stretch-unless-natural'`).
 *
 * In a "column parent" (`parents`) a child gets a TIGHT width: the parent's content width minus
 * its own `margin` (`childWidth`). Only a node with its own `style.width` (`ownWidth`) and
 * widgets from the `naturalWidth` list take their natural width; they are no wider than the
 * parent (`naturalMaxWidth`) and are placed by the parent's cross alignment: its
 * `naturalWidthAlign.prop`, and for a parent without such a prop, `naturalWidthAlign.withoutProp`.
 * A stretched child that `maxWidth` made narrower than the parent is placed by THE SAME alignment
 * (`constrainedStretch`).
 *
 * A `Repeater` instance is NOT in the list of parents: it is always stretched.
 */
export const COLUMN_LAYOUT: {
  readonly childWidth: string
  readonly childWidthWithoutDefiniteParent: string
  readonly parents: readonly WidgetCondition[]
  readonly naturalWidth: readonly WidgetCondition[]
  readonly ownWidth: string
  readonly naturalMaxWidth: string
  readonly naturalWidthAlign: { readonly prop: string; readonly withoutProp: string }
  readonly constrainedStretch: string
} = {
  childWidth: 'parent-content-minus-own-margin',
  /*
   * A column whose parent gave no width (in a row without weight, in a scrolling row, a stack
   * layer without `fill`) is as wide as its widest NATURAL child, and stretched children align
   * to it. In CSS this happens by itself: a flex column with no set width has the content width.
   * In Flutter it takes two measuring passes.
   */
  childWidthWithoutDefiniteParent: 'widest-natural',
  parents: [
    { type: 'Screen' },
    { type: 'Column' },
    { type: 'Container', when: { prop: 'direction', equals: 'column' } },
    { type: 'Tab' },
    { type: 'Accordion' },
    { type: 'ChoiceGroup' },
  ],
  naturalWidth: [
    { type: 'Button', when: { prop: 'fullWidth', equals: false } },
    // 9.5.0: a row of the artifact mirror (`column.naturalWidth`).
    { type: 'IconButton' },
    { type: 'Badge' },
    { type: 'Icon' },
    { type: 'CircularProgress' },
    { type: 'Divider', when: { prop: 'orientation', equals: 'vertical' } },
    { type: 'Spacer', when: { prop: 'orientation', equals: 'vertical' } },
  ],
  ownWidth: 'natural-width',
  naturalMaxWidth: 'parent-content',
  naturalWidthAlign: { prop: 'align', withoutProp: 'start' },
  constrainedStretch: 'clamp-then-same-align',
}

const COLUMN_ALIGNS: readonly string[] = ['start', 'center', 'end']

/**
 * Cross alignment of a column parent, or `undefined` if the node is not a column parent. An
 * unknown prop value is read as "no prop".
 */
export function columnAlignOf(node: Pick<UiNode, 'type' | 'props'>): string | undefined {
  if (!COLUMN_LAYOUT.parents.some((rule) => matchesWidget(rule, node as UiNode))) return undefined
  const value = lookup(node.props, COLUMN_LAYOUT.naturalWidthAlign.prop)
  return typeof value === 'string' && COLUMN_ALIGNS.includes(value) ? value : COLUMN_LAYOUT.naturalWidthAlign.withoutProp
}

/** Whether a node in a column parent takes its natural width BY THE LIST. */
export function takesNaturalWidthInColumn(node: UiNode): boolean {
  return COLUMN_LAYOUT.naturalWidth.some((rule) => matchesWidget(rule, node))
}

/**
 * Built-in badge padding in spacing-scale steps (`x-style.layout.badgePadding`): vertical and
 * horizontal. The node's own `style.padding` overrides them.
 */
export const BADGE_PADDING: { readonly block: string; readonly inline: string } = { block: 'xs', inline: 'sm' }

/**
 * Built-in button geometry (`x-style.layout.buttonPadding`, `buttonTypography`, `buttonSize`):
 * padding in spacing-scale steps and the label's font token. The node's `style.padding` and
 * `style.typography` each override their own part. The button size is label plus padding plus
 * border: the reader adds no minimum size and no invisible touch padding.
 */
export const BUTTON_PADDING: { readonly block: string; readonly inline: string } = { block: 'sm', inline: 'md' }
export const BUTTON_TYPOGRAPHY = 'titleS'
export const BUTTON_SIZE = 'label-plus-padding-plus-border'

/**
 * BUTTON SIZES (9.5.0, `x-style.layout.buttonSizes`): padding in spacing-scale steps and the
 * label's font token for each `Button.size` word. `md` is exactly the button as it was before
 * 9.5.0 (`BUTTON_PADDING`, `BUTTON_TYPOGRAPHY`). With the built-in theme the height without a
 * border is 28 / 40 / 48: the label line plus two paddings.
 *
 * Tokens, not pixels: a client theme has its own scale, and the button follows it. The node's
 * own style is stronger, each field separately: `style.padding` overrides the size's padding,
 * `style.typography` the font (`roleSurfaceCss`).
 */
export interface ButtonSizeGeometry {
  readonly padding: { readonly block: string; readonly inline: string }
  readonly typography: string
}

export const BUTTON_SIZES: Readonly<Record<string, ButtonSizeGeometry>> = {
  sm: { padding: { block: 'xs', inline: 'md' }, typography: 'bodyM' },
  md: { padding: BUTTON_PADDING, typography: BUTTON_TYPOGRAPHY },
  lg: { padding: { block: 'md', inline: 'lg' }, typography: 'titleM' },
}

/** Button size without a `size` field or with an unknown word: `x-style.layout.defaultButtonSize`. */
export const DEFAULT_BUTTON_SIZE = 'md'

const FALLBACK_BUTTON_SIZE: ButtonSizeGeometry = { padding: BUTTON_PADDING, typography: BUTTON_TYPOGRAPHY }

/**
 * Geometry of a button of this size. The word is read by the table's OWN key: `size:
 * 'constructor'`, a number or an object means "size unknown", i.e. the default from contract
 * data, not a schema default (there deliberately is none in `$defs`).
 */
export function buttonGeometryOf(size: unknown): ButtonSizeGeometry {
  return lookup(BUTTON_SIZES, size) ?? lookup(BUTTON_SIZES, DEFAULT_BUTTON_SIZE) ?? FALLBACK_BUTTON_SIZE
}

/**
 * ICON BUTTON (9.5.0, `x-style.layout.iconButton`): a circle with a drawing in the center. The
 * sizes come from the same `BUTTON_SIZES` table: the content box is a square whose side is the
 * size's font LINE, the drawing is a square of its FONT SIZE, the padding is the button's
 * vertical padding of that size on all four sides, the radius is `pill`. So the side equals the
 * height of a button of the same size (28 / 40 / 48), and the border is added to it.
 */
export const ICON_BUTTON = {
  sizes: 'buttonSizes',
  contentBox: 'typography-line-height-square',
  glyph: 'typography-font-size',
  padding: 'buttonSizes.padding.block',
  radius: 'pill',
} as const

/** Built-in color of the trailing text of a list row and of the icon beside it: `x-style.layout.listTileTrailingColor`. */
export const LIST_TILE_TRAILING_COLOR = 'onSurface'

/**
 * ICON BESIDE TEXT (9.5.0, `x-style.layout.iconBesideText`): one rule for three places, the
 * button label, the badge label and the text of a list row's trailing slot.
 *
 *  - `gap` is the space between the icon box and the text, a spacing-scale step;
 *  - `crossAlign: 'center'`: the box's center is on the center of the text LINE;
 *  - `color: 'text'`: the color of the text beside it; the icon has no color of its own;
 *  - `order: 'logical'`: `start` comes before the text in the writing direction, `end` after.
 *    The row direction swaps the sides in RTL, not the reader;
 *  - `places.*.glyph`: the PLACE names the size; `'text'` means the font size and line of the
 *    text beside it (`textGlyphBox`), otherwise a step of the icon scale.
 */
export const ICON_BESIDE_TEXT = {
  gap: 'xs',
  crossAlign: 'center',
  color: 'text',
  order: 'logical',
  textGlyphBox: { inline: 'text-font-size', block: 'text-line-height' },
  defaultPosition: 'start',
  places: {
    Button: { text: 'label', icon: 'icon', position: 'iconPosition', glyph: 'text' },
    Badge: { text: 'label', icon: 'icon', position: 'iconPosition', glyph: 'text' },
    ListTile: { text: 'trailing.text', icon: 'trailing.icon', position: 'end', glyph: 'listTileIconSizes.trailingIcon' },
  },
} as const

export type IconPosition = 'start' | 'end'
export type IconTextPart = 'icon' | 'text'

/** Icon position after the default: no field, an unknown word or a non-string gives `defaultPosition`. */
export function iconPositionOf(position: unknown): IconPosition {
  return position === 'end' || position === 'start' ? position : ICON_BESIDE_TEXT.defaultPosition
}

/**
 * Whether there is an icon in this place. There is as soon as the field is NAMED, even with a
 * name the reader does not know or a non-string: then an empty box of the same size is drawn
 * and the gap stays (`unknownIconBesideText: 'empty-box-keeps-gap'`). "No icon" is only
 * `undefined` and `null`.
 */
export function hasIconBesideText(icon: unknown): boolean {
  return icon !== undefined && icon !== null
}

/** Order of parts IN THE WRITING DIRECTION, which is also the markup order. No icon means text only. */
export function iconBesideTextOrder(icon: unknown, position: unknown): readonly IconTextPart[] {
  if (!hasIconBesideText(icon)) return ['text']
  return iconPositionOf(position) === 'end' ? ['text', 'icon'] : ['icon', 'text']
}

/** Alignment of a button label: `x-style.layout.buttonLabelAlign`, centered, including a second line. */
export const BUTTON_LABEL_ALIGN = 'center'

/**
 * What cannot be heard or seen (`x-accessibleName`): whitespace and invisible characters:
 * format characters (U+200B, U+FEFF, U+00AD...), control characters, combining marks without a
 * base, and fillers (U+3164, U+2800...). `trim()` removes only the first; a string made of the
 * others gave a button with no name. The expression mirrors the artifact key.
 */
export const ACCESSIBLE_NAME = { silentCharacters: '[\\s\\p{Cf}\\p{Cc}\\p{Mn}\\p{Me}\\u3164\\u115F\\u1160\\uFFA0\\u2800]', flags: 'u' } as const
const SILENT_CHARACTERS = new RegExp(ACCESSIBLE_NAME.silentCharacters, `g${ACCESSIBLE_NAME.flags}`)

/** Whether a string is empty for a screen reader: nothing is left after removing the "silent" characters. */
export function isSilentText(text: string): boolean {
  return text.replace(SILENT_CHARACTERS, '') === ''
}

/**
 * Accessible name of an icon button (`iconButtonWithoutLabel: 'draw-and-name-by-icon'`). With
 * text, that text; if empty (whitespace too), the icon name in words with hyphens turned into
 * spaces (`chevron-left` -> "chevron left"). If the icon is not a string, empty: there is
 * nothing to name it by, and the button is still drawn and works.
 */
export function iconButtonNameOf(label: string, icon: unknown): string {
  if (!isSilentText(label)) return label
  return typeof icon === 'string' ? icon.replaceAll('-', ' ').trim() : ''
}

/**
 * ROW CHILD WITHOUT WEIGHT (`x-style.layout.row`; `unweightedRowChild:
 * 'natural-shrink-proportionally'`, `unweightedStretchInRow: 'share-of-one'`).
 *
 * `rigid` and `stretch` are REFERENCES to lists of this same block: who does not shrink
 * (`COLUMN_LAYOUT.naturalWidth`) and who takes the remainder without weight
 * (`SCROLLABLE_ROW.stretchToViewport`) as the share `stretchShare`.
 */
export const ROW_LAYOUT: {
  readonly unweightedWidth: string
  readonly shrink: string
  readonly rigid: string
  readonly ownWidth: string
  readonly stretch: string
  readonly stretchShare: number
  readonly shares: string
} = {
  unweightedWidth: 'single-line-content-max-row-content',
  shrink: 'proportional-to-natural-width',
  rigid: 'column.naturalWidth',
  ownWidth: 'named-overflows-row',
  stretch: 'scrollableRow.stretchToViewport',
  stretchShare: 1,
  shares: 'remainder-after-unweighted',
}

/**
 * The weight that is drawn (`invalidWeight: 'no-weight'`): a non-number, zero, negative or
 * NON-INTEGER (`1.5`, infinity) means NO weight and the node takes its own width. It is the only
 * bounded numeric field where "not a number" does not yield the lower bound. A positive integer
 * outside 1..4 is clamped (`literalOutOfRange: 'clamp'`): `weight: 7` is 4.
 *
 * A fractional weight is the easiest mistake for a web reader: CSS happily runs `flex: 1.5`,
 * while in Flutter `flex` is an integer, and the same document would split the row differently.
 */
export function weightOf(node: Pick<UiNode, 'weight'>): number | undefined {
  const weight: unknown = node.weight
  if (typeof weight !== 'number' || !Number.isInteger(weight) || weight <= 0) return undefined
  return safeInteger(weight, PROP_BOUNDS.weight[0], PROP_BOUNDS.weight[1])
}

/**
 * WHERE WEIGHT APPLIES: only in a row of FINITE width, i.e. `Row` without `wrap` and
 * `scrollable`, and `Container` with `direction: 'row'` (see the `weight` field description in
 * the schema). In a column there is nothing to divide, in a scroll the width is infinite, and a
 * wrapping row has no flex children. The validator rejects a weight outside such a parent; a
 * reader that receives such a document ignores it, the node is drawn at its own width and its
 * `style.width` applies.
 */
export function acceptsWeightedChildren(parent: Pick<UiNode, 'type' | 'props'>): boolean {
  if (parent.type === 'Row') return parent.props.wrap !== true && parent.props.scrollable !== true
  if (parent.type === 'Container') return parent.props.direction === 'row'
  return false
}

/**
 * WHAT ENTERS A ROW SHARE (`x-style.weightShareIncludes`): the node's own `margin`. The rest of
 * the row is divided by weights, and a share is the node's place TOGETHER with its margins; the
 * box is narrower than the share by its margins.
 */
export const WEIGHT_SHARE_INCLUDES = ['margin'] as const

/** Keys that set a "set box" for `sizedBoxOverflow`; `min...`/`max...` do not set a box. */
export const SIZED_BOX_KEYS = ['width', 'height'] as const

/** What counts toward size (`x-style.sizeIncludes`): `width`/`height` is the box together with border and padding. */
export const SIZE_INCLUDES = ['border', 'padding'] as const

/** Where `fill` applies (`x-style.fillScope`): only on direct children of `Stack`; elsewhere it is ignored (`fillOutsideStack: 'ignore'`). */
export const FILL_SCOPE = 'direct-children-of-stack'
