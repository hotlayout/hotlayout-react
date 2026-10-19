/**
 * The app bar of a screen whose body is scrolled (schema 9.21.0, `styleScrolled` and `titleShown`).
 *
 * WHO LISTENS. The screen root (`useBarScrollStore`), and only when the app bar zone asks: it has a
 * layer or shows its title only after scrolling. It listens PASSIVELY to the scroll of ITS body: the
 * body element when the root has its own height (a screen block and any modal layer), the page when
 * the host page scrolls (then "scrolled" is how far the root top went past the line the bar sticks
 * to). A tab or a layer under another one does not mix: every screen root has its own store.
 *
 * WHO HEARS. The store feeds `ScrolledBar`, a small wrapper around the app bar node: it provides
 * the answer to the bar and its children, so a flip redraws the bar and nothing else of the screen.
 * The server markup and the first browser frame are "at rest", whatever the page scroll is.
 */
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode, RefObject } from 'react'

import { isBarScrolled, scrolledLayerOf } from '../app-bar-scrolled'
import type { NodeStyle, UiNode } from '../types'
import { screenPart } from './screen-part'

/** The answer for the bar being drawn: is the body scrolled. */
export const BarScrolledContext = createContext(false)

/** The layer to put over the style of ONE node (the app bar); other nodes read it and ignore it. */
export const ScrolledLayerContext = createContext<{ readonly node: UiNode; readonly style: NodeStyle } | undefined>(undefined)

export interface ScrollStore {
  readonly subscribe: (listener: () => void) => () => void
  readonly get: () => boolean
  readonly set: (value: boolean) => void
}

export function createScrollStore(): ScrollStore {
  let value = false
  const listeners = new Set<() => void>()
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    get: () => value,
    set: (next) => {
      if (next === value) return
      value = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** Wraps the app bar node: provides "scrolled" and, if the node has a layer, the layer while scrolled. */
export const ScrolledBar = screenPart(function ScrolledBar({ node, store, children }: { readonly node: UiNode; readonly store: ScrollStore; readonly children: ReactNode }): ReactNode {
  const scrolled = useSyncExternalStore(store.subscribe, store.get, () => false)
  const layer = scrolled ? scrolledLayerOf(node) : undefined
  const value = useMemo(() => (layer === undefined ? undefined : { node, style: layer }), [node, layer])
  return (
    <BarScrolledContext.Provider value={scrolled}>
      <ScrolledLayerContext.Provider value={value}>{children}</ScrolledLayerContext.Provider>
    </BarScrolledContext.Provider>
  )
})

/** The layer over the style of `node` right now; `undefined` when the node is not the bar being scrolled. */
export function useScrolledLayer(node: UiNode): NodeStyle | undefined {
  const value = useContext(ScrolledLayerContext)
  return value?.node === node ? value.style : undefined
}

function stickLineOf(zone: HTMLElement): number {
  const line = Number.parseFloat(zone.ownerDocument.defaultView?.getComputedStyle(zone).insetBlockStart ?? '')
  return Number.isFinite(line) ? line : 0
}

/**
 * Keeps `store` equal to the answer for the app bar zone of `root`. `enabled` is false for a screen
 * whose bar does not ask, and then nothing is attached. `ownHeight` says who scrolls: the body or the page;
 * `shape` changes when the zone is drawn another way (a lifted bar), so the elements are found again.
 */
export function useBarScrollStore(store: ScrollStore, root: RefObject<HTMLElement | null>, bar: { readonly id: string | undefined; readonly enabled: boolean; readonly ownHeight: boolean; readonly shape: string }): void {
  const { id: barId, enabled, ownHeight, shape } = bar
  useEffect(() => {
    const element = root.current
    if (!enabled || barId === undefined || element === null) return undefined
    const body = element.querySelector<HTMLElement>(':scope > [data-hl-zone="body"]')
    const zone = element.querySelector<HTMLElement>(':scope > [data-hl-zone="appBar"]')
    const bar = zone === null ? undefined : Array.from(zone.querySelectorAll<HTMLElement>('[data-hl-node]')).find((candidate) => candidate.getAttribute('data-hl-node') === barId)
    if (body === null || zone === null || bar === undefined) return undefined

    const measure = (): void => {
      const zoneRect = zone.getBoundingClientRect()
      const rootRect = element.getBoundingClientRect()
      const threshold = { barBottom: bar.getBoundingClientRect().bottom - zoneRect.top, bodyTop: body.getBoundingClientRect().top - rootRect.top }
      // The page scrolls: how far the root top went past the line the bar sticks to, the same quantity as `scrollTop` of a body.
      const scrollTop = ownHeight ? body.scrollTop : Math.max(0, stickLineOf(zone) - rootRect.top)
      store.set(isBarScrolled(scrollTop, threshold))
    }
    measure()
    const doc = element.ownerDocument
    const scroller = ownHeight ? body : doc
    scroller.addEventListener('scroll', measure, { passive: true, capture: !ownHeight })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(element)
    return () => {
      scroller.removeEventListener('scroll', measure, { capture: !ownHeight })
      observer?.disconnect()
      store.set(false)
    }
  }, [store, root, barId, enabled, ownHeight, shape])
}
