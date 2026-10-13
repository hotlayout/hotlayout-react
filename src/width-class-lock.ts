/**
 * Width class from measurements, with a lock against oscillation (since 9.18.0; a rule of the
 * PACKAGE, not of the contract).
 *
 * The contract says one thing: the class is the width of the root's box. An oscillation is
 * possible only where the root's width depends on what is drawn inside it (the host gave the root
 * no width, or the host's scrollbar appears depending on the content height): the class changes
 * the content, the content changes the width, the width changes the class. Without a stop this is
 * a redraw on every frame for as long as the page is open.
 *
 * HOW AN OSCILLATION IS RECOGNISED. By RETURNING, not by pattern: there are three classes, so the
 * fourth change in a row inevitably leads back to a class already visited, whatever the cycle
 * (of two classes or of three). An oscillation changes class on every render, and four changes
 * fit in half a second even at ten frames per second; a person will not deliberately cross a
 * class boundary four times in half a second. The class then becomes the NARROWEST of the
 * cycle's classes and is locked.
 *
 * WHEN THE LOCK IS RELEASED. Under the lock the class is stable, hence the layout is stable, hence
 * the width is stable. A width that CHANGED under the lock comes from the host (a window, a
 * column), not from the content: the lock is released and the class is taken from the new width.
 * If the oscillation starts again it locks again; each release is paid for by a real width
 * change, so no infinite cycle results.
 *
 * HONEST JITTER of a window edge on a class boundary looks like a two-class oscillation, and gets
 * locked. It is told apart by the width UNDER the lock: it is not the width the cycle showed for
 * that class. Such a lock is "uncertain": it is released by any width change like every lock, and
 * if the width never changes, by itself after a second, with a single check (the class is taken
 * from the measured width; a real oscillation locks a second time, and then without checks).
 *
 * No React and no DOM in this module: the caller (`useWidthClass`) supplies width and time.
 */
import type { WidthClass } from './width-class'
import { WIDTH_CLASSES, widthClassOf } from './width-class'

/** This many class changes in a row within `LOOP_WINDOW_MS` mean an oscillation: with three classes the fourth change always returns. */
export const LOOP_CHANGES = 4
/** The window the oscillation's changes must fit in (ms): four renders even at 10 frames per second. */
export const LOOP_WINDOW_MS = 500
/** A measurement that arrives no later than this after the lock and equals the class's width in the cycle is a step of the cycle itself, not the host (ms). */
export const OWN_STEP_MS = 100
/** After this long an uncertain lock checks itself if the width has not changed (ms). */
export const PROBE_MS = 1000
/** Widths closer than this are the same width (a fraction of a pixel: fractional sizes and engine rounding). */
export const SAME_WIDTH_PX = 0.5

interface Change {
  readonly to: WidthClass
  /** The width that caused this change: the one the root had when drawn in the PREVIOUS class. */
  readonly width: number
  readonly at: number
}

interface Lock {
  readonly at: number
  /** The root's width under the lock; a different width releases it. */
  width: number
  /** The width the cycle showed for the locked class; `undefined` when the window had none. */
  readonly expected: number | undefined
  /** Whether the width under the lock has been measured since the locked class was drawn. */
  settled: boolean
  /** A certain lock: the width under it is the one the cycle promised. An uncertain one checks itself (`probe`). */
  trusted: boolean
}

export interface WidthClassTracker {
  /** The effective class. */
  readonly current: () => WidthClass
  /** A new measurement of the root's width. Zero, negative and non-numbers mean "unknown", and the class stays. */
  readonly observe: (width: number, now: number) => WidthClass
  /** The root's width right after a class was drawn (before the browser paints): under a lock this is its width. */
  readonly laidOut: (width: number) => void
  /** The moment an uncertain lock should be checked; `undefined` when there is nothing to check. */
  readonly probeDue: () => number | undefined
  /** The check of an uncertain lock: if the time has passed, the lock is released and the class is taken from `width`. */
  readonly probe: (width: number, now: number) => WidthClass
  /** Whether the class is locked now (for tests and diagnostics). */
  readonly locked: () => boolean
}

const same = (a: number, b: number): boolean => Math.abs(a - b) <= SAME_WIDTH_PX

/** The width the root had in class `klass` in this cycle: the measurement that caused the NEXT change. The freshest one. */
function widthShownIn(klass: WidthClass, changes: readonly Change[]): number | undefined {
  for (let index = changes.length - 2; index >= 0; index -= 1) {
    if (changes[index]?.to === klass) return changes[index + 1]?.width
  }
  return undefined
}

export function createWidthClassTracker(initial: WidthClass): WidthClassTracker {
  let current = initial
  let changes: readonly Change[] = []
  let lock: Lock | undefined
  let probedAt: number | undefined

  const release = (): void => {
    lock = undefined
    changes = []
  }

  const observe = (width: number, now: number): WidthClass => {
    if (!(width > 0)) return current
    if (lock !== undefined) {
      if (same(width, lock.width)) return current
      // A step of the cycle itself that arrived after the lock (a host layout that answers late): this is the locked class's width.
      if (lock.expected !== undefined && same(width, lock.expected) && now - lock.at <= OWN_STEP_MS) {
        lock.width = width
        lock.settled = true
        return current
      }
      release()
    }
    const next = widthClassOf(width)
    if (next === current) return current
    changes = [...changes, { to: next, width, at: now }].slice(-LOOP_CHANGES)
    const first = changes[0]
    if (changes.length === LOOP_CHANGES && first !== undefined && now - first.at <= LOOP_WINDOW_MS) {
      const visited = changes
      const narrowest = WIDTH_CLASSES.find((name) => visited.some((change) => change.to === name)) ?? next
      // The root is already drawn in the narrowest class: this measurement is its width, and there is no need to wait for a render.
      const drawn = narrowest === current
      lock = {
        at: now,
        width,
        expected: drawn ? width : widthShownIn(narrowest, visited),
        settled: drawn,
        trusted: drawn || (probedAt !== undefined && now - probedAt <= LOOP_WINDOW_MS),
      }
      changes = []
      current = narrowest
      return current
    }
    current = next
    return current
  }

  const laidOut = (width: number): void => {
    if (lock === undefined || lock.settled || !(width > 0)) return
    lock.settled = true
    lock.width = width
    // The width under the lock is the one the cycle showed for this class: the content really does change the width itself.
    if (lock.expected !== undefined && same(width, lock.expected)) lock.trusted = true
  }

  const probeDue = (): number | undefined => (lock === undefined || lock.trusted ? undefined : lock.at + PROBE_MS)

  const probe = (width: number, now: number): WidthClass => {
    if (lock === undefined || lock.trusted || now - lock.at < PROBE_MS) return current
    release()
    probedAt = now
    return observe(width, now)
  }

  return { current: () => current, observe, laidOut, probeDue, probe, locked: () => lock !== undefined }
}
