/**
 * The style sheet of the motion the reader itself performs (schema 9.24.0): the ring of the busy
 * swipe button and the pop and fade of the dot on a navigation item. The numbers come from the
 * mirrors of the contract rules, so the sheet cannot drift from them. Under the system "reduce
 * motion" none of it runs.
 */
import { NAV_BADGE_MOTION, navBadgeKeyframes } from './nav-badge-motion'

export function readerMotionCss(scope: string): readonly string[] {
  const appear = `${scope} [data-hl-badge-motion="appear"]`
  const disappear = `${scope} [data-hl-badge-motion="disappear"]`
  return [
    '@keyframes hl-spin{to{transform:rotate(360deg)}}',
    ...navBadgeKeyframes(),
    `${appear}{animation:hl-badge-appear ${String(NAV_BADGE_MOTION.appearMs)}ms linear both}`,
    `${disappear}{animation:hl-badge-disappear ${String(NAV_BADGE_MOTION.disappearMs)}ms linear both}`,
    `@media (prefers-reduced-motion:reduce){${scope} [data-hl-spinner]>span,${appear},${disappear}{animation:none!important}}`,
  ]
}
