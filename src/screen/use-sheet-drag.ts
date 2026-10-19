/**
 * A sheet that follows the finger down and closes (schema 9.26.0, `sheet-dismiss.ts`). The rule of
 * what starts a drag and what a release does is in `sheet-dismiss.ts`; this file is the wiring.
 *
 *  - POINTER events are listened to in the CAPTURE phase on the sheet: a control inside takes its
 *    own `pointerdown`, but the sheet may be dragged by a card as well.
 *  - The body of the sheet scrolls on its own. A move down starts a drag only while the body is at
 *    its top; otherwise the move scrolls the body back. `touch-action` is NOT set: the scrolling of
 *    the content stays the browser's. Once the drag has started, the `touchmove` that follows is
 *    cancelled so the browser does not take the same gesture for a pan (a pointer sequence of a
 *    touch ends in `pointercancel` as soon as the browser starts to scroll).
 *  - Once the sheet is taken by the finger, the node under the finger gets a `pointercancel` (a hold
 *    there must not ripen into a long press in the middle of the drag), and the click that follows
 *    the release is not a press.
 *  - On release the sheet either returns (250 ms) or goes down (200 ms) and only THEN the same
 *    `navigate.back` as a tap on the scrim runs. Under "reduce motion" both are instant. If the host
 *    refuses the step back and the sheet stays, it returns to its place.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import { SHEET_EXIT, SHEET_RETURN, SHEET_VELOCITY_WINDOW_MS, sheetDragOutcome, sheetDragStarts } from '../sheet-dismiss'

interface Sample {
  readonly y: number
  readonly time: number
}

/** The velocity over the last `SHEET_VELOCITY_WINDOW_MS` of the move, pixels per second, down positive. */
function velocityOf(samples: readonly Sample[]): number {
  const last = samples.at(-1)
  if (last === undefined) return 0
  const first = samples.find((sample) => last.time - sample.time <= SHEET_VELOCITY_WINDOW_MS) ?? last
  const span = last.time - first.time
  return span <= 0 ? 0 : ((last.y - first.y) / span) * 1000
}

const bezier = (curve: readonly number[]): string => `cubic-bezier(${curve.join(', ')})`

/** How far the body of the sheet is scrolled from its top (0 — at the very top). */
function scrolledOf(sheet: HTMLElement): number {
  return sheet.querySelector<HTMLElement>('[data-hl-zone="body"]')?.scrollTop ?? 0
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Puts the sheet and the scrim at "dragged down by `offset` pixels". */
function place(sheet: HTMLElement, scrim: HTMLElement | null, offset: number, scale: number, transition: string): void {
  sheet.style.transition = transition
  sheet.style.transform = offset <= 0 ? '' : `translateY(${String(offset / scale)}px)`
  if (scrim === null) return
  scrim.style.transition = transition.replace('transform', 'opacity')
  const height = sheet.getBoundingClientRect().height + offset
  scrim.style.opacity = offset <= 0 || height <= 0 ? '' : String(Math.max(0, 1 - offset / height))
}

/** The sheet takes the finger: the node under it gets a `pointercancel`, so a hold there does not ripen. */
function grab(sheet: HTMLElement, event: PointerEvent): void {
  if (typeof sheet.setPointerCapture === 'function') {
    try {
      sheet.setPointerCapture(event.pointerId)
    } catch {
      // A pointer that is already gone cannot be captured; the drag goes on with the events it still gets.
    }
  }
  if (typeof PointerEvent === 'function') event.target?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: event.pointerId }))
}

function swallow(event: Event): void {
  event.stopPropagation()
  event.preventDefault()
}

/**
 * Wires the drag of a sheet. `enabled` is false for a window, a layer that waits for an action and a
 * sheet without a way back; `onDismiss` is the step back the scrim takes.
 */
