/**
 * A list row (`ListTile`): the leading slot, the texts, the trailing slot.
 *
 * Built-in look: the slots through `sm`, the body — the title `titleS` over the
 * subtitle `bodyS`. The row is pressable in two cases: it carries an action (`props.action`) or it is an
 * option of a `ChoiceGroup` (the circle at the end). A row with neither is a plain row: it has no role of
 * a button and no cursor, because looking interactive while doing nothing is worse than not looking so.
 *
 * Schema 9.19.0 gave the row its parts (`x-style.layout.listTileParts`, `partStyle`): the limit of lines
 * of the title and the subtitle, a colour and a tile under the leading icon, a style and states of the
 * trailing text, a caption under it. The pure answers are in `list-tile-parts.ts`; here they become CSS.
 * Whatever is not named is drawn as before 9.19.0 — the built-in look is the base and a part style only
 * lays over it, and a key whose token the theme does not know is skipped.
 */
import { useContext } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'

import { INERT_ACTION_TYPE } from '../actions'
import { isConditionMet } from '../conditions'
import { colorCss, radiusCss, typographyCss } from '../resolve'
import { cssPx, isRecord } from '../sanitize'
import { shownTextOf } from '../shown-text'
import { ChoiceContext } from '../runtime'

import { hasIconBesideText, LIST_TILE_ICON_SIZES, LIST_TILE_TRAILING_COLOR } from '../layout-rules'
import { typographyToCss } from '../style'
import type { TextStyleContext } from '../style'
import { PRESSABLE_CLASS } from '../styles'
import { productVar } from '../theme'
import { leadingTileOf, listTileLinesOf } from '../list-tile-parts'
import { resolvePartStyle } from '../part-style'
import { BESIDE_GAP } from './buttons'
import { Glyph, glyphBox } from './icon'
import { ImageView } from './image'
import { mathToken, useSpacing } from './prop-tokens'
import { useDocumentAction, usePress } from './use-press'
import { usePartColor, usePartText, useText } from './use-text'
import type { WidgetProps } from './widget-props'
import { useWriteSemantics } from './choice'
import { useData, useTheme } from './contexts'

/** The limit of lines as CSS: the rest is cut with an ellipsis at the end of the last line, by the direction of the text. */
function lineClamp(limit: unknown): CSSProperties {
  const lines = listTileLinesOf(limit)
  return lines === undefined ? {} : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
}

export function ListTileView({ node, props, css, text, mark, choice }: WidgetProps): ReactNode {
  const title = useText(props.title, 'title')
  const subtitle = useText(props.subtitle, 'subtitle')
  const gap = useSpacing('sm', 'sm')
  const titleCss = usePartText('ListTile', 'title', text, 'titleS', 'onSurface')
  const subtitleCss = usePartText('ListTile', 'subtitle', text, 'bodyS', 'muted')
  // A slot from the network: `null` or a string in its place — there is no slot.
  const trailing = isRecord(props.trailing) ? (props.trailing as { kind?: string; text?: unknown; icon?: unknown; optionValue?: unknown }) : undefined
  const choiceScope = useContext(ChoiceContext)

  const action = useDocumentAction(props.action, node.id)
  const measures = isRecord(props.action) && isRecord(props.action.track)
  const press = usePress(action !== undefined && (action.type !== INERT_ACTION_TYPE || measures) ? action : undefined, node.id)
  const semantics = useWriteSemantics(action, choice)
  const option = trailing?.kind === 'radio' && typeof trailing.optionValue === 'string' ? trailing.optionValue : undefined
  const isOption = option !== undefined && choiceScope !== undefined
  const activate =
    isOption || press !== undefined
      ? () => {
          if (isOption) choiceScope.select(option)
          press?.()
        }
      : undefined

  const interactive: HTMLAttributes<HTMLDivElement> =
    activate === undefined
      ? {}
      : {
          className: PRESSABLE_CLASS,
          role: isOption ? 'radio' : 'button',
          tabIndex: 0,
          onClick: activate,
          onKeyDown: (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            // A held key is one press, not one per auto-repeat.
            if (event.repeat) return
            activate()
          },
          // A row of a group keeps the role and the state of the group; a row that writes on its own is an option or a toggle (9.19.0).
          ...(isOption ? { 'aria-checked': choiceScope.selected === option } : semantics),
        }

  // The gap between the slots — `sm` on BOTH sides of the body.
  return (
    <div {...mark} {...interactive} style={{ display: 'flex', alignItems: 'center', gap, ...css }}>
      <LeadingSlot slot={props.leading} text={text} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ ...titleCss, ...lineClamp(props.titleMaxLines) }}>{title}</div>
        {subtitle === '' ? null : <div style={{ ...subtitleCss, ...lineClamp(props.subtitleMaxLines) }}>{subtitle}</div>}
      </div>
      <TrailingSlot slot={trailing} text={text} />
    </div>
  )
}

