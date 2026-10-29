/**
 * The carousel's stop told to the data and taken from it (schema 9.32.0, `carousel.stopPath`).
 *
 *  - WRITE: a scroll a PERSON moved, once it has settled. Person means any scroll the reader did not
 *    start: `pointerdown`, `touchstart`, `wheel` and `keydown` mark it, a scroll the reader starts
 *    (show, following the value) clears the mark. Settled means the `scrollend` event, or a quiet
 *    time of the scroll when the browser sends none; never while a finger or a button still holds the
 *    row (a release where the scroll already stands gives no `scrollend`, so the release starts the
 *    quiet time). The write is the very write of an input field (`InputWriteContext`: the session and
 *    the host at the same moment, under `writablePaths`);
 *  - SHOW: the first time the stops are laid out, the carousel stands on the stop the value names,
 *    without animation, and writes nothing;
 *  - FOLLOW: when the NUMBER the value names changes, the carousel moves to its stop (not while a
 *    finger holds the row; without animation under "reduce motion"). It is an event of the change, not
 *    a comparison at draw time, so a write the host refused leaves the carousel where the person put it.
 */
import { useContext, useEffect, useRef } from 'react'
import type { RefObject } from 'react'

import { activeCarouselStop } from '../carousel'
import { CAROUSEL_SETTLE_MS, carouselShownStop, carouselStopFollow, carouselStopNumberOf, carouselStopPathOf, carouselStopWrite } from '../carousel-stop'
import { valueAt } from '../data'
import { InputWriteContext } from '../runtime'
import type { UiNode } from '../types'
import { useData } from './contexts'
import { prefersReducedMotion } from './motion-pref'

const PERSON_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const
const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'touchend', 'touchcancel'] as const

export interface CarouselStop {
  /** The stop to start from before anything is measured (a server render has no layout). */
  readonly initial: number
  /** The row was measured: the stops and the width of the visible area. */
  readonly observe: (stops: readonly number[], viewport: number) => void
}

export function useCarouselStop(node: Pick<UiNode, 'type' | 'props'>, scroller: RefObject<HTMLElement | null>, direction: 'ltr' | 'rtl'): CarouselStop {
  const path = carouselStopPathOf(node)
  const data = useData()
  const current = path === undefined ? undefined : valueAt(data, path)
  const write = useContext(InputWriteContext)
  const number = path === undefined ? undefined : carouselStopNumberOf(current)

  // What the timers and listeners read: the latest of the render, written after it is committed.
  const latest = useRef({ path, current, write, direction })
  const stops = useRef<readonly number[]>([0])
  const shown = useRef(false)
  const previous = useRef<unknown>(current)
  const person = useRef(false)
  const holding = useRef(false)
  const dirty = useRef(false)
  /** The stop the reader is scrolling towards (the target of its last `scrollTo`) until that scroll settles. */
  const heading = useRef<number | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    latest.current = { path, current, write, direction }
  })

  const offsetOf = (element: HTMLElement): number => Math.abs(element.scrollLeft)

  /** A move by the READER: it never writes. */
  const move = (index: number, behavior: ScrollBehavior): void => {
    const element = scroller.current
    const stop = stops.current[index]
    if (element === null || stop === undefined) return
    if (heading.current === undefined && Math.abs(offsetOf(element) - stop) < 0.5) return
    person.current = false
    dirty.current = false
    heading.current = index
    clearTimeout(timer.current)
    const left = latest.current.direction === 'rtl' ? -stop : stop
    if (typeof element.scrollTo === 'function') element.scrollTo({ left, behavior })
    else element.scrollLeft = left
  }

  const observe = (measured: readonly number[], viewport: number): void => {
    stops.current = measured
    if (shown.current || latest.current.path === undefined || viewport <= 0) return
    shown.current = true
    previous.current = latest.current.current
    move(carouselShownStop(latest.current.current, measured.length), 'instant')
  }

  useEffect(() => {
    const element = scroller.current
    if (element === null || path === undefined) return undefined
    const settle = (): void => {
      clearTimeout(timer.current)
      if (!holding.current) heading.current = undefined
      if (!dirty.current || !person.current || holding.current) return
      dirty.current = false
      person.current = false
      const now = latest.current
      const value = carouselStopWrite({ settled: activeCarouselStop(stops.current, offsetOf(element)), byPerson: true, current: now.current })
      if (value !== undefined && now.path !== undefined) now.write?.(now.path, value)
    }
    const quiet = (): void => {
      clearTimeout(timer.current)
      timer.current = setTimeout(settle, CAROUSEL_SETTLE_MS)
    }
    const onPerson = (event: Event): void => {
      person.current = true
      heading.current = undefined
      if (event.type === 'pointerdown' || event.type === 'touchstart') holding.current = true
    }
    const onScroll = (): void => {
      if (!person.current) return
      dirty.current = true
      quiet()
    }
    const onRelease = (): void => {
      if (!holding.current) return
      holding.current = false
      if (dirty.current) quiet()
    }
    for (const type of PERSON_EVENTS) element.addEventListener(type, onPerson, { passive: true })
    element.addEventListener('scroll', onScroll, { passive: true })
    element.addEventListener('scrollend', settle)
    // The release is heard on the page's own window: the finger may leave the row before it lifts.
    const view = element.ownerDocument.defaultView
    for (const type of RELEASE_EVENTS) view?.addEventListener(type, onRelease, { passive: true })
    return () => {
      clearTimeout(timer.current)
      for (const type of PERSON_EVENTS) element.removeEventListener(type, onPerson)
      element.removeEventListener('scroll', onScroll)
      element.removeEventListener('scrollend', settle)
      for (const type of RELEASE_EVENTS) view?.removeEventListener(type, onRelease)
      holding.current = false
    }
    // The element is the same for the life of the row; the path decides only whether this exists.
  }, [path === undefined])

  // The value named another stop: go there (the event is the change of the number).
  useEffect(() => {
    if (!shown.current) return
    const before = previous.current
    previous.current = current
    const element = scroller.current
    if (element === null || holding.current) return
    const target = carouselStopFollow({ previous: before, next: current, stopCount: stops.current.length, active: heading.current ?? activeCarouselStop(stops.current, offsetOf(element)) })
    if (target !== undefined) move(target, prefersReducedMotion() ? 'instant' : 'smooth')
    // Only a change of the number the value names is an event.
  }, [number])

  return { initial: number === undefined ? 0 : Math.max(0, number), observe }
}
