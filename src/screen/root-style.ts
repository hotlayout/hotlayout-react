/** The inline style of the root element: what must not leak in from the host page and what must not leak out. */
import type { CSSProperties } from 'react'

/** Properties inherited from the host page that must not leak into the screen. */
export const ROOT_TEXT_RESET: CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  isolation: 'isolate',
  textAlign: 'start',
  textTransform: 'none',
  textIndent: 0,
  textShadow: 'none',
  whiteSpace: 'normal',
  wordSpacing: 'normal',
  fontStyle: 'normal',
  fontVariant: 'normal',
  listStyle: 'none',
  cursor: 'auto',
  visibility: 'visible',
  WebkitTextSizeAdjust: '100%',
}

/**
 * The root keeps its content to itself. A document node must not paint or catch a click outside the
 * root's rectangle: a wide button, a shadow, the 48 dp touch target (`hl-press::after`) or a negative
 * margin would otherwise lie on top of the host's UI and a click on a host button would go to the
 * document.
 *
 *  - `overflow: clip` clips painting AND hit testing at the root's edge without making it scrollable
 *    (unlike `hidden`), so `scrollIntoView` inside does not shift content under the clip;
 *  - `contain: layout paint` applies the same clipping to anything taken out of flow and makes the
 *    root its own containing block for `position: fixed`, so a descendant cannot attach itself to
 *    the host's viewport. `layout` also separates the screen's layout from the page: neither
 *    recalculates the other.
 *
 * A host that needs scrolling inside provides it itself (`style={{ overflow: 'auto' }}`): the host's
 * `style` is applied last, and the clipping from `contain` remains.
 */
export const ROOT_CONTAINMENT: CSSProperties = { overflow: 'clip', contain: 'layout paint' }
