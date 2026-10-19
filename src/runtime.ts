/**
 * Plumbing from the host to nodes: actions, choice writes, assets, writing direction.
 *
 * Contexts rather than props, for the same reason as data: otherwise the action handler would
 * have to be threaded through every widget, including those that do not need it. None of them
 * is knowledge about the document; they are what the host surrounds the reader with.
 */
import { createContext } from 'react'

import type { ActionSource, HotlayoutAction, TrackEvent } from './actions'
import type { TextDirection } from './direction'
import type { HapticWord } from './haptic'
import type { RecordChain } from './live-record'
import type { SwipeActionRunner } from './swipe-busy'

/**
 * `insideListItem` says whether the node is drawn inside a `Repeater` instance. It decides which
 * record `navigate` opens the screen with (`record-scope.ts`); the flag is not passed to the
 * host, which gets the record itself in `source.record`.
 */
export type ActionHandler = (action: HotlayoutAction, source: ActionSource, insideListItem?: boolean, extras?: PressExtras) => PressOutcome | undefined

/**
 * What a press LEARNED about its action (since 9.24.0): who runs it and, for the host, the promise
 * it returned. The button that drags to confirm stays busy by it (`swipe-busy.ts`).
 */
export interface PressOutcome {
  readonly runner: SwipeActionRunner
  readonly answer: PromiseLike<unknown> | undefined
}

/** What a press carries besides the action itself: the analytics event and the `carryRecord` word (since 9.8.0), the haptic request (since 9.25.0). */
export interface PressExtras {
  readonly haptic?: HapticWord | undefined
  readonly track?: TrackEvent | undefined
  readonly carryRecord?: boolean | undefined
  /** The links of the record the node's scope is made of (since 9.27.0): a page opened from a row keeps them, so the record can follow the data. Never handed to the host. */
  readonly links?: RecordChain | undefined
}

/** The action handler. Without a host an action goes nowhere, which is not an error. */
export const ActionContext = createContext<ActionHandler>(() => undefined)

/**
 * Writing a value the user changed, for `ChoiceGroup.value`: if it is BOUND
 * (`{kind: 'binding', path}`), the chosen name is stored at that path. The document names the
 * path; without a binding there is nowhere to write, and the choice stays the group's local
 * state.
 */
export type WriteHandler = (path: string, value: string | boolean | number) => void

export const WriteContext = createContext<WriteHandler | undefined>(undefined)

/**
 * Writing from an INPUT FIELD (since 9.13.0): the path has already been checked (`writablePaths`,
 * forbidden segments); the value is a string from a text field, a number (or an empty string)
 * from a numeric one, a boolean from a switch or checkbox. It goes to the reader's session and
 * to the host at the same moment. `undefined` means the screen is outside `ScreenView` and there
 * is nowhere to write.
 */
export type InputWriteHandler = (path: string, value: string | boolean | number) => void

export const InputWriteContext = createContext<InputWriteHandler | undefined>(undefined)

/**
 * Whether the screen's FORM is filled (since 9.14.0): a function rather than a value, because it
 * is computed only for a button with `requiresFilled`. `undefined` means the screen is outside
 * `ScreenView`.
 */
export const FormContext = createContext<(() => boolean) | undefined>(undefined)

/** Whether to ask the platform for autofill suggestions (the host prop `autofill`; on by default). */
export const AutofillContext = createContext(true)

/** Asset URLs from the host: token to URL. Anything missing here is drawn as a placeholder. */
export const AssetContext = createContext<Readonly<Record<string, string>>>({})

/** The screen's writing direction: needed exactly by mirrored icons and the chevron. */
export const DirectionContext = createContext<TextDirection>('ltr')

/**
 * A `ChoiceGroup`'s selection: which name is selected and how to select another. `undefined`
 * means there is no group above the row at all: the radio mark is empty and switches nothing.
 */
export interface ChoiceScope {
  readonly selected: string | undefined
  readonly select: (optionValue: string) => void
}

export const ChoiceContext = createContext<ChoiceScope | undefined>(undefined)

/**
 * Labels that are not in the document because they belong to the reader rather than to a screen:
 * the accessible name of the "back" arrow. The host translates them along with its own interface.
 */
export interface ScreenLabels {
  /** Accessible name of the `AppBar` back arrow. */
  readonly back: string
}

export const DEFAULT_LABELS: ScreenLabels = { back: 'Back' }

export const LabelsContext = createContext<ScreenLabels>(DEFAULT_LABELS)
