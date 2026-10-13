import type { InvalidActionParam, StandardAction } from './action-catalog'
import { SECTION_ACTION_TYPE, sectionTargetOf } from './bottom-zone'

export type { ActionParamProblem, InvalidActionParam, StandardAction } from './action-catalog'

/**
 * Actions and navigation: what the reader executes itself and what it hands to the host.
 *
 * The contract does not interpret an action: it is a free-form `type` string plus a flat `params`
 * map (`ButtonAction` in the schema). Exactly three are exceptions, and all concern screens of
 * the SAME document, so the reader can run them without the host:
 *
 *  - `navigate` with `params.screenId` opens the named screen;
 *  - `navigate.back` goes back one step;
 *  - `navigate.section` (since 9.12.0) lands on the named section screen: the stack is reset to
 *    that one screen.
 *
 * Everything else (`submit`, `share`, app-specific actions, actions from a newer minor) goes to
 * the host as is (`unknownAction: 'pass-to-host'`). Ignoring them silently would lose
 * information rather than be careful: the app may know an action the reader does not.
 */

/**
 * Action attached to a `Button`, a `ListTile` or the `AppBar` back arrow — passed to the host with the `type` as written in the document and `params` reduced to plain string values.
 *
 * The renderer opens nothing by itself. For the catalog actions the HOST performs (`openUrl`, `deeplink`, `close`) it adds a verdict on the parameters: `standard` (they passed the form of the contract — safe to hand to {@link runStandardAction}) or `invalid` (one did not — never run it). Your own actions have neither.
 */
export interface HotlayoutAction {
  /** Free-form action name. `navigate`, `navigate.back` and `none` are handled by the renderer; everything else is yours. */
  readonly type: string
  /** Flat string map from the document, with the parameters bound to data (`paramBindings`) already read from the data of the node. For `navigate` it carries `screenId`. */
  readonly params?: Readonly<Record<string, string>>
  /** Catalog action performed by the host whose parameters passed the check. */
  readonly standard?: StandardAction
  /** Catalog action whose parameter failed the check: never run it. */
  readonly invalid?: InvalidActionParam
}

/** Analytics event of a press (`action.track`): the name and flat string parameters, both of the form the contract names. */
export interface TrackEvent {
  readonly event: string
  readonly params?: Readonly<Record<string, string>>
}

/** Where an action came from. */
export interface ActionSource {
  /** `id` of the node the user activated. */
  readonly nodeId: string
  /** `screenId` of the screen that node belongs to. */
  readonly screenId: string
  /**
   * The record the action is about, as a FLAT map of data-contract paths:
   * `{ 'item.id': 'bottle', 'item.name': 'Bottle' }`. It is the record of the
   * list row (`Repeater` instance) the node is drawn in, laid over the record
   * the screen was opened with — so a "Redeem" button on a details screen
   * opened from a row carries that row's record too. Absent when the node has
   * no record at all. The values are YOURS — they come from `collections` —
   * but which collection a prefix names is decided by the document: treat an
   * id read from here as user input and check it on your backend.
   */
  readonly record?: Readonly<Record<string, unknown>>
}

export const NAVIGATE_ACTION_TYPE = 'navigate'
export const BACK_ACTION_TYPE = 'navigate.back'
/** "Do nothing", the default of `Button.action`; such an action never reaches the host. */
export const INERT_ACTION_TYPE = 'none'
export const NAVIGATE_SCREEN_PARAM = 'screenId'

/** What an action means for the screen stack. */
export type ActionIntent =
  | { readonly kind: 'push'; readonly screenId: string }
  | { readonly kind: 'back' }
  /** `navigate.section` (since 9.12.0): the stack becomes one named screen. */
  | { readonly kind: 'section'; readonly screenId: string }
  | { readonly kind: 'inert' }
  | { readonly kind: 'host' }

/**
 * Intent of an action against the screen stack.
 *
 * No "did not work" case is an error: a jump to a screen missing from the document and a step
 * back from the first screen are both `host`. The host may know more than the document (open
 * that screen from another document, close the web view), so the action travels on instead of
 * vanishing.
 */
export function intentOf(action: HotlayoutAction, knownScreenIds: readonly string[], stackDepth: number): ActionIntent {
  if (action.type === INERT_ACTION_TYPE) return { kind: 'inert' }
  if (action.type === NAVIGATE_ACTION_TYPE) {
    const params = action.params
    const target = params !== undefined && Object.hasOwn(params, NAVIGATE_SCREEN_PARAM) ? params[NAVIGATE_SCREEN_PARAM] : undefined
    return typeof target === 'string' && knownScreenIds.includes(target) ? { kind: 'push', screenId: target } : { kind: 'host' }
  }
  if (action.type === SECTION_ACTION_TYPE) {
    const target = sectionTargetOf(action)
    return target !== undefined && knownScreenIds.includes(target) ? { kind: 'section', screenId: target } : { kind: 'host' }
  }
  if (action.type === BACK_ACTION_TYPE) return stackDepth > 1 ? { kind: 'back' } : { kind: 'host' }
  return { kind: 'host' }
}

/** The action from a node prop if one really lies there, as it is in the document (not validated: `preparePress` does that); otherwise `undefined`. */
export function actionOf(value: unknown): { readonly type: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const type = (value as { readonly type?: unknown }).type
  return typeof type === 'string' && type !== '' ? (value as { readonly type: string }) : undefined
}
