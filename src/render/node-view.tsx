/** One node: visibility, effective style, foreground, box and place in the parent, then the widget. */
import { useContext, useState } from 'react'
import type { ReactNode } from 'react'

import { pullAxisOf } from '../layer-placement'
import { motionMarks, motionOfNode, motionVars, registerMotionPhase } from '../motion'
import { APP_BAR_LEADING_MAX_SHARE } from '../media-chrome'
import { mathLength } from '../resolve'
import { DirectionContext } from '../runtime'
import { cssNumber } from '../sanitize'
import { ROLE_STYLE_KEYS, ROLE_WIDGETS } from '../style-roles'
import { acceptsWeightedChildren, columnAlignOf } from '../layout-rules'
import { boxCss } from '../style-box'
import { inheritTextStyle, mergeNodeStyles, resolveNodeStyle } from '../style'
import type { Css } from '../style'
import { isKnownWidget } from '../types'
import type { UiNode } from '../types'
import { useScrolledLayer } from './bar-scrolled'
import { choicePlaceOfNode } from './choice'
import { DashProbe, dashedPartOf } from './dashed-border'
import type { DashMeasure } from './dashed-border'
import { AnatomyContext, CAROUSEL_CARD_VAR, CarouselCardContext, ColumnParentContext, FillIgnoredContext, ImageContext, LayerContext, LeadingZoneContext, NavPlaceContext, PullAxisContext, ScrollRowContext, SiblingNodesContext, StackLayerContext, TextContext, TightSlotContext, WeightedRowContext, WidthClassContext, useData, useTheme } from './contexts'
import { carouselCardBox, clipSizedBox, columnChildCss, fillLayerCss, placedStyleOf, pulledShare, rowShareOf, scrollRowChildCss, tightSlotCss } from './node-box'
import type { NodePlacement } from './node-box'
import { layerNodeCss } from './node-css'
import { NodePlace } from './node-place'
import { asCss } from './prop-tokens'
import { Children, nodeShown } from './siblings'
import { WidgetView } from './widget-view'
import { screenPart } from './screen-part'

export interface NodeViewProps {
  readonly node: UiNode
}

/** The place of the node, as the contexts of its parent tell it. */
function useNodePlacement(): NodePlacement {
  // The place contexts are read BEFORE any early return: hooks must not depend on data.
  const fillIgnored = useContext(FillIgnoredContext)
  const tightSlot = useContext(TightSlotContext)
  const isStackLayer = useContext(StackLayerContext)
  const inScrollRow = useContext(ScrollRowContext)
  const inLeadingZone = useContext(LeadingZoneContext)
  const columnAlign = useContext(ColumnParentContext)
  const inWeightedRow = useContext(WeightedRowContext)
  const layer = useContext(LayerContext)
  const pullAxis = useContext(PullAxisContext)
  const carouselCard = useContext(CarouselCardContext)
  const direction = useContext(DirectionContext)
  return { fillIgnored, tightSlot, isStackLayer, inScrollRow, inLeadingZone, columnAlign, inWeightedRow, layer, pullAxis, carouselCard, direction }
}

