/** The track of a drag-to-confirm button as it stands now: measured before paint and again whenever the button changes size. */
import { useState } from 'react'
import type { RefObject } from 'react'

import type { SwipeTrack } from '../swipe-confirm'
import { useIsomorphicLayoutEffect } from '../wide-nav-view'

/** The track as it stands now, with the radius it is drawn with (`undefined` where it could not be read: then the thumb is a circle). */
export type Measured = SwipeTrack & { readonly radius: number | undefined }

/** The radius of the track in pixels from the computed style (a percentage is of the height); `undefined` when it is not a length. */
function radiusOf(raw: string, height: number): number | undefined {
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return undefined
  return raw.includes('%') ? (value / 100) * height : value
}

/** The track as it stands now: the border box, the border on one side and the radius. `undefined` while it has no size. */
function measure(element: HTMLElement, inset: number): Measured | undefined {
  const width = element.offsetWidth
  const height = element.offsetHeight
  if (!(width > 0) || !(height > 0)) return undefined
  const style = getComputedStyle(element)
  const border = Number.parseFloat(style.borderBlockStartWidth)
  return { width, height, border: Number.isFinite(border) ? border : 0, inset, radius: radiusOf(style.borderTopLeftRadius, height) }
}

const sameTrack = (a: Measured | undefined, b: Measured | undefined): boolean => a?.width === b?.width && a?.height === b?.height && a?.border === b?.border && a?.radius === b?.radius

/** The track as it is now, measured before paint and again whenever the button changes size. */
export function useTrack(ref: RefObject<HTMLButtonElement | null>, inset: number): Measured | undefined {
  const [track, setTrack] = useState<Measured | undefined>(undefined)
  useIsomorphicLayoutEffect(() => {
    const element = ref.current
    if (element === null) return undefined
    const read = (): void => {
      const next = measure(element, inset)
      setTrack((previous) => (sameTrack(previous, next) ? previous : next))
    }
    read()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(read)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [ref, inset])
  return track
}
