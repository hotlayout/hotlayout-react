/** The layers of the stack: the page layer, the modal layer with its dialog behaviour, and their built-in styles. */
import { useEffect, useRef } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from 'react'

import { backdropFilterCss } from '../backdrop-blur'
import { MODAL_WINDOW_MAX_WIDTH } from '../media-chrome'
import { spacingMathCss } from '../resolve'
import { productVar } from '../theme'
import type { Theme } from '../theme'
import { useSheetDrag } from './use-sheet-drag'
import { WIDE_MODAL_MAX_HEIGHT_SHARE, WIDE_MODAL_MAX_WIDTH } from '../wide-modal'
import type { ModalShape } from '../wide-modal'
const MODAL_SCRIM = 'rgba(0, 0, 0, 0.45)'

/**
 * The page layer. After a transition made by the user, the new screen takes focus: the button that
 * had it disappeared with the old screen, and without this focus would fall to `<body>`, the next
 * Tab would start from the top of the HOST page, and a screen reader would not announce the change.
 */
export function PageLayer({ screenId, takeFocus, ownHeight, children }: { readonly screenId: string; readonly takeFocus: boolean; readonly ownHeight: boolean; readonly children: ReactNode }): ReactNode {
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (takeFocus) layer.current?.focus({ preventScroll: true })
    // Only when the layer appears: re-rendering the same screen does not touch focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div ref={layer} tabIndex={-1} data-hl-screen={screenId} data-hl-presentation="page" style={ownHeight ? PAGE_LAYER_OWN_HEIGHT : PAGE_LAYER}>
      {children}
    </div>
  )
}

/** Variable on the modal layer: the height of the part of the block VISIBLE in the viewport (`useVisiblePartHeight`). Our own, not a theme token. */
const VISIBLE_HEIGHT_VAR = '--hl-visible-h'

/**
 * Tracks the visible part of the block. A block that grows with the page may start below the top of
 * the viewport (a site header above it) or end above its bottom; the layer area is the intersection
 * of the block and the viewport. A sticky area (`top: 0`) provides the top edge, and the observer
 * writes the height here for the two edges where it is smaller than the viewport:
 * `min(block bottom, viewport height) - max(block top, 0)`. In the middle of the block it equals the
 * viewport, and the sticky area scrolls with the page without any JS. Without a measurement
 * (server, first frame) the variable is absent and the height is `min(viewport, block)`.
 */
