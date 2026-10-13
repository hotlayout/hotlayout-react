/**
 * The parts of a list row (schema 9.19.0): the limit of lines of the title and the subtitle, the tile
 * under the leading icon, the column of the trailing part (text over a caption), and who is drawn in
 * which colour and typography. Rules: the artifact block `x-style.layout.listTileParts`, mirrored
 * below whole; the shared rows are `contract/fixtures/list-tile/list-tile-cases.json`.
 *
 * Everything here is optional and has no default in the schema: a row without the new fields is
 * drawn exactly as before 9.19.0. This module holds the REFERENCE-LEVEL answers (a token, a number of
 * pixels); the row turns them into CSS in `render/list-tile.tsx`.
 */
import { isRecord } from './sanitize'
import { readColorRef, readPartStyle, readRadiusRef, resolvePartStyle } from './part-style'
import { SECONDARY_PART_OPACITY, withColorOpacity } from './style'
import type { TextStyleContext } from './style'
import type { ColorRef, RadiusRef, TypographyRef } from './types'

/* ───────────────────────── the limit of lines ───────────────────────── */

export const LIST_TILE_LINES_MIN = 1
export const LIST_TILE_LINES_MAX = 5

/** The limit of lines the reader understands: a whole number in 1…5; anything else — no limit. */
export function listTileLinesOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= LIST_TILE_LINES_MIN && value <= LIST_TILE_LINES_MAX ? value : undefined
}

/** How many lines of a text are drawn: the natural number cut by the limit. */
export function listTileShownLines(naturalLines: number, limit: unknown): { readonly lines: number; readonly cut: boolean } {
  const max = listTileLinesOf(limit)
  return max === undefined || naturalLines <= max ? { lines: naturalLines, cut: false } : { lines: max, cut: true }
}

/* ───────────────────────── the tile under the icon ───────────────────────── */

export const LEADING_TILE_SIZE = 40
export const LEADING_TILE_SIZE_MIN = 24
export const LEADING_TILE_SIZE_MAX = 96
export const LEADING_TILE_RADIUS = 'sm'

export interface LeadingTileLook {
  readonly color: ColorRef
  readonly radius: RadiusRef
  readonly size: number
}

/**
 * The tile the reader draws: its colour must be readable (without it there is no tile — there is
 * nothing to paint it with); a radius or a side of the wrong form is the default.
 */
export function leadingTileOf(leading: unknown): LeadingTileLook | undefined {
  if (!isRecord(leading) || leading.kind !== 'icon' || !isRecord(leading.tile)) return undefined
  const color = readColorRef(leading.tile.color)
  if (color === undefined) return undefined
  const size = leading.tile.size
  return {
    color,
    radius: readRadiusRef(leading.tile.radius) ?? LEADING_TILE_RADIUS,
    size: typeof size === 'number' && Number.isInteger(size) && size >= LEADING_TILE_SIZE_MIN && size <= LEADING_TILE_SIZE_MAX ? size : LEADING_TILE_SIZE,
  }
}

export interface LeadingBox {
  readonly inline: number
  readonly block: number
  /** The offset of the glyph from the start and the top of the box: the glyph in the centre of the tile. */
  readonly glyphInline: number
  readonly glyphBlock: number
}

/** The box of the leading icon: the box of the glyph, or the square of the tile with the glyph in its centre (clipped by the tile when larger). */
export function leadingIconBoxOf(leading: unknown, glyph: { readonly inline: number; readonly block: number }): LeadingBox {
  const tile = leadingTileOf(leading)
  if (tile === undefined) return { inline: glyph.inline, block: glyph.block, glyphInline: 0, glyphBlock: 0 }
  return { inline: tile.size, block: tile.size, glyphInline: (tile.size - glyph.inline) / 2, glyphBlock: (tile.size - glyph.block) / 2 }
}

/* ───────────────────────── the trailing column ───────────────────────── */

