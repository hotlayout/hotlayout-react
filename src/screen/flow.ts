/** The screen stack of one flow: its frames, the screens of a document the stack relies on, and where a flow starts. */
import type { DataScope } from '../data'
import type { ScreenInfo } from '../HotlayoutScreen'
import { MODAL_PLACEMENTS, statusBarIconsOf } from '../media-chrome'
import { isRecord, lookup } from '../sanitize'
import { shownLookOf } from '../screen-shown'
import type { ScreenShownCause } from '../screen-shown'
import type { ScreenEntry, UiDocument } from '../types'

export interface Frame {
  readonly screenId: string
  /**
   * The row record the screen was opened with (since 9.2.0): the list row that was tapped or, for a
   * modal layer, the record of the screen below it. It lives with the frame, so "back" pops frame and
   * record together and the previous screen sees the data it saw before.
   */
  readonly record?: DataScope
}

export interface Flow {
  /** Whose stack this is: the document and entry point it was started for. */
  readonly key: string
  readonly stack: readonly Frame[]
  /** How many times the flow was restarted on top of a NEW document version. Part of the show key; without it the same entry screen would not produce a new show event. */
  readonly restarts: number
  /**
   * Whether the USER has already moved the stack (a transition or a return). Only then does the new
   * screen take focus: the first screen, and a document or entry change made by the host, leave page
   * focus alone, because the user may be typing elsewhere at that moment.
   */
  readonly moved: boolean
  /** Show number within this flow: 0 at the start, then +1 per transition and per return. The show-event effect recognises the same show by it (StrictMode runs effects twice). */
  readonly show: number
  /** Why the top screen is shown (since 9.8.0). */
  readonly cause: ScreenShownCause
  /** How many times a section switch reset the stack (since 9.12.0). Part of the layer key, so a section that was already in the DOM under a modal layer starts over. */
  readonly sections: number
}

export function infoOf(screen: ScreenEntry, isFirst: boolean): ScreenInfo {
  // The first shown screen is never modal: a malformed document is drawn as a page.
  return { screenId: screen.screenId, name: screen.name, presentation: shownLookOf({ presentation: screen.presentation === 'modal' ? 'modal' : 'page' }, isFirst ? 0 : 1).presentation }
}

/**
 * The document's screens in the shape the stack relies on: an object with a string `screenId`.
 * A network document without a screens array means "no screens", not a crash; an entry that is not
 * a screen (`null`, no `screenId`) is skipped. The screen root is NOT checked here; `ScreenView`
 * (`shape.ts`) validates its shape.
 */
export function screensOf(document: UiDocument): readonly ScreenEntry[] {
  const screens: unknown = isRecord(document) ? document.screens : undefined
  if (!Array.isArray(screens)) return []
  const entries: ScreenEntry[] = []
  for (const screen of screens as readonly unknown[]) {
    if (!isRecord(screen) || typeof screen.screenId !== 'string') continue
    const icons = statusBarIconsOf(screen.statusBarIcons)
    entries.push({
      screenId: screen.screenId,
      name: typeof screen.name === 'string' ? screen.name : '',
      root: screen.root as ScreenEntry['root'],
      ...(screen.presentation === 'modal' ? { presentation: 'modal' as const } : {}),
      // Known words only: a newer word means "no request" / a sheet (`unknownModalPlacement`, `unknownStatusBarIcons`).
      ...((MODAL_PLACEMENTS as readonly unknown[]).includes(screen.modalPlacement) ? { modalPlacement: screen.modalPlacement as 'bottom' | 'center' } : {}),
      ...(icons === undefined ? {} : { statusBarIcons: icons }),
    })
  }
  return entries
}

/** The id of a screen root, used to address an action; a network root may not be a node at all. */
export function rootIdOf(screen: ScreenEntry): string {
  const root: unknown = screen.root
  return isRecord(root) && typeof root.id === 'string' ? root.id : screen.screenId
}

/** Which screen to start from: the named entry, else the initial screen, else (malformed document) the first one. */
export function startOf(document: UiDocument, entry: string | undefined): { readonly screenId: string | undefined; readonly unknownEntry: boolean } {
  const screens = screensOf(document)
  const has = (screenId: unknown): screenId is string => typeof screenId === 'string' && screens.some((screen) => screen.screenId === screenId)
  const entries: unknown = isRecord(document) ? document.entryPoints : undefined
  // Own key, not an index: an entry named `constructor` must not find the map's prototype.
  // A network entry map may be `null` or not an object; then there are no entries.
  const named = typeof entry === 'string' && isRecord(entries) ? lookup(entries, entry) : undefined
  if (has(named)) return { screenId: named, unknownEntry: false }
  const unknownEntry = entry !== undefined
  const initial: unknown = isRecord(document) ? document.initialScreenId : undefined
  if (has(initial)) return { screenId: initial, unknownEntry }
  return { screenId: screens[0]?.screenId, unknownEntry }
}

/** A frame of the stack whose screen lives in the current version of the document, with the record it was opened with. */
export interface ShownFrame {
  readonly screen: ScreenEntry
  readonly record: DataScope | undefined
}
