/**
 * The fade of a node whose `visibleIf` changes (schema 9.33.0, `visibilityTransition: 'fade'`).
 *
 * The phases and their moments come from `visibility-fade.ts`; this file is the clock and the
 * translation of a phase into what the node draws: whether it is in the layout, whether it is
 * transparent, whether it is `inert`. The first draw, going back (the screen is drawn anew), a
 * change of the language or of the width class, "reduce motion" and the server draw the node at
 * rest of its condition.
 */
import { useContext, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { screenAppBarOf } from '../media-chrome'
import type { UiNode } from '../types'
import {
  VISIBILITY_FADE_IN,
  VISIBILITY_FADE_OUT,
  visibilityFadeChange,
  visibilityFadeEndsAt,
  visibilityFadeRest,
  visibilityFadeSettle,
  visibilityTransitionOf,
} from '../visibility-fade'
import type { VisibilityFadePhase, VisibilityFadeState } from '../visibility-fade'
import { PlaceContext, WidthClassContext } from './contexts'
import { prefersReducedMotion } from './motion-pref'

export interface VisibilityFadeView {
  /** The node is drawn: its condition holds, or it still fades out, or it has entered. */
  readonly drawn: boolean
  /** The phase of a transition; `undefined` at rest. */
  readonly phase: Exclude<VisibilityFadePhase, 'shown' | 'hidden'> | undefined
  /** Opacity 0 for this frame (fading out, or just entered and not yet started). */
  readonly transparent: boolean
}

const atRest = (shown: boolean): VisibilityFadeView => ({ drawn: shown, phase: undefined, transparent: false })

interface Hold {
  readonly shown: boolean
  /** The width class and the language `shown` was seen under: a change of either is "at once". */
  readonly context: string
  readonly fade: VisibilityFadeState
  /** The state the current run of phases began with (a change of the condition makes a new one): its timers belong to it. */
  readonly root: VisibilityFadeState
  /** The node that has entered was drawn once with opacity 0: it can start to fade in. */
  readonly started: boolean
}

const clock = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now())

/**
 * The zones of the screen read no fade: they follow their condition at once. A zone is a navigation
 * bar or its item, a node with a `pin` field (whatever the word), or the app bar that is the first
 * child of the screen root.
 */
export function isScreenZoneNode(node: UiNode, parent: UiNode | undefined): boolean {
  if (node.type === 'NavBar' || node.type === 'NavItem') return true
  if ((node as { readonly pin?: unknown }).pin !== undefined) return true
  return parent?.type === 'Screen' && screenAppBarOf(parent.children ?? []) === node
}

/** What a node with the field draws now; a node without it (or a zone) just follows `shown`. */
export function useVisibilityFade(node: UiNode, parent: UiNode | undefined, shown: boolean): VisibilityFadeView {
  const enabled = visibilityTransitionOf(node) === 'fade' && !isScreenZoneNode(node, parent)
  const context = `${useContext(WidthClassContext)}|${useContext(PlaceContext).shown.translation ?? ''}`
  const [hold, setHold] = useState<Hold>(() => {
    const rest = visibilityFadeRest(shown)
    return { shown, context, fade: rest, root: rest, started: true }
  })
  let current = hold
  if (hold.shown !== shown || hold.context !== context) {
    const animate = enabled && hold.context === context && !prefersReducedMotion()
    const fade = visibilityFadeChange(hold.fade, shown, clock(), animate)
    current = { shown, context, fade, root: fade, started: false }
    setHold(current)
  }
  const { fade, root } = current
  // One timer for the end of every phase of the run, so the run does not wait for a render between its phases.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (let step = root, end = visibilityFadeEndsAt(step); end !== undefined; end = visibilityFadeEndsAt(step)) {
      const at = end
      timers.push(
        setTimeout(() => {
          setHold((state) => {
            if (state.root !== root) return state
            const next = visibilityFadeSettle(state.fade, Math.max(clock(), at))
            return next === state.fade ? state : { ...state, fade: next, started: next.phase === state.fade.phase ? state.started : false }
          })
        }, Math.max(0, at - clock())),
      )
      step = visibilityFadeSettle(step, at)
    }
    return () => {
      for (const timer of timers) clearTimeout(timer)
    }
  }, [root])
  // A node that has just entered the layout stands one frame with opacity 0, or the transition would have nowhere to start from.
  const needsStart = fade.phase === 'entering' && fade.from === 0 && !current.started
  useEffect(() => {
    if (!needsStart) return undefined
    const frame = requestAnimationFrame(() => {
      setHold((state) => (state.fade === fade ? { ...state, started: true } : state))
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [needsStart, fade])
  switch (fade.phase) {
    case 'shown':
      return atRest(true)
    case 'hidden':
      return atRest(false)
    case 'waiting':
      return { drawn: false, phase: 'waiting', transparent: false }
    case 'leaving':
      return { drawn: true, phase: 'leaving', transparent: true }
    case 'entering':
      return { drawn: true, phase: 'entering', transparent: needsStart }
  }
}

/** Marks of a node in a transition: the phase for the style sheet and tests, `inert` and `aria-hidden` while it fades out. */
export function visibilityFadeMark(view: VisibilityFadeView): { readonly 'data-hl-fade'?: string; readonly inert?: boolean; readonly 'aria-hidden'?: true } {
  if (view.phase === 'entering') return { 'data-hl-fade': 'entering' }
  // `inert` is the string 'true' passed as the boolean React 19 types ask for: React 18 does not know the
  // attribute and would drop `true` with a warning but writes a string through; React 19 reads a non-empty string as true.
  if (view.phase === 'leaving') return { 'data-hl-fade': 'leaving', inert: 'true' as unknown as boolean, 'aria-hidden': true }
  return {}
}

/** The transition of the opacity the phase asks for, and the opacity of the frame that has nothing to start from. */
export function visibilityFadeCss(css: CSSProperties, view: VisibilityFadeView): CSSProperties {
  if (view.phase === 'leaving') {
    return { ...css, opacity: 0, transition: `opacity ${String(VISIBILITY_FADE_OUT.durationMs)}ms cubic-bezier(${VISIBILITY_FADE_OUT.curve.join(',')})`, pointerEvents: 'none' }
  }
  if (view.phase !== 'entering') return css
  const transition = `opacity ${String(VISIBILITY_FADE_IN.durationMs)}ms cubic-bezier(${VISIBILITY_FADE_IN.curve.join(',')})`
  return view.transparent ? { ...css, opacity: 0, transition } : { ...css, transition }
}