/** The column of the trailing part: the text line over the caption, both pressed to the END of the row. */
export function trailingColumnOf(input: { readonly textInline: number; readonly textLine: number; readonly caption?: { readonly inline: number; readonly line: number } | undefined }): {
  readonly inline: number
  readonly block: number
  readonly textStart: number
  readonly captionStart: number | undefined
} {
  const caption = input.caption
  const inline = Math.max(input.textInline, caption?.inline ?? 0)
  return {
    inline,
    block: input.textLine + (caption?.line ?? 0),
    textStart: inline - input.textInline,
    captionStart: caption === undefined ? undefined : inline - caption.inline,
  }
}

/** The height of the content of the row: the tallest of its three columns. */
export function listTileContentBlockOf(columns: { readonly leading: number; readonly body: number; readonly trailing: number }): number {
  return Math.max(columns.leading, columns.body, columns.trailing)
}

export interface RowColumn {
  readonly inline: number
  readonly block: number
}
export interface RowRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * The three columns of the row: the leading and the trailing take their own width, the texts take the rest
 * (not less than zero); each is centred on the height of the row. `x` is from the LEFT edge of the content,
 * and the row is mirrored whole in a right-to-left screen.
 */
export function listTileRowRects(input: {
  readonly rowInline: number
  readonly gap: number
  readonly leading?: RowColumn | undefined
  readonly trailing?: RowColumn | undefined
  readonly bodyBlock: number
  readonly direction: 'ltr' | 'rtl'
}): { readonly block: number; readonly leading: RowRect | undefined; readonly body: RowRect; readonly trailing: RowRect | undefined } {
  const { rowInline, gap, leading, trailing, bodyBlock } = input
  const block = listTileContentBlockOf({ leading: leading?.block ?? 0, body: bodyBlock, trailing: trailing?.block ?? 0 })
  const before = leading === undefined ? 0 : leading.inline + gap
  const after = trailing === undefined ? 0 : trailing.inline + gap
  const bodyInline = Math.max(0, rowInline - before - after)
  const place = (start: number, column: RowColumn): RowRect => ({
    x: input.direction === 'rtl' ? rowInline - start - column.inline : start,
    y: (block - column.block) / 2,
    width: column.inline,
    height: column.block,
  })
  return {
    block,
    leading: leading === undefined ? undefined : place(0, leading),
    body: place(before, { inline: bodyInline, block: bodyBlock }),
    trailing: trailing === undefined ? undefined : place(before + bodyInline + gap, trailing),
  }
}

/* ───────────────────────── who is drawn in which colour ───────────────────────── */

export interface PartLook {
  readonly color: ColorRef
  readonly typography: TypographyRef
}

/** The built-in look of the parts the minor gave a style of their own. */
export const LIST_TILE_PART_DEFAULTS = {
  leadingIcon: { color: 'primary' },
  trailingText: { color: 'onSurface', typography: 'bodyM' },
  caption: { color: 'muted', typography: 'bodyS' },
} as const

type Condition = (condition: never) => boolean

/**
 * The trailing text: the colour is the state of the part, its style, the named colour of the node (with
 * its own state), the built-in `onSurface`; the typography is the state, the style, the built-in `bodyM`.
 */
export function trailingTextLookOf(trailing: unknown, context: TextStyleContext, isMet: Condition): PartLook {
  const slot = isRecord(trailing) ? trailing : {}
  const own = resolvePartStyle(slot.style, slot.styleWhen, isMet)
  return {
    color: own?.color ?? (context.colorNamed ? context.color : LIST_TILE_PART_DEFAULTS.trailingText.color),
    typography: own?.typography ?? LIST_TILE_PART_DEFAULTS.trailingText.typography,
  }
}

/** The caption under the trailing text: its own style, else the named colour of the node with the secondary opacity, else the built-in `muted`. The style of the text does not reach it. */
export function trailingCaptionLookOf(trailing: unknown, context: TextStyleContext, isMet: Condition): PartLook {
  const slot = isRecord(trailing) ? trailing : {}
  const own = resolvePartStyle(slot.captionStyle, slot.captionStyleWhen, isMet)
  return {
    color: own?.color ?? (context.colorNamed ? withColorOpacity(context.color, SECONDARY_PART_OPACITY) : LIST_TILE_PART_DEFAULTS.caption.color),
    typography: own?.typography ?? LIST_TILE_PART_DEFAULTS.caption.typography,
  }
}

