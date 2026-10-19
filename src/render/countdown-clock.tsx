/**
 * The clock of a screen with a countdown (schema 9.21.0, `x-countdown.ticking`).
 *
 * The server render and the first browser frame use the moment of the render (or the host's `now`),
 * so the markup is the same on both sides. After the mount a screen that shows a countdown part keeps
 * ONE timer: every second if a part is `seconds`, otherwise every minute; with no countdown there is
 * no timer. The number is never more than one tick behind the clock, and a hidden tab draws nothing
 * until it is visible again. A host that pins `now` owns the clock: nothing ticks.
 *
 * Only the consumers of `ClockContext` are drawn again (the texts), not the whole screen: the
 * children element stays the same object.
 */
import { createContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { countdownTickOfTree } from '../countdown'
import type { UiNode } from '../types'
import { screenPart } from './screen-part'

export interface ScreenClock {
  /** The moment to count the time left against, epoch milliseconds. */
  readonly now: number
  /** The first browser frame is over: what was drawn by the server has been replaced by what the clock says. */
  readonly live: boolean
}

/** Absent before the mount, on the server and when the host pinned `now`: the texts take the moment of the render. */
export const ClockContext = createContext<ScreenClock | undefined>(undefined)

export const CountdownClock = screenPart(function CountdownClock({ root, pinned, children }: { readonly root: UiNode; readonly pinned: boolean; readonly children: ReactNode }): ReactNode {
  const tick = useMemo(() => countdownTickOfTree(root), [root])
  const [now, setNow] = useState<number | undefined>(undefined)
  const ticks = tick !== undefined && !pinned

  useEffect(() => {
    if (!ticks) {
      setNow(undefined)
      return undefined
    }
    const update = (): void => {
      if (typeof document === 'undefined' || !document.hidden) setNow(Date.now())
    }
    // One redraw straight after the mount replaces the server's text, then the timer.
    setNow(Date.now())
    const timer = setInterval(update, tick)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [ticks, tick])

  const value = useMemo(() => (now === undefined ? undefined : { now, live: true }), [now])
  return <ClockContext.Provider value={ticks ? value : undefined}>{children}</ClockContext.Provider>
})
