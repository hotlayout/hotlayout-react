/**
 * The long press of a node (schema 9.26.0, `long-press.ts`): the pointer, the keys and the name for
 * assistive technology.
 *
 *  - A POINTER that stays down on the node past the threshold, within the touch slop, runs the long
 *    press action while it is still down (the haptic request, the analytics event and the action, in
 *    that order, through the same path as the press of `action`). The click that follows the release
 *    is swallowed: the press does not happen after a long press.
 *  - The node takes the touch only when it is the RECEIVER: the innermost control under the finger.
 *    A button in a card keeps its press and the card gets nothing; a list row with its own long press
 *    inside a card is the receiver itself.
 *  - The KEYBOARD: the context menu key and Shift+F10 on the focused node run it at once. Enter and
 *    Space stay the press of `action`.
 *  - The `contextmenu` event on such a node is cancelled: the browser of a phone opens its own menu on
 *    the same hold. It is not a long press itself - a right mouse button does nothing.
 *  - ASSISTIVE TECHNOLOGY: the name of the action is a hidden element the node is described by
 *    (`aria-describedby`), and `aria-keyshortcuts` lists the keys. The name is not part of the name of
 *    the control.
 */
import { createContext, useContext, useEffect, useId, useRef } from 'react'
import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from 'react'

import { actionOf, INERT_ACTION_TYPE } from '../actions'
import { acceptsLongPress, isLongPressKey, LONG_PRESS_LABEL_PROP, LONG_PRESS_MS, LONG_PRESS_PROP, TOUCH_SLOP } from '../long-press'
import { carriesTrack } from '../press'
import { isSilentText } from '../layout-rules'
import { isRecord } from '../sanitize'
import { shownTextOf } from '../shown-text'
import type { UiNode } from '../types'
import { IssueContext } from './contexts'
import { controlUnder } from './control-under'
import { screenPart } from './screen-part'
import { usePress } from './use-press'
import { useText } from './use-text'

type Handlers = Pick<HTMLAttributes<HTMLElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onContextMenu'>

/** What a node with a long press puts on its element and keeps for its click and keys. */
export interface LongPressWiring {
  /** The id of the hidden element that holds the name of the action. */
  readonly noteId: string
  /** The name of the action as it is read, or `undefined` when nothing would be heard (no description is drawn). */
  readonly name: string | undefined
  /** The pointer handlers and the cancelled `contextmenu` event. */
  readonly handlers: Handlers
  /** `aria-describedby` (when there is a name) and `aria-keyshortcuts`. */
  readonly attributes: Pick<HTMLAttributes<HTMLElement>, 'aria-describedby' | 'aria-keyshortcuts'>
  /** A click that arrives after a long press fired is swallowed once: true means "this click is not a press". */
  readonly swallowClick: (event: MouseEvent<HTMLElement>) => boolean
  /** The context menu key or Shift+F10 on the focused node: runs the long press and says so. */
  readonly runFromKey: (event: KeyboardEvent<HTMLElement>) => boolean
  /** Looks and cursor of a node that holds a finger: no text selection and no callout of the system. */
  readonly look: CSSProperties
}

/** `aria-keyshortcuts` of a node with a long press: the keys of `x-longPress.accessibility.keys`. */
const KEYS = 'ContextMenu Shift+F10'

/** The long press action of a node that does something, or `undefined`: none, not an action, `none` without analytics. */
export function longPressActionOf(node: UiNode): { readonly type: string } | undefined {
  if (!acceptsLongPress(node.type) || !isRecord(node.props)) return undefined
  const action = actionOf(node.props[LONG_PRESS_PROP])
  return action !== undefined && (action.type !== INERT_ACTION_TYPE || carriesTrack(action)) ? action : undefined
}

/** Merges the handlers of the press feedback and of the long press onto one element: both run, the feedback first. */
export function withLongPress<T extends Handlers>(own: T, long: LongPressWiring | undefined): T {
  if (long === undefined) return own
  const merged: Record<string, unknown> = { ...own }
  for (const [name, handler] of Object.entries(long.handlers)) {
    const first = (own as Record<string, unknown>)[name]
    merged[name] = typeof first === 'function' ? (event: unknown) => { (first as (event: unknown) => void)(event); (handler as (event: unknown) => void)(event) } : handler
  }
  return merged as T
}

