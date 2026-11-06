/**
 * The drag of the thumb of a drag-to-confirm button (schema 9.22.0, `swipe-confirm.ts`).
 *
 * A POINTER drags the thumb along the inline axis; releasing it at the threshold or further acts,
 * anything less returns the thumb. A press with no drag does nothing. The drag is taken
 * (`setPointerCapture`) only once the pointer has moved more along the line than across it, and a
 * `pointercancel` (the browser took the gesture for a scroll) returns the thumb without an action.
 */
import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'

import { swipeCapturedBy, swipeProgressOf, swipeReleaseOf } from '../swipe-confirm'

interface Gesture {
  readonly id: number
  readonly x: number
  readonly y: number
  captured: boolean
}

export interface SwipeGestureInput {
  readonly disabled: boolean
  /** The button is busy or still settling: no gesture starts. */
  readonly locked: boolean
  /** The way of the thumb from the start to the end, in points. */
  readonly travel: number
  readonly rtl: boolean
  /** The pointer is released: `act` — past the threshold. */
  readonly onRelease: (act: boolean) => void
}

export interface SwipeGesture {
  /** How far the thumb has gone from the start, in points along the inline axis. */
  readonly offset: number
  readonly dragging: boolean
  readonly handlers: {
    readonly onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void
    readonly onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
    readonly onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
    readonly onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void
  }
}

export function useSwipeGesture({ disabled, locked, travel, rtl, onRelease }: SwipeGestureInput): SwipeGesture {
  const gesture = useRef<Gesture | null>(null)
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)

  const release = (act: boolean): void => {
    gesture.current = null
    setDragging(false)
    setOffset(0)
    onRelease(act)
  }

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (disabled || locked || event.button !== 0 || gesture.current !== null) return
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

  return { offset, dragging, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } }
}