/** The mini image of a row: a SQUARE of two measures `xl`, radius `sm`. */
const LIST_TILE_IMAGE = { sideUnit: 'xl', radius: 'sm' } as const

/** The circle of a choice: the side is the step `lg`, the outline one pixel, the chosen one is filled with `primary` and ringed with `surface`. */
const RADIO = { side: 'lg', ring: 2 } as const

/**
 * The leading slot. An icon is a plain glyph WITHOUT a disc; it reads the colour of its own (`leading.color`),
 * else the named colour of the node, else the built-in `primary`. With `leading.tile` the glyph stands in the
 * centre of a square of its own side (40 without a field), tinted and rounded; a glyph larger than the tile is
 * clipped by it, and the system font scale grows the glyph, not the tile. A photo reads no colour, nor does the
 * circle of a choice.
 */
function LeadingSlot({ slot, text }: { slot: unknown; text: TextStyleContext }): ReactNode {
  const theme = useTheme()
  const glyphCss = usePartColor('ListTile', 'leadingIcon', text, 'primary')
  if (!isRecord(slot) || slot.kind === 'none') return null
  const value = slot
  if (value.kind === 'icon') {
    // The colour of the icon itself: a key the theme does not know is skipped, the colour the part would have is kept.
    const own = colorCss(slot.color, theme)
    const color: CSSProperties = own === undefined ? glyphCss : { color: own }
    const tile = leadingTileOf(value)
    if (tile === undefined) {
      return (
        <span aria-hidden="true" style={{ flex: 'none', ...glyphBox(LIST_TILE_ICON_SIZES.leadingIcon), ...color }}>
          <Glyph name={value.icon} />
        </span>
      )
    }
    const side = cssPx(tile.size)
    return (
      <span
        aria-hidden="true"
        data-hl-tile=""
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          inlineSize: side,
          blockSize: side,
          overflow: 'hidden',
          borderRadius: radiusCss(tile.radius, theme) ?? productVar('radius', 'sm'),
          backgroundColor: colorCss(tile.color, theme),
          ...color,
        }}
      >
        <span style={{ flex: 'none', ...glyphBox(LIST_TILE_ICON_SIZES.leadingIcon) }}>
          <Glyph name={value.icon} />
        </span>
      </span>
    )
  }
  // The mini image is a SQUARE of two measures `xl`, radius `sm`.
  const side = `calc(2 * ${mathToken(LIST_TILE_IMAGE.sideUnit, theme)})`
  return <ImageView props={{ source: value.source }} css={{ flex: 'none', inlineSize: side, blockSize: side, overflow: 'hidden', borderRadius: productVar('radius', LIST_TILE_IMAGE.radius) }} />
}

/** The look of a part over its base: the keys of the style (and the state) the theme knows lay over it; the others are skipped. */
function laidOver(base: CSSProperties, own: { readonly color?: unknown; readonly typography?: unknown } | undefined, theme: ReturnType<typeof useTheme>): CSSProperties {
  if (own === undefined) return base
  const color = colorCss(own.color, theme)
  const typography = own.typography === undefined ? undefined : typographyCss(own.typography, theme)
  return { ...base, ...(typography === undefined ? {} : typographyToCss(typography)), ...(color === undefined ? {} : { color }) }
}

