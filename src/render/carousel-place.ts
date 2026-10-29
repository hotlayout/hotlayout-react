/**
 * The place of a carousel row in its parent.
 *
 * A carousel is drawn as a shell (the scrolling row plus its dots) around the scrolling element,
 * and the shell is the outermost element of the node. What decides the node's place in its parent
 * therefore goes on the shell: its own width and limits, its margins, the share of a weighted row,
 * the self-alignment of a tight slot and the place of a stack layer (offset, rotation). Everything
 * else (padding, background, border, radius, shadow, opacity, overflow) is the look of the box and
 * stays on the scrolling row, where the padding lies inside the scroll.
 */
import type { CSSProperties } from 'react'

const PLACE_KEYS: ReadonlySet<string> = new Set([
  'width',
  'minWidth',
  'maxWidth',
  'inlineSize',
  'minInlineSize',
  'maxInlineSize',
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'alignSelf',
  'justifySelf',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'rotate',
  'zIndex',
  'gridArea',
  'order',
  'pointerEvents',
])

function isPlaceKey(key: string): boolean {
  return PLACE_KEYS.has(key) || key.startsWith('margin') || key.startsWith('inset')
}

/** Split the node CSS into the place (for the shell) and the box look (for the scrolling row). */
export function splitCarouselPlace(css: CSSProperties): { readonly place: CSSProperties; readonly box: CSSProperties } {
  const place: Record<string, unknown> = {}
  const box: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(css)) {
    if (isPlaceKey(key)) place[key] = value
    else box[key] = value
  }
  return { place, box }
}

/** Whether the place names an own width (then the shell does not stretch to the parent). */
export function namesOwnWidth(place: CSSProperties): boolean {
  return place.width !== undefined || place.inlineSize !== undefined || place.flex !== undefined || place.flexBasis !== undefined
}
