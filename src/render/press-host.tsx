/**
 * The pressable container (schema 9.19.0): a `Column`, `Row`, `Container` or `Stack` whose
 * props carry an `action` that is not `none`, or an `action` that carries analytics (`track`).
 * The rule is the artifact block `x-style.layout.composition.pressable`; the shared table is
 * `contract/fixtures/composition/composition-cases.json`.
 *
 *  - The action is THE action of a button: the same parse, the same catalog, the same
 *    `track` (once, before the action), the same `onAction` of the host, the same record of
 *    the list row the card is drawn in. The card calls the very function a `Button` calls.
 *  - A press goes to the innermost CONTROL under the point. Controls are every element that
 *    takes a press by itself: another pressable container, a button, an option of a choice,
 *    an input (its whole box), the strip of tabs and the header of an accordion. An ancestor
 *    of the one that took the press gets nothing — no action and no analytics. Everything
 *    else (text, picture, icon, badge, a list row without an action, the body of an
 *    accordion, a panel of a tab, the card's own padding) is the content of the card.
 *  - A disabled button inside swallows the press: it is a control, so the card around it gets
 *    nothing either.
 *  - The card is a button for assistive technology: `role="button"`, in the order of focus
 *    before its own controls, Enter and Space activate it, the auto-repeat of a held key does
 *    not (it is one press). Its name is the `label` first, then the text of its content; the
 *    label is a visually hidden text node that comes first, NOT `aria-label` (that would
 *    replace the content).
 *  - There is no pressed state, no disabled state and no minimum target: the target is the
 *    box of the card.
 */
import type { CSSProperties, HTMLAttributes, KeyboardEvent, MouseEvent, ReactNode } from 'react'

import { actionOf, INERT_ACTION_TYPE } from '../actions'
import { preparePress } from '../press'
import { isRecord } from '../sanitize'
import { shownTextOf } from '../shown-text'
import { FOCUSABLE_CLASS } from '../styles'
import type { UiNode } from '../types'
import { useDocumentAction, usePress } from './use-press'
import { useText } from './use-text'
import type { WidgetProps } from './widget-props'
import { useWriteSemantics } from './choice'

/** The attributes a pressable container adds to its root element. */
export type PressAttributes = Pick<HTMLAttributes<HTMLElement>, 'role' | 'tabIndex' | 'className' | 'onClick' | 'onKeyDown'> & { readonly 'data-hl-press'?: string }

/** `x-style.layout.composition.pressable`, the part a reader needs, mirrored (a test compares it with the artifact). */
export const COMPOSITION_RULES = {
  nesting: {
    sameTypeContainers: 'allowed',
    decidedBy: 'the-allowed-children-of-each-widget',
    limitedBy: 'depth',
    rowWithoutFiniteWidth: 'x-compatibility.policy.rowInUnboundedWidth',
    sidewaysScrollInsideCarousel: 'not-published',
  },
  depth: {
    max: 8,
    counted: 'levels-below-the-screen-root',
    root: 0,
    deeperDocument: 'not-published',
    readerParseLimit: 32,
    readerBelowParseLimit: 'draws-the-tree',
    readerAboveParseLimit: 'rejects-the-screen',
  },
  pressable: {
    is: 'a-node-with-children-whose-action-is-not-none-or-carries-track',
    props: { action: 'action', label: 'label' },
    action: 'x-actions',
    withoutAction: 'not-a-control',
    actionNoneWithoutTrack: 'not-a-control',
    target: 'the-node-box-without-margin',
    press: {
      receiver: 'the-innermost-control-at-the-point',
      controls: ['a-pressable-container', 'a-leaf-with-an-action', 'a-choice-option', 'an-input', 'the-tab-strip', 'the-accordion-header'],
      ownControlWidgets: ['Tabs', 'Accordion'],
      container: 'every-point-of-its-box-that-is-not-on-a-control-inside',
      ancestors: 'get-nothing-no-action-no-track',
      disabledControlInside: 'swallows-the-press',
    },
    nested: { document: 'not-published', reader: 'the-innermost-gets-the-press' },
    record: 'x-dataScope',
    semantics: {
      role: 'button',
      name: 'label-first-then-the-text-of-its-content',
      nameRequired: 'heard-without-data-label-or-a-text-of-a-descendant-that-is-not-a-control',
      altOfDescendant: 'counts-as-its-text',
      controlsInside: 'stay-separate-controls-with-their-own-names',
      textOfControlsInside: 'not-promised',
      textOfOwnControls: 'does-not-name-the-container',
      ownControlTextWidgets: ['Accordion', 'Tab'],
      textInsideDataList: 'does-not-name-the-container-it-exists-only-with-data',
      focusOrder: 'the-container-before-the-controls-inside',
    },
    keyboard: { activate: ['Enter', 'Space'], autoRepeat: 'x-actions.keyAutoRepeat' },
    feedback: 'not-promised',
    disabledState: 'none',
    editor: 'selects-the-node-never-runs-the-action',
    olderReader: 'ignores-the-fields-the-container-is-not-pressable',
  },
  cases: 'contract/fixtures/composition/composition-cases.json',
} as const

