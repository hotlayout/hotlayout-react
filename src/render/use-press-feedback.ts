/**
 * The pointer side of the press feedback (schema 9.25.0, `press-feedback.ts`): the attributes and the
 * handlers a node that performs the action of a press puts on its element.
 *
 * The pressed pose is set by an ATTRIBUTE the handlers toggle on the element itself, not by React
 * state (no render per press) and not by `:active` alone: a tap shorter than the way down would
 * never show the pose. On release the attribute stays until the way down has had its time, then the
 * element goes back along the slower curve. Only the innermost control answers: a press that lands
 * on a control inside a card marks that control, not the card.
 */
import type { HTMLAttributes, PointerEvent } from 'react'

import { PRESS_DOWN, PRESS_FEEDBACK_ATTRIBUTE, PRESS_PRESSED_ATTRIBUTE } from '../press-feedback'
import type { PressFeedbackKind } from '../press-feedback'
import { controlUnder } from './control-under'

type FeedbackAttributes = Pick<HTMLAttributes<HTMLElement>, 'onPointerDown' | 'onPointerUp' | 'onPointerCancel' | 'onPointerLeave'> & { readonly [PRESS_FEEDBACK_ATTRIBUTE]?: PressFeedbackKind }

/** When the element went down, and the timer that lets it go back. */
const wentDown = new WeakMap<Element, number>()
const releasing = new WeakMap<Element, ReturnType<typeof setTimeout>>()

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now())

function pressDown(event: PointerEvent<HTMLElement>): void {
  // Another mouse button is not a press; a touch or a pen has `button` 0 as well.
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const element = event.currentTarget
  if (controlUnder(event.target, element) !== element) return
  const pending = releasing.get(element)
  if (pending !== undefined) clearTimeout(pending)
  releasing.delete(element)
  wentDown.set(element, now())
  element.setAttribute(PRESS_PRESSED_ATTRIBUTE, '')
}

function pressUp(event: PointerEvent<HTMLElement>): void {
  const element = event.currentTarget
  const since = wentDown.get(element)
  if (since === undefined) return
  wentDown.delete(element)
  // A press shorter than the way down still reaches the pose: the element is let go only after `down.durationMs`.
  const wait = Math.max(0, PRESS_DOWN.durationMs - (now() - since))
  const letGo = (): void => {
    releasing.delete(element)
    element.removeAttribute(PRESS_PRESSED_ATTRIBUTE)
  }
  if (wait === 0) letGo()
  else releasing.set(element, setTimeout(letGo, wait))
}

/** The attributes and handlers of a node that gives feedback; nothing when the kind is `undefined`. */
export function pressFeedbackProps(kind: PressFeedbackKind | undefined): FeedbackAttributes {
  if (kind === undefined) return {}
  return { [PRESS_FEEDBACK_ATTRIBUTE]: kind, onPointerDown: pressDown, onPointerUp: pressUp, onPointerCancel: pressUp, onPointerLeave: pressUp }
}