export const NodeView = screenPart(function NodeView({ node }: NodeViewProps): ReactNode {
  const scope = useData()
  const theme = useTheme()
  const parentText = useContext(TextContext)
  const place = useNodePlacement()
  const { inLeadingZone, inWeightedRow, layer, carouselCard, direction } = place
  const images = useContext(ImageContext)
  const widthClass = useContext(WidthClassContext)
  const anatomy = useContext(AnatomyContext)
  const navPlace = useContext(NavPlaceContext)
  const siblings = useContext(SiblingNodesContext)
  const scrolledLayer = useScrolledLayer(node)
  // The measured border box of a node with a dashed border (9.22.0); read by the probe drawn right after the node.
  const [dashMeasure, setDashMeasure] = useState<DashMeasure | undefined>(undefined)

  // 1. Visibility: the width class (`showOn`) AND the data condition (`visibleIf`) are one question.
  if (!nodeShown(node, widthClass, scope)) return null
  // The place of an option in its group (schema 9.19.0): among the children of one parent with the same write path.
  const choice = choicePlaceOfNode(siblings, node, widthClass, scope)

  /*
   * AN UNKNOWN TYPE DRAWS ITS CHILDREN (`unknownWidget: 'render-children'`) and its style is
   * ignored ENTIRELY (`unknownWidgetStyle: 'ignore-style'`): no box and no inheritance, the
   * children are drawn in the context of the PARENT. A new widget is almost always a wrapper, and
   * its children are content that should be visible anyway; what `style` means on a widget the
   * reader does not know, the reader cannot know.
   */
  if (!isKnownWidget(node.type)) return <Children node={node} />

  // 2. The effective style: the base plus the first state whose condition holds.
  // The app bar of a scrolled body (9.21.0): its layer lies LAST, over the base, the width-class layers and the state.
  const resolved = resolveNodeStyle(node, scope, theme)
  const own = placedStyleOf(node, scrolledLayer === undefined ? resolved : mergeNodeStyles(resolved, scrolledLayer, theme), anatomy, navPlace)

  // 3. The foreground comes AFTER the state. The children receive the same one.
  const text = inheritTextStyle(parentText, own, theme)
  // A dashed border (9.22.0): the border stays a transparent solid one, and the dashes are an image over the box once it is measured.
  const dashed = dashedPartOf(own?.border, theme, dashMeasure)

  /*
   * 4. The box. For a widget with a role, seven style fields go onto its own surface (the widget
   * does that itself, see `roleSurfaceCss`), so they are NOT applied to the box a second time;
   * `margin`, sizes and `opacity` belong to the box, as everywhere.
   */
  const isRoleWidget = Object.hasOwn(ROLE_WIDGETS, node.type)
  const box = boxCss(own, theme, scope, isRoleWidget ? ROLE_STYLE_KEYS : [], images)
  // The limit of the app bar zone (half its width) beats the node's minimum width: otherwise it would lie under the title.
  if (inLeadingZone && typeof box.minWidth === 'string') box.minWidth = `min(${mathLength(box.minWidth, theme)}, ${cssNumber(APP_BAR_LEADING_MAX_SHARE * 100)}cqi)`

  const dropped: string[] = []
  const fillCss = fillLayerCss(node, box, dropped, place)
  const row = rowShareOf(node, box, dropped, inWeightedRow)
  const { weightCss, rowCss } = row
  clipSizedBox(box)
  const slotCss = tightSlotCss(node, box, place.tightSlot)
  const rowViewportCss = scrollRowChildCss(node, box, place.inScrollRow, theme)
  const columnCss = columnChildCss(node, box, place.columnAlign, theme)
  const { cardCss, cardMargins } = carouselCardBox(box, carouselCard, theme)

  /*
   * THE PLACE OF AN OVERLAY (schema 9.10.0, `x-style.layout.layer`): the offset is the logical
   * `inset-inline-start` / `inset-block-start` on a node made `position: relative` (they do not
   * change the layout, `layoutBox`); the rotation is the own `rotate` property with ONE mirror for
   * RTL (the sign of the angle); the layer is no wider than the stack. The alignment lies on the
   * cell that `StackView` provides.
   */
  const layerCss: Css = layer === undefined ? {} : layerNodeCss(layer, theme, direction === 'rtl', box.maxWidth !== undefined)

  const shareCss = pulledShare(node, box, row, place, theme)

  /*
   * MOTION (schema 9.20.0, `x-motion`): marks and variables on the node's own box; the style sheet
   * turns them into a shift, a scale and an opacity, which only paint and never touch layout. The
   * animation starts when the element appears, so a node that appears again starts from zero.
   */
  const motion = motionOfNode(node)
  if (motion !== undefined) registerMotionPhase()
  const motionCss: Css = motion === undefined ? {} : motionVars(motion, direction === 'rtl')

  // 5. The widget sits inside its own "place" so that text fields know their key.
  const view = (
    <NodePlace nodeId={node.id}>
      <TextContext.Provider value={text}>
        {/* The special conditions of the place concern THIS node only, not its descendants. */}
        <FillIgnoredContext.Provider value={false}>
          <LeadingZoneContext.Provider value={false}>
          <TightSlotContext.Provider value={false}>
            <StackLayerContext.Provider value={false}>
              <LayerContext.Provider value={undefined}>
              <CarouselCardContext.Provider value={undefined}>
              <PullAxisContext.Provider value={pullAxisOf(node)}>
              <ScrollRowContext.Provider value={false}>
                {/* Whether THIS node is itself a column parent: knowledge for its children. */}
                <ColumnParentContext.Provider value={columnAlignOf(node)}>
                  {/* And whether it divides the row by weights, again for direct children only. */}
                  <WeightedRowContext.Provider value={acceptsWeightedChildren(node)}>
                   <SiblingNodesContext.Provider value={node.children ?? NO_SIBLINGS}>
                    <WidgetView
                      node={node}
                      props={node.props}
                      css={asCss({ ...box, ...fillCss, ...weightCss, ...rowCss, ...slotCss, ...rowViewportCss, ...columnCss, ...cardCss, ...layerCss, ...motionCss, ...dashed.css })}
                      own={own}
                      dropped={dropped}
                      text={text}
                      mark={{ 'data-hl-node': node.id, 'data-hl-type': node.type, ...(motion === undefined ? {} : motionMarks(motion)), ...dashed.mark }}
                      choice={choice}
                    />
                   </SiblingNodesContext.Provider>
                  </WeightedRowContext.Provider>
                </ColumnParentContext.Provider>
              </ScrollRowContext.Provider>
              </PullAxisContext.Provider>
              </CarouselCardContext.Provider>
              </LayerContext.Provider>
            </StackLayerContext.Provider>
          </TightSlotContext.Provider>
          </LeadingZoneContext.Provider>
        </FillIgnoredContext.Provider>
      </TextContext.Provider>
    </NodePlace>
  )
  // The row share: the wrapper divides the row and the box with its margins lies inside it.
  const shared = shareCss === undefined ? view : <div style={shareCss}>{view}</div>
  // The probe of a dashed border sits right after the node it measures (it is hidden and draws nothing).
  const placed =
    dashed.active ? (
      <>
        {shared}
        <DashProbe nodeId={node.id} radius={own?.radius} theme={theme} onMeasure={setDashMeasure} />
      </>
    ) : (
      shared
    )
  if (carouselCard === undefined) return placed

  /*
   * A CAROUSEL LIST ITEM (schema 9.11.0): the card sits in its own `role="listitem"` wrapper, a
   * direct child of the scrolling element, so the card width percentage is computed from the
   * CONTENT box of the scroll (`carouselCardCss`) and not from the node. The wrapper is the card
   * width plus its `margin`; snapping goes to its start. A hidden node has no wrapper: it is no
   * longer drawn here.
   */
  return (
    <div
      role="listitem"
      style={{
        display: 'flex',
        flex: carouselCard.stretch ? '1 1 0px' : 'none',
        minInlineSize: 0,
        scrollSnapAlign: 'start',
        ...(carouselCard.sized ? { inlineSize: `calc(var(${CAROUSEL_CARD_VAR}) + ${cardMargins.replace(' - ', ' + ')})` } : carouselCard.stretch ? { inlineSize: '100%' } : {}),
      }}
    >
      {placed}
    </div>
  )
})

const NO_SIBLINGS: readonly UiNode[] = []
