/**
 * A glyph's own size (schema 9.16.0).
 *
 * The `glyphSize` field of the Icon widget and of the icon button: a number of logical pixels.
 * The rules are contract data (`x-style.layout.ownGlyphSize`); the functions are the reference
 * implementation's, verbatim. The package imports nothing from the contract repository, so the rule is
 * written here a second time; the two copies are kept together by the `glyphCases` table in
 * `contract/fixtures/media-chrome/media-chrome-cases.json`.
 *
 * The number reaches a style ONLY through `ownGlyphSizeOf` (an integer in range) and `cssPx`: a
 * string, a fraction, infinity or an out-of-range number means "no field".
 */

export const GLYPH_SIZE_RANGE = { min: 8, max: 128 } as const

/** Mirror of `x-style.layout.ownGlyphSize`. */
export const OWN_GLYPH_SIZE = {
  field: 'glyphSize',
  on: ['Icon', 'IconButton'],
  unit: 'logical-pixels',
  range: GLYPH_SIZE_RANGE,
  overrides: ['size', 'style.typography'],
  glyph: 'square-of-the-number',
  align: 'center-of-the-content-box',
  icon: { box: 'square-of-the-number' },
  iconButton: { contentBox: 'square-of-the-number', padding: 'iconButton.padding', side: 'number-plus-padding-plus-border' },
  namedBox: 'glyph-not-larger-than-the-content-box-on-the-named-axis',
  textScale: 'not-applied',
  unreadable: 'no-field',
  before916: 'size-word',
} as const

/** The effective `glyphSize`: an integer in range, or nothing. */
export function ownGlyphSizeOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= GLYPH_SIZE_RANGE.min && value <= GLYPH_SIZE_RANGE.max ? value : undefined
}

export interface OwnGlyphInput {
  readonly glyphSize: unknown
  /** The resolved font token of the size word (or of a named `style.typography`); applies when there is no number. */
  readonly typography: { readonly fontSize: number; readonly lineHeight: number }
  /** Padding on both sides of the axis (the sum of the two) and the border width of one side. */
  readonly paddingInline: number
  readonly paddingBlock: number
  readonly borderWidth: number
  readonly width?: number | undefined
  readonly height?: number | undefined
}

export interface GlyphGeometry {
  readonly glyph: number
  readonly content: { readonly inline: number; readonly block: number }
  readonly box: { readonly inline: number; readonly block: number }
  readonly own: boolean
}

function glyphGeometry(input: OwnGlyphInput, wordContent: { readonly inline: number; readonly block: number }): GlyphGeometry {
  const own = ownGlyphSizeOf(input.glyphSize)
  const insetInline = input.paddingInline + 2 * input.borderWidth
  const insetBlock = input.paddingBlock + 2 * input.borderWidth
  const natural = own === undefined ? wordContent : { inline: own, block: own }
  const content = {
    inline: input.width === undefined ? natural.inline : Math.max(0, input.width - insetInline),
    block: input.height === undefined ? natural.block : Math.max(0, input.height - insetBlock),
  }
  const box = { inline: input.width ?? content.inline + insetInline, block: input.height ?? content.block + insetBlock }
  // The size word: the glyph is the font size, and a named box does not constrain it (as before 9.16.0).
  if (own === undefined) return { glyph: input.typography.fontSize, content, box, own: false }
  const glyph = Math.min(own, input.width === undefined ? own : content.inline, input.height === undefined ? own : content.block)
  return { glyph, content, box, own: true }
}

/** Box and glyph of the Icon widget: without a number, "font size by line height"; with a number, a square of that number. */
export function iconGeometryOf(input: OwnGlyphInput): GlyphGeometry {
  return glyphGeometry(input, { inline: input.typography.fontSize, block: input.typography.fontSize * input.typography.lineHeight })
}

/** Box and glyph of the icon button: without a number, a square the height of the font line; with a number, a square of that number plus the same padding. */
export function iconButtonGeometryOf(input: OwnGlyphInput): GlyphGeometry {
  const line = input.typography.fontSize * input.typography.lineHeight
  return glyphGeometry(input, { inline: line, block: line })
}