/** Who describes the node: the wiring of the node whose view is being drawn, for the hidden name drawn inside it. */
export const LongPressContext = createContext<LongPressWiring | undefined>(undefined)

interface Hold {
  readonly x: number
  readonly y: number
  readonly timer: ReturnType<typeof setTimeout>
}

/**
 * The long press of a node. Hooks run for every node (the order of hooks cannot depend on the
 * document); the answer is `undefined` for a node that has no long press that does something.
 */
export function useLongPress(node: UiNode, props: Readonly<Record<string, unknown>>): LongPressWiring | undefined {
  const report = useContext(IssueContext)
  const accepts = acceptsLongPress(node.type)
  const raw = accepts ? props[LONG_PRESS_PROP] : undefined
  const given = actionOf(raw)
  if (raw !== undefined && raw !== null && given === undefined) report({ where: `node “${node.id}”: longPress`, reason: 'the long press is not an object with a text `type`; the node has no long press' })
  const action = given !== undefined && (given.type !== INERT_ACTION_TYPE || carriesTrack(given)) ? given : undefined
  const run = usePress(action, node.id)
  const label = shownTextOf(useText(accepts ? props[LONG_PRESS_LABEL_PROP] : undefined, LONG_PRESS_LABEL_PROP))
  const noteId = useId()
  const hold = useRef<Hold | undefined>(undefined)
  const fired = useRef(false)
  // The hold ripens later than the render it began in: the timer calls the press of the render that is on screen then.
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  })

  const clear = (): void => {
    if (hold.current !== undefined) clearTimeout(hold.current.timer)
    hold.current = undefined
  }
  useEffect(
    () => () => {
      if (hold.current !== undefined) clearTimeout(hold.current.timer)
      hold.current = undefined
    },
    [],
  )
  if (run === undefined) return undefined

  const name = label === '' || isSilentText(label) ? undefined : label
  const handlers: Handlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      // A new touch ends the memory of the last long press.
      fired.current = false
      clear()
      // Another mouse button is not a hold; a touch and a pen have `button` 0 as well.
      if (event.pointerType === 'mouse' && event.button !== 0) return
      // The receiver is the innermost control under the finger: a control inside keeps the touch.
      if (controlUnder(event.target, event.currentTarget) !== event.currentTarget) return
      const timer = setTimeout(() => {
        hold.current = undefined
        fired.current = true
        runRef.current?.()
      }, LONG_PRESS_MS)
      hold.current = { x: event.clientX, y: event.clientY, timer }
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const start = hold.current
      if (start !== undefined && Math.hypot(event.clientX - start.x, event.clientY - start.y) > TOUCH_SLOP) clear()
    },
    onPointerUp: clear,
    onPointerCancel: () => {
      clear()
      fired.current = false
    },
    // The menu of the browser on the same hold; a right mouse button is not a long press, it does nothing.
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault()
    },
  }
  return {
    noteId,
    name,
    handlers,
    attributes: { ...(name === undefined ? {} : { 'aria-describedby': noteId }), 'aria-keyshortcuts': KEYS },
    swallowClick: (event) => {
      if (!fired.current) return false
      fired.current = false
      event.preventDefault()
      event.stopPropagation()
      return true
    },
    runFromKey: (event) => {
      if (!isLongPressKey(event)) return false
      fired.current = false
      event.preventDefault()
      event.stopPropagation()
      runRef.current?.()
      return true
    },
    look: { WebkitTouchCallout: 'none', userSelect: 'none' },
  }
}

/** The hidden name of the long press action: a text nothing draws and the node is described by. */
export const LongPressNote = screenPart(function LongPressNote({ long }: { readonly long: LongPressWiring | undefined }): ReactNode {
  if (long?.name === undefined) return null
  // `display: none` inline: the reset of the package would take a bare `hidden` attribute back. A hidden element still describes.
  return (
    <span id={long.noteId} data-hl-long-press-note="" style={{ display: 'none' }}>
      {long.name}
    </span>
  )
})
