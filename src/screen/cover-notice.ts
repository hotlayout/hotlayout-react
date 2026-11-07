/**
 * The host's `onScreenCovered`, folded to the screen: however many fills are in flight, the host
 * hears `true` once when the first one starts and `false` once when the last one is gone.
 */
import { useMemo, useRef } from 'react'

export type CoverNotice = (covered: boolean) => void

/** A notice that counts layers. Each `true` must be answered by one `false`; a stray `false` is ignored. */
export function countedNotice(host: () => CoverNotice | undefined): CoverNotice {
  let layers = 0
  return (covered) => {
    if (covered) {
      layers += 1
      if (layers === 1) host()?.(true)
      return
    }
    if (layers === 0) return
    layers -= 1
    if (layers === 0) host()?.(false)
  }
}

/**
 * The stable notice of one screen, or `undefined` when the host gave none (the fill then lives inside
 * the screen root). It stays the same function across renders, so a host that passes a new function on
 * every render still hears one pair.
 */
export function useCoverNotice(onScreenCovered: CoverNotice | undefined): CoverNotice | undefined {
  const latest = useRef(onScreenCovered)
  latest.current = onScreenCovered
  const notice = useMemo(() => countedNotice(() => latest.current), [])
  return onScreenCovered === undefined ? undefined : notice
}
