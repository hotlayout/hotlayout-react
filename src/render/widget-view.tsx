/** The fork from a node type to the component that draws it. */
import type { ReactNode } from 'react'

import { AccordionView } from './accordion'
import { AppBarView } from './app-bar'
import { BadgeView, ButtonView, IconButtonView } from './buttons'
import { ChoiceGroupView } from './choice-group'
import { GridView } from './grid'
import { IconView } from './icon'
import { ImageView } from './image'
import { ColumnView, ContainerView, DividerView, RowView, SpacerView } from './layout'
import { ListTileView } from './list-tile'
import { NavBarView, NavItemView } from './nav-bar'
import { usePressHost } from './press-host'
import { CircularProgressView, ProgressBarView } from './progress'
import { RepeaterView } from './repeater'
import { ScreenRootView } from './screen-root'
import { Children } from './siblings'
import { StackView } from './stack'
import { TabPanelView, TabsView } from './tabs'
import { TextView } from './text'
import { TextFieldView } from './text-field'
import { CheckboxView, SwitchView } from './toggles'
import type { WidgetProps } from './widget-props'
import { screenPart } from './screen-part'

/** Containers and layout: the widgets that draw their children. `undefined` — the type is not one of them. */
function layoutWidget(widget: WidgetProps): ReactNode | undefined {
  switch (widget.node.type) {
    case 'Screen':
      return <ScreenRootView {...widget} />

    case 'AppBar':
      return <AppBarView {...widget} />

    case 'Column':
      return <ColumnView {...widget} />

    case 'Row':
      return <RowView {...widget} />

    case 'Container':
      return <ContainerView {...widget} />

    case 'Grid':
      return <GridView {...widget} />

    case 'Stack':
      return <StackView {...widget} />

    case 'Tabs':
      return <TabsView {...widget} />

    case 'Tab':
      /*
       * A tab panel: the title is drawn by `Tabs`, taken from the props of the CHILD. The gap
       * between the panel children is `md`: `Tab` has no `gap` prop, and this is the built-in look
       * that every reader draws the same. Without it the panel children would stick together.
       */
      return <TabPanelView {...widget} />

    case 'Accordion':
      return <AccordionView {...widget} />

    case 'ChoiceGroup':
      return <ChoiceGroupView {...widget} />

    case 'Repeater':
      return <RepeaterView {...widget} />

    case 'Spacer':
      return <SpacerView {...widget} />

    case 'Divider':
      return <DividerView {...widget} />

    default:
      return undefined
  }
}

/** Content and controls. */
function contentWidget(widget: WidgetProps): ReactNode {
  const { node, css, mark } = widget
  switch (node.type) {
    case 'Text':
      return <TextView {...widget} />

    case 'Image':
      return <ImageView props={widget.props} css={css} mark={mark} />

    case 'Icon':
      return <IconView {...widget} />

    case 'Button':
      return <ButtonView {...widget} />

    case 'IconButton':
      return <IconButtonView {...widget} />

    case 'ListTile':
      return <ListTileView {...widget} />

    case 'ProgressBar':
      return <ProgressBarView {...widget} />

    case 'CircularProgress':
      return <CircularProgressView {...widget} />

    case 'Badge':
      return <BadgeView {...widget} />

    case 'NavBar':
      return <NavBarView {...widget} />

    case 'NavItem':
      return <NavItemView {...widget} />

    case 'TextField':
      return <TextFieldView {...widget} />

    case 'Switch':
      return <SwitchView {...widget} />

    case 'Checkbox':
      return <CheckboxView {...widget} />

    default:
      // Unreachable: an unknown type is filtered out in `NodeView`.
      return <Children node={node} />
  }
}

export const WidgetView = screenPart(function WidgetView(given: WidgetProps): ReactNode {
  // A container with an action (schema 9.19.0) is a pressable container: the role, focus and keyboard go on its root element.
  const widget = usePressHost(given)
  return layoutWidget(widget) ?? contentWidget(widget)
})
