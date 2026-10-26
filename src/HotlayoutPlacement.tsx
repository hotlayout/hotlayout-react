/**
 * `usePlacement` and `<HotlayoutPlacement>`: a NAMED place of the application that shows the
 * document the admin put there.
 *
 * Client module (the build marks it `"use client"`, like `HotlayoutScreen`): it holds state and
 * effects. The rules live in `placements.ts` and `placement-state.ts`. On the server nothing runs
 * an effect, so the first render is `loading` and the component draws `loading` (nothing by
 * default); the client fills it in.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { HotlayoutScreen } from './HotlayoutScreen'
import type { HotlayoutScreenProps } from './HotlayoutScreen'
import { computePlacement, LOADING, sameDocument } from './placement-state'
import type { PlacementMapStore, PlacementSettings, PlacementState } from './placement-state'
import { placementEvent } from './placements'
import type { PlacementEvent, PlacementSettled } from './placements'

/** What the host is told on every change of what the placement shows. */
export interface PlacementStatusEvent extends PlacementEvent {
  readonly name: string
}

export interface UsePlacementOptions extends PlacementSettings {
  /**
   * Called on every change of what the placement shows, the first answer included: a document
   * (`status: 'document'`; `report` is `entryMissing` when the named entry point is gone and the first
   * screen is drawn, otherwise `null`) or nothing (`status: 'nothing'` with `empty`, `unknown`,
   * `unreadable`, `documentMissing` or `documentUnreadable`). A change is any change of `status`,
   * `report`, `mapStatus`, `documentId` or `entry`. Use it to collapse the frame around the placement
   * and to open it again. Not called again when a refresh changes nothing.
   */
  readonly onPlacementStatus?: ((event: PlacementStatusEvent) => void) | undefined
  /** Re-read when the tab becomes visible again. Default `true`. */
  readonly refreshOnVisible?: boolean | undefined
  /** Re-read every this many milliseconds, kept within 5000 … 2147483647. Not a finite number: never. Default: never. */
  readonly pollIntervalMs?: number | undefined
}

const MIN_POLL_MS = 5000
const MAX_POLL_MS = 2 ** 31 - 1

/** The polling interval to use, or `undefined` for none: `NaN` and `Infinity` never poll. */
export function pollDelayOf(pollIntervalMs: number | undefined): number | undefined {
  if (pollIntervalMs === undefined || !Number.isFinite(pollIntervalMs)) return undefined
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, pollIntervalMs))
}

/** Keeps the old object when nothing changed. Never walks the document: a deep one must not throw here. */
function sameState(a: PlacementState, b: PlacementState): boolean {
  if (a.status !== b.status) return false
  if (a.status === 'nothing' && b.status === 'nothing') return a.report === b.report && a.mapStatus === b.mapStatus
  if (a.status === 'document' && b.status === 'document') {
    return a.documentId === b.documentId && a.entry === b.entry && a.mapStatus === b.mapStatus && a.report === b.report && sameDocument(a.document, b.document)
  }
  return true
}

const settledOf = (state: Exclude<PlacementState, { status: 'loading' }>): PlacementSettled =>
  state.status === 'document'
    ? { status: 'document', documentId: state.documentId, entry: state.entry, report: state.report, mapStatus: state.mapStatus }
    : { status: 'nothing', report: state.report, mapStatus: state.mapStatus }

interface Keyed {
  readonly key: string
  readonly state: PlacementState
}

/**
 * The state of the placement `name`: `loading`, a `document` with the entry point to start from, or
 * `nothing` with the reason. Never throws and never leaves a rejected promise: every failure is a
 * state. A new `name` or `mapUrl` starts again from `loading`; an answer to an older read is dropped.
 * Pass `document` and `entry` to `<HotlayoutScreen>` yourself, or use `<HotlayoutPlacement>`.
 */
export function usePlacement(name: string, options: UsePlacementOptions): PlacementState {
  const { mapUrl, refreshOnVisible = true, pollIntervalMs } = options
  const key = `${name}\u0000${mapUrl}`
  const [held, setHeld] = useState<Keyed>({ key, state: LOADING })
  const latest = useRef(options)
  // What the host was last told, per placement and map: an effect re-run for another reason tells nothing twice.
  const told = useRef<{ readonly key: string; readonly settled: PlacementSettled | null }>({ key, settled: null })
  // Declared before the reading effect, so the effect always sees the options of the render it runs for.
  useEffect(() => {
    latest.current = options
  })

  const pollDelay = pollDelayOf(pollIntervalMs)
  useEffect(() => {
    let current: AbortController | undefined
    let alive = true
    const run = (): void => {
      // A newer read makes the older one stale: it is aborted and its answer is dropped.
      current?.abort()
      const controller = new AbortController()
      current = controller
      computePlacement(name, latest.current, controller.signal)
        .then((next) => {
          if (!alive || controller !== current || next.status === 'loading') return
          setHeld((prev) => (prev.key === key && sameState(prev.state, next) ? prev : { key, state: next }))
          const settled = settledOf(next)
          const event = placementEvent(told.current.key === key ? told.current.settled : null, settled)
          told.current = { key, settled }
          if (event !== null) latest.current.onPlacementStatus?.({ name, ...event })
        })
        .catch(() => undefined) // an abort; any other failure is already a state
    }
    run()
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') run()
    }
    if (refreshOnVisible) document.addEventListener('visibilitychange', onVisible)
    const timer = pollDelay === undefined ? undefined : setInterval(run, pollDelay)
    return () => {
      alive = false
      current?.abort()
      document.removeEventListener('visibilitychange', onVisible)
      if (timer !== undefined) clearInterval(timer)
    }
  }, [name, mapUrl, key, refreshOnVisible, pollDelay])

  return held.key === key ? held.state : LOADING
}

export type HotlayoutPlacementProps = UsePlacementOptions &
  Omit<HotlayoutScreenProps, 'document' | 'entry'> & {
    /** The name of the placement, as written in the app (`home.banner`). */
    readonly name: string
    /** Drawn while the first answer is awaited, and on the server. Default: nothing. */
    readonly loading?: ReactNode
  }

/** Keys that belong to the placement, not to the screen it draws. */
const PLACEMENT_KEYS = ['name', 'loading', 'mapUrl', 'documentUrl', 'bundledMap', 'lastKnown', 'fetch', 'loadDocument', 'onPlacementStatus', 'refreshOnVisible', 'pollIntervalMs'] as const

/**
 * Draws the document that stands in the placement `name`, or nothing: an empty, unknown or
 * unreadable placement, a document that is gone or cannot be read. The host hears why through
 * `onPlacementStatus` and can collapse its own frame. Every other prop goes to `HotlayoutScreen`.
 */
export function HotlayoutPlacement(props: HotlayoutPlacementProps): ReactNode {
  const state = usePlacement(props.name, props)
  if (state.status === 'loading') return props.loading ?? null
  if (state.status === 'nothing') return null
  const screenProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) if (!(PLACEMENT_KEYS as readonly string[]).includes(key)) screenProps[key] = value
  return <HotlayoutScreen {...(screenProps as Omit<HotlayoutScreenProps, 'document' | 'entry'>)} document={state.document} {...(state.entry === null ? {} : { entry: state.entry })} />
}

export type { PlacementMapStore, PlacementState }
