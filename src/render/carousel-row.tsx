/** The carousel: a scrollable row of cards with snapping, dots and a remembered position. */
import { useContext, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { DEFAULT_CAROUSEL_PEEK, activeCarouselStop, carouselCardCss, carouselCardWidth, carouselDotCount, carouselStateKey, carouselStops } from '../carousel'
import type { ReaderCarousel } from '../carousel'
import { mathLength, spacingCss } from '../resolve'
import { DirectionContext } from '../runtime'
import { stretchesInScrollRow } from '../layout-rules'
import { FOCUSABLE_CLASS } from '../styles'
import { productVar } from '../theme'
import type { UiNode } from '../types'
import { CAROUSEL_CARD_VAR, CarouselCardContext, CarouselMemoryContext, InstancePathContext, ScrollRowContext, useTheme } from './contexts'
import { PressLabel } from './press-host'
import { splitRootPadding } from './screen-root'
import type { NodeMark } from './widget-props'

/** One carousel card: the node (for its flags) and what to draw. A node hidden by a condition draws nothing itself, so it has no list wrapper. */
interface CarouselCard {
  readonly key: string
  readonly node: UiNode
  readonly content: ReactNode
}

function pixelsOf(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** The cards of a carousel in the scroll area: the hidden name of a pressable row (schema 9.19.0) is not a card and gives no stops. */
function cardsOf(scroller: HTMLElement): readonly HTMLElement[] {
  return Array.from(scroller.children).filter((card): card is HTMLElement => card instanceof HTMLElement && !card.hasAttribute('data-hl-press-label'))
}

/**
 * A CAROUSEL (schema 9.11.0, `x-style.layout.carousel`): a scrolling row, or a data-driven list laid
 * in a row, that has the `carousel` field.
 *
 *  - The scrolling element is the node itself (`mark`, its box and its `padding`, which lies INSIDE
 *    the scroll); cards do not shrink. With `perView` the card width is given by a variable on this
 *    element (`carouselCardCss`: a child's percentage is computed from the content box, so the end
 *    padding is added back); it is NOT rounded. The card's own width limits do not apply;
 *  - SNAPPING is `scroll-snap-type: x mandatory` with `scroll-snap-align: start` on the cards; the
 *    snap line is `scroll-padding-inline-start` = the start padding. The browser clamps the end of
 *    the scroll itself, which yields the last stop. There is no animated programmatic scrolling at
 *    all, so "reduce motion" holds by construction;
 *  - a gesture along the row does not go past the carousel (`overscroll-behavior-x: contain`); the
 *    browser decides the axis (`touch-action` default);
 *  - ACCESSIBILITY: the dots are decoration (`aria-hidden`, not a control); the position is conveyed
 *    by the LIST: `role="list"` on the scrolling element and `role="listitem"` on the cards (a
 *    screen reader says "3 of 5"); `tabindex="0"` lets the row take focus and scroll with arrows;
 *  - DOTS: one per STOP; with a single stop or more than ten there are no dots and no room for
 *    them; an inactive dot is the active colour at 0.3 opacity;
 *  - STATE belongs to the reader: the active stop is the one nearest to the offset and is kept while
 *    the screen is on the stack (`CarouselMemoryContext`); the host is not told about the card.
 *
 * Right-to-left writing mirrors by itself (flex, `scroll-padding-inline-start`); `scrollLeft` is
 * negative there, so its absolute value is used.
 */
export function CarouselRow({
  node,
  mark,
  css,
  gap,
  align,
  carousel,
  cards,
}: {
  readonly node: UiNode
  readonly mark: NodeMark
  readonly css: CSSProperties
  readonly gap: string
  readonly align: string
  readonly carousel: ReaderCarousel
  readonly cards: readonly CarouselCard[]
}): ReactNode {
  const theme = useTheme()
  const direction = useContext(DirectionContext)
  const memory = useContext(CarouselMemoryContext)
  const scroller = useRef<HTMLDivElement>(null)
  // The key is the stack frame, the node and the chain of template instances: in a data-driven list each record has its own card.
  const instancePath = useContext(InstancePathContext)
  const memoryKey = `${memory?.scope ?? ''}\u0000${carouselStateKey(node.id, instancePath)}`
  const [measured, setMeasured] = useState<{ readonly stops: number; readonly viewport: number; readonly active: number; readonly tooNarrow: boolean }>({ stops: 1, viewport: 0, active: 0, tooNarrow: false })

  const { overflow, ...rest } = css
  const { padding } = splitRootPadding(rest)
  const peekRef = carousel.peek ?? DEFAULT_CAROUSEL_PEEK
  const peekCss = spacingCss(peekRef, theme) ?? productVar('spacing', DEFAULT_CAROUSEL_PEEK)
  const sized = carousel.perView !== undefined && !measured.tooNarrow

  const measure = (element: HTMLElement): void => {
    const style = getComputedStyle(element)
    const paddingStart = pixelsOf(style.paddingInlineStart)
    const gapPx = pixelsOf(style.columnGap)
    const viewport = element.clientWidth
    const next = carouselStops({
      viewport,
      paddingStart,
      paddingEnd: pixelsOf(style.paddingInlineEnd),
      gap: gapPx,
      // The outer card width is its box with margins (the node inside may have a `margin`).
      cards: cardsOf(element).map((card) => card.offsetWidth),
    })
    // `perView` is not read when a card would be narrower than 1 (`belowMinCard`): the width is natural.
    const peekPx = typeof peekRef === 'number' ? peekRef : (theme.spacing[peekRef] ?? theme.spacing[DEFAULT_CAROUSEL_PEEK] ?? 0)
    const tooNarrow = carousel.perView !== undefined && viewport > 0 && carouselCardWidth({ viewport, paddingStart, gap: gapPx, peek: peekPx, perView: carousel.perView }) === undefined
    // In right-to-left writing the offset is negative: the distance from the logical start is its absolute value.
    const active = activeCarouselStop(next.stops, Math.abs(element.scrollLeft))
    setMeasured((previous) => (previous.stops === next.stops.length && previous.viewport === viewport && previous.active === active && previous.tooNarrow === tooNarrow ? previous : { stops: next.stops.length, viewport, active, tooNarrow }))
    memory?.set(memoryKey, Math.abs(element.scrollLeft))
  }

  // Returning to the screen shows the same card: the offset is restored when the element appears.
  useEffect(() => {
    const element = scroller.current
    if (element === null) return undefined
    const saved = memory?.get(memoryKey)
    if (saved !== undefined && saved > 0) element.scrollLeft = direction === 'rtl' ? -saved : saved
    measure(element)
    // The row width and the card count change without a scroll event (device, data).
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
      measure(element)
    })
    observer?.observe(element)
    for (const child of Array.from(element.children)) observer?.observe(child)
    return () => {
      observer?.disconnect()
    }
    // Restoring happens only on appearance; the card count restarts measuring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards.length, sized])

  // A row of dots that does not fit the visible area is not drawn and takes no room.
  const dots = carouselDotCount(carousel.indicator, measured.stops, { viewport: measured.viewport, dotSize: theme.spacing.sm ?? 0, dotGap: theme.spacing.sm ?? 0 })
  const active = Math.min(measured.active, Math.max(0, measured.stops - 1))
  const sm = productVar('spacing', 'sm')
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    gap,
    alignItems: align,
    ...rest,
    overflowX: 'auto',
    overflowY: overflow === 'hidden' ? 'hidden' : undefined,
    overscrollBehaviorX: 'contain',
    scrollbarWidth: 'none',
    scrollSnapType: 'x mandatory',
    // The snap line is the start padding: it lies inside the scroll.
    scrollPaddingInlineStart: padding.inlineStart === undefined || padding.inlineStart === '0' ? '0px' : padding.inlineStart,
    ...(sized
      ? ({ [CAROUSEL_CARD_VAR]: carouselCardCss(carousel.perView, mathLength(gap, theme), mathLength(peekCss, theme), mathLength(padding.inlineEnd, theme)) } as CSSProperties)
      : {}),
  }

  return (
    /*
     * The shell is ALWAYS THE SAME BOX (`carousel.shell`): a block as wide as the place the parent
     * gave, whether there are dots or not. The area the stops are computed from does not depend on
     * the presence of dots; otherwise dots that appeared would change the area, and the area would
     * change the stop count (an endless flicker). Dots that are not drawn take no room
     * (`notDrawn: 'takes-no-space'`): the shell column simply reserves nothing for them.
     */
    <div data-hl-carousel-shell="" style={{ display: 'flex', flexDirection: 'column', gap: sm, minInlineSize: 0, inlineSize: '100%' }}>
      <div
        {...mark}
        ref={scroller}
        // A card row (schema 9.19.0) stays a card: the button role, with the hidden name first; the list role applies only when there is no action.
        role={mark.role ?? 'list'}
        tabIndex={0}
        className={FOCUSABLE_CLASS}
        data-hl-carousel={sized ? 'cards' : 'natural'}
        data-hl-per-view={carousel.perView === undefined ? undefined : String(carousel.perView)}
        style={style}
        onScroll={(event) => {
          measure(event.currentTarget)
        }}
      >
        <PressLabel node={node} />
        <ScrollRowContext.Provider value={false}>
          {cards.map((card) => (
            <CarouselCardContext.Provider key={card.key} value={{ sized, stretch: !sized && stretchesInScrollRow(card.node) }}>
              {card.content}
            </CarouselCardContext.Provider>
          ))}
        </ScrollRowContext.Provider>
      </div>
      {dots === 0 ? null : (
        <div aria-hidden="true" data-hl-dots={String(dots)} data-hl-active-dot={String(active)} style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: sm }}>
          {Array.from({ length: dots }, (_unused, index) => (
            <span key={index} style={{ inlineSize: sm, blockSize: sm, borderRadius: productVar('radius', 'pill'), backgroundColor: productVar('color', 'primary'), opacity: index === active ? 1 : 0.3 }} />
          ))}
        </div>
      )}
    </div>
  )
}
