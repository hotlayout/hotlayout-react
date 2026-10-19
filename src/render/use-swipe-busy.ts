/**
 * The busy state of the drag-to-confirm button (schema 9.24.0, `swipe-busy.ts`): the action runs at
 * once, the thumb waits at the end, and the answer to the action ends the wait.
 *
 * The wait ends by the promise of the host, fulfilled or rejected (a promise is held for as long as
 * it takes), or by the time limit when the host returned none, or because the shown screen changed
 * under the button. A rejection is handled here, so it never reaches the render as an error.
 */
import { useContext, useEffect, useState } from 'react'

import type { PressOutcome } from '../runtime'
import { SWIPE_BUSY, swipeAfterReleaseOf } from '../swipe-busy'
import { ShowContext } from './contexts'

/** The wait: the show number it began at (a different one ends it) and the promise of the host, if there is one. */
interface Busy {
  readonly show: number
  readonly promise: PromiseLike<unknown> | undefined
}

/** What the thumb is doing between two states: it glides to the end, returns after the wait, or returns after a short drag. */
export type Glide = 'complete' | 'return' | 'short'

export interface SwipeBusy {
  readonly waiting: boolean
  readonly glide: Glide
  /** Runs the action once and starts the wait when the answer says so. */
  readonly run: () => void
  /** A drag that did not reach the threshold: the thumb returns with the short glide. */
  readonly shortReturn: () => void
}

export function useSwipeBusy(press: (() => PressOutcome | undefined) | undefined): SwipeBusy {
  const show = useContext(ShowContext)
  const [busy, setBusy] = useState<Busy | undefined>(undefined)
  const [glide, setGlide] = useState<Glide>('short')
  // A wait of an earlier show is over: the screen changed, the button is gone with it (or stands at the start when it is shown again).
  const waiting = busy?.show === show

  useEffect(() => {
    if (busy === undefined) return undefined
    let over = false
    const end = (): void => {
      if (over) return
      setGlide('return')
      setBusy(undefined)
    }
    if (busy.promise === undefined) {
      const timer = setTimeout(end, SWIPE_BUSY.maxMs)
      return () => {
        over = true
        clearTimeout(timer)
      }
    }
    busy.promise.then(end, end)
    return () => {
      over = true
    }
  }, [busy])

  // The shown screen changed under a waiting button: forget the wait.
  useEffect(() => {
    if (busy !== undefined && busy.show !== show) setBusy(undefined)
  }, [busy, show])

  const run = (): void => {
    const outcome = press?.()
    if (outcome === undefined || swipeAfterReleaseOf(outcome.runner) === 'return') return
    setGlide('complete')
    setBusy({ show, promise: outcome.answer })
  }
  return {
    waiting,
    glide,
    run,
    shortReturn: () => {
      setGlide('short')
    },
  }
}
