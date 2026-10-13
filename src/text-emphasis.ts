/**
 * TEXT EMPHASIS (schema 9.17.0): italic, line and the weight of a part. A mirror of the
 * contract's reference implementation (the package does not import the builder's sources). The
 * two copies are held together by the shared `emphasis` / `emphasisStruts` tables in
 * `contract/fixtures/rich-text/rich-text-cases.json`, and the `x-style.layout.textEmphasis`
 * block is compared with the artifact for equality.
 *
 *  1. ON A NODE: `style.fontStyle` and `style.textDecoration`; inherited by the same rule as
 *     color and font, EACH FIELD SEPARATELY (`inheritTextEmphasis`), and read only by `Text`. It
 *     travels as a VALUE (the foreground context), not through the CSS cascade: an italic on a
 *     card wrapper would reach the buttons in it;
 *  2. ON A PART: the same two fields plus `weight` (a word; the number comes from `weights`);
 *     named part fields replace the text's fields, unnamed ones stay (`runEmphasisOf`);
 *  3. `normal` and `none` are real words: a descendant, a state and a part use them to CANCEL
 *     what is inherited. An unknown word (`overline`) means no field;
 *  4. EACH RUN DRAWS ITS OWN LINE, in that run's color: in CSS a paragraph's line runs through
 *     nested elements in the paragraph's color, and a descendant cannot cancel it.
 *
 * TRUST BOUNDARY. Only words from these lists reach the style, translated by the package's own
 * table (`emphasisCss`); a string from the document never reaches `style`. The module does not
 * import `react`.
 */

export const TEXT_FONT_STYLES = ['normal', 'italic'] as const
export type TextFontStyle = (typeof TEXT_FONT_STYLES)[number]

export const TEXT_DECORATIONS = ['none', 'underline', 'lineThrough'] as const
export type TextDecoration = (typeof TEXT_DECORATIONS)[number]

export const TEXT_SPAN_WEIGHTS = ['regular', 'medium', 'semibold', 'bold'] as const
export type TextSpanWeight = (typeof TEXT_SPAN_WEIGHTS)[number]

export const ROOT_FONT_STYLE: TextFontStyle = 'normal'
export const ROOT_DECORATION: TextDecoration = 'none'

/** Mirror of `x-style.layout.textEmphasis`. */
export const TEXT_EMPHASIS = {
  nodeKeys: ['fontStyle', 'textDecoration'],
  spanKeys: ['weight', 'fontStyle', 'textDecoration'],
  fontStyles: TEXT_FONT_STYLES,
  decorations: TEXT_DECORATIONS,
  root: { fontStyle: ROOT_FONT_STYLE, textDecoration: ROOT_DECORATION },
  inheritance: 'nearest-named-per-field',
  readers: ['Text'],
  unknownWord: 'field-not-applied',
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  spanWeight: 'over-typography',
  span: 'replaces-per-field',
  decorationColor: 'text-color-of-run',
  decorationSpans: 'run-text-only',
  decorationThickness: 'platform',
  decorationOffset: 'platform',
  decorationSkipInk: 'platform',
  missingFace: 'platform-synthesis',
  strut: 'unchanged',
  merge: 'by-place',
  heard: 'unchanged',
} as const

/** The slant word as the reader reads it: an unknown one means no field. */
export function readFontStyle(value: unknown): TextFontStyle | undefined {
  return typeof value === 'string' && (TEXT_FONT_STYLES as readonly string[]).includes(value) ? (value as TextFontStyle) : undefined
}

/** The line word as the reader reads it: an unknown one means no field. */
export function readDecoration(value: unknown): TextDecoration | undefined {
  return typeof value === 'string' && (TEXT_DECORATIONS as readonly string[]).includes(value) ? (value as TextDecoration) : undefined
}

/** The part weight word as the reader reads it: an unknown one means no field. */
export function readSpanWeight(value: unknown): TextSpanWeight | undefined {
  return typeof value === 'string' && Object.hasOwn(TEXT_EMPHASIS.weights, value) ? (value as TextSpanWeight) : undefined
}

