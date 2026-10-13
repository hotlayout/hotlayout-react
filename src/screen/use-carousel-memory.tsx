/** The memory of carousels: which card is open, kept while the screen is in the stack. */
import { useEffect, useRef } from 'react'

import type { CarouselMemory } from '../render/contexts'

export function useCarouselMemory(scopes: readonly string[]): (scope: string) => CarouselMemory {
  /*
   * Carousel memory (since 9.11.0, `carouselState`): which card is open is kept WHILE THE SCREEN IS
   * IN THE STACK. A screen below the top is not drawn, so the state cannot live inside it; the key
   * is the stack frame (position and screen), and as soon as the frame is popped its entries are
   * forgotten: the same screen pushed again starts at the first card.
   */
  const carouselStore = useRef(new Map<string, number>())
  const scopeKey = scopes.join('\u0000')
  useEffect(() => {
    for (const key of [...carouselStore.current.keys()]) {
      const scope = key.slice(0, key.indexOf('\u0000'))
      if (!scopes.includes(scope)) carouselStore.current.delete(key)
    }
    // The key is the stack composition: recomputed only when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])
  const memoryFor = (scope: string): CarouselMemory => ({
    scope,
    get: (key) => carouselStore.current.get(key),
    set: (key, offset) => {
      carouselStore.current.set(key, offset)
    },
  })
  return memoryFor
}
