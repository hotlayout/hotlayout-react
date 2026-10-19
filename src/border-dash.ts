/**
 * A dashed border (schema 9.22.0, `style.border.style: 'dashed'`). A mirror of the contract's
 * reference rule; the numbers of the block are checked against the artifact key
 * `x-style.layout.borderDash`, and the shared rows are
 * `contract/fixtures/border-dash/border-dash-cases.json`.
 *
 * Why numbers and not the browser's `border-style: dashed`: the browser fits the dashes to every
 * side by itself and breaks one at a corner, and Flutter has no dashed border at all, so three
 * readers would draw three patterns. Here the dash and the gap are fractions of the border WIDTH,
 * the line is the centre line of the border with arcs at the corners, and the count of dashes is
 * the perimeter over the step, rounded: the pattern closes without a seam and follows the arcs.
 *
 * How the web draws it: the border stays `Npx solid transparent` (the room is the same as for a
 * solid one), and the dashes are an image in `border-image` laid over the border box one to one
 * (a slice and a width of 50% put each quarter of the image on its corner of the box). The image
 * is an SVG with the centre-line path, so nothing is added to the markup and nothing is clipped by
 * the radius or by `overflow`. The box is measured (`render/dashed-border.tsx`), which is why the
 * server markup carries the transparent border and the dashes appear when the page is live.
 *
 * No React in this file: the server graph of the entry reads it too.
 */

/** The words of `style.border.style` this reader knows; any other word is a solid border. */
export const BORDER_STYLES = ['dashed'] as const

/** The dash and the gap, in border widths. */
export const BORDER_DASH = 3
export const BORDER_GAP = 2

/** The word of a border, or `undefined` for solid: no field, an unknown word, a border of another shape. */
export function borderStyleOf(border: unknown): 'dashed' | undefined {
  const value = typeof border === 'object' && border !== null ? (border as { readonly style?: unknown }).style : undefined
  return value === 'dashed' ? 'dashed' : undefined
}

/** `x-style.layout.borderDash` of the artifact, whole; a test compares the two. */
export const BORDER_DASH_RULES = {
  prop: 'style.border.style',
  words: [...BORDER_STYLES],
  dash: BORDER_DASH,
  gap: BORDER_GAP,
  unit: 'border-width',
  line: 'centre-line-of-the-border-half-a-width-inside-the-outer-edge',
  radii: 'outer-radii-scaled-down-as-css-does-when-they-do-not-fit-then-minus-half-a-width-not-below-zero',
  corners: 'dashes-follow-the-arcs',
  start: 'inline-start-end-of-the-top-straight-edge',
  direction: 'toward-the-inline-end',
  rightToLeft: 'mirrored',
  first: 'dash',
  fit: 'count-is-the-perimeter-over-dash-plus-gap-rounded-not-below-one-dash-and-gap-stretched-by-the-same-factor',
  room: 'same-as-a-solid-border',
  color: 'same-as-a-solid-border',
  everywhere: 'every-place-that-reads-style-border',
  unknownWord: 'solid',
  olderReader: 'solid',
  cases: 'contract/fixtures/border-dash/border-dash-cases.json',
} as const

export interface DashedRadii {
  readonly topStart: number
  readonly topEnd: number
  readonly bottomEnd: number
  readonly bottomStart: number
}

export interface DashedBox {
  /** The whole border box (the outer edge). */
  readonly width: number
  readonly height: number
  /** The width of the border. */
  readonly border: number
  /** The outer radii of the corners, logical. */
  readonly radii: DashedRadii
}

export interface DashedLine {
  /** The radii of the CENTRE line, logical. */
  readonly radii: DashedRadii
  /** The length of the centre line. */
  readonly perimeter: number
  readonly count: number
  /** The length of a dash and of a gap after fitting. */
  readonly dash: number
  readonly gap: number
}

/** The radii scaled down by one factor when two neighbours do not fit into a side (the rule of CSS). */
function fittedRadii(box: DashedBox): DashedRadii {
  const clamp = (value: number): number => Math.max(0, Number.isFinite(value) ? value : 0)
  const corners = { topStart: clamp(box.radii.topStart), topEnd: clamp(box.radii.topEnd), bottomEnd: clamp(box.radii.bottomEnd), bottomStart: clamp(box.radii.bottomStart) }
  const ratio = (side: number, a: number, b: number): number => (a + b > side ? side / (a + b) : 1)
  const factor = Math.min(
    ratio(box.width, corners.topStart, corners.topEnd),
    ratio(box.width, corners.bottomStart, corners.bottomEnd),
    ratio(box.height, corners.topStart, corners.bottomStart),
    ratio(box.height, corners.topEnd, corners.bottomEnd),
  )
  return { topStart: corners.topStart * factor, topEnd: corners.topEnd * factor, bottomEnd: corners.bottomEnd * factor, bottomStart: corners.bottomStart * factor }
}

/** The centre line of a dashed border and the fitted pattern. */
export function dashedLineOf(box: DashedBox): DashedLine {
  const border = Math.max(0, box.border)
  const outer = fittedRadii(box)
  const half = border / 2
  const radii = {
    topStart: Math.max(0, outer.topStart - half),
    topEnd: Math.max(0, outer.topEnd - half),
    bottomEnd: Math.max(0, outer.bottomEnd - half),
    bottomStart: Math.max(0, outer.bottomStart - half),
  }
  const inner = { width: Math.max(0, box.width - border), height: Math.max(0, box.height - border) }
  const sum = radii.topStart + radii.topEnd + radii.bottomEnd + radii.bottomStart
  const perimeter = Math.max(0, 2 * (inner.width + inner.height) - 2 * sum + (Math.PI / 2) * sum)
  const step = (BORDER_DASH + BORDER_GAP) * border
  if (!(step > 0) || !(perimeter > 0)) return { radii, perimeter, count: 0, dash: 0, gap: 0 }
  const count = Math.max(1, Math.round(perimeter / step))
  const stretch = perimeter / (count * step)
  return { radii, perimeter, count, dash: BORDER_DASH * border * stretch, gap: BORDER_GAP * border * stretch }
}

/**
 * The path of the centre line, from the logical start of the top straight edge toward the end of
 * the line, in the coordinates of the box, LEFT to right. Right-to-left writing mirrors what was
 * drawn: the drawn layer is flipped, the path is not rewritten. Only numbers of the rule enter it.
 */
export function dashedPathOf(box: DashedBox): string {
  const line = dashedLineOf(box)
  const half = Math.max(0, box.border) / 2
  const left = half
  const top = half
  const right = Math.max(half, box.width - half)
  const bottom = Math.max(half, box.height - half)
  const { topStart: a, topEnd: b, bottomEnd: c, bottomStart: d } = line.radii
  const n = (value: number): string => String(Math.round(value * 1000) / 1000)
  const arc = (r: number, x: number, y: number): string => (r > 0 ? `A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y)}` : `L${n(x)} ${n(y)}`)
  return [
    `M${n(left + a)} ${n(top)}`,
    `L${n(right - b)} ${n(top)}`,
    arc(b, right, top + b),
    `L${n(right)} ${n(bottom - c)}`,
    arc(c, right - c, bottom),
    `L${n(left + d)} ${n(bottom)}`,
    arc(d, left, bottom - d),
    `L${n(left)} ${n(top + a)}`,
    arc(a, left + a, top),
    'Z',
  ].join(' ')
}