/** The weight number for a word: what goes into `font-weight`. */
export function spanWeightNumber(weight: TextSpanWeight): number {
  return TEXT_EMPHASIS.weights[weight]
}

/** The emphasis in effect at a point of the tree: both words are always there; at the root they are `normal` and `none`. */
export interface TextEmphasis {
  readonly fontStyle: TextFontStyle
  readonly textDecoration: TextDecoration
}

export const ROOT_TEXT_EMPHASIS: TextEmphasis = { fontStyle: ROOT_FONT_STYLE, textDecoration: ROOT_DECORATION }

/** The emphasis in effect when ancestors named none: a context with no fields is the root. */
export function emphasisOfContext(context: { readonly fontStyle?: TextFontStyle | undefined; readonly textDecoration?: TextDecoration | undefined }): TextEmphasis {
  return { fontStyle: context.fontStyle ?? ROOT_FONT_STYLE, textDecoration: context.textDecoration ?? ROOT_DECORATION }
}

/**
 * INHERITANCE, each field separately, from the nearest ancestor that named it. Takes raw values:
 * the document may not have been assembled by the builder, and an unknown word must not erase
 * what is inherited.
 */
export function inheritTextEmphasis(parent: TextEmphasis, style: { readonly fontStyle?: unknown; readonly textDecoration?: unknown } | undefined): TextEmphasis {
  const fontStyle = readFontStyle(style?.fontStyle)
  const textDecoration = readDecoration(style?.textDecoration)
  if (fontStyle === undefined && textDecoration === undefined) return parent
  return { fontStyle: fontStyle ?? parent.fontStyle, textDecoration: textDecoration ?? parent.textDecoration }
}

/** Emphasis of one RUN of composed text. */
export interface RunEmphasis extends TextEmphasis {
  /** The weight number the part named by a word; `undefined` means the run's font style gives the weight. */
  readonly fontWeight: number | undefined
}

/** Emphasis of a part laid over the text's emphasis; `span: undefined` is the base run. */
export function runEmphasisOf(text: TextEmphasis, span: { readonly weight?: unknown; readonly fontStyle?: unknown; readonly textDecoration?: unknown } | undefined): RunEmphasis {
  const weight = readSpanWeight(span?.weight)
  return { ...inheritTextEmphasis(text, span), fontWeight: weight === undefined ? undefined : spanWeightNumber(weight) }
}

/** Whether the emphasis equals what applies with no field at all (the root): then the run need not be wrapped. */
export function isRootEmphasis(emphasis: RunEmphasis | TextEmphasis): boolean {
  return emphasis.fontStyle === ROOT_FONT_STYLE && emphasis.textDecoration === ROOT_DECORATION && !('fontWeight' in emphasis && emphasis.fontWeight !== undefined)
}

/** Words -> CSS values. The package's table, not the document's: a string from the network never reaches it. */
const DECORATION_CSS: Readonly<Record<TextDecoration, string | undefined>> = { none: undefined, underline: 'underline', lineThrough: 'line-through' }

export interface EmphasisCss {
  fontStyle?: 'italic'
  textDecorationLine?: string
  fontWeight?: number
}

/**
 * CSS of one run: only what differs from the root (`normal`, `none`, the weight of the font
 * style), since neither the paragraph nor its ancestors carry italics or a line. The weight goes
 * AFTER the full font properties: the `font` shorthand resets the weight.
 */
export function emphasisCss(emphasis: RunEmphasis | TextEmphasis): EmphasisCss {
  const css: EmphasisCss = {}
  if (emphasis.fontStyle === 'italic') css.fontStyle = 'italic'
  const line = DECORATION_CSS[emphasis.textDecoration]
  if (line !== undefined) css.textDecorationLine = line
  if ('fontWeight' in emphasis && emphasis.fontWeight !== undefined) css.fontWeight = emphasis.fontWeight
  return css
}