export function useSheetDrag(sheetRef: RefObject<HTMLElement | null>, layerRef: RefObject<HTMLElement | null>, enabled: boolean, onDismiss: () => void): void {
  // The step back of the render that is on screen when the sheet is released: a new render in the middle of a drag must not end it.
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  useEffect(() => {
    const element = sheetRef.current
    if (element === null || !enabled) return undefined
    const scrim = (): HTMLElement | null => layerRef.current?.querySelector<HTMLElement>('[data-hl-scrim]') ?? null
    let start: { x: number; y: number } | undefined
    let dragging = false
    let ownCancel = false
    let samples: Sample[] = []
    let pending: ReturnType<typeof setTimeout> | undefined
    // A browser zoom or a scaled host: the pixels of the screen are not the logical pixels of the sheet.
    const scaleOf = (): number => (element.offsetHeight > 0 ? element.getBoundingClientRect().height / element.offsetHeight : 1)

    const down = (event: PointerEvent): void => {
      if (pending !== undefined) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      start = { x: event.clientX, y: event.clientY }
      dragging = false
      samples = [{ y: event.clientY, time: event.timeStamp }]
    }
    const move = (event: PointerEvent): void => {
      if (start === undefined) return
      const scale = scaleOf()
      const dy = event.clientY - start.y
      if (!dragging) {
        const begins = sheetDragStarts({ sheet: true, dismissible: true, scrolled: scrolledOf(element), dy: dy / scale, dx: (event.clientX - start.x) / scale, onHandle: false })
        if (!begins) return
        dragging = true
        // The cancel the sheet sends to the node under the finger bubbles back here; it is not the end of this drag.
        ownCancel = true
        grab(element, event)
        ownCancel = false
      }
      samples = [...samples.filter((sample) => event.timeStamp - sample.time <= SHEET_VELOCITY_WINDOW_MS), { y: event.clientY, time: event.timeStamp }]
      place(element, scrim(), Math.max(0, dy), scale, 'none')
      event.preventDefault()
    }
    const touchMove = (event: TouchEvent): void => {
      if (dragging && event.cancelable) event.preventDefault()
    }
    const up = (event: PointerEvent): void => {
      const from = start
      start = undefined
      if (!dragging || from === undefined) return
      dragging = false
      const scale = scaleOf()
      const dragged = Math.max(0, event.clientY - from.y)
      const outcome = sheetDragOutcome({ sheetHeight: element.offsetHeight, dragged: dragged / scale, velocity: velocityOf(samples) / scale })
      // The click that follows the release is not a press. It is swallowed only for as long as it can still arrive.
      element.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => {
        element.removeEventListener('click', swallow, { capture: true })
      }, 0)
      const instant = reducedMotion()
      if (outcome === 'return') {
        place(element, scrim(), 0, scale, instant ? 'none' : `transform ${String(SHEET_RETURN.durationMs)}ms ${bezier(SHEET_RETURN.curve)}`)
        return
      }
      place(element, scrim(), element.getBoundingClientRect().height + dragged, scale, instant ? 'none' : `transform ${String(SHEET_EXIT.durationMs)}ms ${bezier(SHEET_EXIT.curve)}`)
      // The step back comes AFTER the sheet has left. If the host refuses it and the sheet stays, it goes back to its place.
      pending = setTimeout(
        () => {
          pending = undefined
          dismissRef.current()
          setTimeout(() => {
            if (element.isConnected) place(element, scrim(), 0, scale, instant ? 'none' : `transform ${String(SHEET_RETURN.durationMs)}ms ${bezier(SHEET_RETURN.curve)}`)
          }, 50)
        },
        instant ? 0 : SHEET_EXIT.durationMs,
      )
    }
    const cancel = (): void => {
      if (ownCancel) return
      start = undefined
      if (dragging) place(element, scrim(), 0, scaleOf(), 'none')
      dragging = false
    }
    element.addEventListener('pointerdown', down, { capture: true })
    element.addEventListener('pointermove', move, { capture: true })
    element.addEventListener('pointerup', up, { capture: true })
    element.addEventListener('pointercancel', cancel, { capture: true })
    element.addEventListener('touchmove', touchMove, { capture: true, passive: false })
    return () => {
      element.removeEventListener('pointerdown', down, { capture: true })
      element.removeEventListener('pointermove', move, { capture: true })
      element.removeEventListener('pointerup', up, { capture: true })
      element.removeEventListener('pointercancel', cancel, { capture: true })
      element.removeEventListener('touchmove', touchMove, { capture: true })
      if (pending !== undefined) clearTimeout(pending)
      place(element, scrim(), 0, 1, '')
    }
  }, [sheetRef, layerRef, enabled])
}
