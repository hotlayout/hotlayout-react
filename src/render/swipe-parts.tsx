/** The layers of the drag-to-confirm button that are not the thumb: the fill behind it and the circle it collapses into (schema 9.34.0). */
import type { CSSProperties, ReactNode, RefObject } from 'react'

import { cssPx } from '../sanitize'
import { SWIPE_BUSY } from '../swipe-busy'
import type { SwipeTrack } from '../swipe-confirm'
import { SWIPE_THUMB_GLYPH, swipeGeometryOf } from '../swipe-confirm'
import { SWIPE_COLLAPSE, SWIPE_HALO_OPACITY, swipeCollapseAt, swipeTrailOf } from '../swipe-motion'
import { productVar } from '../theme'
import { Glyph } from './icon'
import { screenPart } from './screen-part'
import type { SwipeOrb } from './use-swipe-motion'

/** The curve of the collapse as CSS. */
export const COLLAPSE_EASING = `cubic-bezier(${SWIPE_COLLAPSE.curve.join(', ')})`

/** The fill behind the thumb: from the rest place of the thumb to its far edge, with the height, radius and colour of the thumb. */
export const SwipeTrail = screenPart(function SwipeTrail({ track, radius, shown, fill, motion, hidden }: {
  readonly track: SwipeTrack
  readonly radius: number
  /** How far the thumb has gone, in points along the inline axis. */
  readonly shown: number
  readonly fill: string
  readonly motion: CSSProperties
  readonly hidden: boolean
}): ReactNode {
  const travel = swipeGeometryOf(track).travel
  const strip = swipeTrailOf(track, travel > 0 ? shown / travel : 0)
  return (
    <span
      aria-hidden="true"
      data-hl-swipe-trail=""
      style={{
        position: 'absolute',
        insetBlockStart: productVar('spacing', 'xs'),
        insetBlockEnd: productVar('spacing', 'xs'),
        insetInlineStart: cssPx(strip.start - Math.max(0, track.border)),
        inlineSize: cssPx(strip.width),
        borderRadius: cssPx(radius),
        backgroundColor: fill,
        pointerEvents: 'none',
        opacity: hidden ? 0 : 1,
        ...motion,
      }}
    />
  )
})

/**
 * The circle of the collapsed button: the pill of the whole button (`wide`) or the circle in the
 * middle of the box (`round`). The core is the fill of the thumb inset by the border and the inset
 * on every side, the halo is the same colour at `SWIPE_HALO_OPACITY`, and the busy indicator sits
 * in the core.
 */
export const SwipeOrbView = screenPart(function SwipeOrbView({ orb, track, colors, orbRef, coreRef, children }: {
  readonly orb: Exclude<SwipeOrb, 'none'>
  readonly track: SwipeTrack
  readonly colors: { readonly background: string; readonly color: string }
  readonly orbRef: RefObject<HTMLSpanElement | null>
  readonly coreRef: RefObject<HTMLSpanElement | null>
  readonly children: ReactNode
}): ReactNode {
  const frame = swipeCollapseAt(track, orb === 'round' ? SWIPE_COLLAPSE.durationMs : 0)
  const border = Math.max(0, track.border)
  const ease = `${String(SWIPE_COLLAPSE.durationMs)}ms ${COLLAPSE_EASING}`
  return (
    <span
      ref={orbRef}
      aria-hidden="true"
      data-hl-swipe-orb={orb}
      style={{
        position: 'absolute',
        insetBlockStart: cssPx(-border),
        blockSize: cssPx(frame.height),
        insetInlineStart: cssPx(frame.start - border),
        inlineSize: cssPx(frame.width),
        pointerEvents: 'none',
        transition: `inset-inline-start ${ease}, inline-size ${ease}`,
      }}
    >
      <span style={{ position: 'absolute', inset: 0, borderRadius: '9999px', backgroundColor: colors.background, opacity: orb === 'round' ? SWIPE_HALO_OPACITY : 0, transition: `opacity ${ease}` }} />
      <span
        ref={coreRef}
        style={{ position: 'absolute', inset: cssPx(frame.ring), borderRadius: '9999px', backgroundColor: colors.background, color: colors.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </span>
    </span>
  )
})

/** The label of the button: it sits over the fill and fades with the way of the thumb. */
export const SwipeLabel = screenPart(function SwipeLabel({ opacity, motion, children }: { readonly opacity: number; readonly motion: CSSProperties; readonly children: ReactNode }): ReactNode {
  return <span style={{ display: 'block', position: 'relative', minInlineSize: 0, textAlign: 'center', opacity, ...motion }}>{children}</span>
})

/**
 * The thumb. A circle stays `50%` (the box is square); a smaller radius is the one concentric with
 * the track, in pixels. Busy, it carries the indicator instead of the glyph; with the circle out it
 * is not drawn.
 */
export const SwipeThumb = screenPart(function SwipeThumb({ colors, icon, busy, hidden, radius, circle, offset, motion }: {
  readonly colors: { readonly background: string; readonly color: string }
  readonly icon: unknown
  readonly busy: boolean
  readonly hidden: boolean
  readonly radius: number | undefined
  /** Radius of a circle thumb; a radius at least this big is drawn as `50%`. */
  readonly circle: number
  /** Distance from the rest place, along the physical axis. */
  readonly offset: number
  readonly motion: CSSProperties
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      data-hl-swipe-thumb=""
      style={{
        position: 'absolute',
        insetBlockStart: productVar('spacing', 'xs'),
        insetBlockEnd: productVar('spacing', 'xs'),
        insetInlineStart: productVar('spacing', 'xs'),
        aspectRatio: '1 / 1',
        borderRadius: radius === undefined || radius >= circle ? '50%' : cssPx(radius),
        opacity: hidden ? 0 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        backgroundColor: colors.background,
        color: colors.color,
        translate: `${String(offset)}px 0`,
        ...motion,
      }}
    >
      {busy ? <Spinner /> : <Glyph name={typeof icon === 'string' && icon !== '' ? icon : SWIPE_THUMB_GLYPH} />}
    </span>
  )
})

/**
 * The busy indicator: a ring of three quarters (the top segment is clear), the size and colour of
 * the glyph it replaces, the stroke an eighth of its size. It turns once in 800 ms; the style sheet
 * stops it under "reduce motion".
 */
export const Spinner = screenPart(function Spinner(): ReactNode {
  return (
    <span aria-hidden="true" data-hl-spinner="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', inlineSize: '1em', blockSize: '1lh' }}>
      <span style={{ display: 'block', inlineSize: '1em', blockSize: '1em', borderRadius: '50%', border: '0.125em solid currentColor', borderBlockStartColor: 'transparent', animation: `hl-spin ${String(SWIPE_BUSY.turnMs)}ms linear infinite` }} />
    </span>
  )
})
