/**
 * What a drag-to-confirm button does after the release, in one place: the busy state of 9.24.0
 * (`use-swipe-busy.ts`), the circle it collapses into and the fill over the screen of 9.34.0
 * (`use-swipe-motion.ts`).
 */
import { useState } from 'react'
import type { RefObject } from 'react'

import type { PressHandle } from '../runtime'
import type { Glide } from './use-swipe-busy'
import { useSwipeBusy } from './use-swipe-busy'
import type { SwipeOrb } from './use-swipe-motion'
import { useSwipeOrb, useSwipeRipple } from './use-swipe-motion'

export interface SwipeButtonMotionInput {
  readonly press: PressHandle | undefined
  readonly actionType: string | undefined
  readonly transition: 'ripple' | undefined
  readonly orbRef: RefObject<HTMLElement | null>
  readonly coreRef: RefObject<HTMLElement | null>
}

export interface SwipeButtonMotion {
  /** The action ran or is about to (the fill is playing) and the button waits: busy look, no gesture. */
  readonly waiting: boolean
  /** Waiting, or the circle is still expanding back: nothing can start. */
  readonly locked: boolean
  readonly orb: SwipeOrb
  readonly glide: Glide
  /** A press by keyboard or assistive technology: the action at once. */
  readonly press: () => void
  /** The pointer was released; `act` — past the threshold. */
  readonly release: (act: boolean) => void
}

export function useSwipeButtonMotion({ press, actionType, transition, orbRef, coreRef }: SwipeButtonMotionInput): SwipeButtonMotion {
  const busy = useSwipeBusy(press)
  const [rippling, setRippling] = useState(false)
  const waiting = busy.waiting || rippling
  const { orb, held, settleNow } = useSwipeOrb(waiting)
  const beginRipple = useSwipeRipple({ setRippling, press, actionType, transition, orbRef, coreRef, glideToEnd: busy.glideToEnd, settleNow })
  return {
    waiting,
    locked: waiting || held,
    orb,
    glide: busy.glide,
    press: busy.run,
    release: (act) => {
      // With the fill the action waits for it; otherwise it runs at once and the button stays busy.
      if (act && beginRipple()) return
      busy.shortReturn()
      if (act) busy.run()
    },
  }
}
