/**
 * The "drag to confirm" button (schema 9.22.0, `Button.confirm: 'swipe'`): a track with a thumb. The
 * rule is `swipe-confirm.ts`; this file is the markup, `use-swipe-gesture.ts` is the drag.
 *
 * The element is the same `<button>` (the role, the name from the label, the surface of the role
 * and of the node's own style, the touch target); inside it the thumb stands at the inline start
 * and the label is centred in the strip between the two places of the thumb. A press with no drag
 * does nothing: the `click` the browser sends after a pointer carries `detail > 0` and is ignored.
 * The keyboard and assistive technology make a `click` with `detail === 0`, which acts at once, and
 * a held key repeating is swallowed as for every button.
 *
 * THE END (9.24.0, `swipe-busy.ts`): past the threshold the action runs at once and the thumb glides
 * to the end and STAYS there, busy: a ring instead of the glyph, `aria-busy`, no drag, no press, no
 * key. A host that returns a promise from `onAction` holds the state until it settles (either way
 * the thumb then returns); without a promise the state lasts until the shown screen changes or
 * eight seconds pass. An action that nothing runs (`none`, an invalid one) returns the thumb at once.
 *
 * THE MOTION (9.34.0, `swipe-motion.ts`): a fill of the colour of the thumb follows it (under the
 * thumb and the label), the label fades with the way, the thumb takes the radius concentric with the
 * track. Busy, the button collapses into a circle with the indicator (`swipe-parts.tsx`), and with
 * `confirmTransition: 'ripple'` the circle grows over the screen and the action runs after it
 * (`use-swipe-motion.ts`, `swipe-ripple-layer.ts`).
 *
 * `touch-action: pan-y` keeps the vertical scroll of the body with the page.
 */
import { useContext, useRef } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'

import { DirectionContext } from '../runtime'
import type { PressHandle } from '../runtime'
import { SWIPE_BUSY } from '../swipe-busy'
import { swipeGeometryOf } from '../swipe-confirm'
import { SWIPE_COLLAPSE, swipeLabelOpacityOf, swipeThumbRadiusOf } from '../swipe-motion'
import { PRESSABLE_CLASS } from '../styles'
import { COLLAPSE_EASING, Spinner, SwipeLabel, SwipeOrbView, SwipeThumb, SwipeTrail } from './swipe-parts'
import { useTrack } from './swipe-track'
import type { Measured } from './swipe-track'
import { useSwipeGesture } from './use-swipe-gesture'
import type { SwipeOrb } from './use-swipe-motion'
import { useSwipeButtonMotion } from './use-swipe-button-motion'
import { swallowAutoRepeat } from './use-press'
import type { NodeMark } from './widget-props'
import { screenPart } from './screen-part'
import { prefersReducedMotion } from './motion-pref'

export interface SwipeButtonProps {
  readonly mark: NodeMark
  readonly semantics: object
  /** The surface of the button and the box of the node, without the clipping that moved to the label. */
  readonly box: CSSProperties
  /** `display`, the inline size and the alignment of the label of the ordinary button. */
  readonly layout: CSSProperties
  readonly label: ReactNode
  /** The icon of the button (a name from the set) or nothing: then the thumb carries the chevron. */
  readonly icon: unknown
  /** The thumb: the background of the ROLE (not the own background of the node) and the colour of its label. */
  readonly thumb: { readonly background: string; readonly color: string }
  readonly disabled: boolean
  readonly press: PressHandle | undefined
  /** The inset step as a number of the theme, and the block padding of the size (for the first paint, before the track is measured). */
  readonly inset: number
  readonly paddingBlock: number
  /** The look of a disabled button, laid last. */
  readonly look: CSSProperties
  /** The type of the action of the button and its `confirmTransition` (9.34.0): the fill plays on a navigation of the reader only. */
  readonly actionType: string | undefined
  readonly transition: 'ripple' | undefined
}

/** Ease-out of the third power, the curve of `x-swipeConfirmBusy`. */
const EASE_OUT_CUBIC = 'cubic-bezier(0.215, 0.61, 0.355, 1)'

/** Enter and Space do nothing on a disabled or busy button. */
function refuseKey(event: KeyboardEvent<HTMLElement>): void {
  if (event.key === 'Enter' || event.key === ' ') event.preventDefault()
}

type GlideProperty = 'translate' | 'inline-size' | 'opacity'

/** The transition of a part that follows the thumb between two states; none under "reduce motion" (the thumb jumps). */
function glideCss(glide: 'complete' | 'return' | 'short', property: GlideProperty): CSSProperties {
  if (prefersReducedMotion()) return {}
  if (glide === 'short') return { transition: `${property} 160ms ease-out` }
  const ms = glide === 'complete' ? SWIPE_BUSY.completeMs : SWIPE_BUSY.returnMs
  return { transition: `${property} ${String(ms)}ms ${EASE_OUT_CUBIC}` }
}

