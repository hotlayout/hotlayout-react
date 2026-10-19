/**
 * The dashes of a dashed border (schema 9.22.0): the measuring and the style that comes of it. The
 * rule is `border-dash.ts`; this file is only what needs the browser.
 *
 * A node whose border is dashed carries `data-hl-dashed`, and `NodeView` draws a probe right after
 * it. The probe finds the element of the node among its neighbours, reads the size of its border box
 * (`ResizeObserver`, so a changed size is a new image), its radii and its direction off the computed
 * style, and hands them up. `NodeView` then adds the border image to the style of the node. Nothing
 * is added to the markup of the node itself, so nothing can be wiped by React drawing its text and
 * nothing is clipped by its radius.
 *
 * On the server and before the first measurement the border is transparent (the room is the same),
 * which is also what a reader without a `ResizeObserver` shows.
 */
import { useRef } from 'react'
import type { ReactNode } from 'react'

import { dashedLineOf, dashedPathOf } from '../border-dash'
import { cssDashedBorderImage } from '../sanitize'
import type { Css } from '../style'
import { dashedBorderOf } from '../style-box'
import type { Theme } from '../theme'
import { useIsomorphicLayoutEffect } from '../wide-nav-view'
import { screenPart } from './screen-part'

/** What the probe reads off the element of a dashed node. */
export interface DashMeasure {
  readonly width: number
  readonly height: number
  readonly rtl: boolean
  readonly radii: { readonly topStart: number; readonly topEnd: number; readonly bottomEnd: number; readonly bottomStart: number }
}

/** The mark of a node that needs the probe. */
export const DASHED_ATTRIBUTE = 'data-hl-dashed'

const radiusPx = (value: string): number => {
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}

function measureElement(element: HTMLElement, size: { readonly width: number; readonly height: number } | undefined): DashMeasure | undefined {
  const width = size?.width ?? element.offsetWidth
  const height = size?.height ?? element.offsetHeight
  if (!(width > 0) || !(height > 0)) return undefined
  const style = getComputedStyle(element)
  const rtl = style.direction === 'rtl'
  // The corners are logical: in right-to-left writing the start is on the right.
  const left = { top: radiusPx(style.borderTopLeftRadius), bottom: radiusPx(style.borderBottomLeftRadius) }
  const right = { top: radiusPx(style.borderTopRightRadius), bottom: radiusPx(style.borderBottomRightRadius) }
  const start = rtl ? right : left
  const end = rtl ? left : right
  return { width, height, rtl, radii: { topStart: start.top, topEnd: end.top, bottomEnd: end.bottom, bottomStart: start.bottom } }
}

function same(a: DashMeasure | undefined, b: DashMeasure | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return a.width === b.width && a.height === b.height && a.rtl === b.rtl && a.radii.topStart === b.radii.topStart && a.radii.topEnd === b.radii.topEnd && a.radii.bottomEnd === b.radii.bottomEnd && a.radii.bottomStart === b.radii.bottomStart
}

interface ProbeProps {
  readonly nodeId: string
  /** What the radii come from: when the radius of the node or the theme is another, the box is read again. */
  readonly radius: unknown
  readonly theme: unknown
  readonly onMeasure: (measure: DashMeasure | undefined) => void
}

/** Draws nothing: an element that is hidden and sits right after the node it measures. */
export const DashProbe = screenPart(function DashProbe({ nodeId, radius, theme, onMeasure }: ProbeProps): ReactNode {
  const ref = useRef<HTMLSpanElement>(null)
  useIsomorphicLayoutEffect(() => {
    const root = ref.current?.previousElementSibling
    if (!(root instanceof HTMLElement)) return undefined
    const marked = [root, ...root.querySelectorAll<HTMLElement>(`[${DASHED_ATTRIBUTE}]`)]
    const element = marked.find((candidate) => candidate.hasAttribute(DASHED_ATTRIBUTE) && candidate.getAttribute('data-hl-node') === nodeId)
    if (element === undefined) return undefined
    let last: DashMeasure | undefined
    const read = (size?: { readonly width: number; readonly height: number }): void => {
      const next = measureElement(element, size)
      if (same(last, next)) return
      last = next
      onMeasure(next)
    }
    read()
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver((entries) => {
            // An engine without `borderBoxSize` (older Safari) gives none: the element is read instead.
            const sizes: unknown = entries[0]?.borderBoxSize
            const box = Array.isArray(sizes) ? (sizes[0] as ResizeObserverSize | undefined) : undefined
            read(box === undefined ? undefined : { width: box.inlineSize, height: box.blockSize })
          })
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [nodeId, radius, theme, onMeasure])
  return <span ref={ref} hidden aria-hidden="true" />
})

/**
 * The border image of a dashed node: the dashes laid one to one over its border box. A slice and a
 * width of 50% put each quarter of the image on its corner of the box, and the image is as big as
 * the box, so nothing is scaled. No measurement, or something the sanitising layer does not accept,
 * gives no style: the border stays transparent.
 */
export function dashedBorderImageCss(line: { readonly width: number; readonly color: string }, measure: DashMeasure | undefined): Css {
  if (measure === undefined) return {}
  const box = { width: measure.width, height: measure.height, border: line.width, radii: measure.radii }
  const pattern = dashedLineOf(box)
  if (pattern.count === 0) return {}
  const source = cssDashedBorderImage({
    width: measure.width,
    height: measure.height,
    thickness: line.width,
    path: dashedPathOf(box),
    dash: pattern.dash,
    gap: pattern.gap,
    color: line.color,
    rtl: measure.rtl,
  })
  return source === undefined ? {} : { borderImageSource: source, borderImageSlice: '50%', borderImageWidth: '50%', borderImageRepeat: 'stretch' }
}

/** What a node needs for its border: whether it is dashed (then the probe follows it), the mark of the node and the image of the dashes. */
export interface DashedPart {
  readonly active: boolean
  readonly mark: Readonly<Record<string, string>>
  readonly css: Css
}

const NOT_DASHED: DashedPart = { active: false, mark: {}, css: {} }

/** The dashed part of a node by its resolved `border`: nothing for a solid border, a colour that does not resolve or a border of another shape. */
export function dashedPartOf(border: unknown, theme: Theme, measure: DashMeasure | undefined): DashedPart {
  const line = dashedBorderOf(border, theme)
  return line === undefined ? NOT_DASHED : { active: true, mark: { [DASHED_ATTRIBUTE]: '' }, css: dashedBorderImageCss(line, measure) }
}
