/** Layout widgets: `Column`, `Row`, `Container`, `Spacer` and `Divider`. */
import { useContext } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { ALIGN_CSS, crossAlignOf, justifyLayout, mainJustifyOf } from '../alignment'
import { carouselOf } from '../carousel'
import { lookup } from '../sanitize'
import { productVar } from '../theme'
import { CarouselRow } from './carousel-row'
import { ScrollRowContext, WidthClassContext, useData } from './contexts'
import { COLUMN, JUSTIFY, alignOf } from './flex-words'
import { NodeView } from './node-view'
import { usePropColor, useSpacing, useSpacingMath } from './prop-tokens'
import { Children, numbered, numberedSiblings } from './siblings'
import type { WidgetProps } from './widget-props'

export function ColumnView({ node, props, css, mark }: WidgetProps): ReactNode {
  const gap = useSpacing(props.gap, 'sm')
  const main = justifyLayout(mainJustifyOf(node), 'block', useSpacingMath(props.gap, 'sm'))
  return (
    /*
     * There is deliberately NO `align-items` here: a column stretches its children
     * (`columnChildWidth`), and `props.align` places only those that do not stretch, which
     * `NodeView` does through the child's `align-self`.
     */
    <div {...mark} {...main.attrs} style={{ ...COLUMN, gap, ...main.style, ...css }}>
      <Children node={node} />
    </div>
  )
}

export function RowView({ node, props, css, mark }: WidgetProps): ReactNode {
  const numberScope = useData()
  const gap = useSpacing(props.gap, 'sm')
  const gapMath = useSpacingMath(props.gap, 'sm')
  /*
   * `scrollable` and `wrap` TOGETHER should not occur: the validator rejects such a pair because in
   * Flutter it is a crash (infinite width under `Wrap`), not merely an ugly look. If a document
   * still brings both, scrolling wins, exactly as in the other readers: the document may have come
   * from something other than the builder.
   */
  const scrollable = props.scrollable === true
  const wrap = props.wrap === true && !scrollable

  /*
   * SCROLLING: the row `padding` lies INSIDE the scroll (`scrollPadding: 'inside-scroll'`), so the
   * content reaches the edge instead of being clipped by the padding frame. In CSS that is how
   * `overflow` behaves on an element with `padding`. The shorthand `overflow: hidden` that a named
   * box gets (`sizedBoxOverflow`) is replaced here by `overflow-x: auto`: the row scrolls rather
   * than clips.
   */
  const { overflow, ...rest } = css
  const scroll: CSSProperties = scrollable
    ? { overflowX: 'auto', overflowY: overflow === 'hidden' ? 'hidden' : undefined }
    : { overflow }

  // CAROUSEL (schema 9.11.0): `props.carousel` on a scrolling row gives snapping to cards, dots, and a card width taken from the visible area.
  const carousel = scrollable ? carouselOf(node) : undefined
  const cardNumbers = numberedSiblings(carousel === undefined ? [] : (node.children ?? []), numberScope, useContext(WidthClassContext))
  if (carousel !== undefined) {
    return (
      <CarouselRow
        node={node}
        mark={mark}
        css={css}
        gap={gap}
        align={alignOf(props.align, 'center')}
        carousel={carousel}
        cards={(node.children ?? []).map((child) => ({ key: child.id, node: child, content: numbered(cardNumbers, child, <NodeView node={child} />) }))}
      />
    )
  }

  // A wrapping row leaves the word as it is: each line divides its free space separately.
  const rowWord = props.justify === 'center' || props.justify === 'end' ? props.justify : undefined
  const rowMain = wrap || rowWord === undefined ? undefined : justifyLayout(rowWord, 'inline', gapMath)
  return (
    <div
      {...mark}
      {...rowMain?.attrs}
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap,
        alignItems: alignOf(props.align, 'center'),
        justifyContent: lookup(JUSTIFY, props.justify) ?? 'flex-start',
        ...rowMain?.style,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...rest,
        ...scroll,
      }}
    >
      <ScrollRowContext.Provider value={scrollable}>
        <Children node={node} />
      </ScrollRowContext.Provider>
    </div>
  )
}

/**
 * Since schema 9.0.0 `Container` is the layout of its children and nothing else.
 *
 * Background, radius, shadow, border, padding and height live in `style`, that is, in the `css`
 * that arrives here already built. The usual card look (`padding: md`, `radius: md`, an `surface`
 * background, an `low` shadow) is WRITTEN into the document by the editor when a card is put on a
 * screen; it must not be painted in here, because that would be a hidden reader default, and a
 * card without `style` would look different in each reader.
 */
