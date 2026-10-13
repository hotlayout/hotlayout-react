/** Widgets with a theme role and an icon beside the text: `Button`, `IconButton` and `Badge`. */
import { Fragment, useContext } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { ownGlyphSizeOf } from '../glyph-size'
import { typographyCss } from '../resolve'
import { shownTextOf } from '../shown-text'
import { BADGE_PADDING, BUTTON_LABEL_ALIGN, ICON_BESIDE_TEXT, ICON_BUTTON, PROP_DEFAULTS, buttonGeometryOf, hasIconBesideText, iconBesideTextOrder, iconButtonNameOf } from '../layout-rules'
import { roleSurfaceCss } from '../style-roles'
import { typographyToCss } from '../style'
import type { Css } from '../style'
import { PRESSABLE_CLASS } from '../styles'
import { productVar } from '../theme'
import { useWriteSemantics } from './choice'
import { ImageContext, useData, useTheme } from './contexts'
import { Glyph } from './icon'
import { useIconName } from './icon-name'
import { asCss, inlineMarginOf } from './prop-tokens'
import { disabledPressLook, pressHandlers, useDocumentAction, usePress, usePressDisabled } from './use-press'
import { useText } from './use-text'
import type { WidgetProps } from './widget-props'

/**
 * A button is a widget with a ROLE.
 *
 * The background, label colour and border default to the theme role
 * (`theme.roles.buttonVariant[variant]`); the node's own `style` overrides each slot separately and
 * lands on the button ITSELF. The third argument `roleSurfaceCss` is the built-in geometry: what
 * the role does not provide and what applies until the node names its own. The label padding and
 * font are artifact DATA (`x-style.layout.buttonPadding`, `buttonTypography`); the radius is a
 * built-in look.
 *
 * BUTTON SIZE is label plus padding plus border (`buttonSize`). A button has NO minimum size, and
 * `min-height` / `min-width` must not be set: a button with an `sm` padding is 40 tall, and takes
 * exactly that in the layout.
 *
 * The TOUCH TARGET is nevertheless at least 48 x 48: it is given by an invisible pseudo-element
 * outside the flow (class `hl-press`, `styles.ts`), so neither the button size nor the place of its
 * neighbours changes. So that the pseudo-element is not clipped, the `overflow: hidden` of a named
 * box moves from the button to the LABEL: there is nothing else to clip anyway.
 */
export function ButtonView({ node, props, css, own, mark, choice }: WidgetProps): ReactNode {
  const theme = useTheme()
  const scope = useData()
  const label = useText(props.label, 'label')
  const action = useDocumentAction(props.action, node.id)
  const press = usePress(action, node.id)
  const semantics = useWriteSemantics(action, choice)
  const icon = useIconName(props.icon, props.iconPath)
  const disabled = usePressDisabled(node)
  const images = useContext(ImageContext)
  // The size is contract data (`buttonSizes`); with no field or an unknown word it is `defaultButtonSize`.
  const geometry = buttonGeometryOf(props.size)

  const surface = roleSurfaceCss(
    node.type,
    props,
    own,
    { theme, scope, images },
    {
      ...typographyToCss(typographyCss(geometry.typography, theme)),
      padding: `${productVar('spacing', geometry.padding.block)} ${productVar('spacing', geometry.padding.inline)}`,
      borderRadius: productVar('radius', 'md'),
      border: 'none',
    },
  )

  const fullWidth = (props.fullWidth ?? PROP_DEFAULTS.Button?.fullWidth) === true
  const { overflow, ...box } = { ...asCss(surface), ...css }
  /*
   * "Full width" is the width of the place MINUS the node's own margins: a hundred percent plus
   * `margin` would stick out of the parent by exactly those margins.
   */
  const fullInline = fullWidth ? `calc(100% - ${inlineMarginOf(css as Css, 'InlineStart', theme)} - ${inlineMarginOf(css as Css, 'InlineEnd', theme)})` : undefined
  const text = <span style={{ display: 'block', minInlineSize: 0, maxBlockSize: '100%', overflow: overflow === 'hidden' ? 'hidden' : undefined }}>{label}</span>

  /*
   * The "icon + label" pair is centred in the button TOGETHER (`justify-content: center`, also in a
   * full-width button) and is not spread to the edges. The icon is decorative: the button name is
   * its label.
   */
  return (
    <button
      {...mark}
      {...semantics}
      type="button"
      className={PRESSABLE_CLASS}
      style={{ display: fullWidth ? 'flex' : 'inline-flex', alignItems: 'center', justifyContent: 'center', textAlign: BUTTON_LABEL_ALIGN, inlineSize: fullInline, ...BESIDE_GAP, ...box, ...disabledPressLook(disabled, box.opacity) }}
      {...pressHandlers(disabled, press)}
    >
      <BesideText icon={icon} position={props.iconPosition}>
        {text}
      </BesideText>
    </button>
  )
}

/** The gap between the icon box and the text: `iconBesideText.gap`. With a single child (no icon) it has no effect. */
export const BESIDE_GAP: CSSProperties = { gap: productVar('spacing', ICON_BESIDE_TEXT.gap) }

