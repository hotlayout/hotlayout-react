/**
 * The motion of the dot on a navigation item (schema 9.24.0): it appears with a pop and fades out
 * when its condition CHANGES while the item is drawn.
 *
 * The first frame of a mounted item has no motion (the dot is there or not), which also covers the
 * first show, "back" and a section switch: each mounts the item anew. The server render and the
 * hydration frame carry no motion either. Before paint the change is noticed and the motion mark is
 * set, so a fading dot never flickers off for a frame; the dot stays in the markup until the fade is
 * over. A new change in the middle starts its own motion from its start (a new key), and "reduce
 * motion" is no motion at all.
 */
import { useEffect, useRef, useState } from 'react'

import { NAV_BADGE_MOTION, navBadgeChangeOf } from '../nav-badge-motion'
import { useIsomorphicLayoutEffect } from '../wide-nav-view'

export interface BadgeMotion {
  /** Whether the dot is in the markup: shown, or fading out. */
  readonly present: boolean
  readonly motion: 'appear' | 'disappear' | undefined
  /** Changes with every motion: a new key restarts the animation from its start. */
  readonly epoch: number
}

interface Moving {
  readonly kind: 'appear' | 'disappear'
  readonly epoch: number
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useBadgeMotion(dot: boolean): BadgeMotion {
  const before = useRef(dot)
  const epoch = useRef(0)
  const [moving, setMoving] = useState<Moving | undefined>(undefined)

  useIsomorphicLayoutEffect(() => {
    if (before.current === dot) return undefined
    const kind = navBadgeChangeOf({ shownBefore: true, before: before.current, after: dot, reducedMotion: prefersReducedMotion() })
    before.current = dot
    if (kind === 'none') {
      setMoving(undefined)
      return undefined
    }
    epoch.current += 1
    setMoving({ kind, epoch: epoch.current })
    return undefined
  }, [dot])

  // The motion mark goes away when the motion is over; a fading dot leaves the markup with it.
  useEffect(() => {
    if (moving === undefined) return undefined
    const timer = setTimeout(() => {
      setMoving(undefined)
    }, moving.kind === 'appear' ? NAV_BADGE_MOTION.appearMs : NAV_BADGE_MOTION.disappearMs)
    return () => {
      clearTimeout(timer)
    }
  }, [moving])

  // A motion that no longer matches the condition (it flipped again before the mark was set) is not drawn.
  const current = moving !== undefined && (moving.kind === 'appear') === dot ? moving : undefined
  return { present: dot || current !== undefined, motion: current?.kind, epoch: current?.epoch ?? 0 }
}
