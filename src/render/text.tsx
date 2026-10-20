/** The text widget (`Text`): a paragraph, a rich paragraph and a list item with its marker. */
import { useContext } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { showsCountdown } from '../countdown'
import { listMarkerGeometry, listMarkerOf, listMarkerText } from '../list-marker'
import { PROP_BOUNDS, cssNumber, safeEnum, safeInteger } from '../sanitize'
import { textCss } from '../style'
import { textGradientPaint } from '../text-gradient'
import { silentText } from '../silent-paint'
import { ListNumberContext, PlaceContext, useTheme } from './contexts'
import { ClockContext } from './countdown-clock'
import { asCss } from './prop-tokens'
import { richParagraph, withoutTypography } from './rich-paragraph'
import { useTextParts } from './use-text'
import { useValueTransition } from './use-value-transition'
import type { WidgetProps } from './widget-props'
import { screenPart } from './screen-part'

/**
 * A text. The colour and font do NOT come from `props` (they are no longer there) but from the
 * foreground: the node's own `style` or that of the nearest ancestor that named one; if nobody named
 * one, `onSurface` and `bodyM` from the theme core.
 */
export const TextView = screenPart(function TextView({ node, props, css, own, text, mark }: WidgetProps): ReactNode {
  const theme = useTheme()
  const place = useContext(PlaceContext)
  const item = useContext(ListNumberContext)
  // `animateChanges`: the number being counted is read at the frame being shown; without the field the data are the node's own.
  const shownData = useValueTransition(props)
  const { text: content, runs } = useTextParts(props.content, 'content', shownData.stepped)
  // A gradient on the glyphs (9.23.0): the content sits in one block that carries it; a piece with its own colour keeps that colour.
  const paint = textGradientPaint(node.type, own?.textGradient, theme)
  const rich = richParagraph(props, runs, text, theme, { content, glyphGradient: paint !== undefined })
  const base = asCss(textCss('Text', text, theme))
  const marker = listMarkerOf({ props })
  /*
   * A COUNTDOWN (9.21.0) is the one text whose server markup may differ from the first browser frame
   * (two clocks): React is told not to complain about that text, and the node is drawn anew once the
   * screen clock is live, so the server's number is gone as soon as the page is interactive.
   */
  const countdown = showsCountdown(props.content)
  const live = useContext(ClockContext)?.live === true
  const remount = countdown ? (live ? 'live' : 'first') : undefined

  const paragraph: CSSProperties = {
    // A block, not an inline element: the text box (`padding`, background, width) is like that of any node.
    display: 'block',
    // A long word without spaces wraps instead of pushing its parent wider.
    overflowWrap: 'anywhere',
    ...(rich?.paragraph === undefined ? base : { ...withoutTypography(base), ...rich.paragraph }),
    // Only values from the schema list: an arbitrary string in `text-align` would be a new style declaration on the server.
    textAlign: safeEnum(props.align, TEXT_ALIGNS),
  }
  // The lines sit in one element: the gradient block when there is one, the paragraph otherwise (the clamp goes with the lines).
  const clamp = clampCss(props)
  const paragraphClamp = paint === undefined ? clamp : {}
  const body = gradientBlock(rich === undefined ? content : rich.runs, paint, clamp)

  // A text that paints nothing says nothing (`x-silentText`): its own opacity 0, or a colour (own or inherited) with opacity 0.
  const silent = silentText(own, text.color, theme)
  if (marker === undefined) {
    return (
      <span key={remount} suppressHydrationWarning={countdown || undefined} aria-hidden={silent} {...mark} style={{ ...paragraph, ...paragraphClamp, ...css }}>
        {body}
      </span>
    )
  }

  /*
   * A LIST ITEM (schema 9.17.0, `x-style.layout.listMarker`): a BASELINE-aligned row with the marker
   * column at the logical start, a gap, and the text in the remaining width (a hanging indent: its
   * lines start under the first line of the TEXT). Both numbers are fractions of the base style font
   * size: the wrapper carries the base font and the column and gap are in `em`. The marker is set in
   * the font and colour of the TEXT, with no italics or line (those sit on the paragraph pieces, not
   * on the wrapper); it is pushed to the end of the column by flex (`flex-end`, not `text-align:
   * end`: a marker that does not fit would stick out toward the start).
   */
  const number = marker === 'number' ? (item?.number ?? 1) : 1
  const geometry = listMarkerGeometry(marker, 1, marker === 'number' ? (item?.groupSize ?? 1) : 1)
  const sign = listMarkerText(marker, number, place.shown.formatting, place.shown.directionLocale)
  return (
    <span key={remount} suppressHydrationWarning={countdown || undefined} aria-hidden={silent} {...mark} style={{ display: 'flex', alignItems: 'baseline', ...base, ...css }}>
      <span
        data-hl-marker={marker}
        // A bullet is decoration and a screen reader does not announce it; the number is announced before the text ("3. Text").
        aria-hidden={marker === 'bullet' ? true : undefined}
        style={{
          flex: 'none',
          display: 'flex',
          justifyContent: 'flex-end',
          whiteSpace: 'nowrap',
          inlineSize: `${cssNumber(geometry.column)}em`,
          marginInlineEnd: `${cssNumber(geometry.gap)}em`,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {sign}
      </span>
      <span style={{ ...paragraph, ...paragraphClamp, flex: '1 1 auto', minInlineSize: 0 }}>{body}</span>
    </span>
  )
})

/**
 * `maxLines` and `overflow` are behaviour, so they stayed in `props`: a number of lines and what to do
 * with the rest. Without `maxLines` nothing is cut; `overflow: 'visible'` means "let it out".
 */
function clampCss(props: Readonly<Record<string, unknown>>): CSSProperties {
  const maxLines = safeInteger(props.maxLines, PROP_BOUNDS.textMaxLines[0], PROP_BOUNDS.textMaxLines[1])
  if (maxLines === undefined || props.overflow === 'visible') return {}
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: maxLines,
    overflow: 'hidden',
    textOverflow: props.overflow === 'clip' ? 'clip' : 'ellipsis',
  }
}

/** The lines of a text painted by a gradient (9.23.0) are the content of one block that carries the gradient and the clamp; without a gradient they are the content itself. */
function gradientBlock(lines: ReactNode, paint: CSSProperties | undefined, clamp: CSSProperties): ReactNode {
  return paint === undefined ? lines : <span data-hl-text-gradient="" style={{ ...paint, ...clamp }}>{lines}</span>
}

/** The schema `AlignToken`, which are also logical `text-align` values. */
const TEXT_ALIGNS = ['start', 'center', 'end'] as const
