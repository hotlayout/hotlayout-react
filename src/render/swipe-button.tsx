/**
 * The "drag to confirm" button (schema 9.22.0, `Button.confirm: 'swipe'`): a track with a thumb. The
 * rule is `swipe-confirm.ts`; this file is the gesture and the markup.
 *
 * The element is the same `<button>` (the role, the name from the label, the surface of the role
 * and of the node's own style, the touch target); inside it the round thumb stands at the inline
 * start and the label is centred in the strip between the two places of the thumb. A POINTER drags
 * the thumb along the inline axis; releasing it at 0.9 of the way or further runs the action (with
 * its analytics event, once, before it), anything less returns the thumb. A press with no drag does
 * nothing: the `click` the browser sends after a pointer carries `detail > 0` and is ignored. The
 * keyboard and assistive technology make a `click` with `detail === 0`, which acts at once, and a
 * held key repeating is swallowed as for every button.
 *
 * THE END (9.24.0, `swipe-busy.ts`): past the threshold the action runs at once and the thumb glides
 * to the end and STAYS there, busy: a ring instead of the glyph, `aria-busy`, no drag, no press, no
 * key. A host that returns a promise from `onAction` holds the state until it settles (either way
 * the thumb then returns); without a promise the state lasts until the shown screen changes or
 * eight seconds pass. An action that nothing runs (`none`, an invalid one) returns the thumb at once.
 *
 * `touch-action: pan-y` keeps the vertical scroll of the body with the page; the drag is taken
 * (`setPointerCapture`) only once the pointer has moved more along the line than across it, and a
 * `pointercancel` (the browser took the gesture for a scroll) returns the thumb without an action.
 */
import { useContext, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode, RefObject } from 'react'

import { DirectionContext } from '../runtime'
import type { PressOutcome } from '../runtime'
import { SWIPE_BUSY } from '../swipe-busy'
import { SWIPE_THUMB_GLYPH, swipeCapturedBy, swipeGeometryOf, swipeProgressOf, swipeReleaseOf } from '../swipe-confirm'
import type { SwipeTrack } from '../swipe-confirm'
import { PRESSABLE_CLASS } from '../styles'
import { productVar } from '../theme'
import { useIsomorphicLayoutEffect } from '../wide-nav-view'
import { Glyph } from './icon'
import { useSwipeBusy } from './use-swipe-busy'
import { swallowAutoRepeat } from './use-press'
import type { NodeMark } from './widget-props'
import { screenPart } from './screen-part'

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
  readonly press: (() => PressOutcome | undefined) | undefined
  /** The inset step as a number of the theme, and the block padding of the size (for the first paint, before the track is measured). */
  readonly inset: number
  readonly paddingBlock: number
  /** The look of a disabled button, laid last. */
  readonly look: CSSProperties
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The track as it stands now: the border box and the border on one side. `undefined` while it has no size. */
function measure(element: HTMLElement, inset: number): SwipeTrack | undefined {
  const width = element.offsetWidth
  const height = element.offsetHeight
  if (!(width > 0) || !(height > 0)) return undefined
  const border = Number.parseFloat(getComputedStyle(element).borderBlockStartWidth)
  return { width, height, border: Number.isFinite(border) ? border : 0, inset }
}

const sameTrack = (a: SwipeTrack | undefined, b: SwipeTrack | undefined): boolean => a?.width === b?.width && a?.height === b?.height && a?.border === b?.border

/** Ease-out of the third power, the curve of `x-swipeConfirmBusy`. */
const EASE_OUT_CUBIC = 'cubic-bezier(0.215, 0.61, 0.355, 1)'

interface Gesture {
  readonly id: number
  readonly x: number
  readonly y: number
  captured: boolean
}

/** Enter and Space do nothing on a disabled or busy button. */
function refuseKey(event: KeyboardEvent<HTMLElement>): void {
  if (event.key === 'Enter' || event.key === ' ') event.preventDefault()
}

/** The transition of the thumb between two states; none under "reduce motion" (the thumb jumps). */
function glideCss(glide: 'complete' | 'return' | 'short'): CSSProperties {
  if (prefersReducedMotion()) return {}
  if (glide === 'short') return { transition: 'translate 160ms ease-out' }
  const ms = glide === 'complete' ? SWIPE_BUSY.completeMs : SWIPE_BUSY.returnMs
  return { transition: `translate ${String(ms)}ms ${EASE_OUT_CUBIC}` }
}

