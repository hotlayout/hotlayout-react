/**
 * The long press of a pressable container and of a list row (schema 9.26.0, `x-longPress`, node
 * fields `longPress` and `longPressLabel`). A mirror of the contract's reference rule; the shared
 * table `contract/fixtures/long-press/long-press-cases.json` keeps the two copies together.
 *
 * A finger that stays down on the node past the threshold runs the long press action while it is
 * still down; the click that follows its release is not a press. A move past the touch slop before
 * the threshold cancels both the long press and the press (the finger scrolls). A node without a
 * long press behaves as always: a long hold released in place is a press.
 *
 * This file is the rule; the pointer and key handling is `render/use-long-press.tsx`.
 */
import type { UiNode } from './types'

export const LONG_PRESS_PROP = 'longPress'
export const LONG_PRESS_LABEL_PROP = 'longPressLabel'

/** How long the finger stays down, milliseconds. */
export const LONG_PRESS_MS = 450

/** How far the finger may move before the threshold, in CSS pixels from the point it went down. */
export const TOUCH_SLOP = 10

/** The widgets that carry the field: a pressable container and a list row. Never a button. */
const LONG_PRESS_TYPES: readonly string[] = ['Column', 'Row', 'Container', 'Stack', 'ListTile']

/** Whether a widget of this type may carry a long press. */
export function acceptsLongPress(type: UiNode['type']): boolean {
  return LONG_PRESS_TYPES.includes(type)
}

export type LongPressOutcome = 'longPress' | 'press' | 'none'

export interface LongPressInput {
  /** How long the finger was down: until the release, or until this moment. */
  readonly heldMs: number
  /** The farthest the finger got from the point it went down BEFORE the threshold. */
  readonly moved: number
  /** The platform took the touch (a scroll, an interruption). */
  readonly cancelled: boolean
  readonly hasLongPress: boolean
  readonly hasAction: boolean
}

/** What a touch on a node comes to. The long press fires at the threshold, under the finger. */
export function longPressOutcome(input: LongPressInput): LongPressOutcome {
  if (input.cancelled || input.moved > TOUCH_SLOP) return 'none'
  if (input.hasLongPress && input.heldMs >= LONG_PRESS_MS) return 'longPress'
  return input.hasAction ? 'press' : 'none'
}

/** Whether a key on a focused node performs the long press: the context menu key or Shift+F10. */
export function isLongPressKey(event: { readonly key: string; readonly shiftKey: boolean }): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

/** `x-longPress` of the artifact, whole; a test compares the two. */
export const LONG_PRESS_RULES = {
  props: { action: 'longPress', label: 'longPressLabel' },
  on: ['a pressable container: Column, Row, Container, Stack', 'ListTile'],
  notOn: 'Button and IconButton: a button has one action, and the platform already uses a long press there',
  form: 'the action of «x-actions»: catalog, track, haptic, carryRecord, paramBindings — one execution path with «action»',
  doesSomething: 'a type that is not «none», or «none» with «track»; otherwise the field is no long press',
  thresholdMs: 450,
  touchSlop: 10,
  touchSlopUnit: 'logical pixels from the point of touch down',
  fires: 'at the threshold while the finger is still down — not at release',
  movedBeyondSlop: 'before the threshold — neither the long press nor the press: the finger scrolls or drags',
  cancelled: 'nothing',
  afterFire: 'releasing the finger does nothing; «action» is not run',
  releasedEarlier: 'the press of «action» as before 9.26.0',
  withoutLongPress: 'a long hold released in place is a press, as before 9.26.0',
  order: ['haptic', 'track', 'action'],
  haptic: 'the «haptic» of the long press action, at the moment it fires; no field — no request',
  pressFeedback: 'the pressed pose of «x-pressFeedback» stays while the finger is down, also after the long press fired',
  receiver: 'the receiver of the press (x-style.layout.composition.pressable.press.receiver); a control inside without a long press keeps its press, the container gets no long press',
  pressable: 'a container with a long press and no action is a control: it is focusable and named',
  record: 'x-dataScope — the record of the instance, as for the press',
  accessibility: {
    name: 'longPressLabel',
    required: 'when the long press does something',
    flutter: 'a custom semantics action named by «longPressLabel»',
    web: 'the name on a hidden element referenced by «aria-describedby»; «aria-keyshortcuts» lists the keys',
    keys: [
      { key: 'ContextMenu' },
      { key: 'F10', shift: true },
    ],
    keysAct: 'on the focused node, at once — no threshold',
    enterAndSpace: 'the press of «action»',
  },
  secondaryButton: 'not a long press',
  writeActions: 'not published: the role of a choice or a toggle comes from «action»',
  disabled: 'a container has no disabled state',
  editorCanvas: 'nothing — the node is selected there; the preview runs it, a held mouse button too',
  olderReader: 'skips the fields: no long press, a container with only a long press is not pressable',
  cases: 'contract/fixtures/long-press/long-press-cases.json',
} as const