/** The four containers that can be pressable. */
const PRESSABLE_TYPES: readonly string[] = ['Column', 'Row', 'Container', 'Stack']

/** Whether the action carries analytics that the press sends: the same check as the press itself makes (a `track` of a wrong shape is ignored whole). */
function carriesTrack(action: { readonly type: string }): boolean {
  return preparePress(action, () => undefined, () => undefined, '').track !== undefined
}

/**
 * The action of a pressable container, or `undefined` if the node is not one: not one of the
 * four types, no action, or an action `none` without analytics.
 */
export function pressActionOf(node: UiNode, action: { readonly type: string } | undefined): { readonly type: string } | undefined {
  if (!PRESSABLE_TYPES.includes(node.type) || action === undefined) return undefined
  return action.type !== INERT_ACTION_TYPE || carriesTrack(action) ? action : undefined
}

/**
 * Elements that take a press by themselves, found by what they are in the markup. The card
 * itself matches (`role="button"`); the walk below stops at the first match.
 */
const CONTROL_SELECTOR = 'button, a[href], input, textarea, select, [role="button"], [role="radio"], [role="tab"], [role="tablist"], [role="switch"], [role="checkbox"]'
/** An input widget takes the press with its whole box, label and note included. */
const CONTROL_TYPES: readonly string[] = ['TextField', 'Switch', 'Checkbox']

/** The innermost control between the target and the card (the card itself when there is none). */
function controlUnder(target: EventTarget | null, card: HTMLElement): Element {
  let element = target instanceof Element ? target : null
  while (element !== null && element !== card) {
    if (element.matches(CONTROL_SELECTOR) || CONTROL_TYPES.includes(element.getAttribute('data-hl-type') ?? '')) return element
    element = element.parentElement
  }
  return card
}

/**
 * The widget with the attributes of a pressable container, if it is one; otherwise the very
 * same object. Hooks run in every case (the order of hooks cannot depend on the document).
 */
export function usePressHost(widget: WidgetProps): WidgetProps {
  const { node, props } = widget
  const container = PRESSABLE_TYPES.includes(node.type)
  const action = pressActionOf(node, useDocumentAction(container ? props.action : undefined, node.id))
  const press = usePress(action, node.id)
  // A card with a write action is an option or a toggle of its own (9.19.0), with a state; its role replaces `button`.
  const semantics = useWriteSemantics(action, widget.choice)
  if (press === undefined) return widget

  const attributes: PressAttributes = {
    role: 'button',
    tabIndex: 0,
    className: FOCUSABLE_CLASS,
    'data-hl-press': '',
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (controlUnder(event.target, event.currentTarget) === event.currentTarget) press()
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      // A key pressed on a control inside is that control's.
      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      // A held key is ONE press, not one per auto-repeat.
      if (!event.repeat) press()
    },
  }
  return { ...widget, css: { cursor: 'pointer', ...widget.css }, mark: { ...widget.mark, ...attributes, ...semantics } }
}

/** A text only assistive technology reads; it takes no room and cannot be hit. */
const VISUALLY_HIDDEN: CSSProperties = { position: 'absolute', inlineSize: 1, blockSize: 1, margin: -1, padding: 0, border: 0, overflow: 'hidden', clipPath: 'inset(50%)', whiteSpace: 'nowrap' }

/**
 * The label of a pressable container: the first child, hidden. It goes before the content, so
 * the name of the card is the label first and then the text of what is inside.
 */
export function PressLabel({ node }: { readonly node: UiNode }): ReactNode {
  const label = useText(isRecord(node.props) ? node.props.label : undefined, 'label')
  const live = pressActionOf(node, actionOf(isRecord(node.props) ? node.props.action : undefined)) !== undefined
  const shown = shownTextOf(label)
  return live && shown !== '' ? (
    <span data-hl-press-label="" style={VISUALLY_HIDDEN}>
      {shown}
    </span>
  ) : null
}
