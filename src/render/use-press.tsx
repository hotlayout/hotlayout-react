/** A press on a node: the action of the document, its dispatch to the screen, and the disabled state of a pressable. */
import { useContext } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, KeyboardEvent } from 'react'

import { actionOf } from '../actions'
import type { ActionSource } from '../actions'
import { valueAt } from '../data'
import { FORM_RULES, pressDisabledOf } from '../form-rules'
import { preparePress } from '../press'
import { ActionContext, FormContext, InputWriteContext } from '../runtime'
import type { UiNode } from '../types'
import { isWriteAction } from '../write-action'
import { pressWriteAction } from './choice'
import { IssueContext, PlaceContext, RecordContext, useData } from './contexts'

/**
 * A press on a node: the action goes to the screen handler together with the node address.
 *
 * AN UNKNOWN ACTION IS PASSED TO THE HOST as it is (`unknownAction: 'pass-to-host'`): the host app
 * may know it even if the reader does not. Which actions are executed here and which travel on is
 * decided by the handler; see `actions.ts`.
 */
/**
 * Key auto-repeat is not a press (`keyAutoRepeat: 'not-a-press'`). On a real `<button>` the browser
 * sends `click` for EVERY repeated Enter `keydown`, so the repeat is suppressed here: the first
 * press passes (it is not a `repeat`), the rest get `preventDefault`. Space sends one click on
 * `keyup`, but it is suppressed too, so the rule does not depend on the browser.
 */
export function swallowAutoRepeat(event: KeyboardEvent<HTMLElement>): void {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault()
}

export function usePress(action: { readonly type: string } | undefined, nodeId: string): (() => void) | undefined {
  const dispatch = useContext(ActionContext)
  const place = useContext(PlaceContext)
  const { record, insideListItem } = useContext(RecordContext)
  const scope = useData()
  const report = useContext(IssueContext)
  const write = useContext(InputWriteContext)
  if (action === undefined) return undefined
  return () => {
    // The action carries the row record of its node (schema 9.2.0): that is how the host learns WHICH row was pressed.
    const source: ActionSource = record === undefined ? { nodeId, screenId: place.screenId } : { nodeId, screenId: place.screenId, record }
    // A write action (schema 9.19.0): the event first, then the write along the same path as for input fields; it does not go to the host through `onAction`.
    if (isWriteAction(action.type)) {
      pressWriteAction(action, { dispatch, write, scope, source, insideListItem, report })
      return
    }
    // Parameters from data are read from the NODE SCOPE at the moment of the press (schema 9.8.0): the same layers as a text binding on this node.
    const press = preparePress(action, (path) => valueAt(scope, path), report, `node “${nodeId}”: action`)
    dispatch(press.action, source, insideListItem, { track: press.track, carryRecord: press.carryRecord })
  }
}

/**
 * The action from a node prop. What is not an action (not an object, no string `type`) yields no
 * action, but does not pass silently: the node is drawn and the host gets an `ignored-input` report.
 */
export function useDocumentAction(value: unknown, nodeId: string): { readonly type: string } | undefined {
  const report = useContext(IssueContext)
  const action = actionOf(value)
  if (action === undefined && value !== undefined) report({ where: `node “${nodeId}”: action`, reason: 'the action is not an object with a text `type`; the node does nothing' })
  return action
}

/**
 * Whether a button is disabled (schema 9.14.0, `form.button`): `requiresFilled` on an unfilled
 * SCREEN form, or a `disabledIf` that holds; either one is enough. The form is computed only for a
 * button that asks about it, and every time from the current data layers (the person's input is a
 * layer too): the button becomes enabled under the finger, without a reply from the host.
 */
export function usePressDisabled(node: UiNode): boolean {
  const scope = useData()
  const formFilled = useContext(FormContext)
  return pressDisabledOf(node, scope, formFilled ?? (() => true))
}

/**
 * The look of a disabled button (`form.button.look`): the opacity of the WHOLE widget from the data,
 * multiplied by the node's own `style.opacity`; the background, label and border stay the same (the
 * theme has no `disabled` role group). The cursor is the ordinary one: there is no response.
 */
export function disabledPressLook(disabled: boolean, own: unknown): CSSProperties {
  if (!disabled) return {}
  return { opacity: (typeof own === 'number' && Number.isFinite(own) ? own : 1) * FORM_RULES.button.look.opacity, cursor: 'default' }
}

/**
 * The attributes of a disabled button (`form.button.focus`, `semantics`): `aria-disabled` and NOT
 * the `disabled` attribute, with which the button would drop out of the focus order. It cannot be
 * pressed at all: a click has no handler, and Enter and Space are suppressed here (along with
 * auto-repeat), so there is no action, no `track` event and no transition.
 */
export function pressHandlers(disabled: boolean, press: (() => void) | undefined): Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-disabled' | 'onClick' | 'onKeyDown'> {
  if (disabled) {
    return {
      'aria-disabled': true,
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') event.preventDefault()
      },
    }
  }
  return { onClick: press, onKeyDown: swallowAutoRepeat }
}
