/** The screen-shown event: told once per show of the top of the stack. */
import { useEffect, useRef } from 'react'

import type { ScreenInfo, ScreenShown } from '../HotlayoutScreen'
import { isRecord } from '../sanitize'
import { screenShownEvent, shownEntryOf } from '../screen-shown'
import type { ScreenEntry, UiDocument } from '../types'
import type { VersionVerdict } from '../version'
import { infoOf } from './flow'
import type { Flow, ShownFrame } from './flow'

export function useScreenShown({
  verdict,
  topInfo,
  flowKey,
  current,
  frames,
  shownFrames,
  document,
  entry,
  onScreenChange,
}: {
  readonly verdict: VersionVerdict
  readonly topInfo: ScreenInfo | undefined
  readonly flowKey: string
  readonly current: Flow
  readonly frames: readonly ScreenEntry[]
  readonly shownFrames: readonly ShownFrame[]
  readonly document: UiDocument
  readonly entry: string | undefined
  readonly onScreenChange: ((screen: ScreenShown) => void) | undefined
}): void {
  /*
   * The "screen shown" event (since 9.8.0, `screen-shown.ts`). The shown screen is the top of the
   * stack; the event fires when the top becomes a different FRAME: the key is flow, show number and
   * screen. A key rather than `screenId`: the same screen pushed onto the stack again is a new
   * show. In `StrictMode` the effect runs twice (with the same refs); the second time the key has
   * already been reported, so there is one event. Effects do not run on the server: server
   * rendering sends no events, and hydration sends `entry`.
   */
  const shownScreenId = verdict.kind === 'incompatible' ? undefined : topInfo?.screenId
  const lastShown = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (topInfo === undefined || shownScreenId === undefined) return
    const key = `${flowKey}\u0000${String(current.restarts)}\u0000${String(current.show)}\u0000${shownScreenId}\u0000${String(frames.length)}`
    if (lastShown.current === key) return
    lastShown.current = key
    const entryPoints: unknown = isRecord(document) ? document.entryPoints : undefined
    const event = screenShownEvent(
      { documentId: typeof document.documentId === 'string' ? document.documentId : '', entry: shownEntryOf(entry, isRecord(entryPoints) ? (entryPoints as Readonly<Record<string, string>>) : undefined) },
      shownFrames.map((frame, index) => ({
        screenId: frame.screen.screenId,
        presentation: infoOf(frame.screen, index === 0).presentation,
        record: frame.record,
        modalPlacement: frame.screen.modalPlacement,
        statusBarIcons: frame.screen.statusBarIcons,
      })),
      current.show === 0 ? 'start' : current.cause === 'back' ? 'pop' : current.cause === 'switch' ? 'switch' : 'push',
    )
    if (event === undefined) return
    onScreenChange?.(Object.freeze({ ...topInfo, ...event, record: event.record === null ? null : Object.freeze(event.record) }))
    // Report a SHOW, not every render: the key is flow, show number, screen and stack depth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowKey, current.restarts, current.show, shownScreenId, frames.length])
}
