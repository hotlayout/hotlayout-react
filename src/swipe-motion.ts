/**
 * "Drag to confirm": the motion (schema 9.34.0, `Button.confirmTransition`). A mirror of the
 * contract's reference rule; the shared rows are
 * `contract/fixtures/swipe-motion/swipe-motion-cases.json`, and `package.monorepo.test.tsx` and the
 * reader test compare the numbers with the artifact block `x-swipeConfirmMotion`.
 *
 *  - while the thumb is dragged a fill follows it and the label fades with the progress;
 *  - past the threshold the button collapses into a circle with the busy indicator;
 *  - with `confirmTransition: 'ripple'` the circle grows over the whole screen, then the action
 *    runs and the fill fades out over the next screen.
 */
import type { SwipeActionRunner } from './swipe-busy'
import type { SwipeTrack } from './swipe-confirm'
import { swipeGeometryOf } from './swipe-confirm'
import { cubicBezierAt } from './visibility-fade'

/** The collapse into a circle, milliseconds and the curve (fastOutSlowIn). */
export const SWIPE_COLLAPSE = { durationMs: 600, curve: [0.4, 0, 0.2, 1] } as const
/** The fill over the screen. */
export const SWIPE_RIPPLE = { durationMs: 800, curve: 'linear' } as const
/** The fill fading out over the next screen. */
export const SWIPE_REVEAL = { durationMs: 200, curve: 'linear' } as const
/** Opacity of the halo of the circle. */
export const SWIPE_HALO_OPACITY = 0.4
/** The actions the fill may lead: the ones the reader itself performs as a change of screen. */
export const RIPPLE_ACTION_TYPES = ['navigate', 'navigate.back'] as const

const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)

/** The field as the reader takes it: only the word `ripple`, anything else is no field. */
export function confirmTransitionOf(props: object | null | undefined): 'ripple' | undefined {
  if (props === null || props === undefined) return undefined
  return (props as { readonly confirmTransition?: unknown }).confirmTransition === 'ripple' ? 'ripple' : undefined
}

/** Opacity of the label: it fades with the way of the thumb. */
export function swipeLabelOpacityOf(progress: number): number {
  return 1 - clamp01(progress)
}

export interface SwipeStrip {
  readonly start: number
  readonly width: number
}

/** The fill behind the thumb: from the rest place of the thumb to its far edge. */
export function swipeTrailOf(track: SwipeTrack, progress: number): SwipeStrip {
  const geometry = swipeGeometryOf(track)
  return { start: Math.max(0, track.border) + Math.max(0, track.inset), width: clamp01(progress) * geometry.travel + geometry.diameter }
}

/**
 * Radius of the thumb and of the fill behind it, concentric with the track: the radius of the
 * track (capped at half its height) minus the inset, never below zero and never above the circle.
 * An unmeasured radius gives the circle.
 */
export function swipeThumbRadiusOf(track: SwipeTrack & { readonly radius: number | undefined }): number {
  const circle = swipeGeometryOf(track).diameter / 2
  const radius = track.radius
  if (radius === undefined || Number.isNaN(radius)) return circle
  const actual = Math.min(Math.max(0, radius), Math.max(0, track.height) / 2)
  return Math.min(circle, Math.max(0, actual - Math.max(0, track.inset)))
}

export interface SwipeCollapseFrame extends SwipeStrip {
  readonly height: number
  readonly ring: number
  readonly surfaceOpacity: number
  readonly haloOpacity: number
}

/** The collapse `elapsed` milliseconds after its start. */
export function swipeCollapseAt(track: SwipeTrack, elapsed: number): SwipeCollapseFrame {
  const eased = cubicBezierAt(SWIPE_COLLAPSE.curve, clamp01(elapsed / SWIPE_COLLAPSE.durationMs))
  const height = Math.max(0, track.height)
  const full = Math.max(height, track.width)
  const width = full - (full - height) * eased
  return {
    start: (track.width - width) / 2,
    width,
    height,
    ring: Math.max(0, track.border) + Math.max(0, track.inset),
    surfaceOpacity: 1 - eased,
    haloOpacity: SWIPE_HALO_OPACITY * eased,
  }
}

export interface SwipeRippleArea {
  readonly centerX: number
  readonly centerY: number
  readonly screenWidth: number
  readonly screenHeight: number
  /** Diameter of the core of the circle (without the halo). */
  readonly core: number
}

/** The final scale of the circle: its core covers the farthest corner of the screen. */
export function swipeRippleScaleOf(area: SwipeRippleArea): number {
  const dx = Math.max(area.centerX, area.screenWidth - area.centerX)
  const dy = Math.max(area.centerY, area.screenHeight - area.centerY)
  const radius = area.core / 2
  if (!(radius > 0)) return 1
  return Math.max(1, Math.hypot(dx, dy) / radius)
}

/** The scale of the circle `elapsed` milliseconds after the fill began, linear. */
export function swipeRippleAt(scale: number, elapsed: number): number {
  return 1 + (Math.max(1, scale) - 1) * clamp01(elapsed / SWIPE_RIPPLE.durationMs)
}

/** The opacity of the fill `elapsed` milliseconds after the next screen began to show. */
export function swipeRevealAt(elapsed: number): number {
  return 1 - clamp01(elapsed / SWIPE_REVEAL.durationMs)
}

export type SwipeStep = 'act' | 'glide' | 'collapse' | 'busy' | 'ripple' | 'reveal' | 'return'

export interface SwipeSequenceInput {
  readonly runner: SwipeActionRunner
  readonly actionType: string
  readonly transition: 'ripple' | undefined
  /** A dragged thumb is `swipe`; Enter, Space and an assistive activation are `keyboard`. */
  readonly way: 'swipe' | 'keyboard'
  readonly reducedMotion: boolean
}

/** Whether the fill plays: after a drag, on a navigation the reader performs, without "reduce motion". */
export function swipeRipplePlays(input: SwipeSequenceInput): boolean {
  return input.transition === 'ripple' && input.way === 'swipe' && !input.reducedMotion && input.runner === 'reader' && (RIPPLE_ACTION_TYPES as readonly string[]).includes(input.actionType)
}

/** What happens, in order, after the release past the threshold. With the fill the action runs AFTER it. */
export function swipeSequenceOf(input: SwipeSequenceInput): readonly SwipeStep[] {
  if (input.runner === 'none' || input.runner === 'invalid') return ['act', 'return']
  if (swipeRipplePlays(input)) return ['glide', 'collapse', 'ripple', 'act', 'reveal']
  if (input.reducedMotion) return ['act', 'busy']
  return ['act', 'glide', 'collapse', 'busy']
}

/** The end of the busy state: the circle expands back, then the thumb returns. */
export function swipeBusyReturnOf(reducedMotion: boolean): readonly ('expand' | 'return')[] {
  return reducedMotion ? ['return'] : ['expand', 'return']
}
