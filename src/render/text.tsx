/** The text widget (`Text`): a paragraph, a rich paragraph and a list item with its marker. */
import { useContext } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { listMarkerGeometry, listMarkerOf, listMarkerText } from '../list-marker'
import { PROP_BOUNDS, cssNumber, safeEnum, safeInteger } from '../sanitize'
import { textCss } from '../style'
import { ListNumberContext, PlaceContext, useTheme } from './contexts'
import { asCss } from './prop-tokens'
import { richParagraph, withoutTypography } from './rich-paragraph'
import { useTextParts } from './use-text'
import type { WidgetProps } from './widget-props'

/**
 * A text. The colour and font do NOT come from `props` (they are no longer there) but from the
 * foreground: the node's own `style` or that of the nearest ancestor that named one; if nobody named
 * one, `onSurface` and `bodyM` from the theme core.
 */
export function TextView({ props, css, text, mark }: WidgetProps): ReactNode {
  const theme = useTheme()
  const place = useContext(PlaceContext)
  const item = useContext(ListNumberContext)
  const { text: content, runs } = useTextParts(props.content, 'content')
  const maxLines = safeInteger(props.maxLines, PROP_BOUNDS.textMaxLines[0], PROP_BOUNDS.textMaxLines[1])
  const clamps = maxLines !== undefined && props.overflow !== 'visible'
  const rich = richParagraph(props, runs, text, theme, content)
  const base = asCss(textCss('Text', text, theme))
  const marker = listMarkerOf({ props })

  const paragraph: CSSProperties = {
    // A block, not an inline element: the text box (`padding`, background, width) is like that of any node.
    display: 'block',
    // A long word without spaces wraps instead of pushing its parent wider.
    overflowWrap: 'anywhere',
    ...(rich?.paragraph === undefined ? base : { ...withoutTypography(base), ...rich.paragraph }),
    // Only values from the schema list: an arbitrary string in `text-align` would be a new style declaration on the server.
    textAlign: safeEnum(props.align, TEXT_ALIGNS),
    // `maxLines` and `overflow` are behaviour, so they stayed in `props`.
    ...(clamps
      ? {
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: maxLines,
          overflow: 'hidden',
          textOverflow: props.overflow === 'clip' ? 'clip' : 'ellipsis',
        }
      : {}),
  }
  const body = rich === undefined ? content : rich.runs

  if (marker === undefined) {
    return (
      <span {...mark} style={{ ...paragraph, ...css }}>
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
    <span {...mark} style={{ display: 'flex', alignItems: 'baseline', ...base, ...css }}>
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
      <span style={{ ...paragraph, flex: '1 1 auto', minInlineSize: 0 }}>{body}</span>
    </span>
  )
}

/** The schema `AlignToken`, which are also logical `text-align` values. */
const TEXT_ALIGNS = ['start', 'center', 'end'] as const