export function ContainerView({ node, props, css, mark }: WidgetProps): ReactNode {
  const gap = useSpacing(props.gap, 'none')
  const isRow = props.direction === 'row'
  const main = justifyLayout(mainJustifyOf(node), isRow ? 'inline' : 'block', useSpacingMath(props.gap, 'none'))
  /*
   * AXES since schema 9.15.0 (`x-style.layout.alignment`). Row: `align` is the vertical axis
   * (without the field, centred as before), `justify` is the main axis. Column: there is
   * deliberately no `align-items` here (a column stretches its children, and `align` places only
   * those that do not stretch, via the child's `align-self`); `justify` distributes the free space
   * when the height is given by `style.height`, `style.minHeight` or `fill`.
   */
  const line: CSSProperties = {
    display: 'flex',
    flexDirection: isRow ? 'row' : 'column',
    alignItems: isRow ? ALIGN_CSS[crossAlignOf(node)] : undefined,
    gap,
    ...main.style,
  }
  /*
   * A row with a minimum height and no named one: the cross-axis room does not add height to the
   * row, and the children stand in a strip as tall as the tallest of them, from the start of the
   * box. A single-line flex stretches its line over the WHOLE box, so the outer box carries
   * `min-height` and a nested element lays out the strip of children.
   */
  if (isRow && css.minHeight !== undefined && css.height === undefined) {
    return (
      <div {...mark} style={{ display: 'flex', flexDirection: 'column', ...css }}>
        <div {...main.attrs} style={{ ...line, flex: 'none' }}>
          <Children node={node} />
        </div>
      </div>
    )
  }
  return (
    <div {...mark} {...main.attrs} style={{ ...line, ...css }}>
      <Children node={node} />
    </div>
  )
}

/** The minimum length of a vertical line and a vertical spacer when nobody gave them a height. */
const VERTICAL_DIVIDER_MIN_LENGTH = 'lg'

export function SpacerView({ props, css, mark }: WidgetProps): ReactNode {
  /*
   * The axis matters: a horizontal `Spacer` in a column pushes nothing apart. The validator rejects
   * such a pair (`axis_mismatch`), but the reader must behave predictably on a document not built by
   * the builder too.
   */
  const isVertical = props.orientation === 'vertical'
  const size = useSpacing(props.size, 'md')
  /*
   * A vertical spacer has a width (`size`), and the contract names no height for it. The minimum
   * height is the `lg` step, as for a vertical divider: otherwise a row made only of spacers would
   * have zero height, and in a row with `align: center` the spacer would stand at a different point
   * than the other readers put it.
   */
  const minBlockSize = isVertical ? productVar('spacing', VERTICAL_DIVIDER_MIN_LENGTH) : undefined
  return <div {...mark} style={{ inlineSize: isVertical ? size : undefined, blockSize: isVertical ? undefined : size, minBlockSize, flexShrink: 0, ...css }} />
}

/**
 * The divider: the line colour and the spacing around it are PARTS of the widget, hence in `props`.
 *
 * `props.color` rather than `style.color`: otherwise the line would inherit the TEXT colour of an
 * ancestor. `props.spacing` rather than `style.margin`: the spacing follows the divider AXIS (above
 * and below a horizontal line, on both sides of a vertical one), and flipping `margin` together with
 * the axis would have to be done by hand.
 */

export function DividerView({ props, css, mark }: WidgetProps): ReactNode {
  const isVertical = props.orientation === 'vertical'
  const line = usePropColor(props.color, 'border')
  const spacing = useSpacing(props.spacing, 'sm')
  return (
    <div {...mark} style={css}>
      <div
        style={{
          backgroundColor: line,
          inlineSize: isVertical ? '1px' : undefined,
          /*
           * A vertical line: `100%` works only where the box height is NAMED (`style.height`); of an
           * auto height a percentage gives zero and the line would not be visible at all. So the
           * minimum length is the `lg` step.
           */
          blockSize: isVertical ? '100%' : '1px',
          minBlockSize: isVertical ? productVar('spacing', VERTICAL_DIVIDER_MIN_LENGTH) : undefined,
          marginBlock: isVertical ? undefined : spacing,
          marginInline: isVertical ? spacing : undefined,
        }}
      />
    </div>
  )
}
