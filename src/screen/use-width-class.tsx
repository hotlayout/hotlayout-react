/** The width class of the screen, measured from the root element of the package. */
import { useEffect, useLayoutEffect, useState } from 'react'

import { widthClassWord } from '../width-class'
import type { WidthClass } from '../width-class'
import { createWidthClassTracker } from '../width-class-lock'

/** A pre-paint effect in the browser; on the server `useLayoutEffect` warns, and there is nothing to measure anyway. */
const useIsomorphicLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect

/**
 * The width class of the screen (since 9.18.0): the width of the package root's box
 * (`ResizeObserver`), not the window and not the device. Until measured it is the host's word
 * (`initialWidthClass`) or `compact` (`unknownWidth`); the server markup and the first browser frame
 * with the same word are IDENTICAL, and after the first layout the class becomes real BEFORE paint
 * (a layout effect, so no flicker). Returns the class and a callback `ref` for the root (state, not
 * `ref.current`: the root may be absent in the first frame, because an incompatible document draws
 * a different one).
 *
 * A measurement must not change what it measures. A root without its own width would measure the
 * width of its content, and the content depends on the class. `width-class-lock.ts` detects and
 * stops such a loop (the rule lives there, free of React and the DOM); this hook only supplies its
 * three inputs: the observer's measurement, the width right after a class is painted, and the timer
 * that re-checks an uncertain lock.
 *
 * A width of 0 means "unknown" (the root is not laid out: `display: none`, server, jsdom) and the
 * class stays as it is.
 */
export function useWidthClass(initial: unknown): readonly [WidthClass, (element: HTMLDivElement | null) => void] {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [widthClass, setWidthClass] = useState<WidthClass>(() => widthClassWord(initial))
  // One per component lifetime; state nobody changes rather than a `ref`: only its identity is read during render.
  const [tracker] = useState(() => createWidthClassTracker(widthClassWord(initial)))

  useIsomorphicLayoutEffect(() => {
    if (element === null) return undefined
    const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now())
    let timer: ReturnType<typeof setTimeout> | undefined
    // An uncertain lock (honest jitter at a window edge looks like a loop) re-checks itself if the width never changes.
    const scheduleProbe = (): void => {
      const due = tracker.probeDue()
      if (due === undefined || timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        setWidthClass(tracker.probe(element.getBoundingClientRect().width, now()))
        scheduleProbe()
      }, Math.max(0, due - now()))
    }
    const apply = (width: number): void => {
      setWidthClass(tracker.observe(width, now()))
      scheduleProbe()
    }

    // The first measurement is synchronous, BEFORE paint: the class is real on the first frame where the root is laid out.
    apply(element.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver((entries) => {
      // An entry without a size (polyfill, stub observer): measure with the bounding rectangle.
      const entry: ResizeObserverEntry | undefined = Array.isArray(entries) ? (entries as readonly ResizeObserverEntry[])[entries.length - 1] : undefined
      if (entry === undefined) {
        apply(element.getBoundingClientRect().width)
        return
      }
      // Border-box size ignoring transforms (an ancestor's `transform`); the fallback is the bounding rectangle.
      const box = entry.borderBoxSize as readonly ResizeObserverSize[] | ResizeObserverSize | undefined
      const first = Array.isArray(box) ? (box as readonly ResizeObserverSize[])[0] : (box as ResizeObserverSize | undefined)
      apply(first?.inlineSize ?? entry.contentRect.width)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [element, tracker])

  // The class has just been painted: under a lock this width is the width of the locked class, and a change in IT releases the lock.
  useIsomorphicLayoutEffect(() => {
    if (element !== null) tracker.laidOut(element.getBoundingClientRect().width)
  }, [element, tracker, widthClass])

  return [widthClass, setElement]
}
