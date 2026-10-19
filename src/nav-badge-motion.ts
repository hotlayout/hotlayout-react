/**
 * The dot on a navigation item: appearing and fading (schema 9.24.0,
 * `x-style.layout.navBadgeMotion`). A mirror of the contract's reference rule; the shared rows are
 * the `navBadgeMotion...` groups of `contract/fixtures/bottom-zone/bottom-zone-cases.json`, and the
 * block below is compared with the artifact key `x-style.layout.navBadgeMotion`.
 *
 * The motion belongs to the dot, and only to a CHANGE of its condition on a shown screen: a dot that
 * was already there when the screen was shown (first show, "back", a section switch) is a state, not
 * an event. No React in this file: the server graph of the entry reads `nav-badge.ts`, not this.
 */

export const NAV_BADGE_MOTION = {
  appearMs: 320,
  disappearMs: 200,
  peakScale: 1.25,
  peakAt: 0.6,
} as const

/** `x-style.layout.navBadgeMotion` of the artifact, whole; a test compares the two. */
export const NAV_BADGE_MOTION_RULES = {
  refines: ['x-style.layout.navBadge.shown'],
  field: 'none-the-motion-belongs-to-the-dot',
  when: 'the-condition-changes-its-answer-while-the-screen-is-shown',
  firstShow: 'no-motion-the-dot-is-there-or-not',
  shownAgain: 'no-motion-a-screen-shown-again-is-a-first-show',
  appear: {
    durationMs: NAV_BADGE_MOTION.appearMs,
    scale: [0, NAV_BADGE_MOTION.peakScale, 1],
    at: [0, NAV_BADGE_MOTION.peakAt, 1],
    between: 'linear',
    origin: 'centre-of-the-dot',
    opacity: 1,
  },
  disappear: {
    durationMs: NAV_BADGE_MOTION.disappearMs,
    opacity: [1, 0],
    between: 'linear',
    scale: 1,
  },
  interrupted: 'a-new-change-starts-its-own-motion-from-its-start',
  reducedMotion: 'no-motion-the-dot-appears-and-disappears-at-once',
  layout: 'the-dot-does-not-change-the-item-during-the-motion',
  accessibleName: 'unchanged',
  editorCanvas: 'no-motion',
  olderReader: 'no-motion',
  cases: 'contract/fixtures/bottom-zone/bottom-zone-cases.json',
} as const

export type NavBadgeChange = 'appear' | 'disappear' | 'none'

export interface NavBadgeChangeInput {
  /** The item was already drawn on this show of the screen before the change (not its first frame). */
  readonly shownBefore: boolean
  readonly before: boolean
  readonly after: boolean
  readonly reducedMotion?: boolean | undefined
}

/** Whether the dot moves; the order of the checks is part of the rule. */
export function navBadgeChangeOf(input: NavBadgeChangeInput): NavBadgeChange {
  if (!input.shownBefore || input.reducedMotion === true || input.before === input.after) return 'none'
  return input.after ? 'appear' : 'disappear'
}

const lerp = (from: number, to: number, share: number): number => from + (to - from) * share
const shareOf = (t: number, duration: number): number => Math.min(1, Math.max(0, t / duration))

/** The scale of the dot `t` ms into the appearance: 0, then 1.25 at 0.6 of the time, then 1, linear between. */
export function navBadgeAppearScaleAt(t: number): number {
  const p = shareOf(t, NAV_BADGE_MOTION.appearMs)
  if (p <= NAV_BADGE_MOTION.peakAt) return lerp(0, NAV_BADGE_MOTION.peakScale, p / NAV_BADGE_MOTION.peakAt)
  return lerp(NAV_BADGE_MOTION.peakScale, 1, (p - NAV_BADGE_MOTION.peakAt) / (1 - NAV_BADGE_MOTION.peakAt))
}

/** The opacity of the dot `t` ms into the fading: 1 to 0, linear; the scale stays 1. */
export function navBadgeDisappearOpacityAt(t: number): number {
  return 1 - shareOf(t, NAV_BADGE_MOTION.disappearMs)
}

/** The keyframes the style sheet carries, derived from the numbers above so the two cannot drift apart. */
export function navBadgeKeyframes(): readonly string[] {
  const peak = String(NAV_BADGE_MOTION.peakAt * 100)
  return [
    `@keyframes hl-badge-appear{0%{scale:0}${peak}%{scale:${String(NAV_BADGE_MOTION.peakScale)}}100%{scale:1}}`,
    '@keyframes hl-badge-disappear{from{opacity:1}to{opacity:0}}',
  ]
}