function TrailingSlot({ slot, text }: { slot: { kind?: string; text?: unknown; icon?: unknown; optionValue?: unknown } | undefined; text: TextStyleContext }): ReactNode {
  const theme = useTheme()
  const scope = useData()
  const label = useText(slot?.text, 'trailing.text')
  const caption = shownTextOf(useText(isRecord(slot) ? (slot as { caption?: unknown }).caption : undefined, 'trailing.caption'))
  const baseText = usePartText('ListTile', 'trailingText', text, 'bodyM', LIST_TILE_TRAILING_COLOR)
  const baseCaption = usePartText('ListTile', 'subtitle', text, 'bodyS', 'muted')
  const chevronCss = usePartColor('ListTile', 'chevron', text, 'muted')
  const choice = useContext(ChoiceContext)

  if (slot === undefined || slot.kind === 'none') return null
  if (slot.kind === 'chevron') {
    return (
      <span aria-hidden="true" style={{ flex: 'none', display: 'flex', font: productVar('typography', 'titleS'), ...chevronCss }}>
        <Glyph name="chevron" />
      </span>
    )
  }
  if (slot.kind === 'radio') {
    // The chosen row is exactly the one whose `optionValue` equals the value of the group; outside a group — empty.
    const selected = choice?.selected !== undefined && choice.selected === slot.optionValue
    const side = productVar('spacing', RADIO.side)
    return (
      <span
        aria-hidden="true"
        data-hl-radio={selected ? 'selected' : 'empty'}
        style={{
          flex: 'none',
          display: 'block',
          inlineSize: side,
          blockSize: side,
          borderRadius: productVar('radius', 'pill'),
          border: `1px solid ${productVar('color', selected ? 'primary' : 'muted')}`,
          backgroundColor: selected ? productVar('color', 'primary') : undefined,
          boxShadow: selected ? `inset 0 0 0 ${String(RADIO.ring)}px ${productVar('color', 'surface')}` : undefined,
        }}
      />
    )
  }
  // Only a trailing TEXT has a style, states and a caption (`listTileParts.trailing.appliesTo`); the state is read with the data of the node.
  const isMet = (condition: never): boolean => isConditionMet(condition, scope)
  const textCss = laidOver(baseText, resolvePartStyle(slot.kind === 'text' ? (slot as { style?: unknown }).style : undefined, slot.kind === 'text' ? (slot as { styleWhen?: unknown }).styleWhen : undefined, isMet), theme)

  const line = !hasIconBesideText(slot.icon) ? (
    <span style={{ flex: 'none', ...textCss }}>{label}</span>
  ) : (
    /*
     * The icon beside the text in the slot of a row (`iconBesideText.places.ListTile`): the position is fixed — after the text; the gap
     * is `gap`; the centre of the box on the centre of the line of the text; the size is the step of the scale of icons
     * (`listTileIconSizes.trailingIcon`), whatever the typography of the text. The icon takes the colour of THIS text.
     */
    <span style={{ flex: 'none', display: 'flex', alignItems: 'center', ...BESIDE_GAP, ...textCss }}>
      <span style={{ display: 'block' }}>{label}</span>
      <span aria-hidden="true" data-hl-beside="icon" style={{ flex: 'none', ...glyphBox(LIST_TILE_ICON_SIZES.trailingIcon), color: textCss.color }}>
        <Glyph name={slot.icon} />
      </span>
    </span>
  )
  if (slot.kind !== 'text' || caption === '') return line

  // The column of the trailing part: the text over the caption, both pressed to the END of the row; the column never shrinks.
  const captionOwn = resolvePartStyle((slot as { captionStyle?: unknown }).captionStyle, (slot as { captionStyleWhen?: unknown }).captionStyleWhen, isMet)
  return (
    <span data-hl-trailing-column="" style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      {line}
      <span data-hl-caption="" style={{ display: 'block', whiteSpace: 'nowrap', ...laidOver(baseCaption, captionOwn, theme) }}>
        {caption}
      </span>
    </span>
  )
}