/**
 * ICON BESIDE TEXT, size `'text'` (button, badge): `iconBesideText`.
 *
 * The parts go into the markup in LOGICAL order (`iconBesideTextOrder`): `start` before the text,
 * `end` after it. In RTL the flex row direction swaps the sides, not this code; mirroring the glyph
 * is a separate rule (`Glyph`, `MIRRORED_ICONS`).
 *
 * The icon box is the font size wide and one LINE tall of the font the label is set in: it inherits
 * the font from the widget surface, so it follows both the button size and `style.typography`. The
 * icon does not change the widget height. The colour is `currentColor`, the label colour.
 *
 * If the field is named but there is nothing to draw (a name outside the set, a value that is not a
 * string), the result is an empty box of the same size and the gap stays (`unknownIconBesideText`).
 * An empty text does not remove the gap (`emptyTextBesideIcon`): the text is always a separate
 * element, not a bare string.
 */
function BesideText({ icon, position, children }: { readonly icon: unknown; readonly position: unknown; readonly children: ReactNode }): ReactNode {
  if (!hasIconBesideText(icon)) return children
  const glyph = (
    <span key="icon" aria-hidden="true" data-hl-beside="icon" style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Glyph name={icon} />
    </span>
  )
  return iconBesideTextOrder(icon, position).map((part) => (part === 'icon' ? glyph : <Fragment key="text">{children}</Fragment>))
}

/**
 * The icon button (schema 9.5.0) is a round button without visible text. The theme role is the same
 * group as the button's (`ROLE_WIDGETS`), the action has the same shape and the same execution
 * path, and the row record travels with it the same way.
 *
 * Geometry is `x-style.layout.iconButton`: a content square whose side is one line of the size's
 * font (`1lh`), the glyph at its font size (`1em`), padding equal to the vertical padding of a
 * button of that size on all sides, radius `pill`. There is no minimum size for a finger: the touch
 * target is the area around it (`hl-press`).
 *
 * The NAME is `props.label` after translation and data substitution; it is not drawn on screen.
 * Without a name the button is still drawn and works, and the name of the icon, in words, becomes
 * its name (`iconButtonWithoutLabel`).
 */
export function IconButtonView({ node, props, css, own, mark, choice }: WidgetProps): ReactNode {
  const theme = useTheme()
  const scope = useData()
  const label = useText(props.label, 'label')
  const action = useDocumentAction(props.action, node.id)
  const press = usePress(action, node.id)
  const semantics = useWriteSemantics(action, choice)
  const icon = useIconName(props.icon, props.iconPath)
  const disabled = usePressDisabled(node)
  const images = useContext(ImageContext)
  const geometry = buttonGeometryOf(props.size)
  const glyphSize = ownGlyphSizeOf(props.glyphSize)
  const name = shownTextOf(iconButtonNameOf(label, props.icon)) // CSS does not collapse `aria-label` (shownText)

  const surface = roleSurfaceCss(
    node.type,
    props,
    own,
    { theme, scope, images },
    {
      ...typographyToCss(typographyCss(geometry.typography, theme)),
      padding: productVar('spacing', geometry.padding.block),
      borderRadius: productVar('radius', ICON_BUTTON.radius),
      border: 'none',
    },
  )

  const box = { ...asCss(surface), ...css }
  return (
    <button {...mark} {...semantics} type="button" className={PRESSABLE_CLASS} aria-label={name === '' ? undefined : name} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...box, ...disabledPressLook(disabled, box.opacity) }} {...pressHandlers(disabled, press)}>
      {glyphSize === undefined ? (
        <span aria-hidden="true" style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', inlineSize: '1lh', blockSize: '1lh' }}>
          <Glyph name={icon} />
        </span>
      ) : (
        /*
         * Own size (schema 9.16.0): the content box grows with the glyph (a square of the number),
         * while a named side of the button clamps the glyph: the content box takes everything the
         * padding leaves, and the glyph is no larger than it (`max-…: 100%`), centred.
         */
        <span aria-hidden="true" data-hl-glyph-own="" style={{ flex: '1 1 auto', alignSelf: 'stretch', minInlineSize: 0, minBlockSize: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name={icon} size={glyphSize} />
        </span>
      )}
    </button>
  )
}

/**
 * The badge is the second widget with a ROLE: it names a TONE (`success`), not a colour, and the
 * theme says which tokens stand behind it. That is why re-branding touches no document. The node's
 * own `style` works the same as on a button.
 */
export function BadgeView({ node, props, css, own, mark }: WidgetProps): ReactNode {
  const theme = useTheme()
  const scope = useData()
  const label = useText(props.label, 'label')
  const icon = useIconName(props.icon, props.iconPath)
  const images = useContext(ImageContext)

  const surface = roleSurfaceCss(
    node.type,
    props,
    own,
    { theme, scope, images },
    {
      ...typographyToCss(typographyCss('caption', theme)),
      // The built-in padding is artifact data (`x-style.layout.badgePadding`), not a number of this file.
      padding: `${productVar('spacing', BADGE_PADDING.block)} ${productVar('spacing', BADGE_PADDING.inline)}`,
      borderRadius: productVar('radius', 'pill'),
    },
  )

  return (
    <span {...mark} style={{ display: 'inline-flex', alignItems: 'center', ...BESIDE_GAP, ...asCss(surface), ...css }}>
      {/* A badge with an icon (a "chip") is text, NOT a control: no button role, no focus, no action. */}
      {hasIconBesideText(icon) ? (
        <BesideText icon={icon} position={props.iconPosition}>
          <span style={{ display: 'block', minInlineSize: 0 }}>{label}</span>
        </BesideText>
      ) : (
        label
      )}
    </span>
  )
}
