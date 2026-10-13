/** The accordion (`Accordion`): a title that expands and collapses its content. */
import { useContext, useState } from 'react'
import type { ReactNode } from 'react'

import { DirectionContext } from '../runtime'
import { glyphTypographyOf } from '../layout-rules'
import { PRESSABLE_CLASS } from '../styles'
import { productVar } from '../theme'
import { COLUMN } from './flex-words'
import { Glyph } from './icon'
import { useSpacing } from './prop-tokens'
import { Children } from './siblings'
import { usePartColor, usePartText, useText } from './use-text'
import type { WidgetProps } from './widget-props'

/**
 * The expandable block. Built-in look: the title is a `titleS` line and an `md` chevron `sm` apart,
 * with NO padding of its own (the padding, background and radius of the block are the document's
 * `style`); the content sits `sm` below the title and only in an expanded block.
 *
 * `initiallyExpanded` gives the state the block is SHOWN in; after that the user expands and
 * collapses it and the document never learns of it, the same kind of state as tabs have. The
 * chevron of an expanded block points down (in RTL also down: the glyph is already mirrored, so the
 * quarter turn goes the other way).
 */
export function AccordionView({ node, props, css, text, mark }: WidgetProps): ReactNode {
  const title = useText(props.title, 'title')
  const titleCss = usePartText('Accordion', 'title', text, 'titleS', 'onSurface')
  const chevronCss = usePartColor('Accordion', 'chevron', text, 'muted')
  const gap = useSpacing('sm', 'sm')
  const direction = useContext(DirectionContext)
  const [expanded, setExpanded] = useState(props.initiallyExpanded === true)
  const quarter = direction === 'rtl' ? '-90deg' : '90deg'
  return (
    <div {...mark} style={{ ...COLUMN, ...css }}>
      <button
        type="button"
        className={PRESSABLE_CLASS}
        aria-expanded={expanded}
        onClick={() => {
          setExpanded((current) => !current)
        }}
        style={{ ...titleCss, display: 'flex', alignItems: 'center', gap, textAlign: 'start' }}
      >
        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{title}</span>
        <span
          aria-hidden="true"
          style={{ flex: 'none', display: 'flex', font: productVar('typography', glyphTypographyOf('md')), lineHeight: 1, rotate: expanded ? quarter : undefined, ...chevronCss }}
        >
          <Glyph name="chevron" />
        </span>
      </button>
      {/* The body is a flex column: the accordion is a column parent and stretches its children. */}
      {expanded ? (
        <div style={{ ...COLUMN, gap, marginBlockStart: gap }}>
          <Children node={node} />
        </div>
      ) : null}
    </div>
  )
}
