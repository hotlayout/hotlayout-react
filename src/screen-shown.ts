/*
 * Mirror of the contract reference implementation of the screen-shown event (the package imports
 * nothing from the contract repository): the text below is the same, verbatim. Divergence is caught by the
 * shared case table `action-cases.json` and by the check against the artifact keys `x-actions` /
 * `x-screenShown`. Change it only together with the reference implementation.
 */
/**
 * The "screen shown" event: reference implementation of the rule introduced in schema 9.8.0.
 *
 * A host's analytics asks "which screen is the person looking at". The reader reports it through
 * `onScreenChange`.
 *
 * ONE RULE: the shown screen is the TOP OF THE STACK, and the event fires when the top became a
 * different frame. All the answers follow, with no exceptions:
 *
 *  - the start of a flow (the first screen; the host changed the entry or the document) is `entry`;
 *  - `navigate` put a screen on top: `forward` (a modal layer too: it is an ordinary screen of
 *    the document);
 *  - "back" removed the top one: an event for the SCREEN BENEATH IT, `back`. Returning is a new
 *    show: the person looks at that screen again, and a view counter counts it; whoever does not
 *    want returns filters on `cause`;
 *  - a modal layer was closed: the same `back` for the screen under it. There is no separate
 *    "hidden" event: under a layer the screen is visible, but it is not the one being looked at.
 *
 * What is NOT an event: a re-render, new data, another language, an action handed to the host
 * (`openUrl`, `close`, "back" on the first screen), a navigation that did not happen (no such
 * screen, or the host cancelled it).
 *
 * EXACTLY ONE EVENT PER SHOW, and only where the screen was really shown to a person: server
 * rendering sends no events, and a double invocation of effects in development gives no second
 * event.
 *
 * The event's record is the record the screen was opened with (the 9.2.0 rules and `carryRecord`).
 * A screen has no separate "analytics name": `screenId` is already a stable name that navigation
 * and entry points refer to, and a second name would have to be kept in agreement with the first.
 *
 * ZERO IMPORTS; the shared case table is `showCases` in
 * `contract/fixtures/actions/action-cases.json`.
 */

/** Why a screen was shown. Published in the artifact as `x-screenShown.causes`. */
export const SCREEN_SHOWN_CAUSES = ['entry', 'forward', 'back', 'switch'] as const
export type ScreenShownCause = (typeof SCREEN_SHOWN_CAUSES)[number]

/** What happened to the stack. `start` means the stack was rebuilt (first show, a new entry or document). */
export type StackTransition = 'start' | 'push' | 'pop' | 'switch'

const CAUSE_OF: Readonly<Record<StackTransition, ScreenShownCause>> = { start: 'entry', push: 'forward', pop: 'back', switch: 'switch' }

/** A stack frame as the event sees it. */
export interface ShownFrame {
  readonly screenId: string
  /** `ScreenEntry.presentation`; `page` without the field. */
  readonly presentation: 'page' | 'modal'
  /** The record the screen was opened with; `undefined` means no record. */
  readonly record?: Readonly<Record<string, unknown>> | undefined
  /** `ScreenEntry.modalPlacement` (since 9.9.0) as the document named it; read only for a modal screen. */
  readonly modalPlacement?: 'bottom' | 'center' | undefined
  /** `ScreenEntry.statusBarIcons` (since 9.9.0) as the document named it. */
  readonly statusBarIcons?: 'light' | 'dark' | undefined
}

export interface ShownFlow {
  readonly documentId: string
  /**
   * The name of the entry point the flow started from, ONLY when the host named it and the
   * document has such a name. Otherwise `null`: the flow started from the initial screen (including
   * when the document does not know the name the host gave, `unknownEntryPoint`). One per flow:
   * every event says where the person came from.
   */
  readonly entry: string | null
}

/** The event's fields. Published in the artifact as `x-screenShown.fields`. */
export const SCREEN_SHOWN_FIELDS = ['documentId', 'screenId', 'entry', 'presentation', 'cause', 'depth', 'record'] as const

/**
 * Optional fields of the event (since 9.9.0, `x-screenShown.optionalFields`): each is present
 * ONLY when the screen named it with a known word (`optionalFieldPresence`).
 *  - `modalPlacement` is where the modal layer sits; present only when the screen is modal;
 *  - `statusBarIcons` is a REQUEST about status bar icons (`x-statusBar`): the reader does not
 *    touch the system bar, the host does that itself.
 */