/** The track as it is now, measured before paint and again whenever the button changes size. */
function useTrack(ref: RefObject<HTMLButtonElement | null>, inset: number): SwipeTrack | undefined {
  const [track, setTrack] = useState<SwipeTrack | undefined>(undefined)
  useIsomorphicLayoutEffect(() => {
    const element = ref.current
    if (element === null) return undefined
    const read = (): void => {
      const next = measure(element, inset)
      setTrack((previous) => (sameTrack(previous, next) ? previous : next))
    }
    read()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(read)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [ref, inset])
  return track
}

export const SwipeButton = screenPart(function SwipeButton({ mark, semantics, box, layout, label, icon, thumb, disabled, press, inset, paddingBlock, look }: SwipeButtonProps): ReactNode {
  const rtl = useContext(DirectionContext) === 'rtl'
  const ref = useRef<HTMLButtonElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const track = useTrack(ref, inset)
  // How far the thumb has gone from the start, in points along the inline axis.
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const { waiting, glide, run, shortReturn } = useSwipeBusy(press)

  const geometry = track === undefined ? undefined : swipeGeometryOf(track)
  const travel = geometry?.travel ?? 0

  const release = (action: boolean): void => {
    gesture.current = null
    setDragging(false)
    setOffset(0)
    shortReturn()
    if (action) run()
  }

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (disabled || waiting || event.button !== 0 || gesture.current !== null) return
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, captured: false }
  }

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = gesture.current
    if (current === null) return
    if (event.pointerId !== current.id) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (!current.captured) {
      if (!swipeCapturedBy(dx, dy)) return
      current.captured = true
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // A pointer that cannot be captured still drags while it stays over the track.
      }
      setDragging(true)
    }
    setOffset(swipeProgressOf(dx, travel, rtl) * travel)
  }

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = gesture.current
    if (current === null) return
    if (event.pointerId !== current.id) return
    if (!current.captured) {
      // A press with no drag: nothing, and the `click` that follows has `detail > 0`.
      gesture.current = null
      return
    }
    const progress = swipeProgressOf(event.clientX - current.x, travel, rtl)
    release(swipeReleaseOf(progress, disabled) === 'act')
  }

  const onPointerCancel = (event: PointerEvent<HTMLButtonElement>): void => {
    if (gesture.current?.id === event.pointerId) release(false)
  }

  // Enter, Space and an assistive activation are a `click` with no count; a pointer's `click` has one and is not a press.
  const onClick = disabled || waiting ? undefined : (event: { readonly detail: number }): void => {
    if (event.detail === 0) run()
  }

  // Until the track is measured (the server, the first frame) the room of the thumb is its estimate from the size: the line and the padding.
  const room = geometry === undefined || track === undefined ? `calc(1lh + ${String(2 * paddingBlock - inset)}px)` : `${String(geometry.thumbRoom - track.border)}px`
  const motion = dragging ? {} : glideCss(glide)
  const shown = waiting ? travel : offset

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
        touchAction: 'pan-y',
        userSelect: 'none',
        ...look,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
      onKeyDown={disabled || waiting ? refuseKey : swallowAutoRepeat}
    >
      <span
        aria-hidden="true"
        data-hl-swipe-thumb=""
        style={{
          position: 'absolute',
          insetBlockStart: productVar('spacing', 'xs'),
          insetBlockEnd: productVar('spacing', 'xs'),
          insetInlineStart: productVar('spacing', 'xs'),
          aspectRatio: '1 / 1',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          backgroundColor: thumb.background,
          color: thumb.color,
          translate: `${String(rtl ? -shown : shown)}px 0`,
          ...motion,
        }}
      >
        {waiting ? <Spinner /> : <Glyph name={typeof icon === 'string' && icon !== '' ? icon : SWIPE_THUMB_GLYPH} />}
      </span>
      <span style={{ display: 'block', minInlineSize: 0, textAlign: 'center' }}>{label}</span>
    </button>
  )
})

/**
 * The busy indicator: a ring of three quarters (the top segment is clear), the size and colour of
 * the glyph it replaces, the stroke an eighth of its size. It turns once in 800 ms; the style sheet
 * stops it under "reduce motion".
 */
const Spinner = screenPart(function Spinner(): ReactNode {
  return (
    <span aria-hidden="true" data-hl-spinner="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', inlineSize: '1em', blockSize: '1lh' }}>
      <span style={{ display: 'block', inlineSize: '1em', blockSize: '1em', borderRadius: '50%', border: '0.125em solid currentColor', borderBlockStartColor: 'transparent', animation: `hl-spin ${String(SWIPE_BUSY.turnMs)}ms linear infinite` }} />
    </span>
  )
})