/** The leading icon: its own colour, the named colour of the node, the built-in `primary`. The colour of the tile is not the colour of the icon. */
export function leadingIconColorOf(leading: unknown, context: TextStyleContext): ColorRef {
  const own = isRecord(leading) && leading.kind === 'icon' ? readPartStyle({ color: leading.color })?.color : undefined
  return own ?? (context.colorNamed ? context.color : LIST_TILE_PART_DEFAULTS.leadingIcon.color)
}

/** The block `x-style.layout.listTileParts` of the artifact, whole (a test compares it). */
export const LIST_TILE_PARTS_LAYOUT = {
  trailing: {
    appliesTo: 'trailing-of-kind-text',
    style: 'trailing.style',
    styleWhen: 'trailing.styleWhen',
    reads: ['trailingText', 'trailingIcon'],
    icon: 'takes-the-colour-of-the-text-its-size-stays-listTileIconSizes.trailingIcon',
    defaults: {
      color: 'onSurface',
      typography: 'bodyM',
    },
    strongerThan: 'the-named-colour-of-the-node-and-its-states',
    lines: 'one-not-wrapped',
  },
  caption: {
    prop: 'trailing.caption',
    style: 'trailing.captionStyle',
    styleWhen: 'trailing.captionStyleWhen',
    defaults: {
      color: 'muted',
      typography: 'bodyS',
    },
    emphasis: 'secondary',
    namedColor: 'the-named-colour-of-the-node-with-the-secondary-opacity',
    styleOfTheText: 'not-applied-to-the-caption',
    lines: 'one-not-wrapped',
    empty: 'no-line-takes-no-space',
    translated: 'like-every-text-of-the-row',
    styleWithoutCaption: {
      reader: 'not-read',
      document: 'not-published',
    },
  },
  column: {
    order: 'text-line-above-caption',
    crossAlign: 'end',
    gap: 'none',
    inline: 'the-wider-of-the-two-lines',
    block: 'sum-of-the-two-lines',
    inRow: 'centred-like-every-column-of-the-row',
    shrinks: 'never-the-texts-of-the-row-give-way',
  },
  maxLines: {
    title: 'titleMaxLines',
    subtitle: 'subtitleMaxLines',
    min: 1,
    max: 5,
    absent: 'wraps-without-a-limit',
    outOfRange: 'no-limit',
    over: 'cut-with-an-ellipsis-at-the-end-of-the-last-line',
    ellipsis: '…',
    ellipsisSide: 'logical-end-by-the-direction-of-the-screen',
    heard: 'the-whole-text',
    subtitleWithoutSubtitle: 'not-read',
  },
  leading: {
    appliesTo: 'leading-of-kind-icon',
    color: {
      prop: 'leading.color',
      reads: 'leadingIcon',
      default: 'primary',
      strongerThan: 'the-named-colour-of-the-node-and-its-states',
      states: 'none',
    },
    tile: {
      prop: 'leading.tile',
      shape: 'square',
      size: {
        prop: 'size',
        default: 40,
        min: 24,
        max: 96,
        outOfRange: 'default',
      },
      radius: {
        prop: 'radius',
        default: 'sm',
        circle: 'pill',
      },
      background: {
        prop: 'color',
        unreadable: 'no-tile-the-icon-as-without-the-field',
        unknownToken: 'the-box-stays-without-a-background',
      },
      glyph: {
        size: 'unchanged-listTileIconSizes.leadingIcon',
        place: 'centre-of-the-tile',
        overflow: 'clipped-by-the-tile',
      },
      inRow: 'takes-the-place-of-the-icon-the-gap-is-unchanged',
      fontScale: 'the-tile-does-not-grow-the-glyph-does',
    },
  },
  padding: 'style.padding-of-the-node-like-every-node-no-own-field',
  olderReader: 'skips-the-fields-and-draws-the-row-with-the-built-in-look',
  cases: 'contract/fixtures/list-tile/list-tile-cases.json',
} as const
