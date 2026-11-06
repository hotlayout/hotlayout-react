/**
 * The fill over the screen after a swipe-to-confirm (schema 9.34.0, `Button.confirmTransition:
 * 'ripple'`, `x-swipeConfirmMotion.ripple` / `reveal`).
 *
 * The circle the button collapsed into grows from its centre until its core covers the farthest
 * corner of the screen (`swipeRippleScaleOf`), linearly over 800 ms. Then the action runs: the
 * screen changes UNDER the fill, and the fill fades out over the next screen in 200 ms.
 *
 * WHY THE LAYER IS PLAIN DOM, NOT REACT. The action removes the button together with its screen,
 * and the fill must outlive that moment and fade over the new screen. So the layer is created and
 * removed here, with its own timers.
 *
 * WHERE IT LIVES depends on who steers the stack:
 *  - the reader's own stack (no `onScreenCovered`): the layer is a child of the screen root,
 *    `position: absolute; inset: 0` over the zones, clipped by the root; the far corner is the
 *    corner of the root;
 *  - the host changes the route (`onScreenCovered` given): the host may unmount the whole screen
 *    right after the action, so the layer is a child of `document.body`, `position: fixed;
 *    inset: 0` over everything; the far corner is the corner of the window. The host is told that
 *    the screen is covered before the action and that it is not any more once the layer is gone.
 *
 * The layer paints with the colour its circle resolved to (`safeComputedColor`): outside the
 * root the theme variables do not exist.
 */
import { cssNumber, cssPx, safeComputedColor } from '../sanitize'
import { ROOT_ATTRIBUTE } from '../styles'
import { SWIPE_HALO_OPACITY, SWIPE_REVEAL, SWIPE_RIPPLE, swipeRippleScaleOf } from '../swipe-motion'

export interface RippleStart {
  /** The box of the collapsed button and its core: where the circle starts and what colour it has. */
  readonly orb: HTMLElement
  readonly core: HTMLElement
  /** Runs the action (once), when the circle has covered the screen. */
  readonly act: () => void
  /** The host's notice; its presence moves the layer out of the root. */
  readonly onScreenCovered: ((covered: boolean) => void) | undefined
}

export interface RippleRun {
  /** The button left before the screen was covered: the layer goes, the action does not run. After the action it does nothing. */
  readonly cancel: () => void
}

/** Above any stacking of the host page. */
const TOP_LAYER = '2147483647'
/** Above the zones, the navigation bar and the modal layers inside the root. */
const ROOT_LAYER = '2147483000'

interface Place {
  readonly host: HTMLElement
  readonly fixed: boolean
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  /** Screen pixels per logical pixel of the place (a root in a scaled host). */
  readonly zoom: number
}

function rootPlace(orb: HTMLElement): Place | undefined {
  const root = orb.closest<HTMLElement>(`[${ROOT_ATTRIBUTE}]`)
  if (root === null || !(root.offsetWidth > 0) || !(root.offsetHeight > 0)) return undefined
  const box = root.getBoundingClientRect()
  const zoom = box.width > 0 ? box.width / root.offsetWidth : 1
  return { host: root, fixed: false, left: box.left, top: box.top, width: root.offsetWidth, height: root.offsetHeight, zoom }
}

function windowPlace(doc: Document): Place | undefined {
  const view = doc.defaultView
  if (view === null || !(view.innerWidth > 0) || !(view.innerHeight > 0)) return undefined
  return { host: doc.body, fixed: true, left: 0, top: 0, width: view.innerWidth, height: view.innerHeight, zoom: 1 }
}

function block(doc: Document, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const element = doc.createElement('div')
  Object.assign(element.style, style)
  return element
}

/** The circle with its halo and core, where the collapsed button is, and the scale that covers the place. */
function circleOf(doc: Document, place: Place, start: RippleStart, fill: string): { readonly circle: HTMLDivElement; readonly scale: number } {
  const orbBox = start.orb.getBoundingClientRect()
  const size = orbBox.height / place.zoom
  const left = (orbBox.left - place.left) / place.zoom
  const top = (orbBox.top - place.top) / place.zoom
  const core = start.core.getBoundingClientRect().height / place.zoom
  const scale = swipeRippleScaleOf({ centerX: left + size / 2, centerY: top + size / 2, screenWidth: place.width, screenHeight: place.height, core })
  const circle = block(doc, { position: 'absolute', left: cssPx(left), top: cssPx(top), width: cssPx(size), height: cssPx(size), transformOrigin: '50% 50%' })
  circle.append(
    block(doc, { position: 'absolute', inset: '0', borderRadius: '9999px', backgroundColor: fill, opacity: cssNumber(SWIPE_HALO_OPACITY) }),
    block(doc, { position: 'absolute', inset: cssPx((size - core) / 2), borderRadius: '9999px', backgroundColor: fill }),
  )
  return { circle, scale }
}

/**
 * Starts the fill. `undefined` — there is no place for it (no document, no measurable root, a
 * colour that is not a computed colour): the caller runs the action at once.
 */
export function startRipple(start: RippleStart): RippleRun | undefined {
  // The document is the one the button is in: no global, so a server render has nothing to find.
  const doc = start.orb.ownerDocument
  const fill = safeComputedColor(getComputedStyle(start.core).backgroundColor)
  const place = start.onScreenCovered === undefined ? rootPlace(start.orb) : windowPlace(doc)
  if (fill === undefined || place === undefined) return undefined

  const { circle, scale } = circleOf(doc, place, start, fill)
  const layer = block(doc, {
    position: place.fixed ? 'fixed' : 'absolute',
    inset: '0',
    overflow: 'hidden',
    zIndex: place.fixed ? TOP_LAYER : ROOT_LAYER,
    pointerEvents: 'auto',
    touchAction: 'none',
  })
  layer.setAttribute('aria-hidden', 'true')
  layer.dataset.hlSwipeCover = 'growing'
  layer.append(circle)
  place.host.append(layer)
  // The first frame is the circle where the button is; the growth starts from the next one.
  circle.getBoundingClientRect()
  circle.style.transition = `transform ${String(SWIPE_RIPPLE.durationMs)}ms ${SWIPE_RIPPLE.curve}`
  circle.style.transform = `scale(${cssNumber(scale)})`

  let covered = false
  let growing: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    growing = undefined
    covered = true
    // The fade does not wait for the host: it starts with the action and ends by itself.
    layer.dataset.hlSwipeCover = 'revealing'
    layer.style.transition = `opacity ${String(SWIPE_REVEAL.durationMs)}ms ${SWIPE_REVEAL.curve}`
    layer.style.opacity = '0'
    setTimeout(() => {
      layer.remove()
      start.onScreenCovered?.(false)
    }, SWIPE_REVEAL.durationMs)
    try {
      start.onScreenCovered?.(true)
    } finally {
      start.act()
    }
  }, SWIPE_RIPPLE.durationMs)

  return {
    cancel: () => {
      if (covered) return
      if (growing !== undefined) clearTimeout(growing)
      growing = undefined
      layer.remove()
    },
  }
}