/**
 * The surface of a collapsed button (background, border, shadow) fades out; the transition runs while
 * the circle is there. The border goes through the logical longhands: the role may set the `border`
 * shorthand, which React cannot update beside a physical `borderColor`.
 */
const SURFACE_GONE: CSSProperties = { backgroundColor: 'transparent', backgroundImage: 'none', borderBlockColor: 'transparent', borderInlineColor: 'transparent', boxShadow: 'none' }
const SURFACE_FADE = ['background-color', 'border-color', 'box-shadow'].map((property) => `${property} ${String(SWIPE_COLLAPSE.durationMs)}ms ${COLLAPSE_EASING}`).join(', ')

/** How far along the way the thumb is, 0..1; no way, no progress. */
function progressOf(shown: number, travel: number): number {
  return travel > 0 ? shown / travel : 0
}

/** Until the track is measured (the server, the first frame) the room of the thumb is its estimate from the size: the line and the padding. */
function roomOf(track: Measured | undefined, paddingBlock: number, inset: number): string {
  if (track === undefined) return `calc(1lh + ${String(2 * paddingBlock - inset)}px)`
  return `${String(swipeGeometryOf(track).thumbRoom - track.border)}px`
}

/** The surface while the circle is there: it fades to nothing once the circle is round. */
function surfaceOf(orb: SwipeOrb): CSSProperties {
  if (orb === 'none') return {}
  return orb === 'round' ? { transition: SURFACE_FADE, ...SURFACE_GONE } : { transition: SURFACE_FADE }
}

export const SwipeButton = screenPart(function SwipeButton({ mark, semantics, box, layout, label, icon, thumb, disabled, press, inset, paddingBlock, look, actionType, transition }: SwipeButtonProps): ReactNode {
  const rtl = useContext(DirectionContext) === 'rtl'
  const ref = useRef<HTMLButtonElement>(null)
  const orbRef = useRef<HTMLSpanElement>(null)
  const coreRef = useRef<HTMLSpanElement>(null)
  const track = useTrack(ref, inset)
  const motion = useSwipeButtonMotion({ press, actionType, transition, orbRef, coreRef })
  const { waiting, locked, orb } = motion

  const geometry = track === undefined ? undefined : swipeGeometryOf(track)
  const travel = geometry?.travel ?? 0
  const { offset, dragging, handlers } = useSwipeGesture({ disabled, locked, travel, rtl, onRelease: motion.release })

  // Enter, Space and an assistive activation are a `click` with no count; a pointer's `click` has one and is not a press.
  const onClick = disabled || locked ? undefined : (event: { readonly detail: number }): void => {
    if (event.detail === 0) motion.press()
  }

  const room = roomOf(track, paddingBlock, inset)
  const shown = locked ? travel : offset
  const circled = orb !== 'none'
  const followed = (property: GlideProperty): CSSProperties => (dragging ? {} : glideCss(motion.glide, property))
  const thumbRadius = track === undefined ? undefined : swipeThumbRadiusOf(track)

  return (
    <button
      {...mark}
      {...semantics}
      ref={ref}
      type="button"
      className={PRESSABLE_CLASS}
      data-hl-confirm="swipe"
      aria-disabled={disabled ? true : undefined}
      aria-busy={waiting ? true : undefined}
      style={{
        ...layout,
        ...box,
        // The inline padding of the size is not read: the room of the thumb takes its place on both sides.
        paddingInlineStart: room,
        paddingInlineEnd: room,
        position: 'relative',
        isolation: 'isolate',
        touchAction: 'pan-y',
        userSelect: 'none',
        ...surfaceOf(orb),
        ...look,
      }}
      {...handlers}
      onClick={onClick}
      onKeyDown={disabled || locked ? refuseKey : swallowAutoRepeat}
    >
      {track === undefined || thumbRadius === undefined ? null : <SwipeTrail track={track} radius={thumbRadius} shown={shown} fill={thumb.background} motion={followed('inline-size')} hidden={circled} />}
      <SwipeLabel opacity={circled ? 0 : swipeLabelOpacityOf(progressOf(shown, travel))} motion={followed('opacity')}>
        {label}
      </SwipeLabel>
      <SwipeThumb colors={thumb} icon={icon} busy={waiting} hidden={circled} radius={thumbRadius} circle={(geometry?.diameter ?? 0) / 2} offset={rtl ? -shown : shown} motion={followed('translate')} />
      {circled && track !== undefined ? (
        <SwipeOrbView orb={orb} track={track} colors={thumb} orbRef={orbRef} coreRef={coreRef}>
          <Spinner />
        </SwipeOrbView>
      ) : null}
    </button>
  )
})