function useVisiblePartHeight(layer: RefObject<HTMLDivElement | null>, enabled: boolean): void {
  useEffect(() => {
    const element = layer.current
    const view = element?.ownerDocument.defaultView ?? null
    if (!enabled || element === null || view === null) return undefined
    let frame = 0
    const write = (): void => {
      frame = 0
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 && rect.height <= 0) return
      const height = Math.min(rect.bottom, view.innerHeight) - Math.max(rect.top, 0)
      element.style.setProperty(VISIBLE_HEIGHT_VAR, `${String(Math.max(0, Math.round(height)))}px`)
    }
    const schedule = (): void => {
      if (frame === 0) frame = view.requestAnimationFrame(write)
    }
    write()
    // Scrolling of any ancestor (the host page or its own scroll area) arrives in the capture phase.
    view.addEventListener('scroll', schedule, { capture: true, passive: true })
    view.addEventListener('resize', schedule, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
    observer?.observe(element)
    return () => {
      if (frame !== 0) view.cancelAnimationFrame(frame)
      view.removeEventListener('scroll', schedule, { capture: true })
      view.removeEventListener('resize', schedule)
      observer?.disconnect()
      element.style.removeProperty(VISIBLE_HEIGHT_VAR)
    }
  }, [layer, enabled])
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * The modal layer (since 9.9.0, `x-style.layout.modalLayer`): a scrim over the whole area the host
 * gave the screen, and a sheet or window inside it.
 *
 *  - `bottom` (the default, also used for a word from a newer minor) is a sheet: full width of the
 *    area, pinned to the bottom;
 *  - `center` is a window: width = area minus the `xl` margin on each side, at most 400, centred on
 *    both axes; height follows the content, at most the available height (area minus the same
 *    margin top and bottom).
 *
 * The area is the one the host gave the screen (the package root): the reader neither adds nor
 * subtracts a safe area. Content is measured at the width of the LAYER, not the area. The layer has
 * no built-in look (`modalLayerLook`): background, radius, shadow and margins come from the `style`
 * of the screen root, and a root without a background gives a transparent layer. Content taller than
 * the available height scrolls in the layer BODY; the layer's app bar stays put (`ScreenRootView`).
 *
 * Dialog behaviour (WAI-ARIA "Dialog (Modal)"):
 *  - on appearance focus moves to the sheet; on removal it returns to whatever opened the modal
 *    (if it is still on the page);
 *  - Tab and Shift+Tab cycle INSIDE a dismissible sheet (Esc is the way out); a sheet that cannot be
 *    dismissed lets Tab leave unless the host sets `trapFocus`;
 *  - Esc dismisses, with the same `navigate.back` as a tap on the scrim;
 *  - layers below the modal become `inert`: they stay visible (that is what `modal` means), but
 *    neither the keyboard nor a screen reader reaches them.
 *
 * `inert` is set by an effect, not a prop: React 18 does not know the attribute and warns in the
 * console, while React 19 does, so a prop would behave differently across versions.
 */
export function ModalLayer({
  screenId,
  name,
  placement,
  shape,
  theme,
  ownHeight,
  backdropBlur,
  dismissible,
  trapFocus,
  onDismiss,
  children,
}: {
  readonly screenId: string
  readonly name: string
  readonly placement: 'bottom' | 'center'
  /** How the layer is shown: a sheet, a `center` window, or a sheet that became a window on a wide screen (since 9.18.0). */
  readonly shape: ModalShape
  /** Theme: the margins of a sheet-window are computed from its numbers (CSS math). */
  readonly theme: Theme
  /** `scroll="screen"`: the host gave the block a height, so the layer area is the whole block. Otherwise it is the visible part of the block. */
  readonly ownHeight: boolean
  /** Blur of everything under the layer (since 9.20.0), a validated radius; absent means only the scrim. */
  readonly backdropBlur?: number | undefined
  /** `false` (9.26.0): the layer waits for an action inside it - no drag down, no tap on the scrim, no Esc. */
  readonly dismissible: boolean
  /** Host decision (`trapFocus`): Tab never leaves the layer. Without it only a dismissible layer cycles Tab, and Tab may always leave a layer with nothing to focus. */
  readonly trapFocus: boolean
  readonly onDismiss: () => void
  readonly children: ReactNode
}): ReactNode {
  const sheet = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  useVisiblePartHeight(layer, !ownHeight)
  // Only a sheet from the bottom follows the finger; a window is not tied to an edge.
  useSheetDrag(sheet, layer, dismissible && shape === 'sheet', onDismiss)

  useEffect(() => {
    const node = sheet.current
    if (node === null) return undefined
    const opener = node.ownerDocument.activeElement
    const below: Element[] = []
    for (let layer = node.closest('[data-hl-presentation="modal"]')?.previousElementSibling ?? null; layer !== null; layer = layer.previousElementSibling) {
      if (!layer.hasAttribute('data-hl-screen') || layer.hasAttribute('inert')) continue
      layer.setAttribute('inert', '')
      below.push(layer)
    }
    node.focus({ preventScroll: true })
    return () => {
      for (const layer of below) layer.removeAttribute('inert')
      if (opener !== null && opener.isConnected && 'focus' in opener) (opener as HTMLElement).focus({ preventScroll: true })
    }
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      // A layer that waits for an action ignores Esc and leaves it to the host.
      if (!dismissible) return
      event.stopPropagation()
      onDismiss()
      return
    }
    if (event.key !== 'Tab') return
    // A layer that waits for an action and a host that did not ask for a trap leave Tab alone: the person must be able to reach the host page.
    if (!dismissible && !trapFocus) return
    const node = sheet.current
    if (node === null) return
    const stops = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = stops[0]
    const last = stops[stops.length - 1]
    const active = node.ownerDocument.activeElement
    if (first === undefined || last === undefined) {
      if (trapFocus) event.preventDefault()
      return
    }
    if (event.shiftKey && (active === first || active === node)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div ref={layer} data-hl-screen={screenId} data-hl-presentation="modal" data-hl-placement={placement} data-hl-shape={shape} style={MODAL_LAYER} onKeyDown={onKeyDown}>
      {/* The blur lies over every layer below (with its app bar and navigation bar) and under the scrim: the same area, the blur first. The layer itself is above both. */}
      {backdropBlur === undefined ? null : <div aria-hidden="true" data-hl-backdrop-blur={String(backdropBlur)} style={{ ...MODAL_BLUR_STYLE, ...backdropFilterCss(backdropBlur) }} />}
      <div aria-hidden="true" data-hl-scrim="" style={MODAL_SCRIM_STYLE} onClick={dismissible ? onDismiss : undefined} />
      {/* Layer area: the whole block (own height) or its VISIBLE part, sticky, without `position: fixed`. */}
      <div data-hl-layer-area={ownHeight ? 'block' : 'visible'} style={{ ...(ownHeight ? MODAL_AREA_BLOCK : MODAL_AREA_VISIBLE), ...(shape === 'sheet' ? MODAL_AREA_BOTTOM : MODAL_AREA_CENTER) }}>
        <div ref={sheet} role="dialog" aria-modal="true" aria-label={name} tabIndex={-1} style={shape === 'window' ? MODAL_WINDOW : shape === 'sheetWindow' ? modalSheetWindow(theme) : MODAL_SHEET}>
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * The page layer fills the root so the screen background reaches its bottom. EVERY stack layer is
 * its own stacking context (`isolation: isolate`): a `z-index` inside a page (app bar, pulled-up
 * body) cannot lift its parts above a modal layer higher in the stack.
 */
const PAGE_LAYER: CSSProperties = { display: 'flex', flexDirection: 'column', flex: '1 0 auto', minInlineSize: 0, isolation: 'isolate' }
/** `scroll="screen"`: the layer has the root's height and does not grow past it; the screen body scrolls, not the layer. Basis `auto`: a root without a set height stays as tall as its content. */
const PAGE_LAYER_OWN_HEIGHT: CSSProperties = { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minInlineSize: 0, minBlockSize: 0, isolation: 'isolate' }
/** The modal layer covers the whole block (scrim) and is itself a stacking context above the whole page, app bar included. */
const MODAL_LAYER: CSSProperties = { position: 'absolute', inset: 0, isolation: 'isolate' }
/**
 * The layer area when the host gave the block a height: the whole block. It lies ABOVE the scrim and
 * covers it entirely, so without `pointer-events: none` a tap beside the window would land on the
 * area instead of the scrim and "tap the scrim to dismiss" would not work in a browser (jsdom does
 * no hit testing, so `fireEvent.click` on the scrim hides this). Only the sheet (`MODAL_SHEET`)
 * catches taps.
 */
const MODAL_AREA_BLOCK: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }
/**
 * The layer area when the block grows with the page: the VISIBLE part of the block, no taller than
 * the viewport. A sticky area at the top of the viewport, `min(viewport, block)` tall;
 * `position: fixed` is not used because the root clips its content (trust boundary). A sheet sits
 * on the bottom edge of this area, a window in its centre.
 */
const MODAL_AREA_VISIBLE: CSSProperties = { position: 'sticky', insetBlockStart: 0, blockSize: `var(${VISIBLE_HEIGHT_VAR}, min(100dvh, 100%))`, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }
const MODAL_AREA_BOTTOM: CSSProperties = { justifyContent: 'flex-end' }
/** Window: `xl` margin on all sides (`modalLayer.center.margin`), centred on both axes. */
const MODAL_AREA_CENTER: CSSProperties = { alignItems: 'center', justifyContent: 'center', padding: productVar('spacing', 'xl') }
/** The blur layer has the area of the scrim and catches nothing: a tap beside the layer lands on the scrim above it. */
const MODAL_BLUR_STYLE: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' }
const MODAL_SCRIM_STYLE: CSSProperties = { position: 'absolute', inset: 0, backgroundColor: MODAL_SCRIM }
/** Sheet: no built-in background (`builtInLook: 'none'`); height follows the content, at most the area. The screen body scrolls inside it, not the sheet itself. */
const MODAL_SHEET: CSSProperties = { position: 'relative', display: 'flex', flexDirection: 'column', maxBlockSize: '100%', minBlockSize: 0, pointerEvents: 'auto' }
const MODAL_WINDOW: CSSProperties = { ...MODAL_SHEET, inlineSize: '100%', maxInlineSize: `${String(MODAL_WINDOW_MAX_WIDTH)}px` }
/**
 * A sheet on a wide screen is a window (since 9.18.0, `wideModal.window`): width is the area minus
 * the `xl` margin on each side (supplied by the area's padding), at most 560; height follows the
 * content, at most the smaller of 85 % of the area height and the area without margins. A height
 * percentage resolves against the area's CONTENT box (already without margins), so the share of the
 * full height is `(content + 2 margins) * 0.85`.
 */
function modalSheetWindow(theme: Theme): CSSProperties {
  // The `xl` margin as a theme NUMBER: the `--product-space-xl` variable is invalid inside `calc()` when the token is a bare `0`.
  const margin = spacingMathCss('xl', theme) ?? '0px'
  return {
    ...MODAL_SHEET,
    inlineSize: '100%',
    maxInlineSize: `${String(WIDE_MODAL_MAX_WIDTH)}px`,
    maxBlockSize: `min(100%, calc((100% + 2 * ${margin}) * ${String(WIDE_MODAL_MAX_HEIGHT_SHARE)}))`,
  }
}
