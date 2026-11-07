/**
 * The clock of the motion of the drag-to-confirm button (schema 9.34.0, `swipe-motion.ts`).
 *
 * Two parts, both fed by what the button is doing:
 *  - `useSwipeOrb`: while the button is busy, it collapses into a circle (the thumb has glided to
 *    the end first), and when the busy state ends the circle expands back before the thumb
 *    returns. The circle is `wide` for one frame (the pill is the whole button) and `round` after
 *    it, so the transition of the style sheet has something to start from;
 *  - `useSwipeRipple`: with `confirmTransition: 'ripple'` the action does NOT run at the release.
 *    The thumb glides, the button collapses, the fill grows over the screen, and only then the
 *    action runs (`swipeSequenceOf`). A button that leaves before the screen is covered runs
 *    nothing and takes its fill with it.
 */
import { useContext, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import type { PressHandle } from '../runtime'
import { SWIPE_BUSY } from '../swipe-busy'
import { RIPPLE_ACTION_TYPES, SWIPE_COLLAPSE, swipeSequenceOf } from '../swipe-motion'
import { useIsomorphicLayoutEffect } from '../wide-nav-view'
import { ScreenCoverContext, ShowContext } from './contexts'
import { prefersReducedMotion } from './motion-pref'
import type { RippleRun } from './swipe-ripple-layer'
import { startRipple } from './swipe-ripple-layer'

/** The circle of the collapsed button: none, the pill of the whole button (first frame, last frame of the expansion) or the round one. */
export type SwipeOrb = 'none' | 'wide' | 'round'

export interface SwipeOrbState {
  readonly orb: SwipeOrb
  /** The circle is expanding back: the thumb still stands at the end and has not returned yet. */
  readonly held: boolean
  /** The busy state is over for good (the action ran, the screen is covered): no expansion, the button is at rest. */
  readonly settleNow: () => void
}

export function useSwipeOrb(active: boolean): SwipeOrbState {
  const show = useContext(ShowContext)
  const [orb, setOrb] = useState<SwipeOrb>('none')
  const [held, setHeld] = useState(false)
  const orbRef = useRef<SwipeOrb>('none')
  const showRef = useRef(show)
  const startedAt = useRef(show)
  const instant = useRef(false)
  useIsomorphicLayoutEffect(() => {
    orbRef.current = orb
    showRef.current = show
  })

  useEffect(() => {
    if (active) {
      if (prefersReducedMotion()) return undefined
      startedAt.current = showRef.current
      let outer: number | undefined
      let inner: number | undefined
      const timer = setTimeout(() => {
        setOrb('wide')
        outer = requestAnimationFrame(() => {
          inner = requestAnimationFrame(() => {
            setOrb('round')
          })
        })
      }, SWIPE_BUSY.completeMs)
      return () => {
        clearTimeout(timer)
        if (outer !== undefined) cancelAnimationFrame(outer)
        if (inner !== undefined) cancelAnimationFrame(inner)
      }
    }
    if (orbRef.current === 'none') {
      instant.current = false
      return undefined
    }
    // The shown screen changed under the button: it is shown again at rest, nothing to expand.
    if (instant.current || showRef.current !== startedAt.current) {
      instant.current = false
      setOrb('none')
      setHeld(false)
      return undefined
    }
    setHeld(true)
    setOrb('wide')
    const timer = setTimeout(() => {
      setOrb('none')
      setHeld(false)
    }, SWIPE_COLLAPSE.durationMs)
    return () => {
      clearTimeout(timer)
    }
  }, [active])

  const settleNow = (): void => {
    instant.current = true
    setOrb('none')
    setHeld(false)
  }
  return { orb, held, settleNow }
}

export interface RippleInput {
  /** From the release to the action: the button is busy and takes no gesture. */
  readonly setRippling: (rippling: boolean) => void
  readonly press: PressHandle | undefined
  readonly actionType: string | undefined
  readonly transition: 'ripple' | undefined
  readonly orbRef: RefObject<HTMLElement | null>
  readonly coreRef: RefObject<HTMLElement | null>
  readonly glideToEnd: () => void
  readonly settleNow: () => void
}

/** A drag was released past the threshold: `true` — the fill takes over and the action runs after it; `false` — run the action at once. */
export function useSwipeRipple(input: RippleInput): () => boolean {
  const cover = useContext(ScreenCoverContext)
  const latest = useRef({ input, cover })
  useIsomorphicLayoutEffect(() => {
    latest.current = { input, cover }
  })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const layer = useRef<RippleRun | undefined>(undefined)
  useEffect(
    () => () => {
      // The button left before the screen was covered: no action, no layer.
      if (timer.current !== undefined) clearTimeout(timer.current)
      layer.current?.cancel()
    },
    [],
  )

  const grow = (): void => {
    timer.current = undefined
    const { input: now, cover: notice } = latest.current
    const act = (): void => {
      layer.current = undefined
      now.setRippling(false)
      now.settleNow()
      now.press?.()
    }
    const orb = now.orbRef.current
    const core = now.coreRef.current
    const run = orb === null || core === null ? undefined : startRipple({ orb, core, act, onScreenCovered: notice })
    if (run === undefined) {
      act()
      return
    }
    layer.current = run
  }

  const begin = (): boolean => {
    const { actionType, transition, press } = latest.current.input
    if (press === undefined || actionType === undefined) return false
    // Who would run the action is the screen's answer: a jump whose target is not found goes to the host, and there is nowhere to cover. Without a screen to ask, the type decides.
    const steps = swipeSequenceOf({
      runner: press.runner?.() ?? ((RIPPLE_ACTION_TYPES as readonly string[]).includes(actionType) ? 'reader' : 'host'),
      actionType,
      transition,
      way: 'swipe',
      reducedMotion: prefersReducedMotion(),
    })
    if (!steps.includes('ripple')) return false
    latest.current.input.setRippling(true)
    latest.current.input.glideToEnd()
    timer.current = setTimeout(grow, SWIPE_BUSY.completeMs + SWIPE_COLLAPSE.durationMs)
    return true
  }
  return begin
}