export const SCREEN_SHOWN_OPTIONAL_FIELDS = ['modalPlacement', 'statusBarIcons'] as const

/** How a stack frame is presented, as the reader draws it and the event says: the kind and (for a layer only) the placement. */
export interface ShownLook {
  readonly presentation: 'page' | 'modal'
  readonly modalPlacement?: 'bottom' | 'center' | undefined
}

/**
 * The EFFECTIVE presentation of a screen: ONE place that answers both for drawing and for the
 * event. A modal layer lies over the previous screen, so the FIRST shown screen (the bottom of
 * the stack) is never modal: a document that named it modal is drawn by the reader as a page, and
 * the event says `page` without `modalPlacement`. `index` is the frame's place in the stack from
 * the bottom, zero-based.
 */
export function shownLookOf(frame: Pick<ShownFrame, 'presentation' | 'modalPlacement'>, index: number): ShownLook {
  if (index <= 0 || frame.presentation !== 'modal') return { presentation: 'page' }
  return frame.modalPlacement === undefined ? { presentation: 'modal' } : { presentation: 'modal', modalPlacement: frame.modalPlacement }
}

export interface ScreenShownEvent {
  readonly documentId: string
  readonly screenId: string
  readonly entry: string | null
  readonly presentation: 'page' | 'modal'
  readonly cause: ScreenShownCause
  /** Stack length AFTER the change; the first screen is 1. */
  readonly depth: number
  /** The screen's record as a flat path map; `null` means the screen was opened without a record. */
  readonly record: Readonly<Record<string, unknown>> | null
  readonly modalPlacement?: 'bottom' | 'center'
  readonly statusBarIcons?: 'light' | 'dark'
}

/**
 * The event for the stack AFTER a change. `undefined` means the stack is empty (nothing to show).
 * The caller says WHAT happened: it cannot be derived from two stacks (when the host changes the
 * entry the stack has the same length, yet the show is new).
 */
export function screenShownEvent(flow: ShownFlow, stack: readonly ShownFrame[], transition: StackTransition): ScreenShownEvent | undefined {
  const top = stack[stack.length - 1]
  if (top === undefined) return undefined
  const look = shownLookOf(top, stack.length - 1)
  return {
    documentId: flow.documentId,
    screenId: top.screenId,
    entry: flow.entry,
    presentation: look.presentation,
    cause: CAUSE_OF[transition],
    depth: stack.length,
    record: top.record === undefined ? null : { ...top.record },
    ...(look.presentation === 'modal' && look.modalPlacement !== undefined ? { modalPlacement: look.modalPlacement } : {}),
    ...(top.statusBarIcons === undefined ? {} : { statusBarIcons: top.statusBarIcons }),
  }
}

/**
 * The transition between two stacks of one flow: longer is `push`, shorter is `pop`, the same
 * length means nothing happened. For a reader that holds the stack as a value; it names a new flow
 * `start` itself.
 */
export function stackTransition(previousDepth: number, nextDepth: number): Exclude<StackTransition, 'start' | 'switch'> | undefined {
  if (nextDepth > previousDepth) return 'push'
  if (nextDepth < previousDepth) return 'pop'
  return undefined
}

/** The entry name for the event: the one named by the host and known to the document; otherwise `null`. */
export function shownEntryOf(requested: string | undefined, entryPoints: Readonly<Record<string, string>> | undefined): string | null {
  if (requested === undefined || entryPoints === undefined) return null
  return Object.hasOwn(entryPoints, requested) ? requested : null
}

/**
 * A NEW VERSION OF THE SAME DOCUMENT (policy row `stackScreenGone: 'restart-from-entry'`). The
 * host gave the reader a new version (the same `documentId` and entry). If it contains EVERY
 * screen of the stack, the flow continues as it was and there are no events. If at least one is
 * missing, the stack is discarded entirely: the entry screen of the NEW version is shown, and the
 * show event is `entry`. No ghost frames (a screen that no longer exists under a removed one)
 * remain, and there is no partial "trim to the deepest intact frame" either: the person was
 * looking at a different document, and continuing from its middle would be inventing a flow.
 */
export function stackSurvivesNewVersion(stackScreenIds: readonly string[], versionScreenIds: readonly string[]): boolean {
  return stackScreenIds.every((screenId) => versionScreenIds.includes(screenId))
}
