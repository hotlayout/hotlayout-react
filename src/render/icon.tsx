/** Icons: the glyph drawn as a mask, its box and the `Icon` widget. */
import { useContext } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { ownGlyphSizeOf } from '../glyph-size'
import { MIRRORED_ICONS, iconMask } from '../icons'
import { DirectionContext } from '../runtime'
import { cssPx } from '../sanitize'
import { glyphTypographyOf } from '../layout-rules'
import { textCss } from '../style'
import { productVar } from '../theme'
import { useAltText } from './alt-text'
import { useTheme } from './contexts'
import { useIconName } from './icon-name'
import { asCss } from './prop-tokens'
import type { WidgetProps } from './widget-props'

/**
 * THE ICON GLYPH: a mask over a fill in the text colour.
 *
 * The glyph box is one FONT SIZE wide and one LINE tall (`1em` x `1lh`): the icon is set in a font
 * token (`x-style.layout.iconGlyphTypography`), so its height is the line height of that token and
 * its width is its font size. With the default theme that is 12 x 16, 18 x 24 and 28 x 30 for
 * `sm` / `md` / `lg`. The drawing itself is a square with a side equal to the font size, centred in
 * this box (`mask-size: contain`).
 *
 * The font and colour come from the PARENT element: the glyph only reads `1em`, `1lh` and
 * `currentColor`. So the same element draws an icon widget, the leading icon of a row, a chevron
 * and the "back" arrow.
 *
 * A token the reader does not know (an icon from a newer minor) leaves an EMPTY box of the same
 * size: the layout does not jump and no invented symbol appears.
 */
export function Glyph({ name, size }: { readonly name: unknown; readonly size?: number | undefined }): ReactNode {
  const direction = useContext(DirectionContext)
  const mask = iconMask(name)
  /*
   * Mirroring in RTL is a FLIP (`scale: -1 1`), not a rotation, and only for tokens listed in
   * `x-mirroredIcons`: those that point in a direction of travel. The browser does not flip a mask
   * image by itself (unlike the `›` character).
   */
  const mirrored = direction === 'rtl' && typeof name === 'string' && MIRRORED_ICONS.includes(name)
  return (
    <span
      aria-hidden="true"
      data-hl-glyph={typeof name === 'string' ? name : undefined}
      style={{
        display: 'block',
        flex: 'none',
        /*
         * OWN SIZE (schema 9.16.0, `x-style.layout.ownGlyphSize`): a square whose side is the number
         * (`ownGlyphSizeOf`, an integer 8…128), NOT LARGER than the content box: a named side of the
         * node clamps the glyph rather than growing with it. Without the number, the word's font size
         * per line applies.
         */
        inlineSize: size === undefined ? '1em' : cssPx(size),
        blockSize: size === undefined ? '1lh' : cssPx(size),
        maxInlineSize: size === undefined ? undefined : '100%',
        maxBlockSize: size === undefined ? undefined : '100%',
        backgroundColor: mask === undefined ? undefined : 'currentColor',
        maskImage: mask,
        WebkitMaskImage: mask,
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        scale: mirrored ? '-1 1' : undefined,
      }}
    />
  )
}

/** The glyph box: a centred flex, with the size token as its font. */
export function glyphBox(size: unknown): CSSProperties {
  return { display: 'flex', alignItems: 'center', justifyContent: 'center', font: productVar('typography', glyphTypographyOf(size)) }
}

/**
 * An icon. The contract names a TOKEN (`props.name`), the glyph comes from the contract icon set
 * (`icon-set.ts`, schema 9.3.0), and how it is drawn is up to the platform (`icons.ts`).
 *
 * The colour is the inherited foreground (`x-style.readers.color`); the icon does not read a font:
 * its size is given by `props.size`.
 *
 * `display: flex`, not `inline-flex`: an inline element would sit on the baseline of the parent
 * line and leave a gap below it, making an `md` box 29 tall instead of 24. The icon box height is
 * the token line height, with nothing added.
 */
export function IconView({ props, css, text, mark }: WidgetProps): ReactNode {
  const theme = useTheme()
  // The description is a string or a document string (schema 9.19.0); the icon name comes from the document or from the data via `iconPath`.
  const alt = useAltText(props.alt)
  const name = useIconName(props.name, props.iconPath)
  // Schema 9.16.0: the number beats the `size` word (the box is a square of the number, not "font size by line"); the system font scale does not multiply it.
  const glyphSize = ownGlyphSizeOf(props.glyphSize)
  return (
    <span
      {...mark}
      role={alt === undefined ? undefined : 'img'}
      aria-label={alt}
      aria-hidden={alt === undefined ? true : undefined}
      data-hl-glyph-own={glyphSize === undefined ? undefined : ''}
      style={{ ...glyphBox(props.size), ...asCss(textCss('Icon', text, theme)), ...css }}
    >
      <Glyph name={name} size={glyphSize} />
    </span>
  )
}
